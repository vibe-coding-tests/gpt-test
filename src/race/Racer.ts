import Phaser from "phaser";
import type { DerivedStats, ItemKind, PokemonDef, PokeType, Surface } from "../types";
import { deriveStats, offroadMult, typeEffect, waterMult } from "../systems/Stats";
import { getPokemon } from "../data/pokemonData";
import { ensurePokemonTexture } from "../systems/SpriteFactory";
import { TrackGeometry, type Projection } from "../systems/TrackGeometry";
import { HANDLING_STEP, HANDLING_TUNE, loadSplit, surfaceGrip, tireCurve } from "../systems/Handling";
import { clamp, wrap01, wrapAngle } from "../util";
import { Audio } from "../systems/AudioSystem";
import { burst, floatText, ringPulse } from "../systems/effects";
import type { ThreeView } from "../systems/ThreeView";

export interface RacerInput {
  throttle: number;
  brake: boolean;
  steer: number;
  drift: boolean;
  useItem: boolean;
}

/**
 * Per-class drift identity. Low-grip classes (floater/flyer) used to be punished
 * for drifting — now they're the specialists: they slide wider but charge the
 * mini-turbo fastest, so a long committed slide is *their* game. Runners get
 * quick, tidy turbos; heavies barely slide and charge slowest, but their mass
 * already carries the corner.
 *   rearGrip — rear-axle grip retained while drifting (lower = wider slide)
 *   charge   — multiplier on how fast real slip feeds the mini-turbo
 *   turn     — base authority of the drift's pull toward the corner
 */
const DRIFT_PROFILE: Record<string, { rearGrip: number; charge: number; turn: number }> = {
  runner: { rearGrip: 0.68, charge: 1.15, turn: 1.0 },
  flyer: { rearGrip: 0.56, charge: 1.2, turn: 0.82 },
  floater: { rearGrip: 0.5, charge: 1.3, turn: 0.92 },
  swimmer: { rearGrip: 0.62, charge: 1.0, turn: 0.9 },
  heavy: { rearGrip: 0.74, charge: 0.82, turn: 0.74 }
};

/**
 * How strongly each movement class feels gravity on slopes.
 * Flyers and floaters hover over the grade; heavies are ruled by it —
 * slow grinding climbs but freight-train descents.
 */
const SLOPE_FACTOR: Record<string, { up: number; down: number }> = {
  runner: { up: 0.85, down: 1.0 },
  flyer: { up: 0.2, down: 0.5 },
  floater: { up: 0.35, down: 0.55 },
  swimmer: { up: 1.2, down: 1.0 },
  heavy: { up: 1.3, down: 1.45 }
};

export const DRIFT_TIERS = [0.55, 1.3, 2.2];
export const DRIFT_COLORS = [0x66ccff, 0xffaa33, 0xd06aff];

/** Reserve ceiling: chained drift boosts stack up to this many seconds. */
const DRIFT_BOOST_CAP = 3.5;

/**
 * Checkpoints a lap must clear before the finish line will count it. Buckets are
 * defined purely along the centerline (s), so any forward driving passes through
 * them in order — a big shortcut that skips a section can't bank the lap.
 */
const CHECKPOINTS = 12;

export class Racer {
  scene: Phaser.Scene;
  geom: TrackGeometry;
  def: PokemonDef;
  stats: DerivedStats;
  isPlayer: boolean;
  index: number;

  x = 0; y = 0;
  heading = 0;
  vx = 0; vy = 0;
  proj: Projection = { s: 0, d: 0, idx: 0 };
  totalProgress = 0;
  rank = 1;
  finished = false;
  finishTimeMs = 0;
  surface: Surface = "road";

  input: RacerInput = { throttle: 0, brake: false, steer: 0, drift: false, useItem: false };
  private steerSm = 0; // smoothed steering — keyboard taps ramp in instead of snapping

  drifting = false;
  driftDir = 0;
  driftCharge = 0;
  driftTier = 0;
  driftChain = 0;            // consecutive drift releases — CTR-style reserve
  driftChainT = 0;           // window the chain stays alive between slides
  private driftPerfectT = 0; // brief clean-release window after a tier locks in
  hopT = 0;

  boostT = 0;
  boostMult = 1;
  agilityFxT = 0;

  draftT = 0;

  airT = 0;
  falling = false;
  fallT = 0;

  status = { paralysis: 0, sleep: 0, drowsy: 0, burn: 0, spin: 0, squash: 0, freeze: 0, poison: 0, leech: 0, confuse: 0, invuln: 0 };
  shieldT = 0;
  shieldHits = 0; // hits the active shield can soak (Withdraw shells take two)
  acidT = 0;      // Acid Armor: anyone who bumps you gets poisoned
  paraJoltT = 0;
  burnTickT = 0;
  auraTickT = 0; // particle ticks for poison / leech

  // signature moves
  energy = 0;                 // 0..100 meter, charged by driving well
  equippedMoves: string[] = [];
  moveCdT = 0;                // tiny cooldown between casts
  transform: "dig" | "fly" | "phase" | null = null;
  transformT = 0;
  reflectT = 0;               // Counter / Barrier: bounce hits back
  reflectOnce = false;        // Counter ends after one reflect
  slamPending: "body" | "quake" | null = null; // pulse fires on landing
  weatherMult = 1;            // Rain Dance
  offroadFreeT = 0;           // Rock Polish: terrain penalties waived
  wallPenaltyT = 0;           // brief speed tax after a hard wall/guardrail hit

  item: ItemKind | null = null;
  rouletteT = 0;
  agilityCharges = 0; // time trial stock

  candies = 0;
  powerStacks = 0; // MAX POWER stacks for fully-evolved racers

  // battle mode
  battle = false;
  balloons = 3;
  hitsScored = 0;
  lastAttacker: Racer | null = null;
  eliminated = false;
  koPlace = 0;

  private climbT = 0; // recently-on-a-steep-climb window for crest launches
  private updraftCd = 0; // flyer crest-surge cooldown
  private stunnedPrev = false; // for the shake-it-off rebound
  latAbs = 0; // lateral slip px/s, read by cornering fx/audio
  yawRate = 0; // body rotation rate from the grip model
  slipAngle = 0; // signed travel angle vs nose, radians
  frontSlip = 0;
  rearSlip = 0;
  slipRatio = 0; // 0..1-ish grip loss read by fx/audio/AI
  gripMu = 1;
  loadFront = 0.5;
  lateralLoad = 0; // signed lateral acceleration hint for camera roll
  weightTransfer = 0; // +front load under braking, -rear squat on throttle
  private airPeak = 0; // biggest airT of the current flight, for landing impact
  private airPrev = false;

  speedMult = 1; // rubber band (AI only)

  lastSafeS = 0;
  // lap validation: every checkpoint must be touched before a lap line counts
  private cpHits: boolean[] = new Array(CHECKPOINTS).fill(false);
  private cutWarnT = 0; // debounce for the "wrong way" warning
  animT = 0;
  private landT = 0; // squash-on-landing timer
  private wasAirborne = false;
  boostPadCd = 0;
  bumpCd = 0;
  inWater = false;
  bobPhase = Math.random() * Math.PI * 2;
  fallRot = 0;

  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  shieldImg: Phaser.GameObjects.Image;
  private shadowSX = 1;
  private shadowSY = 1;
  private shieldS = 1;

  constructor(scene: Phaser.Scene, geom: TrackGeometry, speciesId: number, index: number, isPlayer: boolean) {
    this.scene = scene;
    this.geom = geom;
    this.def = getPokemon(speciesId);
    this.stats = deriveStats(this.def);
    this.index = index;
    this.isPlayer = isPlayer;

    const key = ensurePokemonTexture(scene, speciesId);
    this.shadow = scene.add.image(0, 0, "fx-shadow").setDepth(4).setAlpha(0.35);
    this.sprite = scene.add.sprite(0, 0, key, 2).setDepth(5 + index * 0.01);
    this.shieldImg = scene.add.image(0, 0, "fx-ring").setDepth(7).setVisible(false).setTint(0x58e8c8);
    this.updateShadowSize();
  }

