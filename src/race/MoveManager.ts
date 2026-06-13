import Phaser from "phaser";
import { Racer } from "./Racer";
import { TrackGeometry } from "../systems/TrackGeometry";
import { MOVES, MoveDef } from "../data/movesData";
import { Audio } from "../systems/AudioSystem";
import { burst, floatText, ringPulse } from "../systems/effects";
import { clamp, wrapAngle } from "../util";
import type { ThreeView } from "../systems/ThreeView";

/**
 * Signature moves: the personal layer on top of item-box specials.
 * Cast from the energy meter with Z / X (Q / E on WASD). Every hit funnels
 * through Racer.applyHit, so the type chart, mercy windows, reflect stances
 * and battle balloons all apply without special cases here.
 */

type ShotKind = "swift" | "iceshard" | "pinmissile" | "rockthrow" | "acidspray";
type ZoneKind = "firespin" | "stunspore" | "frostmist" | "stringshot" | "acid";
type DashKind = "quickattack" | "flamecharge" | "aquajet" | "volttackle" | "machpunch" | "dragonrush";

interface Shot {
  kind: ShotKind;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  owner: Racer;
  x: number; y: number;
  vx: number; vy: number;
  z: number; vz: number;     // lob arc for rockthrow / acidspray
  life: number;
  armT: number;
  spin: number;
  target: Racer | null;      // swift homing
}

interface Zone {
  kind: ZoneKind;
  img: Phaser.GameObjects.Image;
  owner: Racer;
  x: number; y: number;
  r: number;
  life: number;
  armT: number;
  bob: number;
  tickCd: Map<Racer, number>;
}

interface Dash {
  racer: Racer;
  kind: DashKind;
  t: number;
  trailT: number;
  hit: Set<Racer>;
}

const ZONE_TINT: Record<ZoneKind, number> = {
  firespin: 0xff8a40, stunspore: 0xd8e858, frostmist: 0xbfe8ff, stringshot: 0xe8e8f8, acid: 0xb05ae8
};
const DASH_COLOR: Record<DashKind, number> = {
  quickattack: 0xffffff, flamecharge: 0xff8a40, aquajet: 0x6ab8ff,
  volttackle: 0xfff060, machpunch: 0xffb070, dragonrush: 0x9a7aff
};

export class MoveManager {
  scene: Phaser.Scene;
  geom: TrackGeometry;
  racers: Racer[];
  battle: boolean;

  shots: Shot[] = [];
  zones: Zone[] = [];
  dashes: Dash[] = [];
  rainT = 0;
  private rainFxT = 0;
  private aiT = new Map<Racer, number>();

  constructor(scene: Phaser.Scene, geom: TrackGeometry, racers: Racer[], battle: boolean) {
    this.scene = scene;
    this.geom = geom;
    this.racers = racers;
    this.battle = battle;
  }

  private get view(): ThreeView {
    return (this.scene as Phaser.Scene & { view: ThreeView }).view;
  }

  private foesOf(r: Racer): Racer[] {
    return this.racers.filter((o) => o !== r && !o.finished && !o.falling && !o.eliminated);
  }

  /** Nearest foe within range, optionally inside a forward cone. */
  private nearestFoe(r: Racer, range: number, cone?: number): Racer | null {
    let best: Racer | null = null, bestD = range;
    for (const o of this.foesOf(r)) {
      const d = Math.hypot(o.x - r.x, o.y - r.y);
      if (d >= bestD) continue;
      if (cone !== undefined) {
        const rel = Math.abs(wrapAngle(Math.atan2(o.y - r.y, o.x - r.x) - r.heading));
        if (rel > cone) continue;
      }
      bestD = d; best = o;
    }
    return best;
  }

