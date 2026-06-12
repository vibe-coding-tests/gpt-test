import { Racer } from "./Racer";
import { TrackGeometry } from "../systems/TrackGeometry";
import { ItemManager } from "./ItemManager";
import type { AIContext } from "./AIDriver";
import { clamp, wrap01, wrapAngle } from "../util";

type BattleState = "scavenge" | "hunt" | "evade";

/**
 * Battle-mode brain. Racing AI follows a lap line; battle AI is goal-driven:
 *
 *  SCAVENGE — no item held: steer for the nearest live item box (or a rare
 *             candy when this species can still evolve), wander otherwise.
 *  HUNT     — armed: pick a victim (close, low on balloons, or the racer who
 *             hit us last), close in, and fire when the shot lines up.
 *  EVADE    — down to one balloon with a hunter nearby: run away, spend
 *             Protect/Agility/Teleport defensively.
 *
 * Decisions re-evaluate on a jittered 0.3–0.55s clock so the AI feels human
 * rather than aimbot-precise; per-bot aggression varies the victim scoring.
 */
export class BattleAI {
  racer: Racer;
  geom: TrackGeometry;
  items: ItemManager;
  racers: Racer[];
  skill: number;
  aggression: number;

  private state: BattleState = "scavenge";
  private victim: Racer | null = null;
  private targetX = 0;
  private targetY = 0;
  private hasTarget = false;
  private decideT = 0;
  private fireT = 0;
  private holdT = 0;   // how long the current item has been held
  private stuckT = 0;
  private driftHoldT = 0;

  constructor(racer: Racer, geom: TrackGeometry, items: ItemManager, racers: Racer[]) {
    this.racer = racer;
    this.geom = geom;
    this.items = items;
    this.racers = racers;
    this.skill = 0.88 + Math.random() * 0.1;
    this.aggression = 0.7 + Math.random() * 0.5;
  }

  private enemies(): Racer[] {
    return this.racers.filter((e) => e !== this.racer && !e.eliminated && !e.falling);
  }

  update(dt: number, ctx: AIContext) {
    const r = this.racer;
    const inp = r.input;
    if (r.eliminated) {
      inp.throttle = 0; inp.steer = 0; inp.drift = false; inp.brake = false;
      return;
    }
    if (r.item) this.holdT += dt; else this.holdT = 0;

    this.decideT -= dt;
    if (this.decideT <= 0) {
      this.decideT = 0.3 + Math.random() * 0.25;
      this.think(ctx);
    }

    // ---- steering target for the current goal ----
    let tx = this.targetX, ty = this.targetY;
    if (this.state === "hunt" && this.victim && !this.victim.eliminated) {
      // lead pursuit: aim a beat ahead of where the victim is going
      tx = this.victim.x + this.victim.vx * 0.28;
      ty = this.victim.y + this.victim.vy * 0.28;
    } else if (this.state === "evade" && this.victim) {
      // run directly away from the threat
      const dx = r.x - this.victim.x, dy = r.y - this.victim.y;
      const dd = Math.hypot(dx, dy) || 1;
      tx = r.x + (dx / dd) * 420;
      ty = r.y + (dy / dd) * 420;
    } else if (!this.hasTarget) {
      // wander: a point partway around the ring
      const p = this.geom.posOf(wrap01(r.proj.s + 0.16), (Math.random() - 0.5) * this.geom.def.roadHalf);
      tx = p.x; ty = p.y;
      this.targetX = tx; this.targetY = ty;
      this.hasTarget = true;
    }

    // keep the goal inside the arena so walls don't pin us
    const tProj = this.geom.project(tx, ty, r.proj.idx);
    if (Math.abs(tProj.d) > this.geom.def.corridorHalf - 60) {
      const p = this.geom.posOf(tProj.s, clamp(tProj.d, -this.geom.def.corridorHalf + 60, this.geom.def.corridorHalf - 60));
      tx = p.x; ty = p.y;
    }

    let err = wrapAngle(Math.atan2(ty - r.y, tx - r.x) - r.heading);

    // dodge live hazards and incoming shots (same instinct as the race AI)
    for (const a of ctx.avoid) {
      const dx = a.x - r.x, dy = a.y - r.y;
      const distp = Math.hypot(dx, dy);
      const reach = 200 + a.r;
      if (distp > reach) continue;
      const rel = wrapAngle(Math.atan2(dy, dx) - r.heading);
      if (Math.abs(rel) < 0.95) {
        err += (rel > 0 ? -1 : 1) * (1 - distp / reach) * 1.5;
      }
    }

    let steer = clamp(err * 2.4, -1, 1);
    let throttle = 1;
    if (Math.abs(err) > 1.7) throttle = 0.3;       // turning around — pivot hard
    else if (Math.abs(err) > 1.1) throttle = 0.6;

    // hop-drift through big swings to whip the turn around
    let drift: boolean;
    if (r.drifting) {
      drift = !(r.driftTier >= 2 || Math.abs(err) < 0.2);
    } else {
      if (Math.abs(err) > 0.7 && r.speed > r.stats.topSpeed * 0.55 && r.airT <= 0) {
        this.driftHoldT += dt;
      } else {
        this.driftHoldT = 0;
      }
      drift = this.driftHoldT > 0.2;
    }

    this.tryUseItem(dt);

    // stuck recovery: nudge back to the centerline
    const stunned = r.status.sleep > 0 || r.status.squash > 0 || r.status.spin > 0 || r.falling;
    if (ctx.raceStarted && r.speed < 26 && !stunned) {
      this.stuckT += dt;
      if (this.stuckT > 2.8) {
        this.stuckT = 0;
        const p = this.geom.posOf(r.proj.s, 0);
        r.x = p.x; r.y = p.y;
        r.heading = p.heading;
        r.status.invuln = Math.max(r.status.invuln, 0.6);
      }
    } else {
      this.stuckT = 0;
    }

    inp.throttle = throttle;
    inp.steer = steer;
    inp.drift = drift;
    inp.brake = false;
  }