  private get view(): ThreeView {
    return (this.scene as Phaser.Scene & { view: ThreeView }).view;
  }

  private updateShadowSize() {
    const r = this.stats.radius;
    const shTex = this.scene.textures.get("fx-shadow").getSourceImage();
    this.shadowSX = (r * 2.4) / shTex.width;
    this.shadowSY = (r * 1.5) / shTex.height;
    const rgTex = this.scene.textures.get("fx-ring").getSourceImage();
    this.shieldS = (r * 3.4) / rgTex.width;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get hovering() { return this.def.cls === "flyer" || this.def.cls === "floater"; }
  get radius() { return this.stats.radius; }

  placeAt(x: number, y: number, heading: number) {
    this.x = x; this.y = y; this.heading = heading;
    this.vx = 0; this.vy = 0;
    this.resetHandlingDynamics();
    this.proj = this.geom.project(x, y);
    this.totalProgress = this.proj.s > 0.5 ? this.proj.s - 1 : this.proj.s;
    this.lastSafeS = this.proj.s;
    this.cpHits = new Array(CHECKPOINTS).fill(false);
    this.cpHits[Math.floor(wrap01(this.proj.s) * CHECKPOINTS) % CHECKPOINTS] = true;
    this.syncVisual(0);
  }

  private resetHandlingDynamics() {
    this.yawRate = 0;
    this.slipAngle = 0;
    this.frontSlip = 0;
    this.rearSlip = 0;
    this.slipRatio = 0;
    this.latAbs = 0;
    this.lateralLoad = 0;
    this.weightTransfer = 0;
    this.loadFront = this.stats.cgFront;
    this.gripMu = 1;
  }

  /** Adjust totalProgress so its fractional lap position matches newS. */
  private syncProgress(newS: number) {
    const frac = wrap01(this.totalProgress);
    let e = newS - frac;
    if (e > 0.5) e -= 1;
    if (e < -0.5) e += 1;
    this.totalProgress += e;
  }

  applyBoost(mult: number, dur: number, sound?: string) {
    if (dur > this.boostT || mult > this.boostMult) {
      this.boostT = Math.max(this.boostT, dur);
      this.boostMult = Math.max(mult, 1.05);
    }
    if (sound) Audio.sfx(sound);
  }

  /**
   * Returns true if the hit landed (not blocked).
   * Pass the move's type to run it through the type chart — super-effective
   * hits stun longer, resisted hits shorter, immunities whiff entirely.
   * `pierce` is for secondary statuses of a hit that already landed (e.g.
   * Ember's burn after its spin) so the spin's mercy window doesn't eat them.
   * `power` scales status duration further (STAB items pass > 1).
   */
  applyHit(
    kind: "spin" | "thunderbolt" | "sleep" | "drowsy" | "squash" | "burn" | "freeze" | "poison" | "leech" | "confuse",
    attackType?: PokeType, pierce = false, power = 1, attacker?: Racer
  ): boolean {
    if ((this.status.invuln > 0 && !pierce) || this.falling || this.finished) return false;
    if (this.transform) return false; // dug in, airborne on Fly, or phased out
    // Counter / Barrier: the hit bounces back at whoever threw it
    if (this.reflectT > 0 && attacker && attacker !== this) {
      ringPulse(this.scene, this.x, this.y, 0xf0a8ff, 80);
      floatText(this.scene, this.x, this.y - 34, "REFLECTED!", "#f0a8ff", 14);
      Audio.sfx("shieldpop");
      if (this.reflectOnce) this.reflectT = 0;
      attacker.applyHit(kind, attackType, false, power); // no attacker → can't ping-pong
      return false;
    }
    if (kind === "thunderbolt" && this.def.types.includes("electric")) {
      if (this.scene.scene.isActive()) floatText(this.scene, this.x, this.y - 30, "IMMUNE!", "#ffe066", 14);
      return false;
    }
    const eff = attackType ? typeEffect(attackType, this.def.types) : 1;
    if (eff === 0) {
      floatText(this.scene, this.x, this.y - 30, "IMMUNE!", "#ffe066", 14);
      return false;
    }
    if (this.shieldT > 0) {
      this.shieldHits--;
      if (this.shieldHits <= 0) this.shieldT = 0;
      Audio.sfx("shieldpop");
      ringPulse(this.scene, this.x, this.y, 0x58e8c8, 70);
      if (this.shieldT > 0 && this.isPlayer) {
        floatText(this.scene, this.x, this.y - 32, `shell holds! (${this.shieldHits})`, "#6ab8ff", 12);
      }
      return false;
    }
    const f = (eff >= 2 ? 1.45 : eff <= 0.51 ? 0.6 : 1) * power; // status-duration multiplier
    let mercy = 0; // invulnerable while stunned plus a beat after, so hits never chain
    // forgiving arcade hits: keep a good chunk of speed so one hit costs a
    // position or two, not the whole pack
    switch (kind) {
      case "spin":
        this.status.spin = 0.8 * f;
        mercy = this.status.spin + 1.8;
        this.vx *= 0.5; this.vy *= 0.5;
        this.drifting = false; this.driftCharge = 0; this.driftTier = 0;
        this.driftChain = 0; this.driftChainT = 0;
        Audio.sfx("hit");
        burst(this.scene, this.x, this.y, { color: 0xffe066, n: 8, spd: 110 });
        break;
      case "thunderbolt":
        this.status.spin = Math.max(this.status.spin, 0.6);
        this.status.paralysis = 1.8 * f;
        mercy = this.status.spin + 1.8;
        this.vx *= 0.45; this.vy *= 0.45;
        burst(this.scene, this.x, this.y, { color: 0xfff060, n: 12, spd: 140 });
        break;
      case "sleep":
        this.status.sleep = 0.75 * f;
        mercy = this.status.sleep + 2.0;
        Audio.sfx("sleep");
        break;
      case "drowsy":
        this.status.drowsy = Math.max(this.status.drowsy, 1.5 * f);
        break;
      case "squash":
        this.status.squash = 1.05;
        mercy = this.status.squash + 1.8;
        this.vx *= 0.25; this.vy *= 0.25;
        Audio.sfx("bump");
        break;
      case "burn":
        if (this.def.types.includes("fire")) return false;
        if (this.status.burn <= 0 && this.isPlayer) Audio.sfx("burn");
        this.status.burn = 2.2 * f;
        break;
      case "freeze":
        if (this.def.types.includes("ice")) {
          floatText(this.scene, this.x, this.y - 30, "IMMUNE!", "#bfe8ff", 14);
          return false;
        }
        this.status.freeze = 0.95 * f;
        mercy = this.status.freeze + 1.8;
        this.vx *= 0.2; this.vy *= 0.2;
        Audio.sfx("freeze");
        burst(this.scene, this.x, this.y, { color: 0xbfe8ff, n: 10, spd: 90, size: 5 });
        break;
      case "poison":
        if (this.def.types.includes("poison")) {
          floatText(this.scene, this.x, this.y - 30, "IMMUNE!", "#d8a8ff", 14);
          return false;
        }
        if (this.status.poison <= 0 && this.isPlayer) Audio.sfx("burn");
        this.status.poison = 2.6 * f;
        break;
      case "leech":
        if (this.def.types.includes("grass")) {
          floatText(this.scene, this.x, this.y - 30, "IMMUNE!", "#8ac84c", 14);
          return false;
        }
        this.status.leech = 2.6 * f;
        break;
      case "confuse":
        this.status.confuse = 1.0 * f;
        mercy = this.status.confuse + 0.8;
        Audio.sfx("confuse");
        burst(this.scene, this.x, this.y - 20, { color: 0xf0a8ff, n: 8, spd: 80, size: 4 });
        if (this.isPlayer) floatText(this.scene, this.x, this.y - 30, "CONFUSED!", "#f0a8ff", 14);
        break;
    }
    if (mercy > 0) this.status.invuln = Math.max(this.status.invuln, mercy);
    // getting stunned reads through the camera, not just the sprite
    if (mercy > 0 && this.isPlayer) this.scene.cameras.main.shake(150, 0.005);
    // battle mode: every stunning hit costs a balloon (slows/DoTs don't set
    // mercy and don't pop — they soften a target instead)
    if (this.battle && mercy > 0) this.popBalloon(attacker ?? null);
    if (attackType && eff !== 1) {
      floatText(
        this.scene, this.x, this.y - 44,
        eff >= 2 ? "SUPER EFFECTIVE!" : "resisted...",
        eff >= 2 ? "#ff8a5a" : "#9aa3c7",
        eff >= 2 ? 15 : 12
      );
    }
    if (kind !== "sleep" && kind !== "drowsy") this.status.sleep = 0;
    // landing a hit feeds the attacker's move meter — aggression pays for itself
    if (attacker && attacker !== this && !attacker.finished) {
      attacker.gainEnergy(20);
      // fighting-game hit confirm for the player: you should *feel* it land
      if (attacker.isPlayer && !this.isPlayer) {
        Audio.sfx("landhit");
        floatText(this.scene, this.x, this.y - 56, "HIT!", "#ffe066", 14);
      }
    }
    return true;
  }

  gainEnergy(n: number) {
    if (this.finished || this.eliminated) return;
    this.energy = clamp(this.energy + n, 0, 100);
  }

  /** Wipe every lingering affliction (Recover / Haze). Stuns aren't castable-through anyway. */
  cleanseStatus() {
    this.status.burn = 0;
    this.status.poison = 0;
    this.status.leech = 0;
    this.status.paralysis = 0;
    this.status.drowsy = 0;
    this.status.confuse = 0;
  }

  /** Wind down any active transform (Dig pop-up, Fly landing, phase end). */
  endTransform() {
    const was = this.transform;
    this.transform = null;
    this.transformT = 0;
    if (was === "dig") {
      this.airT = Math.max(this.airT, 0.28);
      this.airPeak = Math.max(this.airPeak, this.airT);
      this.applyBoost(1.18, 0.5, this.isPlayer ? "boost1" : undefined);
      burst(this.scene, this.x, this.y + 4, { color: 0xb08a58, n: 12, spd: 130, size: 6 });
    } else if (was === "phase") {
      ringPulse(this.scene, this.x, this.y, 0xb08aff, 70);
    }
  }

  /** Touch-down after real air: dust, a thud, and a shockwave for heavies. */
  private onLand() {
    // Body Slam / airborne Earthquake detonate on touchdown
    if (this.slamPending) {
      const kind = this.slamPending;
      this.slamPending = null;
      const mgr = (this.scene as Phaser.Scene & { moves?: { landSlam(r: Racer, k: "body" | "quake"): void } }).moves;
      mgr?.landSlam(this, kind);
    }
    const impact = this.airPeak;
    this.airPeak = 0;
    if (impact < 0.25) return;
    const dustCol = this.surface === "water" ? 0x9ad0ff
      : this.geom.def.offroadKind === "snow" ? 0xeaf6ff
      : this.geom.def.offroadKind === "sand" ? 0xf0e0b8 : 0xb8a888;
    burst(this.scene, this.x, this.y + 4, { color: dustCol, n: Math.round(6 + impact * 8), spd: 90, size: 5, life: 320 });
    if (this.isPlayer) Audio.sfx(this.def.cls === "heavy" ? "slam" : "land");

    // heavies hit like a falling Snorlax: nearby grounded racers get knocked away
    if (this.def.cls === "heavy" && impact > 0.45) {
      ringPulse(this.scene, this.x, this.y, 0xd8c8a8, 95);
      if (this.isPlayer) this.scene.cameras.main.shake(160, 0.004);
      const others = (this.scene as Phaser.Scene & { racers?: Racer[] }).racers ?? [];
      for (const r of others) {
        if (r === this || r.falling || r.finished || r.airT > 0 || r.def.cls === "heavy") continue;
        const dx = r.x - this.x, dy = r.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 130 || d === 0) continue;
        const push = (1 - d / 130) * 260;
        r.vx += (dx / d) * push;
        r.vy += (dy / d) * push;
        if (d < 75) r.applyHit("spin", undefined, false, 1, this);
        else if (r.isPlayer) floatText(this.scene, r.x, r.y - 28, "shockwave!", "#d8c8a8", 12);
        if (r.isPlayer && !this.isPlayer) Audio.sfx("slam");
      }
    }
  }