  /** Player / AI entry point. Returns true when the move actually fired. */
  tryUse(r: Racer, slot: number): boolean {
    const id = r.equippedMoves[slot];
    if (!id) return false;
    const move = MOVES[id];
    if (!move || r.energy < move.cost || r.moveCdT > 0) return false;
    if (r.falling || r.eliminated || r.finished || r.transform) return false;
    if (r.status.sleep > 0 || r.status.squash > 0 || r.status.spin > 0 || r.status.freeze > 0) return false;
    const onGround = r.airT <= 0;
    if ((id === "dig" || id === "bodyslam") && !onGround) return false;

    if (!this.cast(r, move)) return false;
    r.energy -= move.cost;
    r.moveCdT = 0.55;
    if (r.isPlayer) {
      Audio.sfx("move");
      floatText(this.scene, r.x, r.y - 40, move.name.toUpperCase() + "!", "#ffe066", 14);
    }
    return true;
  }

  /** Execute a move. Returns false when there's no valid way to fire it. */
  private cast(r: Racer, move: MoveDef): boolean {
    switch (move.id) {
      // ---- dashes ----
      case "quickattack": return this.dash(r, "quickattack", 1.34, 0.5, 170);
      case "flamecharge": return this.dash(r, "flamecharge", 1.36, 1.1, 150);
      case "aquajet": {
        const onWater = r.surface === "water";
        return this.dash(r, "aquajet", onWater ? 1.5 : 1.36, onWater ? 1.5 : 0.75, onWater ? 230 : 160);
      }
      case "volttackle": return this.dash(r, "volttackle", 1.42, 0.95, 190);
      case "machpunch": return this.dash(r, "machpunch", 1.4, 0.45, 210);
      case "dragonrush": return this.dash(r, "dragonrush", 1.38, 1.0, 180);

      // ---- shots ----
      case "iceshard": this.spawnShot(r, "iceshard", 760, 1.0); return true;
      case "pinmissile":
        for (const off of [-0.16, 0, 0.16]) this.spawnShot(r, "pinmissile", 700, 0.95, off);
        return true;
      case "swift": {
        const t = this.nearestFoe(r, 680);
        const s = this.spawnShot(r, "swift", 560, 1.6);
        s.target = t; // homes if anyone's around, flies straight otherwise
        return true;
      }
      case "rockthrow": this.spawnLob(r, "rockthrow"); return true;
      case "acidspray": this.spawnLob(r, "acidspray"); return true;

      // ---- zones (dropped behind) ----
      case "firespin": this.dropZone(r, "firespin", 58, 5.5); return true;
      case "stunspore": this.dropZone(r, "stunspore", 62, 6); return true;
      case "frostmist": this.dropZone(r, "frostmist", 70, 6); return true;
      case "stringshot": this.dropZone(r, "stringshot", 64, 7); return true;

      // ---- pulses ----
      case "thunderwave": {
        const foes = this.coneFoes(r, 330, 0.6);
        this.fanFx(r, 0xfff060, 330, 0.6);
        Audio.sfx("zap");
        for (const f of foes) f.applyHit("thunderbolt", "electric", false, 0.8, r);
        return true;
      }
      case "gust": {
        const foes = this.coneFoes(r, 300, 0.7);
        this.fanFx(r, 0xcfe8ff, 300, 0.7);
        for (const f of foes) {
          const dx = f.x - r.x, dy = f.y - r.y;
          const d = Math.hypot(dx, dy) || 1;
          // mass runs 0.8 (Pidgey) to 2.5 (Snorlax): lights get launched, heavies budge
          const heft = clamp(2.1 - f.stats.mass * 0.72, 0.4, 1.6);
          f.vx += (dx / d) * 360 * heft;
          f.vy += (dy / d) * 360 * heft;
          burst(this.scene, f.x, f.y, { color: 0xcfe8ff, n: 6, spd: 90, size: 4 });
        }
        return true;
      }
      case "roar": {
        const foes = this.coneFoes(r, 320, 0.65);
        this.fanFx(r, 0xffc0a0, 320, 0.65);
        for (const f of foes) {
          const dx = f.x - r.x, dy = f.y - r.y;
          const d = Math.hypot(dx, dy) || 1;
          f.vx += (dx / d) * 200;
          f.vy += (dy / d) * 200;
          f.applyHit("drowsy", "normal", false, 0.9, r);
        }
        return true;
      }
      case "dragonbreath": {
        const foes = this.coneFoes(r, 330, 0.55);
        this.fanFx(r, 0x9a7aff, 330, 0.55);
        for (const f of foes) f.applyHit("spin", "dragon", false, 0.85, r);
        return true;
      }
      case "confusion": {
        const t = this.nearestFoe(r, 460, 0.6);
        if (!t) return false;
        ringPulse(this.scene, t.x, t.y, 0xf0a8ff, 60);
        t.applyHit("confuse", "psychic", false, 1, r);
        return true;
      }
      case "vinewhip": {
        const t = this.nearestFoe(r, 400, 0.65);
        if (!t) return false;
        // dotted vine, a yank for them, a slingshot for us
        for (let i = 1; i <= 6; i++) {
          const k = i / 6;
          burst(this.scene, r.x + (t.x - r.x) * k, r.y + (t.y - r.y) * k, { color: 0x4cb84c, n: 2, spd: 24, size: 4, life: 260 });
        }
        t.applyHit("spin", "grass", false, 0.8, r);
        const dx = t.x - r.x, dy = t.y - r.y;
        const d = Math.hypot(dx, dy) || 1;
        r.vx += (dx / d) * 290;
        r.vy += (dy / d) * 290;
        r.applyBoost(1.3, 0.5);
        Audio.sfx("vine");
        return true;
      }
      case "lick": {
        const t = this.nearestFoe(r, 170);
        if (!t) return false;
        t.applyHit("thunderbolt", "ghost", false, 0.7, r);
        r.applyBoost(1.2, 1.1);
        floatText(this.scene, r.x, r.y - 30, "PACE STOLEN!", "#b08aff", 13);
        return true;
      }
      case "sludgewave": {
        ringPulse(this.scene, r.x, r.y, 0xb05ae8, 130);
        Audio.sfx("quake");
        for (const f of this.foesOf(r)) {
          if (Math.hypot(f.x - r.x, f.y - r.y) > 150) continue;
          f.applyHit("spin", "poison", false, 0.7, r);
          f.applyHit("poison", "poison", true, 1);
        }
        return true;
      }
      case "bodyslam":
        r.airT = Math.max(r.airT, 0.46);
        r.slamPending = "body";
        if (r.isPlayer) Audio.sfx("boost1");
        return true;
      case "earthquake":
        if (r.airT > 0) {
          r.slamPending = "quake"; // detonates on touchdown, bigger
        } else {
          this.quakePulse(r, 175);
        }
        return true;

      // ---- stances / transforms / buffs ----
      case "counter":
        r.reflectT = 1.6;
        r.reflectOnce = true;
        ringPulse(this.scene, r.x, r.y, 0xffb070, 60);
        return true;
      case "barrier":
        r.reflectT = 3.2;
        r.reflectOnce = false;
        ringPulse(this.scene, r.x, r.y, 0xf0a8ff, 70);
        return true;

      // ---- guards: shields, shells and cleanses ----
      case "harden":
        r.shieldT = Math.max(r.shieldT, 6);
        r.shieldHits = Math.max(r.shieldHits, 1);
        r.shieldImg.setTint(0xd8d0c0);
        Audio.sfx("shield");
        ringPulse(this.scene, r.x, r.y, 0xd8d0c0, 60);
        return true;
      case "withdraw":
        r.shieldT = Math.max(r.shieldT, 8);
        r.shieldHits = Math.max(r.shieldHits, 2);
        r.shieldImg.setTint(0x6ab8ff);
        Audio.sfx("shield");
        ringPulse(this.scene, r.x, r.y, 0x6ab8ff, 70);
        burst(this.scene, r.x, r.y, { color: 0x9ad0ff, n: 8, spd: 80, size: 4 });
        return true;
      case "haze": {
        const afflicted = r.status.burn > 0 || r.status.poison > 0 || r.status.leech > 0
          || r.status.paralysis > 0 || r.status.drowsy > 0 || r.status.confuse > 0;
        r.cleanseStatus();
        r.status.invuln = Math.max(r.status.invuln, 1.6);
        Audio.sfx("freeze");
        ringPulse(this.scene, r.x, r.y, 0xd8f4ff, 85);
        burst(this.scene, r.x, r.y, { color: 0xeaf6ff, n: 12, spd: 70, size: 5, life: 420 });
        if (r.isPlayer && afflicted) floatText(this.scene, r.x, r.y - 28, "cleansed!", "#d8f4ff", 12);
        return true;
      }
      case "recover": {
        r.cleanseStatus();
        r.applyBoost(1.15, 0.8, r.isPlayer ? "recover" : undefined);
        ringPulse(this.scene, r.x, r.y, 0x8af0c8, 70);
        burst(this.scene, r.x, r.y - 10, { color: 0x8af0c8, n: 10, spd: 60, size: 4, life: 420 });
        if (r.isPlayer) floatText(this.scene, r.x, r.y - 28, "refreshed!", "#8af0c8", 12);
        return true;
      }
      case "acidarmor":
        r.shieldT = Math.max(r.shieldT, 8);
        r.shieldHits = Math.max(r.shieldHits, 1);
        r.acidT = Math.max(r.acidT, 8);
        r.shieldImg.setTint(0xb05ae8);
        Audio.sfx("toxic");
        ringPulse(this.scene, r.x, r.y, 0xb05ae8, 75);
        burst(this.scene, r.x, r.y, { color: 0xb05ae8, n: 10, spd: 70, size: 5 });
        return true;
      case "dig":
        r.transform = "dig";
        r.transformT = 1.5;
        burst(this.scene, r.x, r.y + 4, { color: 0xb08a58, n: 14, spd: 140, size: 6 });
        Audio.sfx("quake");
        return true;
      case "fly":
        r.transform = "fly";
        r.transformT = 1.7;
        r.airT = Math.max(r.airT, 0.4);
        r.applyBoost(1.18, 1.7);
        if (r.isPlayer) Audio.sfx("updraft");
        return true;
      case "shadowsneak":
        r.transform = "phase";
        r.transformT = 1.4;
        r.applyBoost(1.22, 1.4);
        ringPulse(this.scene, r.x, r.y, 0xb08aff, 70);
        return true;
      case "rockpolish":
        r.offroadFreeT = 3.5;
        r.applyBoost(1.3, 0.9, r.isPlayer ? "boost2" : undefined);
        burst(this.scene, r.x, r.y, { color: 0xd8d0c0, n: 10, spd: 100, size: 4 });
        return true;
      case "raindance":
        this.rainT = 4.5;
        Audio.sfx("rain");
        floatText(this.scene, r.x, r.y - 40, "RAIN DANCE!", "#6ab8ff", 15);
        return true;
    }
    return false;
  }

