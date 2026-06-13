import Phaser from "phaser";
import type { DecoKind } from "../types";
import { Rng } from "../util";
import { TrackGeometry } from "./TrackGeometry";
import { ensurePokemonTexture } from "./SpriteFactory";
import { Audio } from "./AudioSystem";
import type { ThreeView } from "./ThreeView";

interface Prop {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  scale: number;
  sway: number; // 0 = rigid, > 0 = wind sway amount
  phase: number;
}

interface Spectator {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  scale: number;
  phase: number;
  hop: number; // jump height (0 = calm fan)
}

interface Wild {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  id: number;
  scale: number;
  phase: number;
  cryT: number;
}

interface FlockBird {
  img: Phaser.GameObjects.Image;
  dx: number;
  dy: number;
  phase: number;
}

interface Flock {
  birds: FlockBird[];
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  speed: number;
  ang: number;
  lift: number;
}

/** Texture keys (with weights) used as roadside props for each environment. */
const THEME_PROPS: Record<DecoKind, [string, number][]> = {
  forest: [["sc-tree", 7], ["sc-pine", 3]],
  plain: [["sc-tree", 5], ["sc-pine", 2], ["sc-bush", 4]],
  beach: [["sc-palm", 8], ["sc-bush", 2]],
  cave: [["sc-rock", 6], ["sc-crystal", 4]],
  volcano: [["sc-rockdark", 7], ["sc-deadtree", 3]],
  ice: [["sc-snowpine", 6], ["sc-icecrystal", 4]],
  city: [["sc-tower", 6], ["sc-lamp", 4]],
  rocky: [["sc-rock", 6], ["sc-deadtree", 4]],
  space: [["sc-spacecrystal", 10]],
  ghost: [["sc-grave", 5], ["sc-deadtree", 5]],
  moon: [["sc-icecrystal", 5], ["sc-rock", 5]],
  plant: [["sc-pylon", 6], ["sc-lamp", 4]]
};

const SWAYERS = new Set(["sc-tree", "sc-pine", "sc-palm", "sc-bush", "sc-snowpine"]);

/** Wild Pokémon loitering off-road, per environment (Gen 1 ids). */
const THEME_WILD: Record<DecoKind, number[]> = {
  forest: [10, 13, 16, 43, 69],        // Caterpie, Weedle, Pidgey, Oddish, Bellsprout
  plain: [16, 19, 56, 133],            // Pidgey, Rattata, Mankey, Eevee
  beach: [98, 90, 79, 72],             // Krabby, Shellder, Slowpoke, Tentacool
  cave: [41, 74, 27, 104],             // Zubat, Geodude, Sandshrew, Cubone
  volcano: [58, 77, 126, 37],          // Growlithe, Ponyta, Magmar, Vulpix
  ice: [86, 124, 90],                  // Seel, Jynx, Shellder
  city: [52, 109, 137, 100],           // Meowth, Koffing, Porygon, Voltorb
  rocky: [74, 111, 66, 104],           // Geodude, Rhyhorn, Machop, Cubone
  space: [35, 137, 147],               // Clefairy, Porygon, Dratini
  ghost: [92, 104, 109],               // Gastly, Cubone, Koffing
  moon: [35, 36, 41],                  // Clefairy, Clefable, Zubat
  plant: [81, 100, 88]                 // Magnemite, Voltorb, Grimer
};

/** Species circling the sky for each environment. */
const THEME_FLOCK: Record<DecoKind, number[]> = {
  forest: [16, 21], plain: [16, 21], beach: [16, 72], cave: [41],
  volcano: [21], ice: [16], city: [41, 16], rocky: [21],
  space: [120], ghost: [92, 41], moon: [41, 35], plant: [81]
};

/** One oversized background cameo per environment — blink and you miss it. */
const THEME_LANDMARK: Record<DecoKind, number> = {
  forest: 3, plain: 143, beach: 130, cave: 95, volcano: 6, ice: 131,
  city: 68, rocky: 112, space: 150, ghost: 94, moon: 36, plant: 82
};

/**
 * Standing roadside props (trees, rocks, lamps...) rendered as Mode 7
 * billboards — they give the first-person view its sense of speed and depth.
 * Positions are deterministic per track and never overlap the corridor.
 */
export class Scenery {
  private props: Prop[] = [];
  private crowd: Spectator[] = [];
  private wilds: Wild[] = [];
  private flocks: Flock[] = [];
  private t = 0;
  private cryCd = 3; // global wild-cry cooldown (don't chorus)