  startFall() {
    if (this.falling || this.status.invuln > 0) return;
    this.falling = true;
    this.fallT = 0.6; // quick tumble — arcade racers get you back fast
    this.drifting = false;
    this.driftCharge = 0; this.driftTier = 0;
    this.driftChain = 0; this.driftChainT = 0;
    this.transform = null; this.transformT = 0;
    this.slamPending = null;
    Audio.sfx("fall");
    if (this.battle) this.popBalloon(null); // gravity counts as a hit in battle
  }

  /** Battle mode: lose a balloon; at zero you're out of the fight. */
  popBalloon(attacker: Racer | null) {
    if (this.eliminated || this.balloons <= 0) return;
    this.balloons--;
    this.status.invuln = Math.max(this.status.invuln, 2.2);
    if (attacker && attacker !== this) {
      attacker.hitsScored++;
      this.lastAttacker = attacker;
    }
    burst(this.scene, this.x, this.y - 16, { color: 0xff5a5a, n: 10, spd: 150, size: 6 });
    floatText(this.scene, this.x, this.y - 46, this.balloons > 0 ? `${this.balloons} left!` : "KO!", "#ff8a8a", 15);
    Audio.sfx(this.balloons > 0 ? "pop" : "ko");
    if (this.balloons <= 0) this.eliminate();
  }

  private eliminate() {
    this.eliminated = true;
    this.finished = true; // drops out of targeting, items and collisions
    const others = (this.scene as Phaser.Scene & { racers?: Racer[] }).racers ?? [];
    this.koPlace = others.filter((r) => !r.eliminated).length + 1;
    ringPulse(this.scene, this.x, this.y, 0xff5a5a, 110);
    burst(this.scene, this.x, this.y, { color: 0xffffff, n: 18, spd: 180, size: 7 });
    Audio.cry(this.def.id, 0.5);
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.shieldImg.setVisible(false);
  }

  respawn() {
    const p = this.geom.nearestSafeSpot(this.lastSafeS, this.proj.d, {
      roadOnly: true,
      margin: 24,
      sSearchPx: 420,
      stepPx: 16
    }) ?? this.geom.posOf(this.lastSafeS, 0);
    this.x = p.x; this.y = p.y;
    this.heading = p.heading;
    // fast enough to clear a ramp right after the respawn point
    this.vx = Math.cos(this.heading) * 230;
    this.vy = Math.sin(this.heading) * 230;
    this.resetHandlingDynamics();
    this.falling = false;
    this.fallRot = 0;
    this.status.invuln = 2.6;
    this.proj = this.geom.project(this.x, this.y);
    this.syncProgress(this.proj.s);
    Audio.sfx("respawn");
    if (this.isPlayer) floatText(this.scene, this.x, this.y - 40, "Fearow airlift!", "#ffd23a", 14);
    this.syncVisual(0);
  }