  // ---------------- primitives ----------------

  private dash(r: Racer, kind: DashKind, mult: number, dur: number, kick: number): boolean {
    r.applyBoost(mult, dur, r.isPlayer ? "boost2" : undefined);
    r.vx += Math.cos(r.heading) * kick;
    r.vy += Math.sin(r.heading) * kick;
    this.dashes.push({ racer: r, kind, t: dur, trailT: 0, hit: new Set() });
    return true;
  }

  private spawnShot(r: Racer, kind: ShotKind, speed: number, life: number, angleOff = 0): Shot {
    const a = r.heading + angleOff;
    const tex = kind === "swift" ? "fx-spark" : "fx-shard";
    const tint = kind === "swift" ? 0xffd860 : kind === "pinmissile" ? 0xe8f0d0 : 0xbfe8ff;
    const img = this.scene.add.image(r.x, r.y, tex).setDepth(6).setTint(tint);
    const shadow = this.scene.add.image(r.x, r.y, "fx-shadow").setDepth(2).setAlpha(0.2);
    const s: Shot = {
      kind, img, shadow, owner: r,
      x: r.x + Math.cos(a) * (r.radius + 10), y: r.y + Math.sin(a) * (r.radius + 10),
      vx: Math.cos(a) * speed + r.vx * 0.45, vy: Math.sin(a) * speed + r.vy * 0.45,
      z: 0, vz: 0, life, armT: 0.16, spin: 0, target: null
    };
    this.shots.push(s);
    return s;
  }