  constructor(private scene: Phaser.Scene, private geom: TrackGeometry, private view: ThreeView) {
    makeSceneryTextures(scene);
    const def = geom.def;
    const rng = new Rng(987 + def.id * 4045);
    const options = THEME_PROPS[def.theme.deco] ?? THEME_PROPS.plain;
    const totalW = options.reduce((a, [, w]) => a + w, 0);
    const N = geom.xs.length;
    const count = 64;

    for (let i = 0; i < count; i++) {
      const k = Math.floor((i / count) * N + rng.range(0, N / count)) % N;
      const side = rng.next() < 0.5 ? -1 : 1;
      const spot = this.offTrack(k / N, side * (def.corridorHalf + rng.range(60, 260)));
      if (!spot) continue;

      let roll = rng.next() * totalW;
      let key = options[0][0];
      for (const [tex, w] of options) {
        roll -= w;
        if (roll <= 0) { key = tex; break; }
      }
      const img = scene.add.image(spot.x, spot.y, key).setOrigin(0.5, 1).setDepth(2.8);
      this.props.push({
        img, x: spot.x, y: spot.y,
        scale: rng.range(1.5, 2.4) * (key === "sc-tower" ? 1.5 : 1),
        sway: SWAYERS.has(key) ? rng.range(0.015, 0.035) : 0,
        phase: rng.range(0, 6.28)
      });
    }

    // checkered flags flanking the start line — find an offset on each side
    // that clears every stretch of road (the start can sit near a return leg)
    const startP = geom.sample(0.0015);
    for (const side of [-1, 1]) {
      let fx = 0, fy = 0, ok = false;
      for (const off of [26, 16, 40, 64]) {
        const d = side * (def.corridorHalf + off);
        fx = startP.x + startP.nx * d;
        fy = startP.y + startP.ny * d;
        if (!geom.onCourse(fx, fy, 6)) { ok = true; break; }
      }
      if (!ok) continue;
      const img = scene.add.image(fx, fy, "sc-flag").setOrigin(0.5, 1).setDepth(2.8);
      this.props.push({ img, x: fx, y: fy, scale: 2.1, sway: 0.04, phase: side });
    }

    this.placeCrowd(rng);
    this.placeWilds(rng);
    this.placeFlocks(rng);
    this.placeLandmark(rng);
  }

  /** World point at lap position s, lateral d — or null if off-map / on the course. */
  private offTrack(s: number, d: number, margin = 40) {
    const p = this.geom.sample(s);
    const x = p.x + p.nx * d, y = p.y + p.ny * d;
    if (x < 30 || y < 30 || x > this.geom.worldW - 30 || y > this.geom.worldH - 30) return null;
    // the point may land on a different stretch of the course — keep it off the road
    const proj = this.geom.project(x, y);
    if (Math.abs(proj.d) < this.geom.corridorHalfAt(proj.s, proj.d) + margin) return null;
    return { x, y };
  }

  /** Trainer fans: bleachers at the start line plus pockets at the big features. */
  private placeCrowd(rng: Rng) {
    const def = this.geom.def;
    const spots: [number, number][] = []; // [s, side]
    for (const side of [-1, 1]) {
      spots.push([0.985, side], [0.012, side]); // start-line bleachers
    }
    // a pocket of fans at up to three exciting features (ramps, boosts, gaps)
    const feats = (def.features ?? []).filter(f => f.kind === "ramp" || f.kind === "boost" || f.kind === "gap");
    for (let i = 0; i < Math.min(3, feats.length); i++) {
      spots.push([wrapS(feats[i].s0 - 0.012), rng.next() < 0.5 ? -1 : 1]);
    }

    for (const [s, side] of spots) {
      const n = 4 + Math.floor(rng.range(0, 4));
      for (let i = 0; i < n; i++) {
        // two loose rows just behind the corridor edge (outside walls/rails)
        const row = i % 2;
        const d = side * (def.corridorHalf + 16 + row * 22 + rng.range(-4, 8));
        const along = s + (i - n / 2) * 0.0045 + rng.range(-0.001, 0.001);
        const p = this.geom.sample(wrapS(along));
        const x = p.x + p.nx * d, y = p.y + p.ny * d;
        if (x < 30 || y < 30 || x > this.geom.worldW - 30 || y > this.geom.worldH - 30) continue;
        // bleachers hug the corridor edge; reject any that a nearby return leg
        // would otherwise drop into the middle of the road
        if (this.geom.onCourse(x, y, 8)) continue;
        const img = this.scene.add.image(x, y, `sc-trainer${Math.floor(rng.range(0, 6))}`)
          .setOrigin(0.5, 1).setDepth(2.85);
        this.crowd.push({
          img, x, y,
          scale: rng.range(1.0, 1.25),
          phase: rng.range(0, 6.28),
          hop: rng.next() < 0.6 ? rng.range(3, 7) : 0
        });
      }
    }
  }