  teleportToS(targetS: number) {
    const p = this.geom.nearestSafeSpot(targetS, 0, {
      roadOnly: true,
      margin: 24,
      sSearchPx: 420,
      stepPx: 16
    }) ?? this.geom.posOf(targetS, 0);
    this.x = p.x; this.y = p.y;
    this.heading = p.heading;
    const sp = this.stats.topSpeed * 0.8;
    this.vx = Math.cos(this.heading) * sp;
    this.vy = Math.sin(this.heading) * sp;
    this.resetHandlingDynamics();
    this.proj = this.geom.project(this.x, this.y);
    this.syncProgress(this.proj.s);
    this.status.invuln = Math.max(this.status.invuln, 0.8);
    ringPulse(this.scene, this.x, this.y, 0xc878f0, 90);
  }

  /** Re-derive stats from the current form, then apply MAX POWER stacks. */
  private recalcStats() {
    this.stats = deriveStats(this.def);
    if (this.powerStacks > 0) {
      this.stats.topSpeed *= 1 + 0.025 * this.powerStacks;
      this.stats.accel *= 1 + 0.035 * this.powerStacks;
    }
  }

  private hudToast(text: string, color: string) {
    const sc = this.scene as Phaser.Scene & { hud?: () => { toast(t: string, c?: string): void } | null };
    sc.hud?.()?.toast(text, color);
  }

  evolveIfReady(): boolean {
    if (this.candies < 2) return false;
    this.candies -= 2;

    // Fully evolved (or single-stage) racers turn candies into a MAX POWER
    // rush instead: a big burst now plus a small permanent stat stack.
    if (this.def.evos.length === 0) {
      if (this.powerStacks < 3) {
        this.powerStacks++;
        this.recalcStats();
      }
      this.applyBoost(1.45, 2.0, this.isPlayer ? "boost3" : undefined);
      this.status.invuln = Math.max(this.status.invuln, 0.6);
      this.agilityFxT = Math.max(this.agilityFxT, 1.2);
      this.gainEnergy(35);
      Audio.sfx("maxpower");
      ringPulse(this.scene, this.x, this.y, 0xffd23a, 90);
      burst(this.scene, this.x, this.y, { color: 0xffd23a, n: 14, spd: 150, size: 6 });
      floatText(this.scene, this.x, this.y - 34, `MAX POWER Lv.${this.powerStacks}!`, "#ffd23a", 16);
      if (this.isPlayer) this.hudToast(`MAX POWER Lv.${this.powerStacks}!`, "#ffd23a");
      return false;
    }

    const nextId = this.def.evos[Math.floor(Math.random() * this.def.evos.length)];
    const keepSpeedFrac = this.speed / this.stats.topSpeed;
    this.def = getPokemon(nextId);
    this.recalcStats();
    const key = ensurePokemonTexture(this.scene, nextId);
    this.sprite.setTexture(key, 2);
    this.updateShadowSize();
    const sp = this.stats.topSpeed * Math.max(keepSpeedFrac, 0.5);
    this.vx = Math.cos(this.heading) * sp;
    this.vy = Math.sin(this.heading) * sp;
    this.status.invuln = Math.max(this.status.invuln, 1.2);
    this.applyBoost(1.2, 0.9); // evolution surge
    this.gainEnergy(50);       // evolving floods the move meter
    Audio.sfx("evolve");
    Audio.cry(nextId, 0.55);
    ringPulse(this.scene, this.x, this.y, 0xffffff, 110);
    ringPulse(this.scene, this.x, this.y, 0xffe8a0, 150);
    burst(this.scene, this.x, this.y, { color: 0xffffff, n: 22, spd: 190, size: 7 });
    floatText(this.scene, this.x, this.y - 36, `Evolved into ${this.def.name}!`, "#ffffff", 16);
    if (this.isPlayer) {
      this.scene.cameras.main.flash(320, 255, 255, 255);
      this.hudToast(`EVOLVED INTO ${this.def.name.toUpperCase()}!`, "#ffffff");
    }
    return true;
  }

  releaseDrift() {
    if (this.driftTier > 0) {
      const tier = this.driftTier;
      const mult = [1.3, 1.4, 1.5][tier - 1];
      let dur = [0.7, 1.4, 2.2][tier - 1];
      // perfect release: let go on the beat a tier locks in for a clean bonus
      const perfect = this.driftPerfectT > 0;
      if (perfect) dur += 0.12 * tier;

      // CTR-style reserve: drifts chained inside the window stack boost time
      // (up to a cap) instead of replacing it, so good cornering compounds into
      // sustained speed rather than resetting every slide
      if (this.driftChainT > 0) {
        this.driftChain++;
        this.boostT = Math.min(this.boostT + dur, DRIFT_BOOST_CAP);
        this.boostMult = Math.max(this.boostMult, mult);
        Audio.sfx(["boost1", "boost2", "boost3"][tier - 1]);
      } else {
        this.driftChain = 1;
        this.applyBoost(mult, dur, ["boost1", "boost2", "boost3"][tier - 1]);
      }
      this.driftChainT = 1.2; // hold the chain window open for the next corner
      this.gainEnergy([12, 20, 30][tier - 1] + (perfect ? 6 : 0));

      ringPulse(this.scene, this.x, this.y, DRIFT_COLORS[tier - 1], 64 + tier * 14);
      if (this.isPlayer) {
        if (perfect) floatText(this.scene, this.x, this.y - 42, "PERFECT!", "#ffe9a0", 15);
        if (this.driftChain >= 2) {
          floatText(this.scene, this.x, this.y - 58, `CHAIN x${this.driftChain}`, "#d8a0ff", 14);
          this.hudToast(`DRIFT CHAIN x${this.driftChain}!`, "#d8a0ff");
        }
      }
    }
    this.drifting = false;
    this.driftCharge = 0;
    this.driftTier = 0;
    this.driftPerfectT = 0;
  }

  private updateDriftCharge(dt: number, steer: number) {
    if (!this.drifting) return;

    const dp = DRIFT_PROFILE[this.def.cls];
    const align = clamp(steer * this.driftDir, -1, 1);
    const slipK = clamp((Math.abs(this.slipAngle) - 0.055) / 0.28, 0, 1);
    const scrubK = clamp(this.latAbs / Math.max(160, this.stats.topSpeed * 0.55), 0, 1);
    const hold = Math.max(slipK, scrubK * 0.75);
    this.driftCharge += dt * (0.35 + hold * 1.15 + Math.max(align, 0) * 0.35) * dp.charge;

    const newTier = this.driftCharge >= DRIFT_TIERS[2] ? 3
      : this.driftCharge >= DRIFT_TIERS[1] ? 2
        : this.driftCharge >= DRIFT_TIERS[0] ? 1 : 0;
    if (newTier > this.driftTier) {
      this.driftTier = newTier;
      this.driftPerfectT = 0.26;
      if (this.isPlayer) Audio.sfx("drifttick");
    }
  }