  private spawnLob(r: Racer, kind: "rockthrow" | "acidspray") {
    const s = this.spawnShot(r, kind, 430, 2.5);
    s.img.setTexture(kind === "rockthrow" ? "fx-boulder" : "fx-drop");
    if (kind === "acidspray") s.img.setTint(0xb05ae8); else s.img.clearTint();
    s.z = 6; s.vz = 150; // lobbed: lands by gravity, not by timeout
    Audio.sfx("throw");
  }

  private dropZone(r: Racer, kind: ZoneKind, radius: number, life: number) {
    const back = r.tailPos(2.2);
    const img = this.scene.add.image(back.x, back.y, "fx-cloud").setDepth(3)
      .setTint(ZONE_TINT[kind]).setAlpha(0.85);
    this.zones.push({
      kind, img, owner: r, x: back.x, y: back.y, r: radius,
      life, armT: 0.7, bob: Math.random() * 6, tickCd: new Map()
    });
  }

  private coneFoes(r: Racer, range: number, cone: number): Racer[] {
    return this.foesOf(r).filter((f) => {
      if (f.transform || f.status.invuln > 0) return false;
      const d = Math.hypot(f.x - r.x, f.y - r.y);
      if (d > range) return false;
      const rel = Math.abs(wrapAngle(Math.atan2(f.y - r.y, f.x - r.x) - r.heading));
      return rel <= cone;
    });
  }