  /** Wild Pokémon loitering in the scenery — they shuffle, and cry when you pass. */
  private placeWilds(rng: Rng) {
    const def = this.geom.def;
    const species = THEME_WILD[def.theme.deco] ?? THEME_WILD.plain;
    for (let i = 0; i < 12; i++) {
      const s = rng.next();
      const side = rng.next() < 0.5 ? -1 : 1;
      const spot = this.offTrack(s, side * (def.corridorHalf + rng.range(50, 200)), 30);
      if (!spot) continue;
      const id = species[Math.floor(rng.range(0, species.length))];
      const img = this.scene.add.image(spot.x, spot.y, ensurePokemonTexture(this.scene, id), 2)
        .setDepth(2.9).setFlipX(rng.next() < 0.5);
      this.wilds.push({
        img, x: spot.x, y: spot.y, id,
        scale: rng.range(0.85, 1.15),
        phase: rng.range(0, 6.28),
        cryT: rng.range(0, 10)
      });
    }
  }

  /** Flocks circling above the course. */
  private placeFlocks(rng: Rng) {
    const def = this.geom.def;
    const species = THEME_FLOCK[def.theme.deco] ?? THEME_FLOCK.plain;
    for (let f = 0; f < 2; f++) {
      const anchor = this.geom.sample(rng.next());
      const cx = clampN(anchor.x + rng.range(-350, 350), 200, this.geom.worldW - 200);
      const cy = clampN(anchor.y + rng.range(-350, 350), 200, this.geom.worldH - 200);
      const id = species[Math.floor(rng.range(0, species.length))];
      const tex = ensurePokemonTexture(this.scene, id);
      const birds: FlockBird[] = [];
      const n = 3 + Math.floor(rng.range(0, 3));
      for (let i = 0; i < n; i++) {
        birds.push({
          img: this.scene.add.image(0, 0, tex, 0).setDepth(2.95),
          dx: rng.range(-52, 52),
          dy: rng.range(-40, 40),
          phase: rng.range(0, 6.28)
        });
      }
      this.flocks.push({
        birds, cx, cy,
        rx: rng.range(260, 430), ry: rng.range(200, 340),
        speed: rng.range(0.22, 0.4) * (rng.next() < 0.5 ? -1 : 1),
        ang: rng.range(0, 6.28),
        lift: rng.range(70, 115)
      });
    }
  }

  /** One big background cameo, far off the road. */
  private placeLandmark(rng: Rng) {
    const def = this.geom.def;
    const id = THEME_LANDMARK[def.theme.deco] ?? 143;
    for (let tries = 0; tries < 14; tries++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const spot = this.offTrack(rng.next(), side * (def.corridorHalf + rng.range(330, 520)), 120);
      if (!spot) continue;
      const img = this.scene.add.image(spot.x, spot.y, ensurePokemonTexture(this.scene, id), 2).setDepth(2.7);
      this.wilds.push({
        img, x: spot.x, y: spot.y, id,
        scale: 2.9, phase: rng.range(0, 6.28), cryT: rng.range(4, 12)
      });
      return;
    }
  }