  // ---------------- decisions ----------------

  private think(ctx: AIContext) {
    const r = this.racer;
    const foes = this.enemies();
    if (foes.length === 0) {
      this.state = "scavenge";
      this.pickScavengeTarget(ctx);
      return;
    }

    // nearest armed enemy = the current threat level
    let threat: Racer | null = null, threatD = Infinity;
    for (const e of foes) {
      if (!e.item) continue;
      const d = Math.hypot(e.x - r.x, e.y - r.y);
      if (d < threatD) { threatD = d; threat = e; }
    }

    // cornered on the last balloon: run, don't fight (unless we're armed too)
    if (r.balloons === 1 && threat && threatD < 460 && !r.item) {
      this.state = "evade";
      this.victim = threat;
      return;
    }

    if (r.item) {
      this.state = "hunt";
      this.victim = this.pickVictim(foes);
      return;
    }

    this.state = "scavenge";
    this.victim = null;
    this.pickScavengeTarget(ctx);
  }

  /** Score victims: close beats far, finish off low-balloon racers, hold grudges. */
  private pickVictim(foes: Racer[]): Racer | null {
    const r = this.racer;
    let best: Racer | null = null, bestScore = -Infinity;
    for (const e of foes) {
      const d = Math.hypot(e.x - r.x, e.y - r.y);
      let score = -d * (2 - this.aggression);
      score += (3 - e.balloons) * 150;                       // smell blood
      if (r.lastAttacker === e) score += 260;                // payback
      if (e.isPlayer && e.balloons === 1) score -= 200;      // soft mercy on a cornered player
      if (e.status.invuln > 0.5) score -= 320;               // don't waste shots on mercy frames
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  private pickScavengeTarget(ctx: AIContext) {
    const r = this.racer;
    this.hasTarget = false;

    let bx = 0, by = 0, bestD = Infinity;
    for (const b of this.items.boxes) {
      if (!b.active) continue;
      const d = Math.hypot(b.x - r.x, b.y - r.y);
      if (d < bestD) { bestD = d; bx = b.x; by = b.y; }
    }

    // a rare candy is worth a detour when this species can still evolve
    // (final forms value them less — MAX POWER stacks are a bonus, not a plan)
    const candyBias = r.def.evos.length > 0 ? 0.65 : 1.25;
    for (const c of ctx.candies) {
      if (!c.active) continue;
      const d = Math.hypot(c.x - r.x, c.y - r.y) * candyBias;
      if (d < bestD) { bestD = d; bx = c.x; by = c.y; }
    }

    if (isFinite(bestD)) {
      this.targetX = bx; this.targetY = by;
      this.hasTarget = true;
    }
  }

  // ---------------- weapons ----------------

  private tryUseItem(dt: number) {
    const r = this.racer;
    this.fireT -= dt;
    if (!r.item || this.fireT > 0 || r.falling || r.airT > 0) return;
    this.fireT = 0.14;

    const v = this.victim && !this.victim.eliminated ? this.victim : null;
    const dist = v ? Math.hypot(v.x - r.x, v.y - r.y) : Infinity;
    const relAng = v ? Math.abs(wrapAngle(Math.atan2(v.y - r.y, v.x - r.x) - r.heading)) : Math.PI;
    const foes = this.enemies();

    // anything closing in? (protect trigger)
    let nearestFoeD = Infinity;
    let behindFoeD = Infinity;
    for (const e of foes) {
      const d = Math.hypot(e.x - r.x, e.y - r.y);
      nearestFoeD = Math.min(nearestFoeD, d);
      const rel = Math.abs(wrapAngle(Math.atan2(e.y - r.y, e.x - r.x) - r.heading));
      if (rel > 2.1) behindFoeD = Math.min(behindFoeD, d);
    }

    let fire = false;
    switch (r.item) {
      case "thunderbolt": fire = dist < 520; break;                       // ranged zap, no aim needed
      case "ember":       fire = dist < 540 && relAng < 0.22; break;
      case "rollout":     fire = dist < 600 && relAng < 0.24; break;
      case "icebeam":     fire = dist < 500 && relAng < 0.18; break;
      case "hydropump":   fire = dist < 820 && relAng < 0.55; break;      // homes — loose aim is fine
      case "leechseed":   fire = dist < 640 && relAng < 0.5; break;
      case "razorleaf":   fire = dist < 380; break;                       // saw blades: pop and ram
      case "hyperbeam":   fire = dist < 760 && relAng < 0.3; break;
      case "toxic":
      case "sleeppowder":
      case "substitute":
        // drop traps when someone's tailing us, or seed the box clusters
        fire = behindFoeD < 320 || (this.holdT > 5 && nearestFoeD < 420) || this.holdT > 10;
        break;
      case "protect":
        fire = nearestFoeD < (r.balloons === 1 ? 360 : 240) || this.holdT > 9;
        break;
      case "agility":
        fire = this.state === "evade" || dist > 700 || this.holdT > 6;
        break;
      case "teleport":
        fire = (r.balloons === 1 && nearestFoeD < 380) || this.holdT > 5;
        break;
    }

    if (fire) this.items.use(r);
  }
}