  /** Spray of particles filling a forward cone — the "I cast something" tell. */
  private fanFx(r: Racer, color: number, range: number, cone: number) {
    for (let i = 0; i < 10; i++) {
      const a = r.heading + (Math.random() * 2 - 1) * cone;
      const d = 30 + Math.random() * range * 0.7;
      burst(this.scene, r.x + Math.cos(a) * d, r.y + Math.sin(a) * d, { color, n: 1, spd: 40, size: 4, life: 300 });
    }
  }

  private quakePulse(caster: Racer, radius: number) {
    ringPulse(this.scene, caster.x, caster.y, 0xb08a58, radius * 0.8);
    Audio.sfx("quake");
    this.scene.cameras.main.shake(220, 0.005);
    for (const f of this.foesOf(caster)) {
      // the whole point of Earthquake: only the grounded feel it
      if (f.airT > 0 || f.hovering || f.transform) continue;
      if (Math.hypot(f.x - caster.x, f.y - caster.y) > radius) continue;
      f.applyHit("spin", "ground", false, 1, caster);
    }
  }

  /** Called from Racer.onLand when a Body Slam / airborne Earthquake lands. */
  landSlam(r: Racer, kind: "body" | "quake") {
    if (kind === "quake") {
      this.quakePulse(r, 215);
      return;
    }
    ringPulse(this.scene, r.x, r.y, 0xffe066, 105);
    Audio.sfx("slam");
    for (const f of this.foesOf(r)) {
      if (f.airT > 0 || f.transform) continue;
      if (Math.hypot(f.x - r.x, f.y - r.y) > 125) continue;
      f.applyHit("spin", "normal", false, 0.9, r);
    }
  }

  // ---------------- per-frame ----------------