  update(dt: number, px?: number, py?: number) {
    this.t += dt;
    const t = this.t;
    for (const p of this.props) {
      const rot = p.sway > 0 ? Math.sin(t * 1.7 + p.phase) * p.sway : 0;
      this.view.submit(p.img, p.x, p.y, { rot, scale: p.scale, topDepth: 2.8, m7Boost: 1.15 });
    }

    // fans bounce in little waves
    for (const c of this.crowd) {
      const hop = c.hop > 0 ? Math.max(0, Math.sin(t * 3.1 + c.phase)) * c.hop : 0;
      const rot = c.hop === 0 ? Math.sin(t * 1.3 + c.phase) * 0.05 : 0;
      this.view.submit(c.img, c.x, c.y, { lift: hop, rot, scale: c.scale, topDepth: 2.85, m7Boost: 1.05 });
    }

    // wilds shuffle in place and call out when the player passes close
    this.cryCd = Math.max(0, this.cryCd - dt);
    for (const w of this.wilds) {
      w.img.setFrame(Math.floor(t * 2.6 + w.phase) % 2);
      const bob = Math.sin(t * 2.2 + w.phase) * 1.5;
      this.view.submit(w.img, w.x, w.y, { lift: bob, scale: w.scale, topDepth: 2.9, m7Boost: 1.0 });
      w.cryT -= dt;
      if (px !== undefined && py !== undefined && w.cryT <= 0 && this.cryCd <= 0) {
        const dx = w.x - px, dy = w.y - py;
        if (dx * dx + dy * dy < 240 * 240) {
          Audio.cry(w.id, 0.2);
          w.cryT = 16 + Math.random() * 14;
          this.cryCd = 2.8;
        }
      }
    }

    // flocks wheel around the sky, flying nose-first along the circle
    for (const fl of this.flocks) {
      fl.ang += fl.speed * dt;
      const ca = Math.cos(fl.ang), sa = Math.sin(fl.ang);
      const fx = fl.cx + ca * fl.rx;
      const fy = fl.cy + sa * fl.ry;
      const heading = Math.atan2(ca * fl.ry * fl.speed, -sa * fl.rx * fl.speed);
      const movingLeft = -sa * fl.rx * fl.speed < 0;
      for (const b of fl.birds) {
        b.img.setFrame(Math.floor(t * 7 + b.phase * 3) % 3);
        b.img.setFlipX(movingLeft);
        const bobL = Math.sin(t * 2.6 + b.phase) * 7;
        this.view.submit(b.img, fx + b.dx, fy + b.dy, {
          lift: fl.lift + bobL, scale: 0.78, topDepth: 2.95, m7Boost: 0.85,
          face: heading
        });
      }
    }
  }
}

const wrapS = (s: number) => ((s % 1) + 1) % 1;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

let texturesBuilt = false;

