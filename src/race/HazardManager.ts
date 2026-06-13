import Phaser from "phaser";
import { Racer } from "./Racer";
import { TrackGeometry } from "../systems/TrackGeometry";
import { ensurePokemonTexture } from "../systems/SpriteFactory";
import { Rng, clamp, wrap01 } from "../util";
import { Audio } from "../systems/AudioSystem";
import { burst, boltStrike, floatText, ringPulse } from "../systems/effects";
import type { AvoidPoint, CandySpot } from "./AIDriver";
import type { ThreeView } from "../systems/ThreeView";

interface Candy extends CandySpot {
  img: Phaser.GameObjects.Image;
  respawnT: number;
}

interface Diglett {
  x: number; y: number;
  sprite: Phaser.GameObjects.Sprite;
  mound: Phaser.GameObjects.Image;
  state: "hidden" | "warn" | "up";
  t: number;
}

interface Snorlax {
  x: number; y: number;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  state: "hidden" | "warn" | "sit" | "leave";
  t: number;
  fallLift: number;
}

/** Roaming legendary: Zapdos zaps, Moltres dive-bombs, Articuno freezes. */
interface Bird {
  kind: "zapdos" | "moltres" | "articuno";
  sprite: Phaser.GameObjects.Sprite;
  cloud: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  s: number;
  t: number;
  strikeT: number;
  target: Racer | null;
  telegraphT: number;
  wx: number;
  wy: number;
}

interface Gastly {
  sprite: Phaser.GameObjects.Sprite;
  s: number;
  t: number;
  phase: number;
  hitCd: number;
  solid: boolean;
  wx: number;
  wy: number;
}

interface Electrode {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  state: "idle" | "gone";
  t: number;
  bumps: number;
  pulse: number;
}

interface Boulder {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  homeS: number;
  s: number;
  d: number;
  rolling: boolean;
  t: number;
  rot: number;
  wx: number;
  wy: number;
}

interface FirePatch {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  r: number;
  life: number;
}

export class HazardManager {
  scene: Phaser.Scene;
  geom: TrackGeometry;
  racers: Racer[];
  candies: Candy[] = [];
  digletts: Diglett[] = [];
  snorlaxes: Snorlax[] = [];
  birds: Bird[] = [];
  gastlys: Gastly[] = [];
  electrodes: Electrode[] = [];
  boulders: Boulder[] = [];
  firePatches: FirePatch[] = [];
  rng: Rng;
  elapsed = 0;
  onPlayerCandy?: (count: number) => void;
  private shadowTexW: number;
  private shadowTexH: number;
  private ringTexW: number;

  private get view(): ThreeView {
    return (this.scene as Phaser.Scene & { view: ThreeView }).view;
  }