  update(dt: number) {
    this.updateDashes(dt);
    this.updateShots(dt);
    this.updateZones(dt);
    this.updateRain(dt);
  }

  private updateDashes(dt: number) {
    for (let i = this.dashes.length - 1; i >= 0; i--) {
      const d = this.dashes[i];
      const r = d.racer;
      d.t -= dt;
      if (d.t <= 0 || r.falling || r.eliminated) {
        this.dashes.splice(i, 1);
        continue;
      }
      d.trailT += dt;
      if (d.trailT > 0.05) {
        d.trailT = 0;
        const back = r.tailPos(1.1);
        burst(this.scene, back.x, back.y, { color: DASH_COLOR[d.kind], n: 2, spd: 50, size: 5, life: 260 });
      }
      if (d.kind === "quickattack" || d.kind === "aquajet") continue; // pure mobility
      for (const f of this.foesOf(r)) {
        if (d.hit.has(f) || f.transform || f.airT > 0) continue;
        const reach = r.radius + f.radius + 8;
        if (Math.hypot(f.x - r.x, f.y - r.y) > reach) continue;
        d.hit.add(f);
        switch (d.kind) {
          case "flamecharge":
            if (f.applyHit("spin", "fire", false, 0.6, r)) f.applyHit("burn", "fire", true, 1);
            break;
          case "volttackle":
            f.applyHit("thunderbolt", "electric", false, 0.85, r);
            break;
          case "machpunch":
            f.applyHit("spin", "fighting", false, 1.15, r);
            break;
          case "dragonrush": {
            f.applyHit("spin", "dragon", false, 0.9, r);
            const dx = f.x - r.x, dy = f.y - r.y;
            const dd = Math.hypot(dx, dy) || 1;
            f.vx += (dx / dd) * 320; // bulldozed aside no matter the weight
            f.vy += (dy / dd) * 320;
            break;
          }
        }
      }
    }
  }

  private updateShots(dt: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.armT -= dt;
      s.spin += dt * 10;

      const lobbed = s.kind === "rockthrow" || s.kind === "acidspray";
      if (lobbed) {
        s.z += s.vz * dt;
        s.vz -= 330 * dt;
      }
      if (s.kind === "swift" && s.target && !s.target.finished && !s.target.falling && !s.target.eliminated) {
        const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
        const cur = Math.atan2(s.vy, s.vx);
        const spd = Math.hypot(s.vx, s.vy);
        const turn = wrapAngle(want - cur);
        const a = cur + clamp(turn, -4.2 * dt, 4.2 * dt);
        s.vx = Math.cos(a) * spd;
        s.vy = Math.sin(a) * spd;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // walls / arena edge
      const proj = this.geom.project(s.x, s.y);
      const out = Math.abs(proj.d) > this.geom.corridorHalfAt(proj.s, proj.d) - 8;

      // lobs detonate on touchdown instead of on contact
      if (lobbed && s.z <= 0) {
        if (s.kind === "rockthrow") {
          ringPulse(this.scene, s.x, s.y, 0xb09a78, 80);
          Audio.sfx("slam");
          for (const f of this.foesOf(s.owner)) {
            if (f.transform || f.airT > 0) continue;
            if (Math.hypot(f.x - s.x, f.y - s.y) > 95) continue;
            f.applyHit("squash", "rock", false, 0.85, s.owner);
          }
        } else {
          const img = this.scene.add.image(s.x, s.y, "fx-cloud").setDepth(3).setTint(ZONE_TINT.acid).setAlpha(0.8);
          this.zones.push({
            kind: "acid", img, owner: s.owner, x: s.x, y: s.y, r: 58,
            life: 5.5, armT: 0.3, bob: 0, tickCd: new Map()
          });
          burst(this.scene, s.x, s.y, { color: 0xb05ae8, n: 10, spd: 90, size: 5 });
        }
        this.killShot(i);
        continue;
      }

      if (s.life <= 0 || out) {
        burst(this.scene, s.x, s.y, { color: 0xcccccc, n: 5, spd: 70, size: 4, life: 240 });
        this.killShot(i);
        continue;
      }

      this.view.submit(s.img, s.x, s.y, {
        rot: s.spin, lift: 10 + s.z,
        scale: s.kind === "rockthrow" ? 1.1 : s.kind === "swift" ? 1.3 : 0.9,
        topDepth: 6
      });
      this.view.submit(s.shadow, s.x, s.y + 3, { flat: true, scale: 0.26, scaleY: 0.16, topDepth: 2 });

      if (lobbed) continue; // no contact damage while sailing overhead
      for (const f of this.racers) {
        if (f.falling || f.airT > 0 || f.finished || f.eliminated || f.transform) continue;
        if (f === s.owner && s.armT > 0) continue;
        if (f === s.owner) continue;
        const rr = f.radius + 12;
        const dx = f.x - s.x, dy = f.y - s.y;
        if (dx * dx + dy * dy >= rr * rr) continue;
        switch (s.kind) {
          case "iceshard": f.applyHit("freeze", "ice", false, 0.62, s.owner); break;
          case "pinmissile": f.applyHit("spin", "bug", false, 0.62, s.owner); break;
          case "swift": f.applyHit("spin", "normal", false, 0.85, s.owner); break;
        }
        this.killShot(i);
        break;
      }
    }
  }