/** Procedural prop sprites, generated once per game session. */
function makeSceneryTextures(scene: Phaser.Scene) {
  if (texturesBuilt && scene.textures.exists("sc-tree")) return;
  texturesBuilt = true;
  const g = scene.make.graphics(undefined, false);

  // leafy tree
  g.fillStyle(0x6a4a2c, 1).fillRect(20, 40, 8, 22);
  g.fillStyle(0x1d5a22, 1).fillCircle(24, 26, 20);
  g.fillCircle(12, 34, 13);
  g.fillCircle(36, 34, 13);
  g.fillStyle(0x2f7a30, 1).fillCircle(20, 22, 13);
  g.fillStyle(0x4a9a44, 1).fillCircle(16, 18, 7);
  g.generateTexture("sc-tree", 48, 62);
  g.clear();

  // pine
  g.fillStyle(0x5a4026, 1).fillRect(17, 48, 6, 14);
  g.fillStyle(0x14502a, 1);
  g.fillTriangle(20, 0, 4, 26, 36, 26);
  g.fillTriangle(20, 14, 2, 40, 38, 40);
  g.fillTriangle(20, 28, 0, 52, 40, 52);
  g.fillStyle(0x2a7a40, 1);
  g.fillTriangle(20, 4, 10, 22, 30, 22);
  g.generateTexture("sc-pine", 40, 62);
  g.clear();

  // snowy pine
  g.fillStyle(0x5a4026, 1).fillRect(17, 48, 6, 14);
  g.fillStyle(0x1a5a40, 1);
  g.fillTriangle(20, 0, 4, 26, 36, 26);
  g.fillTriangle(20, 14, 2, 40, 38, 40);
  g.fillTriangle(20, 28, 0, 52, 40, 52);
  g.fillStyle(0xeaf6ff, 1);
  g.fillTriangle(20, 0, 10, 16, 30, 16);
  g.fillTriangle(20, 16, 12, 28, 28, 28);
  g.generateTexture("sc-snowpine", 40, 62);
  g.clear();

  // bush
  g.fillStyle(0x3f8f38, 1);
  g.fillCircle(14, 20, 12);
  g.fillCircle(28, 20, 12);
  g.fillCircle(21, 12, 12);
  g.fillStyle(0x5cb84e, 1).fillCircle(17, 12, 7).fillCircle(26, 16, 6);
  g.fillStyle(0xff8aa8, 1).fillCircle(28, 12, 2.4).fillCircle(10, 16, 2);
  g.fillStyle(0xffe066, 1).fillCircle(20, 22, 2);
  g.generateTexture("sc-bush", 42, 32);
  g.clear();

  // palm
  g.fillStyle(0x8a5a32, 1);
  g.fillRect(20, 22, 6, 38);
  g.fillRect(22, 14, 5, 12);
  g.fillStyle(0x2f8a3e, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.fillEllipse(24 + Math.cos(a) * 13, 14 + Math.sin(a) * 7, 22, 8);
  }
  g.fillStyle(0x6a4a22, 1).fillCircle(24, 14, 4);
  g.generateTexture("sc-palm", 48, 60);
  g.clear();

  // rock spike
  g.fillStyle(0x4a443c, 1);
  g.fillTriangle(4, 50, 22, 2, 40, 50);
  g.fillStyle(0x6a6258, 1);
  g.fillTriangle(12, 50, 22, 8, 30, 50);
  g.fillStyle(0x8a8278, 1);
  g.fillTriangle(18, 38, 22, 14, 27, 38);
  g.generateTexture("sc-rock", 44, 52);
  g.clear();

  // dark volcanic rock
  g.fillStyle(0x241612, 1);
  g.fillTriangle(4, 50, 22, 2, 40, 50);
  g.fillStyle(0x3a241c, 1);
  g.fillTriangle(12, 50, 22, 8, 30, 50);
  g.fillStyle(0xff7a30, 0.9);
  g.fillCircle(22, 30, 2.5).fillCircle(18, 40, 1.8).fillCircle(27, 44, 1.6);
  g.generateTexture("sc-rockdark", 44, 52);
  g.clear();

  // cave crystal
  g.fillStyle(0x8a5ae8, 1);
  g.fillTriangle(10, 48, 18, 4, 26, 48);
  g.fillStyle(0xb88af8, 1);
  g.fillTriangle(14, 48, 18, 12, 22, 48);
  g.fillStyle(0x6a3ac8, 1);
  g.fillTriangle(24, 48, 31, 20, 38, 48);
  g.fillStyle(0xd8c0ff, 0.9);
  g.fillTriangle(16, 30, 18, 16, 20, 30);
  g.generateTexture("sc-crystal", 44, 50);
  g.clear();

  // ice crystal
  g.fillStyle(0x6ab8e8, 1);
  g.fillTriangle(10, 48, 18, 4, 26, 48);
  g.fillStyle(0xb8e4ff, 1);
  g.fillTriangle(14, 48, 18, 12, 22, 48);
  g.fillStyle(0x4a90c8, 1);
  g.fillTriangle(24, 48, 31, 20, 38, 48);
  g.fillStyle(0xffffff, 0.9);
  g.fillTriangle(16, 30, 18, 16, 20, 30);
  g.generateTexture("sc-icecrystal", 44, 50);
  g.clear();

  // space crystal
  g.fillStyle(0xe858c8, 1);
  g.fillTriangle(10, 48, 18, 4, 26, 48);
  g.fillStyle(0xff9ae8, 1);
  g.fillTriangle(14, 48, 18, 12, 22, 48);
  g.fillStyle(0x58c8e8, 1);
  g.fillTriangle(24, 48, 31, 20, 38, 48);
  g.fillStyle(0xffffff, 0.9);
  g.fillTriangle(16, 28, 18, 16, 20, 28);
  g.generateTexture("sc-spacecrystal", 44, 50);
  g.clear();

  // gravestone
  g.fillStyle(0x4a4458, 1).fillRoundedRect(8, 6, 24, 34, 9);
  g.fillStyle(0x5a5468, 1).fillRect(4, 36, 32, 8);
  g.lineStyle(3, 0x36304a, 1);
  g.lineBetween(20, 14, 20, 28);
  g.lineBetween(14, 19, 26, 19);
  g.generateTexture("sc-grave", 40, 44);
  g.clear();

  // dead tree
  g.lineStyle(6, 0x2a2030, 1);
  g.lineBetween(22, 58, 22, 18);
  g.lineStyle(4, 0x2a2030, 1);
  g.lineBetween(22, 34, 8, 18);
  g.lineBetween(22, 26, 36, 10);
  g.lineBetween(22, 44, 34, 34);
  g.lineStyle(3, 0x2a2030, 1);
  g.lineBetween(8, 18, 4, 8);
  g.lineBetween(36, 10, 40, 2);
  g.generateTexture("sc-deadtree", 44, 60);
  g.clear();

  // street lamp
  g.fillStyle(0x222638, 1);
  g.fillRect(19, 12, 5, 48);
  g.fillRect(12, 56, 19, 5);
  g.fillStyle(0xffe88a, 1).fillCircle(21, 8, 7);
  g.fillStyle(0xfff8d0, 1).fillCircle(21, 8, 3.6);
  g.generateTexture("sc-lamp", 42, 62);
  g.clear();

  // neon tower block
  g.fillStyle(0x141832, 1).fillRect(6, 4, 32, 58);
  g.lineStyle(2, 0xe858c8, 0.95).strokeRect(6, 4, 32, 58);
  g.fillStyle(0xffe066, 0.92);
  for (let yy = 10; yy < 56; yy += 9) {
    for (let xx = 11; xx < 34; xx += 8) {
      if ((xx * 7 + yy * 13) % 3 !== 0) g.fillRect(xx, yy, 4, 5);
    }
  }
  g.generateTexture("sc-tower", 44, 64);
  g.clear();

  // power pylon
  g.fillStyle(0x1a2428, 1);
  g.fillRect(19, 6, 5, 54);
  g.fillRect(6, 14, 31, 4);
  g.fillRect(10, 26, 23, 4);
  g.fillStyle(0xfff060, 0.95).fillCircle(21, 4, 4);
  g.fillStyle(0xfff060, 0.4).fillCircle(21, 4, 8);
  g.generateTexture("sc-pylon", 44, 62);
  g.clear();

  // checkered start flag
  g.fillStyle(0x8a8a96, 1).fillRect(20, 2, 4, 58);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      g.fillStyle((r + c) % 2 === 0 ? 0xffffff : 0x16161e, 1);
      g.fillRect(24 + c * 6, 4 + r * 6, 6, 6);
    }
  }
  g.generateTexture("sc-flag", 50, 62);
  g.clear();

  // spectator trainers: [cap, hair, shirt, legs, skin]
  const TRAINERS: [number, number, number, number, number][] = [
    [0xe83a3a, 0x4a3018, 0xffd23a, 0x3a5ac8, 0xf0c8a0], // youngster
    [0xffffff, 0xe8b840, 0xff7aa8, 0x28386a, 0xf8d8b8], // lass
    [0x16161e, 0x16161e, 0xff8a30, 0x222230, 0xd8a878], // ace trainer
    [0x6a4a2c, 0x3a2a18, 0x4a8a3c, 0x6a5238, 0xc89868], // hiker
    [0xffffff, 0x2a2a3a, 0xe8e8f0, 0x4a4a5a, 0xf0c8a0], // scientist
    [0x2a2a3a, 0xb05ae8, 0x303040, 0x16161e, 0xe8c0a0]  // rocket grunt
  ];
  TRAINERS.forEach(([cap, hair, shirt, legs, skin], i) => {
    // legs + feet
    g.fillStyle(legs, 1).fillRect(7, 22, 3.5, 9).fillRect(11.5, 22, 3.5, 9);
    g.fillStyle(0x2a2430, 1).fillRect(6, 30, 5, 3).fillRect(11, 30, 5, 3);
    // torso + arms raised mid-cheer
    g.fillStyle(shirt, 1).fillRect(5.5, 12, 11, 11);
    g.fillRect(3, 8, 3, 8).fillRect(16, 8, 3, 8);
    g.fillStyle(skin, 1).fillCircle(4.5, 7, 1.8).fillCircle(17.5, 7, 1.8);
    // head, hair, cap
    g.fillStyle(skin, 1).fillCircle(11, 7.5, 4.6);
    g.fillStyle(hair, 1).fillRect(6.5, 2.5, 9, 3);
    g.fillStyle(cap, 1).fillRect(5.5, 1, 11, 3.4).fillRect(11, 3.4, 7.5, 1.8);
    g.fillStyle(0x10121f, 1).fillCircle(9.2, 8, 0.8).fillCircle(12.8, 8, 0.8);
    g.generateTexture(`sc-trainer${i}`, 22, 34);
    g.clear();
  });

  g.destroy();
}
