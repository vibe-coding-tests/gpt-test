import Phaser from "phaser";
import { Racer } from "./Racer";
import { TrackGeometry } from "../systems/TrackGeometry";
import { rollItem, ITEMS, ITEM_TYPE } from "../data/itemsData";
import type { ItemKind } from "../types";
import { clamp, lerp, wrap01, wrapAngle } from "../util";
import { Audio } from "../systems/AudioSystem";
import { Save } from "../systems/SaveSystem";
import { boltStrike, burst, floatText, ringPulse, afterimage } from "../systems/effects";
import type { AvoidPoint } from "./AIDriver";
import type { ThreeView } from "../systems/ThreeView";

const DEG = Math.PI / 180;

interface Box {
  img: Phaser.GameObjects.Image;
  x: number; y: number;
  s: number; d: number;
  active: boolean;
  respawnT: number;
  spin: number;
}

interface Decoy {
  img: Phaser.GameObjects.Image;
  x: number; y: number;
  owner: Racer;
  armT: number;
  life: number;
}

interface Cloud {
  kind: "sleep" | "toxic";
  img: Phaser.GameObjects.Image;
  owner: Racer | null;
  x: number; y: number;
  r: number;
  life: number;
  armT: number;
}

/**
 * World-space shots (Ember fireball, Rollout boulder — bounce off rails) or
 * track-space shots (Hydro Pump / Leech Seed home on a target, Ice Beam runs
 * straight down its lane).
 */
interface Projectile {
  kind: "ember" | "hydropump" | "rollout" | "icebeam" | "leechseed";
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  owner: Racer;
  x: number; y: number;
  vx: number; vy: number;
  s: number; d: number;
  target: Racer | null;
  life: number;
  armT: number;
  bounces: number;
  maxBounces: number;
  trailT: number;
  idxHint: number | undefined;
  spin: number;
  stab: boolean;
}

interface LeafRing {
  owner: Racer;
  sprites: Phaser.GameObjects.Image[];
  t: number;
  phase: number;
  hitCd: number;
}

interface PendingBolt {
  caster: Racer;
  target: Racer;
  t: number;
  cloud: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  elapsed: number;
}

export class ItemManager {
  scene: Phaser.Scene;
  geom: TrackGeometry;
  racers: Racer[];
  boxes: Box[] = [];
  battle: boolean;
  private rouletteTick = 0;
  decoys: Decoy[] = [];
  clouds: Cloud[] = [];
  projectiles: Projectile[] = [];
  leafRings = new Map<Racer, LeafRing>();
  bolts: PendingBolt[] = [];
  private aiDecisionT = new Map<Racer, number>();
  private ringTexW: number;

  constructor(scene: Phaser.Scene, geom: TrackGeometry, racers: Racer[], spawnBoxes: boolean, battle = false) {
    this.scene = scene;
    this.geom = geom;
    this.racers = racers;
    this.battle = battle;
    this.ringTexW = scene.textures.get("fx-ring").getSourceImage().width;
    if (spawnBoxes) this.spawnBoxes();
  }

  /** Nearest living enemy, optionally restricted to a forward cone. */
  private nearestEnemy(racer: Racer, maxDist: number, coneRad?: number): Racer | null {
    let best: Racer | null = null, bestD = maxDist;
    for (const r of this.racers) {
      if (r === racer || r.finished || r.falling) continue;
      const d = Math.hypot(r.x - racer.x, r.y - racer.y);
      if (d >= bestD) continue;
      if (coneRad !== undefined) {
        const rel = Math.abs(wrapAngle(Math.atan2(r.y - racer.y, r.x - racer.x) - racer.heading));
        if (rel > coneRad) continue;
      }
      bestD = d;
      best = r;
    }
    return best;
  }

  private get view(): ThreeView {
    return (this.scene as Phaser.Scene & { view: ThreeView }).view;
  }

  private spawnBoxes() {
    const safeSurfaces = ["road", "boost", "ramp", "ice", "mud"] as const;
    for (const sRow of this.geom.def.itemRows) {
      const occupied: { s: number; d: number }[] = [];
      for (const frac of [-0.66, -0.22, 0.22, 0.66]) {
        const d = frac * this.geom.def.roadHalf;
        const p = this.findBoxSpot(sRow, d, occupied, safeSurfaces);
        if (!p) continue;
        const img = this.scene.add.image(p.x, p.y, "fx-box").setDepth(3);
        this.boxes.push({ img, x: p.x, y: p.y, s: p.s, d: p.d, active: true, respawnT: 0, spin: Math.random() * 6 });
        occupied.push({ s: p.s, d: p.d });
      }
    }
  }

  private findBoxSpot(
    s: number,
    d: number,
    occupied: { s: number; d: number }[],
    safeSurfaces: readonly ("road" | "boost" | "ramp" | "ice" | "mud")[]
  ) {
    const roadHalf = this.geom.def.roadHalf;
    for (let target = d, pass = 0; pass < 3; pass++) {
      const spot = this.geom.nearestSafeSpot(s, target, {
        roadOnly: true,
        margin: 20,
        sSearchPx: 520,
        stepPx: 14,
        surfaces: safeSurfaces
      });
      if (!spot) continue;
      const tooClose = occupied.some((o) => {
        const ds = Math.abs(spot.s - o.s);
        const dsPx = Math.min(ds, 1 - ds) * this.geom.total;
        return Math.hypot(dsPx, spot.d - o.d) < 36;
      });
      if (!tooClose) return spot;
      target = pass === 0 ? Math.sign(d || 1) * roadHalf * 0.9 : -target;
    }
    return null;
  }