  constructor(scene: Phaser.Scene, geom: TrackGeometry, racers: Racer[], seed: number) {
    this.scene = scene;
    this.geom = geom;
    this.racers = racers;
    this.rng = new Rng(seed);
    const sh = scene.textures.get("fx-shadow").getSourceImage();
    this.shadowTexW = sh.width;
    this.shadowTexH = sh.height;
    this.ringTexW = scene.textures.get("fx-ring").getSourceImage().width;

    for (const c of geom.def.candies) {
      const p = geom.posOf(c.s, c.d);
      const img = scene.add.image(p.x, p.y, "fx-candy").setDepth(3);
      this.candies.push({ x: p.x, y: p.y, s: c.s, d: c.d, active: true, img, respawnT: 0 });
    }

    for (const h of geom.def.hazards) {
      if (h.kind === "diglett") {
        const p = geom.posOf(h.s ?? 0, h.d ?? 0);
        const key = ensurePokemonTexture(scene, 50);
        const mound = scene.add.image(p.x, p.y + 4, "fx-mound").setDepth(2).setAlpha(0);
        const sprite = scene.add.sprite(p.x, p.y, key, 2).setDepth(4).setScale(0.85).setVisible(false);
        this.digletts.push({ x: p.x, y: p.y, sprite, mound, state: "hidden", t: this.rng.range(1, 4) });
      } else if (h.kind === "snorlax") {
        const p = geom.posOf(h.s ?? 0, h.d ?? 0);
        const key = ensurePokemonTexture(scene, 143);
        const shadow = scene.add.image(p.x, p.y, "fx-shadow").setDepth(2).setAlpha(0);
        const sprite = scene.add.sprite(p.x, p.y, key, 2).setDepth(9).setScale(1.7).setVisible(false);
        this.snorlaxes.push({ x: p.x, y: p.y, sprite, shadow, state: "hidden", t: this.rng.range(1.5, 4), fallLift: 0 });
      } else if (h.kind === "zapdos" || h.kind === "moltres" || h.kind === "articuno") {
        const spec = {
          zapdos: { id: 145, cloud: 0x4a4a6a, ring: 0xffe066 },
          moltres: { id: 146, cloud: 0xc2502a, ring: 0xff8a3a },
          articuno: { id: 144, cloud: 0x9ac8e8, ring: 0x8ae0ff }
        }[h.kind];
        const key = ensurePokemonTexture(scene, spec.id);
        const cloud = scene.add.image(0, 0, "fx-cloud").setDepth(9).setTint(spec.cloud).setAlpha(0.85).setScale(2.4);
        const sprite = scene.add.sprite(0, 0, key, 0).setDepth(9.1).setScale(1.1);
        const ring = scene.add.image(0, 0, "fx-ring").setDepth(2).setTint(spec.ring).setVisible(false);
        this.birds.push({ kind: h.kind, sprite, cloud, ring, s: 0.3, t: 0, strikeT: 5, target: null, telegraphT: 0, wx: 0, wy: 0 });
      } else if (h.kind === "gastly") {
        const key = ensurePokemonTexture(scene, 92);
        const sprite = scene.add.sprite(0, 0, key, 0).setDepth(6).setScale(1.05).setAlpha(0.8);
        this.gastlys.push({ sprite, s: h.s ?? 0, t: this.rng.range(0, 6), phase: this.rng.range(0, Math.PI * 2), hitCd: 0, solid: false, wx: 0, wy: 0 });
      } else if (h.kind === "electrode") {
        const p = geom.posOf(h.s ?? 0, h.d ?? 0);
        const key = ensurePokemonTexture(scene, 101);
        const sprite = scene.add.sprite(p.x, p.y, key, 2).setDepth(4).setScale(1.05);
        this.electrodes.push({ x: p.x, y: p.y, sprite, state: "idle", t: 0, bumps: 0, pulse: this.rng.range(0, Math.PI * 2) });
      } else if (h.kind === "boulder") {
        const key = ensurePokemonTexture(scene, 75);
        const sprite = scene.add.sprite(0, 0, key, 2).setDepth(6).setScale(1.15);
        const shadow = scene.add.image(0, 0, "fx-shadow").setDepth(2).setAlpha(0.3);
        this.boulders.push({
          sprite, shadow, homeS: h.s ?? 0, s: h.s ?? 0, d: h.d ?? 0,
          rolling: false, t: this.rng.range(2, 5), rot: 0, wx: 0, wy: 0
        });
      }
    }
  }