  private integrateHandlingStep(step: number, opts: {
    throttle: number;
    brake: boolean;
    raceStarted: boolean;
    stunned: boolean;
    steerFx: number;
    vmax: number;
    slope: number;
    gripSurface: number;
    offroadSeverity: number;
  }) {
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    let fwd = this.vx * hx + this.vy * hy;
    let lat = this.vx * -hy + this.vy * hx;

    let longAccel = this.stats.accel * opts.throttle;
    if (this.status.paralysis > 0) longAccel *= 0.72;
    if (this.surface === "offroad") longAccel *= 0.96 - opts.offroadSeverity * 0.28;
    if (fwd < opts.vmax || longAccel < 0) {
      fwd += longAccel * step;
    } else {
      longAccel = 0;
    }

    if (this.boostT > 0 && fwd < opts.vmax * 0.85) {
      const boostAccel = this.stats.accel * 1.6;
      fwd += boostAccel * step;
      longAccel += boostAccel;
    }

    if (opts.slope !== 0) {
      const slopeAccel = opts.slope * 480;
      fwd -= slopeAccel * step;
      longAccel -= slopeAccel;
    }

    if (fwd > opts.vmax) {
      fwd += (opts.vmax - fwd) * (1 - Math.exp(-3.2 * step));
    } else if (opts.throttle <= 0.02) {
      fwd *= Math.exp(-1.1 * step);
      longAccel -= 120;
    }

    if (opts.brake && opts.raceStarted && !opts.stunned) {
      fwd -= 520 * step;
      longAccel -= 520;
      if (fwd < -90) fwd = -90;
    } else if (fwd < 0) {
      fwd *= Math.exp(-3 * step);
    }

    if (this.status.sleep > 0 || this.status.squash > 0 || this.status.freeze > 0) {
      fwd *= Math.exp(-6.5 * step);
      lat *= Math.exp(-6.5 * step);
      this.yawRate *= Math.exp(-7 * step);
    }

    const speedFrac = Math.abs(fwd) / Math.max(1, this.stats.topSpeed);
    const lowBoost = clamp(speedFrac / 0.5, 0.55, 1);
    const highTaper = this.boostT > 0 ? 1 : 1 - clamp((speedFrac - 0.62) / 0.38, 0, 1) * 0.25;
    let steerAngle = opts.steerFx * this.stats.steerLock * lowBoost * highTaper;
    if (this.status.paralysis > 0) steerAngle *= 0.72;

    const dp = DRIFT_PROFILE[this.def.cls];
    let frontGrip = this.stats.gripFront;
    let rearGrip = this.stats.gripRear;
    if (this.drifting) {
      const align = opts.steerFx * this.driftDir;
      const counter = Math.max(-align, 0);
      const driftBias = this.driftDir * (0.23 + Math.max(align, 0) * 0.14) * dp.turn;
      steerAngle = clamp(opts.steerFx * (0.55 + counter * 0.85) + driftBias, -1.1, 1.1)
        * this.stats.steerLock * lowBoost;
      rearGrip *= dp.rearGrip * (this.hopT > 0 ? 0.78 : 1);
      frontGrip *= 1.04 + counter * 0.16;
    }
    if (opts.brake && Math.abs(opts.steerFx) > 0.15) {
      frontGrip *= 1.07;
      rearGrip *= 0.94;
    }

    const loads = loadSplit(this.stats.cgFront, longAccel);
    this.loadFront = loads.front;
    this.weightTransfer = loads.front - this.stats.cgFront;
    this.gripMu = opts.gripSurface;

    const absFwd = Math.max(Math.abs(fwd), 32);
    const a = this.stats.wheelbase * (1 - this.stats.cgFront);
    const b = this.stats.wheelbase * this.stats.cgFront;
    const alphaF = Math.atan2(lat + this.yawRate * a, absFwd) - steerAngle;
    const alphaR = Math.atan2(lat - this.yawRate * b, absFwd);
    this.frontSlip = alphaF;
    this.rearSlip = alphaR;

    const muF = frontGrip * opts.gripSurface;
    const muR = rearGrip * opts.gripSurface;
    const fyF = -tireCurve(alphaF) * muF * loads.front * HANDLING_TUNE.lateralAccel;
    const fyR = -tireCurve(alphaR) * muR * loads.rear * HANDLING_TUNE.lateralAccel;
    const latAccel = fyF * Math.cos(steerAngle) + fyR - fwd * this.yawRate * 0.62;
    const inertiaScale = Math.max(0.55, this.stats.izz / 900);
    const yawAccel = ((fyF * a * Math.cos(steerAngle) - fyR * b) / this.stats.wheelbase)
      * HANDLING_TUNE.yawGain / inertiaScale;

    lat += latAccel * step;
    this.yawRate += yawAccel * step;

    const avgGrip = (muF + muR) * 0.5;
    this.yawRate *= Math.exp(-HANDLING_TUNE.yawDamping * (0.38 + avgGrip * 0.3) * step / inertiaScale);
    this.yawRate = clamp(this.yawRate, -4.4, 4.4);

    this.slipAngle = Math.atan2(lat, absFwd);
    const catchK = !this.drifting ? clamp((Math.abs(this.slipAngle) - 0.07) / 0.34, 0, 1) * this.stats.catchAssist * opts.gripSurface : 0;
    if (catchK > 0) {
      lat *= Math.exp(-catchK * 1.9 * step);
      this.yawRate *= Math.exp(-catchK * 2.4 * step);
    }

    const maxLat = this.stats.topSpeed * (this.drifting ? 0.85 : 0.62);
    lat = clamp(lat, -maxLat, maxLat);
    this.latAbs = Math.abs(lat);
    this.slipAngle = Math.atan2(lat, absFwd);
    this.slipRatio = clamp(Math.abs(this.slipAngle) / 0.42 + this.latAbs / Math.max(1, this.stats.topSpeed) * 0.24, 0, 1.4);
    this.lateralLoad = clamp(latAccel / 1200, -1.3, 1.3);

    this.heading = wrapAngle(this.heading + this.yawRate * step);
    const nhx = Math.cos(this.heading), nhy = Math.sin(this.heading);
    this.vx = nhx * fwd - nhy * lat;
    this.vy = nhy * fwd + nhx * lat;
    this.x += this.vx * step;
    this.y += this.vy * step;
  }

  /** Spot just behind the racer (feet / tail / wake) for spark effects. */
  tailPos(dist = 1) {
    const back = this.stats.radius * dist;
    return {
      x: this.x - Math.cos(this.heading) * back,
      y: this.y - Math.sin(this.heading) * back
    };
  }

  update(dt: number, racers: Racer[], raceStarted: boolean, raceTimeMs: number, lapsTotal: number) {
    // timers
    for (const k of Object.keys(this.status) as (keyof typeof this.status)[]) {
      if (this.status[k] > 0) this.status[k] = Math.max(0, this.status[k] - dt);
    }
    this.boostPadCd = Math.max(0, this.boostPadCd - dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    this.hopT = Math.max(0, this.hopT - dt);
    this.agilityFxT = Math.max(0, this.agilityFxT - dt);
    this.wallPenaltyT = Math.max(0, this.wallPenaltyT - dt);
    if (this.driftChainT > 0) {
      this.driftChainT -= dt;
      if (this.driftChainT <= 0) this.driftChain = 0;
    }
    this.driftPerfectT = Math.max(0, this.driftPerfectT - dt);
    if (this.boostT > 0) {
      this.boostT -= dt;
      if (this.boostT <= 0) this.boostMult = 1;
    }
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) this.shieldHits = 0;
    }
    this.acidT = Math.max(0, this.acidT - dt);
    this.cutWarnT = Math.max(0, this.cutWarnT - dt);
    if (this.rouletteT > 0) this.rouletteT -= dt;
    this.moveCdT = Math.max(0, this.moveCdT - dt);
    this.reflectT = Math.max(0, this.reflectT - dt);
    this.offroadFreeT = Math.max(0, this.offroadFreeT - dt);
    if (this.transform) {
      this.transformT -= dt;
      if (this.transformT <= 0) this.endTransform();
    }
    // meter trickle: flat-out driving + hangtime both feed the move gauge
    if (raceStarted && !this.finished) {
      if (this.speed > this.stats.topSpeed * 0.6) this.gainEnergy(1.2 * dt);
      if (this.airT > 0) this.gainEnergy(6 * dt);
    }