  update(dt: number, raceTime: number) {
    for (const b of this.boxes) {
      b.spin += dt * 2.2;
      if (!b.active) {
        b.respawnT -= dt;
        if (b.respawnT <= 0) {
          b.active = true;
          b.img.setAlpha(0);
          this.scene.tweens.add({ targets: b.img, alpha: 1, duration: 250 });
          burst(this.scene, b.x, b.y, { color: 0xffffff, n: 5, spd: 55, size: 4, life: 260 });
        }
        this.view.submit(b.img, b.x, b.y, { show: false });
        continue;
      }
      this.view.submit(b.img, b.x, b.y, {
        rot: Math.sin(b.spin) * 20 * DEG,
        lift: 3 + Math.sin(b.spin * 1.4) * 3,
        topDepth: 3
      });

      for (const r of this.racers) {
        if (r.falling || r.finished || r.item !== null || r.rouletteT > 0) continue;
        const dx = r.x - b.x, dy = r.y - b.y;
        if (dx * dx + dy * dy < (r.radius + 18) * (r.radius + 18)) {
          b.active = false;
          b.respawnT = 2.6;
          b.img.setVisible(false);
          r.rouletteT = 1.05;
          r.gainEnergy(6); // boxes feed the move meter a little too
          if (r.isPlayer) Audio.sfx("box");
          // shatter: box fragments + sparkle spray + a gold ring
          burst(this.scene, b.x, b.y, { tex: "fx-box", n: 6, size: 11, spd: 150, life: 430 });
          burst(this.scene, b.x, b.y, { color: 0xfff0a0, n: 10, spd: 110, size: 5 });
          ringPulse(this.scene, b.x, b.y, 0xffd23a, 70);
          break;
        }
      }
    }

    // roulette ticker: pitch climbs as the player's roll settles
    const pl = this.racers.find(r => r.isPlayer);
    if (pl && pl.rouletteT > 0) {
      this.rouletteTick += dt;
      if (this.rouletteTick >= 0.07) {
        this.rouletteTick = 0;
        Audio.blip(540 + (1.05 - pl.rouletteT) * 560);
      }
    } else {
      this.rouletteTick = 0;
    }

    // finish roulettes (rolls lean toward moves matching the racer's type,
    // and racers far behind the leader roll from stronger weight columns)
    const leadProgress = this.racers.reduce((m, r) => Math.max(m, r.totalProgress), 0);
    for (const r of this.racers) {
      if (r.rouletteT > 0 && r.rouletteT - dt <= 0 && r.item === null) {
        if (this.battle) {
          // battle: no standings — flat combat table, balloons-down racers
          // roll as if they were trailing (stronger column)
          r.item = rollItem(r.balloons <= 1 ? 6 : 4, Math.random, r.def.types, 0);
        } else {
          const desperation = clamp((leadProgress - r.totalProgress) / 0.45, 0, 1);
          let item = rollItem(r.rank, Math.random, r.def.types, desperation);
          if (item === "teleport" && r.rank < 6 && desperation < 0.62) item = "agility";
          if (item === "hyperbeam" && r.rank < 5 && desperation < 0.62) item = "rollout";
          r.item = item;
        }
        if (r.isPlayer) Audio.sfx("item");
      }
    }

    // decoys
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const dcy = this.decoys[i];
      dcy.life -= dt;
      dcy.armT -= dt;
      this.view.submit(dcy.img, dcy.x, dcy.y, {
        rot: Math.sin(dcy.life * 4) * 10 * DEG,
        topDepth: 3
      });
      if (dcy.life <= 0) {
        dcy.img.destroy();
        this.decoys.splice(i, 1);
        continue;
      }
      for (const r of this.racers) {
        if (r.falling || r.airT > 0 || (r === dcy.owner && dcy.armT > 0)) continue;
        const dx = r.x - dcy.x, dy = r.y - dcy.y;
        if (dx * dx + dy * dy < (r.radius + 15) * (r.radius + 15)) {
          if (r.applyHit("spin", undefined, false, 1, dcy.owner)) {
            burst(this.scene, dcy.x, dcy.y, { color: 0x9bbf6a, n: 10, spd: 120 });
            dcy.img.destroy();
            this.decoys.splice(i, 1);
          }
          break;
        }
      }
    }