  private killShot(i: number) {
    this.shots[i].img.destroy();
    this.shots[i].shadow.destroy();
    this.shots.splice(i, 1);
  }

  private updateZones(dt: number) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      z.armT -= dt;
      z.bob += dt * 3;
      if (z.life <= 0) {
        z.img.destroy();
        this.zones.splice(i, 1);
        continue;
      }
      const flat = z.kind === "acid" || z.kind === "stringshot";
      this.view.submit(z.img, z.x, z.y, {
        flat, lift: flat ? 0 : 4 + Math.sin(z.bob) * 2,
        scale: (z.r / 32) * (0.92 + Math.sin(z.bob * 1.7) * 0.08),
        topDepth: 3, rot: flat ? z.bob * 0.18 : 0
      });
      if (z.kind === "firespin" && Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        burst(this.scene, z.x + Math.cos(a) * z.r * 0.7, z.y + Math.sin(a) * z.r * 0.7,
          { color: 0xff8a40, n: 1, spd: 50, size: 5, life: 300 });
      }

      for (const f of this.racers) {
        if (f.falling || f.airT > 0 || f.finished || f.eliminated || f.transform) continue;
        if (f === z.owner && z.armT > 0) continue;
        const cd = z.tickCd.get(f) ?? 0;
        if (cd > 0) { z.tickCd.set(f, cd - dt); continue; }
        if (Math.hypot(f.x - z.x, f.y - z.y) > z.r + f.radius * 0.5) continue;
        z.tickCd.set(f, 0.9);
        switch (z.kind) {
          case "firespin": f.applyHit("burn", "fire", false, 1, z.owner); break;
          case "stunspore": f.applyHit("thunderbolt", "grass", false, 0.7, z.owner); break;
          case "frostmist": f.applyHit("drowsy", "ice", false, 1.1, z.owner); break;
          case "acid": f.applyHit("poison", "poison", false, 1, z.owner); break;
          case "stringshot":
            f.applyHit("drowsy", "bug", false, 1.2, z.owner);
            f.drifting = false; f.driftCharge = 0; f.driftTier = 0; // drifts unravel in the web
            break;
        }
      }
    }
  }

  private updateRain(dt: number) {
    if (this.rainT <= 0) return;
    this.rainT -= dt;
    const over = this.rainT <= 0;
    for (const r of this.racers) {
      r.weatherMult = over ? 1 : r.def.types.includes("water") ? 1.07 : 0.9;
    }
    if (over) return;
    this.rainFxT -= dt;
    if (this.rainFxT <= 0) {
      this.rainFxT = 0.07;
      const p = this.racers.find((r) => r.isPlayer) ?? this.racers[0];
      for (let i = 0; i < 4; i++) {
        burst(this.scene,
          p.x + (Math.random() - 0.5) * 480,
          p.y + (Math.random() - 0.5) * 480,
          { color: 0x6ab8ff, n: 1, spd: 30, size: 4, life: 240 });
      }
    }
  }

  // ---------------- AI ----------------

  /**
   * Lightweight move brain for AI racers (racing and battle both): fire the
   * cheap slot when it's useful — dashes on open road, shots / pulses with a
   * target lined up, zones when tailed, stances when threatened.
   */
  aiUpdate(dt: number, raceStarted: boolean) {
    if (!raceStarted) return;
    for (const r of this.racers) {
      if (r.isPlayer || r.finished || r.falling || r.eliminated) continue;
      const t = (this.aiT.get(r) ?? Math.random() * 0.6) - dt;
      if (t > 0) { this.aiT.set(r, t); continue; }
      this.aiT.set(r, 0.7 + Math.random() * 0.5);

      for (let slot = 0; slot < r.equippedMoves.length; slot++) {
        const move = MOVES[r.equippedMoves[slot]];
        if (!move || r.energy < move.cost) continue;
        if (this.aiWants(r, move) && this.tryUse(r, slot)) break;
      }
    }
  }

  private aiWants(r: Racer, move: MoveDef): boolean {
    const aheadFoe = this.nearestFoe(r, 380, 0.6);
    const closeFoe = this.nearestFoe(r, 170);
    let behindFoe: Racer | null = null;
    for (const f of this.foesOf(r)) {
      const d = Math.hypot(f.x - r.x, f.y - r.y);
      const rel = Math.abs(wrapAngle(Math.atan2(f.y - r.y, f.x - r.x) - r.heading));
      if (rel > 2.1 && d < 260 && (!behindFoe || d < Math.hypot(behindFoe.x - r.x, behindFoe.y - r.y))) behindFoe = f;
    }
    switch (move.cat) {
      case "dash":
        return r.boostT <= 0 && !r.drifting && r.speed > r.stats.topSpeed * 0.55 &&
          (this.battle ? !!aheadFoe : Math.random() < 0.55);
      case "shot":
        return !!aheadFoe;
      case "pulse":
        if (move.id === "sludgewave" || move.id === "bodyslam" || move.id === "lick") return !!closeFoe;
        if (move.id === "earthquake") return !!closeFoe && !closeFoe.hovering;
        return !!aheadFoe;
      case "zone":
        return !!behindFoe;
      case "stance":
        return !!(behindFoe?.item) || (!!closeFoe?.item) || (this.battle && r.balloons === 1 && !!closeFoe);
      case "guard": {
        if (move.id === "haze" || move.id === "recover") {
          return r.status.burn > 0 || r.status.poison > 0 || r.status.leech > 0 ||
            r.status.paralysis > 0 || r.status.confuse > 0 || r.status.drowsy > 0;
        }
        // shell up under pressure: armed rivals close by, or last balloon in battle
        return r.shieldT <= 0 && (
          !!(behindFoe?.item) || (!!closeFoe?.item) ||
          (this.battle && r.balloons === 1 && !!closeFoe) ||
          (!!closeFoe && Math.random() < 0.25)
        );
      }
      case "transform":
        if (move.id === "fly") return this.geom.def.edgeMode === "fall" || Math.random() < 0.3;
        return !!behindFoe || Math.random() < 0.25;
      case "buff":
        return r.boostT <= 0 && (move.id !== "raindance" || this.rainT <= 0);
    }
    return false;
  }

  destroy() {
    for (const s of this.shots) { s.img.destroy(); s.shadow.destroy(); }
    for (const z of this.zones) z.img.destroy();
    this.shots = [];
    this.zones = [];
    this.dashes = [];
  }
}