  update(dt: number, raceStarted: boolean) {
    this.elapsed += dt;

    // --- rare candies ---
    for (const c of this.candies) {
      if (!c.active) {
        c.respawnT -= dt;
        if (c.respawnT <= 0) c.active = true;
        this.view.submit(c.img, c.x, c.y, { show: false });
        continue;
      }
      this.view.submit(c.img, c.x, c.y, {
        scale: 1 + Math.sin(this.elapsed * 4 + c.x) * 0.12,
        lift: 2 + Math.sin(this.elapsed * 3 + c.x) * 2,
        topDepth: 3
      });
      for (const r of this.racers) {
        if (r.falling || r.finished) continue;
        const dx = r.x - c.x, dy = r.y - c.y;
        if (dx * dx + dy * dy < (r.radius + 15) * (r.radius + 15)) {
          c.active = false;
          c.respawnT = 12;
          r.candies++;
          if (r.isPlayer) {
            Audio.sfx("candy");
            if (r.candies < 2) {
              floatText(this.scene, c.x, c.y - 20, `Rare Candy ${r.candies}/2`, "#ffd0f0", 14);
            }
            this.onPlayerCandy?.(r.candies);
          }
          r.evolveIfReady();
          break;
        }
      }
    }

    // --- digletts ---
    for (const d of this.digletts) {
      d.t -= dt;
      switch (d.state) {
        case "hidden":
          if (d.t <= 0 && raceStarted) {
            d.state = "warn";
            d.t = 0.55;
            d.mound.setAlpha(0.9);
          }
          break;
        case "warn":
          if (d.t <= 0) {
            d.state = "up";
            d.t = 1.05;
            burst(this.scene, d.x, d.y, { color: 0x8a6a4a, n: 6, spd: 70, size: 5 });
          }
          break;
        case "up": {
          d.sprite.setFrame(Math.floor(this.elapsed * 6) % 2);
          for (const r of this.racers) {
            if (r.falling || r.airT > 0 || r.def.cls === "flyer" || r.status.invuln > 0) continue;
            const dx = r.x - d.x, dy = r.y - d.y;
            if (dx * dx + dy * dy < (r.radius + 16) * (r.radius + 16)) {
              r.applyHit("spin");
            }
          }
          if (d.t <= 0) {
            d.state = "hidden";
            d.t = this.rng.range(1.6, 4.5);
            d.mound.setAlpha(0);
          }
          break;
        }
      }
      this.view.submit(d.mound, d.x, d.y + 4, {
        show: d.state !== "hidden",
        flat: true,
        scale: d.state === "warn" ? 1 + Math.sin(this.elapsed * 20) * 0.15 : 1,
        topDepth: 2
      });
      this.view.submit(d.sprite, d.x, d.y, {
        show: d.state === "up",
        scale: 0.85,
        lift: Math.sin(Math.min(1, (1.05 - Math.max(d.t, 0)) * 6) * Math.PI / 2) * 6,
        topDepth: 4
      });
    }

    // --- falling snorlax ---
    for (const s of this.snorlaxes) {
      s.t -= dt;
      switch (s.state) {
        case "hidden":
          if (s.t <= 0 && raceStarted) {
            s.state = "warn";
            s.t = 1.1;
            s.shadow.setAlpha(0.2);
          }
          break;
        case "warn": {
          const f = 1 - Math.max(s.t, 0) / 1.1;
          s.shadow.setAlpha(0.2 + f * 0.3);
          if (s.t <= 0) {
            s.state = "sit";
            s.t = 2.4;
            s.fallLift = 260;
            s.sprite.setAlpha(1);
            this.scene.tweens.add({ targets: s, fallLift: 0, duration: 160, ease: "Quad.easeIn" });
            this.scene.time.delayedCall(160, () => {
              Audio.sfx("bump");
              this.scene.cameras.main.shake(160, 0.006);
              burst(this.scene, s.x, s.y, { color: 0xc8b8a0, n: 12, spd: 140, size: 6 });
              for (const r of this.racers) {
                if (r.falling || r.airT > 0 || r.status.invuln > 0) continue;
                const d = Math.hypot(r.x - s.x, r.y - s.y);
                if (d < 95 && r.def.cls !== "heavy") r.applyHit("squash");
                else if (d < 95) r.applyHit("spin");
              }
            });
          }
          break;
        }
        case "sit": {
          // solid obstacle while sitting
          for (const r of this.racers) {
            if (r.falling || r.airT > 0) continue;
            const dx = r.x - s.x, dy = r.y - s.y;
            const dd = Math.hypot(dx, dy);
            const minD = r.radius + 52;
            if (dd < minD && dd > 0) {
              r.x = s.x + (dx / dd) * minD;
              r.y = s.y + (dy / dd) * minD;
              r.vx *= 0.6; r.vy *= 0.6;
            }
          }
          if (s.t <= 0) {
            s.state = "leave";
            s.t = 0.5;
          }
          break;
        }
        case "leave":
          s.sprite.setAlpha(Math.max(s.t, 0) * 2);
          s.shadow.setAlpha(Math.max(s.t, 0) * 0.5);
          if (s.t <= 0) {
            s.state = "hidden";
            s.t = this.rng.range(4, 8);
            s.shadow.setAlpha(0);
          }
          break;
      }
      {
        const warnF = s.state === "warn" ? 1 - Math.max(s.t, 0) / 1.1 : 1;
        const sw = (40 + warnF * 120) / this.shadowTexW;
        const shh = (26 + warnF * 80) / this.shadowTexH;
        this.view.submit(s.shadow, s.x, s.y, {
          show: s.state !== "hidden",
          flat: true, scale: sw, scaleY: shh, topDepth: 2
        });
        this.view.submit(s.sprite, s.x, s.y, {
          show: s.state === "sit" || s.state === "leave",
          scale: 1.7,
          lift: s.fallLift,
          topDepth: 9
        });
      }
    }

    // --- roaming legendaries ---
    for (const z of this.birds) {
      z.t += dt;
      z.s = wrap01(z.s + (95 / this.geom.total) * dt);
      const wander = Math.sin(z.t * 0.5) * this.geom.def.roadHalf * 0.45;
      const p = this.geom.posOf(z.s, wander);
      z.wx = p.x;
      z.wy = p.y;
      const bob = Math.sin(z.t * 2) * 4;
      z.sprite.setFrame(Math.floor(z.t * 5) % 3);
      this.view.submit(z.cloud, p.x, p.y, { lift: 38 - bob, scale: 2.4, topDepth: 9 });
      this.view.submit(z.sprite, p.x, p.y, { lift: 58 - bob, scale: 1.1, face: p.heading, topDepth: 9.1 });

      if (z.target) {
        z.telegraphT -= dt;
        z.ring.setAlpha(0.4 + Math.sin(z.t * 16) * 0.3);
        this.view.submit(z.ring, z.target.x, z.target.y, {
          show: true, flat: true, scale: 90 / this.ringTexW, topDepth: 2
        });
        if (z.telegraphT <= 0) {
          this.birdStrike(z, z.target);
          z.target = null;
          z.ring.setVisible(false);
        }
      } else if (raceStarted) {
        z.strikeT -= dt;
        if (z.strikeT <= 0) {
          z.strikeT = this.rng.range(4.5, 7);
          const immuneType = z.kind === "zapdos" ? "electric" : z.kind === "moltres" ? "fire" : "ice";
          let best: Racer | null = null;
          let bestD = 520;
          for (const r of this.racers) {
            if (r.falling || r.finished || r.def.types.includes(immuneType)) continue;
            const d = Math.hypot(r.x - z.wx, r.y - z.wy);
            if (d < bestD) { bestD = d; best = r; }
          }
          if (best) {
            z.target = best;
            z.telegraphT = 0.85;
          }
        }
      }
    }

    // --- lingering fire patches (moltres) ---
    for (let i = this.firePatches.length - 1; i >= 0; i--) {
      const fp = this.firePatches[i];
      fp.life -= dt;
      if (fp.life <= 0) {
        fp.img.destroy();
        this.firePatches.splice(i, 1);
        continue;
      }
      fp.img.setAlpha(clamp(fp.life / 1.5, 0, 0.8));
      this.view.submit(fp.img, fp.x, fp.y, {
        flat: true, scale: (fp.r * 2.2) / 64 * (1 + Math.sin(this.elapsed * 9 + fp.x) * 0.1), topDepth: 2
      });
      for (const r of this.racers) {
        if (r.falling || r.airT > 0 || r.def.cls === "flyer") continue;
        const dx = r.x - fp.x, dy = r.y - fp.y;
        if (dx * dx + dy * dy < fp.r * fp.r) r.applyHit("burn", "fire");
      }
    }

    // --- gastly sweepers ---
    for (const ga of this.gastlys) {
      ga.t += dt;
      ga.hitCd = Math.max(0, ga.hitCd - dt);
      const d = Math.sin(ga.t * 0.7 + ga.phase) * this.geom.def.roadHalf * 0.85;
      const p = this.geom.posOf(ga.s, d);
      ga.wx = p.x;
      ga.wy = p.y;
      const fade = 0.45 + Math.sin(ga.t * 1.7 + ga.phase) * 0.35; // phases in and out
      ga.solid = fade > 0.5;
      ga.sprite.setFrame(Math.floor(ga.t * 4) % 3);
      ga.sprite.setAlpha(fade);
      this.view.submit(ga.sprite, ga.wx, ga.wy, {
        lift: 12 + Math.sin(ga.t * 2.4) * 4, scale: 1.05, topDepth: 6
      });
      if (ga.hitCd <= 0 && ga.solid) {
        for (const r of this.racers) {
          if (r.falling || r.finished || r.status.invuln > 0) continue;
          const dx = r.x - ga.wx, dy = r.y - ga.wy;
          if (dx * dx + dy * dy < (r.radius + 16) * (r.radius + 16)) {
            // ghost moves whiff on normal types — they drive right through
            if (r.applyHit("spin", "ghost")) {
              Audio.sfx("haunt");
              burst(this.scene, r.x, r.y, { color: 0x9a7ac8, n: 10, spd: 110, size: 5 });
              if (r.isPlayer) floatText(this.scene, r.x, r.y - 32, "SPOOKED!", "#b8a0e0", 14);
            }
            ga.hitCd = 1.2;
            break;
          }
        }
      }
    }

    // --- electrode bumpers ---
    for (const e of this.electrodes) {
      e.pulse += dt;
      if (e.state === "gone") {
        e.t -= dt;
        this.view.submit(e.sprite, e.x, e.y, { show: false });
        if (e.t <= 0) {
          e.state = "idle";
          e.bumps = 0;
          e.sprite.setAlpha(0);
          this.scene.tweens.add({ targets: e.sprite, alpha: 1, duration: 300 });
        }
        continue;
      }
      const sc = 1.05 + Math.sin(e.pulse * 3.2) * 0.06 + e.bumps * 0.06;
      this.view.submit(e.sprite, e.x, e.y, { scale: sc, topDepth: 4 });
      e.sprite.setTint(e.bumps >= 2 && Math.sin(e.pulse * 14) > 0 ? 0xff8a8a : 0xffffff);
      for (const r of this.racers) {
        if (r.falling || r.airT > 0 || r.finished) continue;
        const dx = r.x - e.x, dy = r.y - e.y;
        const dd = Math.hypot(dx, dy);
        const minD = r.radius + 22;
        if (dd < minD && dd > 0) {
          // pinball bounce
          const nx = dx / dd, ny = dy / dd;
          r.x = e.x + nx * minD;
          r.y = e.y + ny * minD;
          const vn = r.vx * nx + r.vy * ny;
          if (vn < 0) {
            r.vx -= nx * vn * 1.9;
            r.vy -= ny * vn * 1.9;
          }
          r.vx += nx * 160;
          r.vy += ny * 160;
          if (r.bumpCd <= 0) {
            r.bumpCd = 0.3;
            e.bumps++;
            Audio.sfx("bump");
            burst(this.scene, e.x + nx * 24, e.y + ny * 24, { color: 0xfff060, n: 6, spd: 110, size: 4 });
            if (e.bumps >= 3) {
              // SELF-DESTRUCT
              e.state = "gone";
              e.t = 4.5;
              Audio.sfx("thunder");
              this.scene.cameras.main.shake(150, 0.005);
              burst(this.scene, e.x, e.y, { color: 0xffffff, n: 18, spd: 220, size: 7 });
              burst(this.scene, e.x, e.y, { color: 0xfff060, n: 12, spd: 150, size: 6 });
              ringPulse(this.scene, e.x, e.y, 0xfff060, 110);
              floatText(this.scene, e.x, e.y - 30, "BOOM!", "#fff060", 16);
              for (const v of this.racers) {
                if (v.falling || v.airT > 0) continue;
                if (Math.hypot(v.x - e.x, v.y - e.y) < 95) v.applyHit("spin", "electric");
              }
            }
          }
        }
      }
    }

    // --- rolling boulders (oncoming!) ---
    for (const b of this.boulders) {
      if (!b.rolling) {
        b.t -= dt;
        this.view.submit(b.sprite, b.wx, b.wy, { show: false });
        this.view.submit(b.shadow, b.wx, b.wy, { show: false });
        if (b.t <= 0 && raceStarted) {
          b.rolling = true;
          b.t = 13;
          b.s = b.homeS;
          b.d = this.rng.range(-0.55, 0.55) * this.geom.def.roadHalf;
        }
        continue;
      }
      b.t -= dt;
      b.s = wrap01(b.s - (235 / this.geom.total) * dt); // rolls against race direction
      b.d += Math.sin(b.t * 1.3) * 14 * dt;
      b.rot -= 5 * dt;
      const p = this.geom.posOf(b.s, b.d);
      b.wx = p.x;
      b.wy = p.y;
      this.view.submit(b.shadow, b.wx, b.wy + 3, {
        flat: true, scale: 52 / this.shadowTexW, scaleY: 34 / this.shadowTexH, topDepth: 2
      });
      this.view.submit(b.sprite, b.wx, b.wy, { rot: b.rot, scale: 1.15, topDepth: 6 });
      for (const r of this.racers) {
        if (r.falling || r.airT > 0 || r.status.invuln > 0 || r.def.cls === "flyer") continue;
        const dx = r.x - b.wx, dy = r.y - b.wy;
        if (dx * dx + dy * dy < (r.radius + 24) * (r.radius + 24)) {
          const hit = r.def.cls === "heavy" ? r.applyHit("spin") : r.applyHit("squash");
          if (hit) {
            burst(this.scene, r.x, r.y, { color: 0x9a9a92, n: 10, spd: 130, size: 5 });
            if (r.isPlayer) this.scene.cameras.main.shake(140, 0.005);
          }
        }
      }
      if (b.t <= 0) {
        b.rolling = false;
        b.t = this.rng.range(3, 6);
        burst(this.scene, b.wx, b.wy, { color: 0x8a8a82, n: 8, spd: 100, size: 5 });
      }
    }
  }