    // ground clouds: sleep powder mist and toxic puddles
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.life -= dt;
      c.armT -= dt;
      c.img.setAlpha(clamp(c.life / 2, 0, c.kind === "toxic" ? 0.7 : 0.55));
      this.view.submit(c.img, c.x, c.y, {
        flat: true,
        scale: (c.r / 32) * (1 + Math.sin(c.life * 3) * 0.06),
        topDepth: 2
      });
      if (c.life <= 0) {
        c.img.destroy();
        this.clouds.splice(i, 1);
        continue;
      }
      if (c.armT > 0) continue;
      for (const r of this.racers) {
        if (r.falling || r.airT > 0 || r.def.cls === "flyer") continue;
        const dx = r.x - c.x, dy = r.y - c.y;
        if (dx * dx + dy * dy >= c.r * c.r) continue;
        if (c.kind === "sleep") {
          if (r.status.sleep <= 0 && r.status.invuln <= 0) r.applyHit("sleep", undefined, false, 1, c.owner ?? undefined);
        } else {
          const landed = r.applyHit("spin", "poison", false, 1, c.owner ?? undefined);
          if (landed) {
            r.applyHit("poison", "poison", true);
            burst(this.scene, r.x, r.y, { color: 0xb05ae8, n: 10, spd: 120, size: 5 });
            if (r.isPlayer) {
              Audio.sfx("toxic");
              floatText(this.scene, r.x, r.y - 30, "POISONED!", "#d8a8ff", 14);
            }
            c.img.destroy();
            this.clouds.splice(i, 1);
            break;
          }
        }
      }
    }

    this.updateProjectiles(dt);
    this.updateLeaves(dt);
    this.updateBolts(dt);
  }

  // ---------------- projectiles ----------------

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.armT -= dt;
      p.trailT += dt;
      p.spin += dt * (p.kind === "rollout" ? 6 : 9);

      const worldSpace = p.kind === "ember" || p.kind === "rollout";
      if (worldSpace) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const proj = this.geom.project(p.x, p.y, p.idxHint);
        p.idxHint = proj.idx;
        const limit = this.geom.corridorHalfAt(proj.s, proj.d) - 10;
        if (Math.abs(proj.d) > limit) {
          if (this.geom.edgeAt(proj.s, proj.d).mode === "open") {
            this.popProjectile(i, 0x9aa3c7);
            continue;
          }
          // reflect off the rail
          const sm = this.geom.sample(proj.s);
          const out = Math.sign(proj.d) || 1;
          const vn = p.vx * sm.nx * out + p.vy * sm.ny * out;
          if (vn > 0) {
            p.vx -= 2 * vn * sm.nx * out;
            p.vy -= 2 * vn * sm.ny * out;
            p.vx *= 0.88; p.vy *= 0.88;
            p.bounces++;
            const cl = clamp(proj.d, -limit, limit);
            const pos = this.geom.posOf(proj.s, cl);
            p.x = pos.x; p.y = pos.y;
            burst(this.scene, p.x, p.y, {
              color: p.kind === "rollout" ? 0xb0a080 : 0xffc93a, n: 4, spd: 80, size: 4, life: 220
            });
            if (p.bounces > p.maxBounces) {
              this.popProjectile(i, p.kind === "rollout" ? 0x8a7a60 : 0xff7a30);
              continue;
            }
          }
        }
        if (p.kind === "ember") {
          const surf = this.geom.surfaceAtProj(proj);
          if (surf === "water") {
            burst(this.scene, p.x, p.y, { color: 0xcfe8ff, n: 8, spd: 70, size: 5, life: 380 });
            this.killProjectile(i);
            continue;
          }
          if (p.trailT > 0.05) {
            p.trailT = 0;
            burst(this.scene, p.x, p.y, { color: Math.random() < 0.5 ? 0xff7a30 : 0xffc93a, n: 1, spd: 26, size: 4, life: 240 });
          }
          this.view.submit(p.img, p.x, p.y, { rot: p.spin, lift: 9, scale: 1, topDepth: 6 });
        } else {
          // rollout: dust kicked up by the rolling boulder
          if (p.trailT > 0.07) {
            p.trailT = 0;
            burst(this.scene, p.x, p.y, { color: 0x9a8a70, n: 1, spd: 30, size: 4, life: 300 });
          }
          this.view.submit(p.img, p.x, p.y, { rot: p.spin, lift: 11, scale: p.stab ? 1.6 : 1.25, topDepth: 6 });
        }
      } else {
        // track-space: hydropump/leechseed home on a target, icebeam runs its lane
        const spd = p.kind === "icebeam" ? 980 : p.kind === "leechseed" ? 640 : 760;
        p.s = wrap01(p.s + (spd / this.geom.total) * dt);
        if (p.kind !== "icebeam" && p.target && !p.target.finished && !p.target.falling) {
          const k = p.kind === "leechseed" ? 3 : 4;
          p.d = lerp(p.d, p.target.proj.d, 1 - Math.exp(-k * dt));
        }
        const pos = this.geom.posOf(p.s, p.d);
        p.x = pos.x; p.y = pos.y;
        if (p.trailT > 0.045) {
          p.trailT = 0;
          const col = p.kind === "hydropump" ? 0x9ad0ff : p.kind === "icebeam" ? 0xd8f4ff : 0x9ae85c;
          burst(this.scene, p.x, p.y, { color: col, n: 1, spd: 30, size: 4, life: 260 });
        }
        this.view.submit(p.img, p.x, p.y, {
          face: pos.heading, lift: 8,
          scale: p.kind === "icebeam" ? 1.2 : 1.1, topDepth: 6
        });
      }

      this.view.submit(p.shadow, p.x, p.y + 3, { flat: true, scale: 0.32, scaleY: 0.2, topDepth: 2 });

      if (p.life <= 0) {
        const popCol = { ember: 0xff7a30, hydropump: 0x4aa8f0, rollout: 0x8a7a60, icebeam: 0xbfe8ff, leechseed: 0x8ac84c }[p.kind];
        this.popProjectile(i, popCol);
        continue;
      }

      // racer collisions
      for (const r of this.racers) {
        if (r.falling || r.airT > 0 || r.finished || r.transform) continue; // dug/phased racers slip shots
        if (r === p.owner && p.armT > 0) continue;
        const dx = r.x - p.x, dy = r.y - p.y;
        const rr = r.radius + (p.kind === "rollout" ? 16 : 13);
        if (dx * dx + dy * dy >= rr * rr) continue;

        if (this.consumeLeaf(r)) {
          this.killProjectile(i);
          break;
        }
        const pow = p.stab ? 1.25 : 1;
        if (p.kind === "ember") {
          const landed = r.applyHit("spin", "fire", false, pow, p.owner);
          if (landed) {
            r.applyHit("burn", "fire", true, pow);
            burst(this.scene, r.x, r.y, { color: 0xff7a30, n: 12, spd: 130, size: 6 });
            if (r.isPlayer || p.owner.isPlayer) Audio.sfx("ember");
          }
          this.killProjectile(i);
        } else if (p.kind === "hydropump") {
          const landed = r.applyHit("spin", "water", false, pow, p.owner);
          if (landed) {
            r.applyHit("drowsy", "water", true, pow);
            ringPulse(this.scene, r.x, r.y, 0x4aa8f0, 80);
            burst(this.scene, r.x, r.y, { color: 0x9ad0ff, n: 14, spd: 150, size: 6 });
            Audio.sfx("splash");
            if (r.isPlayer) floatText(this.scene, r.x, r.y - 30, "SOAKED!", "#9ad0ff", 14);
          }
          this.killProjectile(i);
        } else if (p.kind === "rollout") {
          // the boulder flattens whoever it hits and keeps rolling
          const landed = r.applyHit("squash", "rock", false, pow, p.owner);
          if (landed) {
            burst(this.scene, r.x, r.y, { color: 0xb0a080, n: 12, spd: 140, size: 6 });
            if (r.isPlayer || p.owner.isPlayer) Audio.sfx("bump");
            if (r.isPlayer) floatText(this.scene, r.x, r.y - 30, "FLATTENED!", "#d8c8a8", 14);
          }
          continue;
        } else if (p.kind === "icebeam") {
          const landed = r.applyHit("freeze", "ice", false, pow, p.owner);
          if (landed) {
            burst(this.scene, r.x, r.y, { color: 0xd8f4ff, n: 14, spd: 150, size: 6 });
            if (r.isPlayer) floatText(this.scene, r.x, r.y - 30, "FROZEN SOLID!", "#bfe8ff", 14);
          }
          this.killProjectile(i);
        } else {
          // leechseed: sap the victim, fuel the owner
          const landed = r.applyHit("leech", "grass", false, pow);
          if (landed) {
            r.applyHit("spin", "grass", true, 0.8, p.owner);
            p.owner.applyBoost(1.24, p.stab ? 3.2 : 2.4, p.owner.isPlayer ? "boost2" : undefined);
            p.owner.agilityFxT = Math.max(p.owner.agilityFxT, 1);
            burst(this.scene, r.x, r.y, { color: 0x8ac84c, n: 12, spd: 130, size: 5 });
            if (r.isPlayer) floatText(this.scene, r.x, r.y - 30, "LEECHED!", "#8ac84c", 14);
            if (p.owner.isPlayer) floatText(this.scene, p.owner.x, p.owner.y - 30, "energy drained!", "#9ae85c", 13);
          }
          this.killProjectile(i);
        }
        break;
      }
    }
  }

  private popProjectile(i: number, color: number) {
    const p = this.projectiles[i];
    burst(this.scene, p.x, p.y, { color, n: 8, spd: 90, size: 5 });
    this.killProjectile(i);
  }

  private killProjectile(i: number) {
    const p = this.projectiles[i];
    p.img.destroy();
    p.shadow.destroy();
    this.projectiles.splice(i, 1);
  }

  // ---------------- razor leaf ----------------

  private updateLeaves(dt: number) {
    for (const [owner, ring] of this.leafRings) {
      ring.t -= dt;
      ring.phase += dt * 7;
      ring.hitCd -= dt;

      if (ring.t <= 0 || ring.sprites.length === 0 || owner.falling || owner.finished) {
        for (const s of ring.sprites) s.destroy();
        this.leafRings.delete(owner);
        continue;
      }

      const orbitR = owner.radius + 24;
      ring.sprites.forEach((leaf, li) => {
        const a = ring.phase + (li / ring.sprites.length) * Math.PI * 2;
        const lx = owner.x + Math.cos(a) * orbitR;
        const ly = owner.y + Math.sin(a) * orbitR;
        leaf.setAlpha(ring.t < 1 ? clamp(ring.t, 0.25, 1) : 1);
        this.view.submit(leaf, lx, ly, { rot: a * 3, lift: 12 + Math.sin(a * 2) * 3, topDepth: 6.5 });
      });

      // slash rivals that touch the ring
      if (ring.hitCd <= 0) {
        for (const r of this.racers) {
          if (r === owner || r.falling || r.airT > 0 || r.finished || r.status.invuln > 0 || r.transform) continue;
          const dd = Math.hypot(r.x - owner.x, r.y - owner.y);
          if (Math.abs(dd - orbitR) < r.radius + 9 || dd < orbitR) {
            if (r.applyHit("spin", "grass", false, 1, owner)) {
              Audio.sfx("leaf");
              burst(this.scene, r.x, r.y, { color: 0x7ac74c, n: 10, spd: 120, size: 5 });
              const leaf = ring.sprites.pop();
              leaf?.destroy();
              ring.hitCd = 0.35;
            }
            break;
          }
        }
      }
    }
  }

  /** Razor Leaf blocks one projectile. Returns true if a leaf absorbed the hit. */
  private consumeLeaf(r: Racer): boolean {
    const ring = this.leafRings.get(r);
    if (!ring || ring.sprites.length === 0) return false;
    const leaf = ring.sprites.pop();
    leaf?.destroy();
    Audio.sfx("leaf");
    burst(this.scene, r.x, r.y, { color: 0x7ac74c, n: 8, spd: 110, size: 5 });
    return true;
  }

  // ---------------- thunderbolt telegraph ----------------

  private updateBolts(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      b.elapsed += dt;
      const valid = !b.target.finished && !b.target.falling;

      if (valid) {
        b.cloud.setAlpha(0.7 + Math.sin(b.elapsed * 14) * 0.2);
        b.ring.setAlpha(0.4 + Math.sin(b.elapsed * 16) * 0.3);
        this.view.submit(b.cloud, b.target.x, b.target.y, { lift: 74, scale: 1.5, topDepth: 9 });
        this.view.submit(b.ring, b.target.x, b.target.y, {
          flat: true, scale: 84 / this.ringTexW, topDepth: 2
        });
      }

      if (b.t <= 0) {
        if (valid) {
          Audio.sfx("thunder");
          boltStrike(this.scene, b.target.x, b.target.y);
          b.target.applyHit("thunderbolt", "electric", false, 1, b.caster);
          if (b.target.isPlayer || b.caster.isPlayer) {
            this.scene.cameras.main.shake(180, 0.004);
          }
        }
        b.cloud.destroy();
        b.ring.destroy();
        this.bolts.splice(i, 1);
      }
    }
  }

  // ---------------- item use ----------------

  /**
   * Use the racer's held item. Same Type Attack Bonus: when the move's type
   * matches the user's, the item comes out visibly upgraded.
   */
  use(racer: Racer) {
    const item = racer.item;
    if (!item || racer.finished || racer.falling) return;
    if (!(racer.isPlayer && Save.cheats.infiniteItems)) racer.item = null;
    const stab = racer.def.types.includes(ITEM_TYPE[item]);
    if (stab && racer.isPlayer) {
      floatText(this.scene, racer.x, racer.y - 44, `STAB! ${ITEMS[item].name}+`, "#8ecdff", 13);
    }
    switch (item) {
      case "agility": this.doAgility(racer, stab); break;
      case "protect": this.doProtect(racer, stab); break;
      case "substitute": this.doSubstitute(racer, stab); break;
      case "sleeppowder": this.doSleepPowder(racer, stab); break;
      case "thunderbolt": this.doThunderbolt(racer, stab); break;
      case "teleport": this.doTeleport(racer, stab); break;
      case "ember": this.doEmber(racer, stab); break;
      case "hydropump": this.doHydroPump(racer, stab); break;
      case "razorleaf": this.doRazorLeaf(racer, stab); break;
      case "rollout": this.doRollout(racer, stab); break;
      case "icebeam": this.doIceBeam(racer, stab); break;
      case "toxic": this.doToxic(racer, stab); break;
      case "hyperbeam": this.doHyperBeam(racer, stab); break;
      case "leechseed": this.doLeechSeed(racer, stab); break;
    }
  }

  doAgility(racer: Racer, stab = false) {
    racer.applyBoost(stab ? 1.5 : 1.42, stab ? 1.7 : 1.25, "boost3");
    racer.agilityFxT = stab ? 1.7 : 1.25;
    ringPulse(this.scene, racer.x, racer.y, 0x58c8f0, 70);
  }

  private doProtect(racer: Racer, stab = false) {
    racer.shieldT = stab ? 13 : 9;
    racer.shieldHits = Math.max(racer.shieldHits, 1);
    racer.shieldImg.setTint(0x58e8c8);
    Audio.sfx("shield");
  }

  private doSubstitute(racer: Racer, stab = false) {
    const p = racer.tailPos(2.2);
    const img = this.scene.add.image(p.x, p.y, "fx-doll").setDepth(3);
    if (stab) img.setScale(1.25);
    this.decoys.push({ img, x: p.x, y: p.y, owner: racer, armT: 0.7, life: stab ? 36 : 24 });
    if (racer.isPlayer) Audio.sfx("select");
  }

  private doSleepPowder(racer: Racer, stab = false) {
    Audio.sfx("sleep");
    const w = stab ? 1.3 : 1;
    const img = this.scene.add.image(racer.x, racer.y, "fx-cloud").setDepth(2).setTint(0x9ad05a).setAlpha(0.5);
    this.clouds.push({ kind: "sleep", img, owner: racer, x: racer.x, y: racer.y, r: 80 * w, life: 3.2, armT: 0.8 });
    burst(this.scene, racer.x, racer.y, { color: 0x9ad05a, n: 14, spd: 150, size: 6 });
    for (const r of this.racers) {
      if (r === racer || r.falling || r.def.cls === "flyer" || r.airT > 0) continue;
      const d = Math.hypot(r.x - racer.x, r.y - racer.y);
      if (d < 105 * w) r.applyHit("sleep", undefined, false, stab ? 1.2 : 1, racer);
      else if (d < 210 * w) r.applyHit("drowsy");
    }
  }

  private doThunderbolt(racer: Racer, stab = false) {
    // race: telegraphed strike on the racer directly ahead in the standings
    // (STAB calls a second bolt on the next one up); battle: zap whoever's
    // closest — there are no standings to climb
    const targets: Racer[] = [];
    if (this.battle) {
      const t1 = this.nearestEnemy(racer, 620);
      if (t1) {
        targets.push(t1);
        if (stab) {
          // STAB: fork to the second-nearest as well
          let best = 620, near: Racer | null = null;
          for (const r of this.racers) {
            if (r === racer || r === t1 || r.finished || r.falling) continue;
            const d = Math.hypot(r.x - racer.x, r.y - racer.y);
            if (d < best) { best = d; near = r; }
          }
          if (near) targets.push(near);
        }
      }
    } else {
      const byRank = (rank: number) => this.racers.find((r) => r.rank === rank && !r.finished && r !== racer) ?? null;
      if (racer.rank > 1) {
        const t1 = byRank(racer.rank - 1);
        if (t1) targets.push(t1);
        if (stab && racer.rank > 2) {
          const t2 = byRank(racer.rank - 2);
          if (t2) targets.push(t2);
        }
      }
    }
    if (targets.length === 0) {
      let best = Infinity, near: Racer | null = null;
      for (const r of this.racers) {
        if (r === racer || r.finished || r.falling) continue;
        const d = Math.hypot(r.x - racer.x, r.y - racer.y);
        if (d < best && d < 900) { best = d; near = r; }
      }
      if (near) targets.push(near);
    }
    if (targets.length === 0) {
      floatText(this.scene, racer.x, racer.y - 30, "no target!", "#ccccdd", 13);
      return;
    }
    Audio.sfx("count");
    for (const target of targets) {
      const cloud = this.scene.add.image(0, 0, "fx-cloud").setDepth(9).setTint(0x3a3a5a).setScale(1.5);
      const ring = this.scene.add.image(0, 0, "fx-ring").setDepth(2).setTint(0xfff060);
      this.bolts.push({ caster: racer, target, t: 0.75, cloud, ring, elapsed: 0 });
      if (target.isPlayer) {
        floatText(this.scene, target.x, target.y - 36, "!", "#fff060", 22);
      }
    }
  }

  private doTeleport(racer: Racer, stab = false) {
    Audio.sfx("teleport");
    burst(this.scene, racer.x, racer.y, { color: 0xc878f0, n: 12, spd: 130 });
    afterimage(this.scene, racer.sprite, 0xc878f0);
    if (this.battle) {
      // battle: escape hatch — blink to the far side of the arena
      // (STAB grants a longer mercy window on arrival)
      racer.teleportToS(wrap01(racer.proj.s + 0.4 + Math.random() * 0.2));
      racer.status.invuln = Math.max(racer.status.invuln, stab ? 2.2 : 1.4);
      return;
    }
    const targetRank = Math.max(1, racer.rank - (stab ? 4 : 3));
    const ahead = this.racers.find((r) => r.rank === targetRank && r !== racer);
    if (ahead) {
      const s = wrap01(ahead.proj.s - 50 / this.geom.total);
      racer.teleportToS(s);
    } else {
      racer.teleportToS(wrap01(racer.proj.s + 600 / this.geom.total));
    }
  }

  private doEmber(racer: Racer, stab = false) {
    // STAB (fire types) fans out three fireballs
    const spreads = stab ? [-0.16, 0, 0.16] : [0];
    for (const off of spreads) {
      const a = racer.heading + off;
      const sx = racer.x + Math.cos(a) * (racer.radius + 12);
      const sy = racer.y + Math.sin(a) * (racer.radius + 12);
      const sp = 540 + racer.speed * 0.35;
      const img = this.scene.add.image(sx, sy, "fx-fire").setDepth(6);
      const shadow = this.scene.add.image(sx, sy, "fx-shadow").setDepth(2).setAlpha(0.25);
      this.projectiles.push({
        kind: "ember", img, shadow, owner: racer,
        x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        s: 0, d: 0, target: null,
        life: 5, armT: 0.35, bounces: 0, maxBounces: 5, trailT: 0, idxHint: undefined, spin: 0, stab
      });
    }
    burst(this.scene, racer.x, racer.y, { color: 0xff7a30, n: 6, spd: 90, size: 5 });
    if (racer.isPlayer) Audio.sfx("ember");
  }

  private doHydroPump(racer: Racer, stab = false) {
    let target: Racer | null = null;
    if (this.battle) {
      // battle: home on whoever's in front of the muzzle
      target = this.nearestEnemy(racer, 1100, 0.8) ?? this.nearestEnemy(racer, 700);
    } else if (racer.rank > 1) {
      target = this.racers.find((r) => r.rank === racer.rank - 1 && !r.finished) ?? null;
    }
    if (!target && !this.battle) {
      // nearest racer ahead on the track within ~1500px
      let best = 1500;
      for (const r of this.racers) {
        if (r === racer || r.finished || r.falling) continue;
        const gap = (r.totalProgress - racer.totalProgress) * this.geom.total;
        if (gap > 0 && gap < best) { best = gap; target = r; }
      }
    }
    const a = racer.heading;
    const sx = racer.x + Math.cos(a) * (racer.radius + 12);
    const sy = racer.y + Math.sin(a) * (racer.radius + 12);
    const proj = this.geom.project(sx, sy, racer.proj.idx);
    const img = this.scene.add.image(sx, sy, "fx-drop").setDepth(6);
    const shadow = this.scene.add.image(sx, sy, "fx-shadow").setDepth(2).setAlpha(0.25);
    this.projectiles.push({
      kind: "hydropump", img, shadow, owner: racer,
      x: sx, y: sy, vx: 0, vy: 0,
      s: proj.s, d: clamp(proj.d, -this.geom.def.roadHalf, this.geom.def.roadHalf),
      target,
      life: 4.5, armT: 0.35, bounces: 0, maxBounces: 0, trailT: 0, idxHint: undefined, spin: 0, stab
    });
    burst(this.scene, sx, sy, { color: 0x9ad0ff, n: 6, spd: 90, size: 5 });
    if (racer.isPlayer) Audio.sfx("hydro");
    // a homing shot you can't see coming isn't fair — call it out
    if (target?.isPlayer && !racer.isPlayer) {
      floatText(this.scene, target.x, target.y - 36, "!", "#9ad0ff", 22);
      Audio.sfx("warn");
    }
  }

  private doRazorLeaf(racer: Racer, stab = false) {
    const old = this.leafRings.get(racer);
    if (old) for (const s of old.sprites) s.destroy();
    const sprites: Phaser.GameObjects.Image[] = [];
    const n = stab ? 5 : 3;
    for (let i = 0; i < n; i++) {
      sprites.push(this.scene.add.image(racer.x, racer.y, "fx-leaf").setDepth(6.5));
    }
    this.leafRings.set(racer, { owner: racer, sprites, t: 6.5, phase: Math.random() * 6, hitCd: 0.4 });
    Audio.sfx("leaf");
    ringPulse(this.scene, racer.x, racer.y, 0x7ac74c, 60);
  }

  private doRollout(racer: Racer, stab = false) {
    const a = racer.heading;
    const sx = racer.x + Math.cos(a) * (racer.radius + 16);
    const sy = racer.y + Math.sin(a) * (racer.radius + 16);
    const sp = (stab ? 520 : 460) + racer.speed * 0.25;
    const img = this.scene.add.image(sx, sy, "fx-boulder").setDepth(6);
    const shadow = this.scene.add.image(sx, sy, "fx-shadow").setDepth(2).setAlpha(0.3);
    this.projectiles.push({
      kind: "rollout", img, shadow, owner: racer,
      x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      s: 0, d: 0, target: null,
      life: 4.5, armT: 0.4, bounces: 0, maxBounces: stab ? 5 : 3, trailT: 0, idxHint: undefined, spin: 0, stab
    });
    burst(this.scene, sx, sy, { color: 0xb0a080, n: 8, spd: 100, size: 5 });
    Audio.sfx("rumble");
  }

  private doIceBeam(racer: Racer, stab = false) {
    const a = racer.heading;
    const sx = racer.x + Math.cos(a) * (racer.radius + 12);
    const sy = racer.y + Math.sin(a) * (racer.radius + 12);
    const proj = this.geom.project(sx, sy, racer.proj.idx);
    const img = this.scene.add.image(sx, sy, "fx-shard").setDepth(6);
    const shadow = this.scene.add.image(sx, sy, "fx-shadow").setDepth(2).setAlpha(0.25);
    this.projectiles.push({
      kind: "icebeam", img, shadow, owner: racer,
      x: sx, y: sy, vx: 0, vy: 0,
      s: proj.s, d: clamp(proj.d, -this.geom.def.roadHalf + 8, this.geom.def.roadHalf - 8),
      target: null,
      life: 2.6, armT: 0.3, bounces: 0, maxBounces: 0, trailT: 0, idxHint: undefined, spin: 0, stab
    });
    burst(this.scene, sx, sy, { color: 0xd8f4ff, n: 6, spd: 90, size: 5 });
    Audio.sfx("freeze");
  }

  private doToxic(racer: Racer, stab = false) {
    const p = racer.tailPos(2.4);
    const img = this.scene.add.image(p.x, p.y, "fx-cloud").setDepth(2).setTint(0xb05ae8).setAlpha(0.6);
    this.clouds.push({
      kind: "toxic", img, owner: racer, x: p.x, y: p.y,
      r: stab ? 92 : 70, life: stab ? 16 : 11, armT: 0.7
    });
    burst(this.scene, p.x, p.y, { color: 0xb05ae8, n: 8, spd: 90, size: 5 });
    if (racer.isPlayer) Audio.sfx("toxic");
  }

  private doHyperBeam(racer: Racer, stab = false) {
    // race: blasts everyone on the road ahead, then slings the user forward.
    // battle: a straight cannon shot along the aim heading.
    const lenPx = stab ? 1300 : 950;
    const len = lenPx / this.geom.total;
    Audio.sfx("hyper");
    this.scene.cameras.main.flash(220, 255, 220, 160);
    this.scene.cameras.main.shake(260, 0.006);
    const steps = Math.ceil(lenPx / 70);
    for (let i = 0; i <= steps; i++) {
      let pos: { x: number; y: number };
      if (this.battle) {
        pos = {
          x: racer.x + Math.cos(racer.heading) * (lenPx * i) / steps,
          y: racer.y + Math.sin(racer.heading) * (lenPx * i) / steps
        };
      } else {
        const s = wrap01(racer.proj.s + (len * i) / steps);
        pos = this.geom.posOf(s, clamp(racer.proj.d, -this.geom.def.roadHalf * 0.6, this.geom.def.roadHalf * 0.6));
      }
      this.scene.time.delayedCall(i * 26, () => {
        burst(this.scene, pos.x, pos.y, { color: i % 2 === 0 ? 0xffa050 : 0xfff0c0, n: 6, spd: 130, size: 7, life: 320 });
      });
    }
    ringPulse(this.scene, racer.x, racer.y, 0xffa050, 110);
    for (const r of this.racers) {
      if (r === racer || r.finished || r.falling) continue;
      let inBeam: boolean;
      if (this.battle) {
        const d = Math.hypot(r.x - racer.x, r.y - racer.y);
        const rel = Math.abs(wrapAngle(Math.atan2(r.y - racer.y, r.x - racer.x) - racer.heading));
        inBeam = d < lenPx && rel < 0.35;
      } else {
        const ahead = wrap01(r.proj.s - racer.proj.s);
        inBeam = ahead < len && Math.abs(r.proj.d) < this.geom.def.roadHalf;
      }
      if (inBeam) {
        const landed = r.applyHit("spin", "normal", false, stab ? 1.25 : 1, racer);
        if (landed) {
          burst(this.scene, r.x, r.y, { color: 0xffa050, n: 14, spd: 160, size: 6 });
          if (r.isPlayer) floatText(this.scene, r.x, r.y - 30, "BLASTED!", "#ffa050", 15);
        }
      }
    }
    racer.applyBoost(1.32, 1.1, racer.isPlayer ? "boost3" : undefined);
  }

  private doLeechSeed(racer: Racer, stab = false) {
    let target: Racer | null = null;
    if (this.battle) {
      target = this.nearestEnemy(racer, 900, 0.7) ?? this.nearestEnemy(racer, 600);
    } else if (racer.rank > 1) {
      target = this.racers.find((r) => r.rank === racer.rank - 1 && !r.finished) ?? null;
    }
    const a = racer.heading;
    const sx = racer.x + Math.cos(a) * (racer.radius + 12);
    const sy = racer.y + Math.sin(a) * (racer.radius + 12);
    const proj = this.geom.project(sx, sy, racer.proj.idx);
    const img = this.scene.add.image(sx, sy, "fx-seed").setDepth(6);
    const shadow = this.scene.add.image(sx, sy, "fx-shadow").setDepth(2).setAlpha(0.25);
    this.projectiles.push({
      kind: "leechseed", img, shadow, owner: racer,
      x: sx, y: sy, vx: 0, vy: 0,
      s: proj.s, d: clamp(proj.d, -this.geom.def.roadHalf, this.geom.def.roadHalf),
      target,
      life: 4, armT: 0.35, bounces: 0, maxBounces: 0, trailT: 0, idxHint: undefined, spin: 0, stab
    });
    burst(this.scene, sx, sy, { color: 0x8ac84c, n: 6, spd: 80, size: 5 });
    if (racer.isPlayer) Audio.sfx("leech");
    if (target?.isPlayer && !racer.isPlayer) {
      floatText(this.scene, target.x, target.y - 36, "!", "#8ac84c", 22);
      Audio.sfx("warn");
    }
  }

  // ---------------- AI ----------------

  /** Simple AI item usage. */
  aiUpdate(dt: number, raceStarted: boolean) {
    if (!raceStarted) return;
    for (const r of this.racers) {
      if (r.isPlayer || !r.item || r.finished || r.falling) continue;
      const t = (this.aiDecisionT.get(r) ?? 0) - dt;
      if (t > 0) {
        this.aiDecisionT.set(r, t);
        continue;
      }
      // unhurried trigger fingers — the field shouldn't be a constant barrage
      this.aiDecisionT.set(r, 0.85 + Math.random() * 0.7);

      const item: ItemKind = r.item;
      let useNow = false;
      switch (item) {
        case "teleport": useNow = true; break;
        case "agility": useNow = r.surface === "road" && !r.drifting && Math.random() < 0.45; break;
        case "thunderbolt": {
          const target = this.racers.find((o) => o.rank === r.rank - 1);
          useNow = !!target && Math.hypot(target.x - r.x, target.y - r.y) < 650;
          if (r.rank === 1) useNow = Math.random() < 0.15;
          break;
        }
        case "sleeppowder": {
          let near = 0;
          for (const o of this.racers) {
            if (o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 250) near++;
          }
          useNow = near >= 1 && Math.random() < 0.4;
          break;
        }
        case "substitute": useNow = Math.random() < 0.3; break;
        case "protect": useNow = r.rank <= 3 ? Math.random() < 0.5 : Math.random() < 0.2; break;
        case "ember": {
          // fire when someone is roughly ahead of the nose
          let aimed = false;
          for (const o of this.racers) {
            if (o === r || o.finished || o.falling) continue;
            const dx = o.x - r.x, dy = o.y - r.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 700) continue;
            const ang = Math.atan2(dy, dx);
            let diff = ang - r.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) < 0.35) { aimed = true; break; }
          }
          useNow = aimed || Math.random() < 0.05;
          break;
        }
        case "hydropump": {
          const target = this.racers.find((o) => o.rank === r.rank - 1 && !o.finished);
          if (target) {
            const gap = (target.totalProgress - r.totalProgress) * this.geom.total;
            useNow = gap > 60 && gap < 1500;
          } else {
            useNow = Math.random() < 0.15;
          }
          break;
        }
        case "razorleaf": {
          let near = 0;
          for (const o of this.racers) {
            if (o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 300) near++;
          }
          useNow = near >= 1 || Math.random() < 0.15;
          break;
        }
        case "rollout": {
          // roll it when someone is roughly ahead of the nose
          let aimed = false;
          for (const o of this.racers) {
            if (o === r || o.finished || o.falling) continue;
            const dx = o.x - r.x, dy = o.y - r.y;
            if (Math.hypot(dx, dy) > 650) continue;
            let diff = Math.atan2(dy, dx) - r.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) < 0.3) { aimed = true; break; }
          }
          useNow = aimed || Math.random() < 0.05;
          break;
        }
        case "icebeam": {
          const target = this.racers.find((o) => o.rank === r.rank - 1 && !o.finished);
          if (target) {
            const gap = (target.totalProgress - r.totalProgress) * this.geom.total;
            const laneDiff = Math.abs(target.proj.d - r.proj.d);
            useNow = gap > 60 && gap < 1100 && laneDiff < 60;
          } else {
            useNow = Math.random() < 0.1;
          }
          break;
        }
        case "toxic": {
          // drop the puddle when someone is tailing close behind
          let tailing = false;
          for (const o of this.racers) {
            if (o === r || o.finished) continue;
            const gap = (r.totalProgress - o.totalProgress) * this.geom.total;
            if (gap > 0 && gap < 320) { tailing = true; break; }
          }
          useNow = tailing || Math.random() < 0.08;
          break;
        }
        case "hyperbeam": useNow = Math.random() < 0.5; break;
        case "leechseed": {
          const target = this.racers.find((o) => o.rank === r.rank - 1 && !o.finished);
          if (target) {
            const gap = (target.totalProgress - r.totalProgress) * this.geom.total;
            useNow = gap > 50 && gap < 1300;
          }
          break;
        }
      }
      if (useNow) this.use(r);
    }
  }

  avoidPoints(): AvoidPoint[] {
    const pts: AvoidPoint[] = [];
    for (const d of this.decoys) pts.push({ x: d.x, y: d.y, r: 18 });
    for (const c of this.clouds) {
      if (c.armT <= 0) pts.push({ x: c.x, y: c.y, r: c.r });
    }
    for (const p of this.projectiles) {
      pts.push({ x: p.x, y: p.y, r: p.kind === "rollout" ? 36 : 28 });
    }
    for (const b of this.bolts) pts.push({ x: b.target.x, y: b.target.y, r: 55 });
    return pts;
  }

  destroy() {
    for (const b of this.boxes) b.img.destroy();
    for (const d of this.decoys) d.img.destroy();
    for (const c of this.clouds) c.img.destroy();
    for (const p of this.projectiles) { p.img.destroy(); p.shadow.destroy(); }
    for (const [, ring] of this.leafRings) for (const s of ring.sprites) s.destroy();
    for (const b of this.bolts) { b.cloud.destroy(); b.ring.destroy(); }
    this.leafRings.clear();
  }
}