    if (this.falling) {
      this.fallT -= dt;
      this.vx *= Math.exp(-4 * dt);
      this.vy *= Math.exp(-4 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.fallRot += 9 * dt;
      const f = Math.max(this.fallT / 0.6, 0);
      this.sprite.setAlpha(f);
      this.shadow.setAlpha(0.35 * f);
      this.view.submit(this.sprite, this.x, this.y, {
        face: this.heading + this.fallRot,
        scale: f,
        topDepth: 5 + this.index * 0.01
      });
      this.view.submit(this.shadow, this.x, this.y + 4, {
        flat: true, scale: this.shadowSX * f, scaleY: this.shadowSY * f, topDepth: 4
      });
      this.view.submit(this.shieldImg, this.x, this.y, { show: false });
      if (this.fallT <= 0) {
        this.sprite.setAlpha(1);
        this.shadow.setAlpha(0.35);
        this.respawn();
      }
      return;
    }

    const stunned = this.status.sleep > 0 || this.status.squash > 0 || this.status.spin > 0 || this.status.freeze > 0;
    // shake-it-off rebound: a short surge when a stun wears off, so a hit
    // costs ground but never strands you while the pack streams past
    if (this.stunnedPrev && !stunned && raceStarted && !this.finished) {
      this.applyBoost(1.14, 0.6, this.isPlayer ? "recover" : undefined);
      this.gainEnergy(6);
      burst(this.scene, this.x, this.y, { color: 0xbfe8ff, n: 6, spd: 90, size: 4, life: 260 });
      if (this.isPlayer) floatText(this.scene, this.x, this.y - 30, "back in it!", "#bfe8ff", 12);
    }
    this.stunnedPrev = stunned;
    const inp = this.input;
    const throttle = raceStarted && !stunned ? inp.throttle : 0;
    const baseSteer = raceStarted && !stunned ? inp.steer : 0;
    // Confusion scrambles the wheel without fully hard-reversing every input.
    const steer = this.status.confuse > 0
      ? clamp(baseSteer * -0.55 + Math.sin(this.bobPhase * 3.1 + this.index) * 0.12 * Math.abs(baseSteer), -1, 1)
      : baseSteer;
    const driftHeld = raceStarted && !stunned ? inp.drift : false;

    const onGround = this.airT <= 0;

    // --- drift / hop ---
    if (driftHeld && !this.drifting && onGround && this.speed > 110 && Math.abs(steer) > 0.2) {
      this.drifting = true;
      this.driftDir = Math.sign(steer);
      this.driftCharge = 0;
      this.driftTier = 0;
      this.driftPerfectT = 0;
      this.hopT = 0.18;
    }
    if (this.drifting) {
      if (stunned) {
        // a hit kills the slide cold: no payoff, and the chain breaks
        this.drifting = false;
        this.driftCharge = 0;
        this.driftTier = 0;
        this.driftPerfectT = 0;
        this.driftChain = 0;
        this.driftChainT = 0;
      } else if (!driftHeld || this.speed < 60) {
        this.releaseDrift();
      }
    }

    // --- steering ---
    // smooth the input: ramp in over ~150ms, release a bit faster — kills
    // the snap-twitch of digital keys without making it feel laggy
    const steerRamp = Math.abs(steer) > Math.abs(this.steerSm) ? 7 : 11;
    this.steerSm += (steer - this.steerSm) * Math.min(1, steerRamp * dt);
    if (Math.abs(this.steerSm) < 0.01 && steer === 0) this.steerSm = 0;
    const steerFx = this.steerSm;

    // --- target speed ---
    let surfMult = 1;
    const def = this.def;
    switch (this.surface) {
      case "offroad": {
        const rough = this.geom.offroadSeverityAtProj(this.proj);
        const worst = offroadMult(def, this.geom.def.offroadKind);
        surfMult = 1 - (1 - worst) * (0.35 + rough * 0.65);
        break;
      }
      case "water": surfMult = waterMult(def); break;
      case "lava": surfMult = def.types.includes("fire") ? 1.06 : 0.75; break;
      case "mud": surfMult = def.cls === "floater" ? 1 : def.cls === "flyer" ? 0.85 : 0.55; break;
      default: surfMult = 1;
    }
    if (this.airT > 0) surfMult = 1;
    if (this.offroadFreeT > 0) surfMult = Math.max(surfMult, 1);      // Rock Polish
    if (this.transform === "dig") surfMult = 1.04;                    // underground ignores terrain

    let statusMult = 1;
    if (this.status.burn > 0) statusMult *= 0.84;
    if (this.status.drowsy > 0) statusMult *= 0.72;
    if (this.status.paralysis > 0) statusMult *= 0.82;
    if (this.status.poison > 0) statusMult *= 0.78;
    if (this.status.leech > 0) statusMult *= 0.87;

    const draftMult = 1 + 0.1 * clamp(this.draftT, 0, 1);
    let vmax = this.stats.topSpeed * this.speedMult * surfMult * statusMult * draftMult * this.weatherMult;
    if (this.wallPenaltyT > 0) vmax *= 0.88;
    if (this.boostT > 0) vmax = Math.max(vmax * this.boostMult, this.stats.topSpeed * this.boostMult * 0.92);

    // hills: descents run faster, climbs slower — scaled by movement class
    // (flyers/floaters hover over the grade, heavies are ruled by gravity)
    const rawSlope = this.geom.hasHills && this.airT <= 0 ? this.geom.slopeAt(this.proj.s) : 0;
    const sf = SLOPE_FACTOR[this.def.cls];
    const slope = rawSlope * (rawSlope > 0 ? sf.up : sf.down);
    if (slope !== 0) vmax *= clamp(1 - slope * 0.9, 0.8, 1.18);

    // paralysis jolts
    if (this.status.paralysis > 0) {
      this.paraJoltT -= dt;
      if (this.paraJoltT <= 0) {
        this.paraJoltT = 0.45;
        this.vx *= 0.9;
        this.vy *= 0.9;
        burst(this.scene, this.x, this.y, { color: 0xfff060, n: 3, spd: 60, size: 4, life: 200 });
      }
    }
    if (this.status.burn > 0) {
      this.burnTickT -= dt;
      if (this.burnTickT <= 0) {
        this.burnTickT = 0.3;
        burst(this.scene, this.x, this.y - 10, { color: 0xff7a30, n: 2, spd: 40, size: 5, life: 320 });
      }
    }
    if (this.status.poison > 0 || this.status.leech > 0) {
      this.auraTickT -= dt;
      if (this.auraTickT <= 0) {
        this.auraTickT = 0.32;
        const col = this.status.poison > 0 ? 0xb05ae8 : 0x8ac84c;
        burst(this.scene, this.x, this.y - 8, { color: col, n: 2, spd: 38, size: 4, life: 340 });
      }
    }

    // --- grip-core physics ---
    const gripSurface = surfaceGrip(this.surface, def, this.airT > 0, this.offroadFreeT > 0 || this.transform === "dig");
    const offroadSeverity = this.surface === "offroad" ? this.geom.offroadSeverityAtProj(this.proj) : 0;
    let remaining = dt;
    let substeps = 0;
    while (remaining > 0 && substeps < 8) {
      const step = Math.min(HANDLING_STEP, remaining);
      this.integrateHandlingStep(step, {
        throttle,
        brake: inp.brake,
        raceStarted,
        stunned,
        steerFx,
        vmax,
        slope,
        gripSurface,
        offroadSeverity
      });
      remaining -= step;
      substeps++;
    }
    if (remaining > 0) {
      this.integrateHandlingStep(remaining, {
        throttle,
        brake: inp.brake,
        raceStarted,
        stunned,
        steerFx,
        vmax,
        slope,
        gripSurface,
        offroadSeverity
      });
    }
    this.updateDriftCharge(dt, steer);

    // --- track projection / progress ---
    const prevS = this.proj.s;
    this.proj = this.geom.project(this.x, this.y, this.proj.idx);
    let ds = this.proj.s - prevS;
    if (ds > 0.5) ds -= 1;
    if (ds < -0.5) ds += 1;
    const beforeTP = this.totalProgress;
    this.totalProgress += ds;

    // --- checkpoint lap validation (open battle arenas have no laps) ---
    if (!this.geom.def.arena) {
      const ci = Math.floor(wrap01(this.proj.s) * CHECKPOINTS) % CHECKPOINTS;
      this.cpHits[ci] = true;
      const boundary = Math.floor(beforeTP) + 1; // the next lap line ahead
      if (boundary >= 1 && this.totalProgress >= boundary) {
        if (this.cpHits.every(Boolean)) {
          this.cpHits.fill(false);
          this.cpHits[ci] = true; // already standing on the new lap's first checkpoint
        } else {
          // crossed the line without completing the lap — don't bank it
          this.totalProgress = boundary - 1e-4;
          if (this.isPlayer && this.cutWarnT <= 0) {
            this.cutWarnT = 3;
            this.hudToast("FOLLOW THE TRACK — LAP NOT COUNTED", "#ff8a8a");
            floatText(this.scene, this.x, this.y - 40, "WRONG WAY!", "#ff8a8a", 16);
          }
        }
      }
    }

    // --- surface response ---
    this.airT = Math.max(0, this.airT - dt);
    if (this.transform === "fly") this.airT = Math.max(this.airT, 0.15); // Fly keeps you aloft
    this.updraftCd = Math.max(0, this.updraftCd - dt);
    if (this.airPrev && this.airT <= 0 && !this.falling) this.onLand();
    this.airPrev = this.airT > 0;
    const rawSurface = this.geom.surfaceAtProj(this.proj);
    this.surface = rawSurface;

    if (rawSurface === "wall") {
      const edge = this.geom.edgeAt(this.proj.s, this.proj.d);
      const ch = this.geom.corridorHalfAt(this.proj.s, this.proj.d) - 6;
      const cl = clamp(this.proj.d, -ch, ch);
      const p = this.geom.posOf(this.proj.s, cl);
      this.x = p.x; this.y = p.y;
      this.proj = this.geom.project(this.x, this.y, this.proj.idx);
      // kill outward velocity
      const sN = this.geom.sample(this.proj.s);
      const outSign = Math.sign(this.proj.d) || 1;
      const vn = this.vx * sN.nx * outSign + this.vy * sN.ny * outSign;
      if (vn > 0) {
        this.vx -= sN.nx * outSign * vn;
        this.vy -= sN.ny * outSign * vn;
        this.vx *= 0.82; this.vy *= 0.82;
        this.wallPenaltyT = Math.max(this.wallPenaltyT, 0.45);
        if (this.speed > 150 && this.bumpCd <= 0) {
          this.bumpCd = 0.4;
          if (this.isPlayer) Audio.sfx("bump");
          burst(this.scene, this.x, this.y, { color: edge.mode === "guardrail" ? this.geom.def.theme.roadEdge : 0xcccccc, n: 4, spd: 70, size: 4, life: 220 });
        }
      }
      this.surface = "offroad";
    } else if (rawSurface === "gap") {
      if (this.transform === "dig") this.endTransform(); // can't tunnel across nothing — pop up
      if (this.def.cls !== "flyer" && this.airT <= 0) {
        this.startFall();
        return;
      }
    } else if (rawSurface === "ramp") {
      if (this.speed > 150 && this.airT <= 0 && onGround) {
        // flyers glide off ramps and hang in the air longer
        this.airT = (0.45 + this.speed / 1500) * (this.def.cls === "flyer" ? 1.45 : 1);
        this.airPeak = this.airT;
        if (this.isPlayer) Audio.sfx("boost1");
      }
    } else if (rawSurface === "boost") {
      if (this.boostPadCd <= 0) {
        this.boostPadCd = 0.9;
        this.applyBoost(1.32, 1.0, this.isPlayer ? "boost2" : undefined);
        this.gainEnergy(6);
        burst(this.scene, this.x, this.y, { color: 0xffc93a, n: 6, spd: 90, size: 5 });
      }
    } else if (rawSurface === "water") {
      if (!this.inWater) {
        this.inWater = true;
        if (!this.hovering) {
          Audio.sfx("splash");
          burst(this.scene, this.x, this.y, { color: 0x9ad0ff, n: 8, spd: 80, size: 5 });
        }
      }
      if (this.def.cls === "swimmer" && Math.random() < dt * 6) {
        burst(this.scene, this.tailPos().x, this.tailPos().y, { color: 0xbfe4ff, n: 2, spd: 50, size: 4, life: 260 });
      }
    } else if (rawSurface === "lava") {
      this.applyHit("burn");
    }
    if (rawSurface !== "water") this.inWater = false;

    // crest behavior: carrying speed over the top of a hill
    if (this.geom.hasHills) {
      const slNow = this.geom.slopeAt(this.proj.s);
      if (slNow > 0.055) this.climbT = 0.55; // remember the steep climb briefly
      else this.climbT = Math.max(0, this.climbT - dt);
      const cresting = this.climbT > 0 && slNow < -0.04;
      if (this.def.cls === "flyer") {
        // flyers ride the updraft off the crest: a surge instead of a jump
        if (cresting && this.speed > 240 && this.updraftCd <= 0) {
          this.climbT = 0;
          this.updraftCd = 2.5;
          this.applyBoost(1.16, 1.0, this.isPlayer ? "updraft" : undefined);
          if (this.isPlayer) floatText(this.scene, this.x, this.y - 34, "UPDRAFT!", "#8ecdff", 14);
        }
      } else if (this.airT <= 0 && cresting && this.speed > 290) {
        this.climbT = 0;
        // heavies launch hardest — all that momentum has to go somewhere
        this.airT = (0.3 + this.speed / 2100) * (this.def.cls === "heavy" ? 1.25 : 1);
        this.airPeak = this.airT;
        if (this.isPlayer) Audio.sfx("crest");
      }
    }

    // remember safe spot for respawns
    if ((rawSurface === "road" || rawSurface === "offroad" || rawSurface === "boost" || rawSurface === "ice") &&
      this.airT <= 0 && Math.abs(this.proj.d) < this.geom.def.corridorHalf * 0.7) {
      this.lastSafeS = this.proj.s;
    }

    // --- slipstream ---
    let drafting = false;
    if (this.speed > this.stats.topSpeed * 0.62 && raceStarted && !this.finished) {
      for (const o of racers) {
        if (o === this || o.falling) continue;
        const dpx = (o.totalProgress - this.totalProgress) * this.geom.total;
        if (dpx > 12 && dpx < 230 && Math.abs(o.proj.d - this.proj.d) < 38) {
          drafting = true;
          break;
        }
      }
    }
    this.draftT = clamp(this.draftT + (drafting ? dt * 1.1 : -dt * 1.8), 0, 1.45);
    if (this.draftT >= 1.45) {
      this.draftT = 0;
      this.applyBoost(1.26, 0.85, this.isPlayer ? "draft" : undefined);
      this.gainEnergy(12);
      burst(this.scene, this.x, this.y, { color: 0xffffff, n: 6, spd: 100, size: 4 });
    }

    // finish
    if (!this.finished && this.totalProgress >= lapsTotal) {
      this.finished = true;
      this.finishTimeMs = raceTimeMs;
    }

    this.syncVisual(dt);
  }