  /** Resolve a legendary bird's telegraphed attack. */
  private birdStrike(z: Bird, target: Racer) {
    if (z.kind === "zapdos") {
      boltStrike(this.scene, target.x, target.y);
      Audio.sfx("thunder");
      target.applyHit("thunderbolt", "electric");
      if (target.isPlayer) this.scene.cameras.main.shake(200, 0.005);
    } else if (z.kind === "moltres") {
      Audio.sfx("ember");
      burst(this.scene, target.x, target.y, { color: 0xff7a30, n: 18, spd: 190, size: 7 });
      burst(this.scene, target.x, target.y, { color: 0xffc93a, n: 10, spd: 120, size: 5 });
      ringPulse(this.scene, target.x, target.y, 0xff8a3a, 90);
      const landed = target.applyHit("spin", "fire");
      if (landed) target.applyHit("burn", "fire", true);
      if (target.isPlayer) this.scene.cameras.main.shake(170, 0.005);
      // scorched ground lingers
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2 + this.rng.range(0, 1);
        const fx = target.x + Math.cos(ang) * this.rng.range(0, 34);
        const fy = target.y + Math.sin(ang) * this.rng.range(0, 34);
        const img = this.scene.add.image(fx, fy, "fx-cloud").setTint(0xff7a30).setAlpha(0.7).setDepth(2);
        this.firePatches.push({ img, x: fx, y: fy, r: 30, life: 3.2 });
      }
    } else {
      Audio.sfx("freeze");
      burst(this.scene, target.x, target.y, { color: 0xbfe8ff, n: 16, spd: 150, size: 6 });
      ringPulse(this.scene, target.x, target.y, 0x8ae0ff, 90);
      target.applyHit("freeze", "ice");
      if (target.isPlayer) this.scene.cameras.main.shake(150, 0.004);
    }
  }

  candySpots(): CandySpot[] {
    return this.candies;
  }

  avoidPoints(): AvoidPoint[] {
    const pts: AvoidPoint[] = [];
    for (const d of this.digletts) {
      if (d.state !== "hidden") pts.push({ x: d.x, y: d.y, r: 22 });
    }
    for (const s of this.snorlaxes) {
      if (s.state !== "hidden") pts.push({ x: s.x, y: s.y, r: 70 });
    }
    for (const z of this.birds) {
      if (z.target) pts.push({ x: z.target.x, y: z.target.y, r: 60 });
    }
    for (const ga of this.gastlys) {
      if (ga.solid) pts.push({ x: ga.wx, y: ga.wy, r: 26 });
    }
    for (const e of this.electrodes) {
      if (e.state === "idle") pts.push({ x: e.x, y: e.y, r: 34 });
    }
    for (const b of this.boulders) {
      if (b.rolling) pts.push({ x: b.wx, y: b.wy, r: 34 });
    }
    for (const fp of this.firePatches) pts.push({ x: fp.x, y: fp.y, r: fp.r + 8 });
    return pts;
  }

  destroy() {
    for (const c of this.candies) c.img.destroy();
    for (const d of this.digletts) { d.sprite.destroy(); d.mound.destroy(); }
    for (const s of this.snorlaxes) { s.sprite.destroy(); s.shadow.destroy(); }
    for (const z of this.birds) { z.sprite.destroy(); z.cloud.destroy(); z.ring.destroy(); }
    for (const ga of this.gastlys) ga.sprite.destroy();
    for (const e of this.electrodes) e.sprite.destroy();
    for (const b of this.boulders) { b.sprite.destroy(); b.shadow.destroy(); }
    for (const fp of this.firePatches) fp.img.destroy();
  }
}