  private syncVisual(dt: number) {
    this.animT += dt * (2.5 + (this.speed / this.stats.topSpeed) * 9);
    this.bobPhase += dt * 5;

    let frame: number;
    if (this.def.cls === "flyer") {
      frame = Math.floor(this.animT * 1.6) % 3;
    } else if (this.speed < 30) {
      frame = 2;
    } else {
      frame = Math.floor(this.animT) % 2;
    }
    this.sprite.setFrame(frame);

    // landing squash: thud when coming back to the ground
    const airborne = this.airT > 0;
    if (this.wasAirborne && !airborne) this.landT = 0.16;
    this.wasAirborne = airborne;
    this.landT = Math.max(0, this.landT - dt);

    let hover = 0;
    if (this.def.cls === "flyer") hover = 7 + Math.sin(this.bobPhase) * 2.5;
    else if (this.def.cls === "floater") hover = 4 + Math.sin(this.bobPhase) * 2;
    if (this.transform === "fly") hover += 30; // soaring on Fly
    const air = this.airT > 0 ? Math.sin(Math.min(this.airT / 0.6, 1) * Math.PI) * 26 : 0;
    const hop = this.hopT > 0 ? Math.sin((this.hopT / 0.18) * Math.PI) * 10 : 0;
    // runners and heavies bounce with their stride; swimmers undulate
    let gait = 0;
    if (!airborne && this.speed > 40 && (this.def.cls === "runner" || this.def.cls === "heavy" || this.def.cls === "swimmer")) {
      const amp = this.def.cls === "heavy" ? 1.6 : this.def.cls === "swimmer" ? 2.4 : 2.0;
      gait = Math.abs(Math.sin(this.animT * Math.PI)) * amp * Math.min(1, this.speed / 240);
    }
    const lift = hover + air + hop + gait;

    const airScale = 1 + (air / 26) * 0.25;
    // stride bounce + landing thud read through scale too
    const gaitPulse = gait > 0 ? Math.sin(this.animT * Math.PI * 2) * 0.04 : 0;
    const landSquash = this.landT > 0 ? Math.sin((this.landT / 0.16) * Math.PI) * 0.22 : 0;
    let sx = airScale * (1 + gaitPulse * 0.5 + landSquash * 0.6);
    let sy = airScale * (1 + gaitPulse - landSquash);
    if (this.status.squash > 0) { sx = airScale * 1.15; sy = airScale * 0.55; }

    let face = this.heading;
    let lean = 0; // body roll, read by the 3D rig
    if (this.status.spin > 0) {
      face += (1 - this.status.spin / 0.8) * Math.PI * 4;
    } else if (this.drifting) {
      face += this.driftDir * (0.28 + this.driftTier * 0.05);
      lean = this.driftDir * (0.3 + this.driftTier * 0.06);
    } else {
      face += this.steerSm * 0.12; // lean into the turn
      lean = this.steerSm * 0.16;
    }

    // bumper cam: your own model is the camera, so don't draw it
    const hideMe = this.isPlayer && this.view.isM7 && !this.view.showPlayer;
    const dugIn = this.transform === "dig"; // underground: only the dirt mound shows
    this.view.submit(this.sprite, this.x, this.y, {
      show: !hideMe && !dugIn, face, rot: lean, scale: sx, scaleY: sy, lift,
      footprint: this.radius,
      topDepth: 5 + this.index * 0.01
    });
    if (dugIn && Math.random() < dt * 22) {
      burst(this.scene, this.x, this.y + 2, { color: 0xb08a58, n: 2, spd: 60, size: 5, life: 260 });
    }

    // status tinting
    if (this.transform === "phase") {
      this.sprite.setAlpha(0.4);
    } else if (this.status.invuln > 0) {
      this.sprite.setAlpha(Math.sin(this.bobPhase * 6) > 0 ? 0.45 : 0.9);
    } else if (this.def.types.includes("ghost")) {
      this.sprite.setAlpha(0.92);
    } else {
      this.sprite.setAlpha(1);
    }
    if (this.status.paralysis > 0 && Math.sin(this.bobPhase * 8) > 0.3) {
      this.sprite.setTint(0xfff060);
    } else if (this.status.burn > 0) {
      this.sprite.setTint(0xffaa88);
    } else if (this.status.freeze > 0) {
      this.sprite.setTint(0xa8e4ff);
    } else if (this.status.poison > 0) {
      this.sprite.setTint(0xd8a8f8);
    } else if (this.status.drowsy > 0 || this.status.sleep > 0) {
      this.sprite.setTint(0xb8c8ff);
    } else if (this.acidT > 0) {
      this.sprite.setTint(Math.sin(this.bobPhase * 5) > 0 ? 0xc8a0e8 : 0xffffff);
    } else {
      this.sprite.clearTint();
    }

    this.shadow.setAlpha(0.35 - (lift / 80));
    this.view.submit(this.shadow, this.x, this.y + 4, {
      show: !hideMe,
      flat: true, lift: -lift, // top view: shadow slides down as the racer lifts
      scale: this.shadowSX, scaleY: this.shadowSY, topDepth: 4
    });

    if (this.shieldT > 0) {
      this.shieldImg.setAlpha(0.5 + Math.sin(this.bobPhase * 4) * 0.2);
    }
    this.view.submit(this.shieldImg, this.x, this.y, {
      show: this.shieldT > 0, scale: this.shieldS, lift, footprint: this.radius, topDepth: 7
    });
  }

  /** Sleep "Z" particles while asleep — called occasionally by the scene. */
  emitSleepZ() {
    if (this.status.sleep > 0 || this.status.drowsy > 0) {
      floatText(this.scene, this.x + 12, this.y - 24, "z", "#bcd0ff", 13);
    }
  }

  static collide(a: Racer, b: Racer, scene: Phaser.Scene) {
    if (a.falling || b.falling || a.airT > 0 || b.airT > 0 || a.finished || b.finished) return;
    if (a.transform || b.transform) return; // dug under / phased through
    const dx = b.x - a.x, dy = b.y - a.y;
    const rr = a.radius + b.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    const overlap = rr - d;
    const ma = a.stats.mass, mb = b.stats.mass;
    const tot = ma + mb;
    a.x -= nx * overlap * (mb / tot);
    a.y -= ny * overlap * (mb / tot);
    b.x += nx * overlap * (ma / tot);
    b.y += ny * overlap * (ma / tot);

    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = 0.42;
      let j = (-(1 + e) * vn) / (1 / ma + 1 / mb);
      // cap the velocity change of the lighter racer so nobody gets yeeted across the map
      const maxDv = 280;
      j = Math.min(j, maxDv * Math.min(ma, mb));
      a.vx -= (j * nx) / ma;
      a.vy -= (j * ny) / ma;
      b.vx += (j * nx) / mb;
      b.vy += (j * ny) / mb;

      // heavies shove light racers aside
      const heavy = ma > mb ? a : b;
      const light = ma > mb ? b : a;
      const ratio = heavy.stats.mass / light.stats.mass;
      if (ratio > 1.45 && Math.abs(vn) > 90) {
        const sign = light === b ? 1 : -1;
        light.vx += nx * sign * 130;
        light.vy += ny * sign * 130;
        light.vx *= 0.85; light.vy *= 0.85;
        burst(scene, (a.x + b.x) / 2, (a.y + b.y) / 2, { color: 0xffffff, n: 5, spd: 90, size: 4, life: 240 });
      }
      if (Math.abs(vn) > 120 && a.bumpCd <= 0 && b.bumpCd <= 0) {
        a.bumpCd = b.bumpCd = 0.3;
        if (a.isPlayer || b.isPlayer) Audio.sfx("bump");
      }
      // Acid Armor: shoulder-checking an oozing racer is a mistake
      if (Math.abs(vn) > 70) {
        if (a.acidT > 0 && b.acidT <= 0) b.applyHit("poison", "poison", false, 1, a);
        else if (b.acidT > 0 && a.acidT <= 0) a.applyHit("poison", "poison", false, 1, b);
      }
    }
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.shieldImg.destroy();
  }
}
