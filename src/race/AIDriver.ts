import { Racer } from "./Racer";
import { TrackGeometry } from "../systems/TrackGeometry";
import { clamp, wrap01, wrapAngle } from "../util";

export interface AvoidPoint { x: number; y: number; r: number }

export interface CandySpot { x: number; y: number; s: number; d: number; active: boolean }

export interface AIContext {
  avoid: AvoidPoint[];
  candies: CandySpot[];
  raceStarted: boolean;
}

/** Waypoint-following driver with personality, hazard avoidance and drifting. */
export class AIDriver {
  racer: Racer;
  geom: TrackGeometry;
  skill: number;
  lineBias: number;
  private noiseT = 0;
  private noiseVal = 0;
  private mistakeT: number;
  private driftHoldT = 0;
  private stuckT = 0;

  constructor(racer: Racer, geom: TrackGeometry) {
    this.racer = racer;
    this.geom = geom;
    this.skill = 0.84 + Math.random() * 0.1;
    this.lineBias = (Math.random() - 0.5) * 0.9;
    this.mistakeT = 5 + Math.random() * 9;
  }

  update(dt: number, ctx: AIContext) {
    const r = this.racer;
    const geom = this.geom;
    const def = geom.def;
    const inp = r.input;

    if (r.finished) {
      // victory-lap cruise along the centerline
      const sT = wrap01(r.proj.s + 200 / geom.total);
      const tp = geom.posOf(sT, 0);
      const err = wrapAngle(Math.atan2(tp.y - r.y, tp.x - r.x) - r.heading);
      inp.steer = clamp(err * 2, -1, 1);
      inp.throttle = 0.7;
      inp.drift = false;
      inp.brake = false;
      return;
    }

    const sp = r.speed;
    const laPx = clamp(sp * 0.55, 150, 440); // boosted speeds need long sight
    const la = laPx / geom.total;
    const sNow = r.proj.s;
    const sT = wrap01(sNow + la);
    let dT = this.lineBias * def.roadHalf * 0.5;

    // chase rare candies if this species can still evolve (front-runners
    // skip the detour — keeps the leaders honest and leaves candy for you)
    if (r.def.evos.length > 0 && r.rank > 2) {
      for (const c of ctx.candies) {
        if (!c.active) continue;
        let ahead = c.s - sNow;
        if (ahead < -0.5) ahead += 1;
        if (ahead > 0.002 && ahead < la * 1.6 && Math.abs(c.d) < def.roadHalf * 0.95) {
          dT = c.d;
          break;
        }
      }
    }

    // feature-aware lane choice
    const cls = r.def.cls;
    const likesWater = cls === "swimmer" || r.def.types.includes("water");
    const checkS = wrap01(sNow + la * 0.9);
    let jumpAhead = false; // mandatory gap jump coming — commit, full speed
    for (const f of def.features) {
      if (!TrackGeometry.inRange(checkS, f.s0, f.s1) && !TrackGeometry.inRange(sT, f.s0, f.s1)) continue;
      const leftLane = (-def.roadHalf + f.d0) / 2;
      const rightLane = (f.d1 + def.roadHalf) / 2;
      const leftOk = f.d0 > -def.roadHalf + 36;
      const rightOk = f.d1 < def.roadHalf - 36;
      if (f.kind === "water") {
        if (likesWater) {
          dT = clamp((f.d0 + f.d1) / 2, -def.roadHalf * 0.8, def.roadHalf * 0.8);
        } else if (cls !== "flyer" && cls !== "floater" && (leftOk || rightOk)) {
          dT = leftOk && (!rightOk || Math.abs(leftLane - r.proj.d) < Math.abs(rightLane - r.proj.d)) ? leftLane : rightLane;
        }
      } else if (f.kind === "gap" && cls !== "flyer") {
        if (leftOk && (!rightOk || Math.abs(leftLane - r.proj.d) < Math.abs(rightLane - r.proj.d))) dT = leftLane;
        else if (rightOk) dT = rightLane;
        else jumpAhead = true; // full-width gap: stay centered, hit the ramp at speed
      } else if (f.kind === "lava" && !r.def.types.includes("fire")) {
        if (leftOk || rightOk) dT = leftOk && (!rightOk || Math.abs(leftLane - r.proj.d) < Math.abs(rightLane - r.proj.d)) ? leftLane : rightLane;
      } else if (f.kind === "mud" && cls !== "floater" && cls !== "flyer") {
        if (leftOk || rightOk) dT = leftOk && (!rightOk || Math.abs(leftLane - r.proj.d) < Math.abs(rightLane - r.proj.d)) ? leftLane : rightLane;
      } else if (f.kind === "boost") {
        dT = clamp(dT, f.d0 + 14, f.d1 - 14);
      }
    }

    const tp = geom.posOf(sT, clamp(dT, -def.corridorHalf + 50, def.corridorHalf - 50));
    let err = wrapAngle(Math.atan2(tp.y - r.y, tp.x - r.x) - r.heading);

    // steer around live obstacles — swerve gently on fall-edge tracks so the
    // dodge itself doesn't carry anyone off the boardwalk
    const dodge = def.edgeMode === "fall" ? 0.9 : 1.7;
    for (const a of ctx.avoid) {
      const dx = a.x - r.x, dy = a.y - r.y;
      const distp = Math.hypot(dx, dy);
      const reach = 220 + a.r;
      if (distp > reach) continue;
      const rel = wrapAngle(Math.atan2(dy, dx) - r.heading);
      if (Math.abs(rel) < 0.95) {
        err += (rel > 0 ? -1 : 1) * (1 - distp / reach) * dodge;
      }
    }

    // occasional human error (mild where a wobble means falling off)
    this.mistakeT -= dt;
    if (this.mistakeT <= 0) {
      this.mistakeT = 6 + Math.random() * 10;
      this.noiseT = 0.25 + (1 - this.skill) * 1.4;
      this.noiseVal = (Math.random() - 0.5) * (def.edgeMode === "fall" ? 0.6 : 1.3);
    }
    if (this.noiseT > 0) {
      this.noiseT -= dt;
      err += this.noiseVal;
    }

    let steer = clamp(err * 2.4, -1, 1);
    let throttle = 1;
    if (Math.abs(err) > 1.35) throttle = 0.4;

    const hNow = geom.headingAt(wrap01(sNow + 0.004));
    const hFar = geom.headingAt(wrap01(sNow + la * 1.5));
    const curv = Math.abs(wrapAngle(hFar - hNow));
    if (curv > 1.2 && sp > r.stats.topSpeed * 0.84) throttle = 0.55;
    // rim tracks: boost-stacked speed into a bend means flying off — lift early
    if (def.edgeMode === "fall" && curv > 0.45 && sp > r.stats.topSpeed * 0.98) throttle = Math.min(throttle, 0.62);
    if (jumpAhead) {
      // never lift before a jump — coming up short means falling in
      throttle = 1;
      steer = clamp(err * 1.4, -0.5, 0.5); // gentle corrections only, hold the line
    }

    // drift on sustained curves (not near a rim — low drift grip slides wide)
    const nearRim = def.edgeMode === "fall" && Math.abs(r.proj.d) > def.roadHalf * 0.55;
    let drift: boolean;
    if (r.drifting) {
      drift = !(r.driftTier >= 3 || (r.driftTier >= 1 && Math.abs(err) < 0.13));
    } else {
      if (!nearRim && curv > 0.55 && Math.abs(err) > 0.32 && sp > r.stats.topSpeed * 0.68 && r.airT <= 0) {
        this.driftHoldT += dt;
      } else {
        this.driftHoldT = 0;
      }
      drift = this.driftHoldT > 0.22;
    }

    // stuck recovery
    const stunned = r.status.sleep > 0 || r.status.squash > 0 || r.status.spin > 0 || r.falling;
    if (ctx.raceStarted && sp < 28 && !stunned) {
      this.stuckT += dt;
      if (this.stuckT > 2.6) {
        this.stuckT = 0;
        const p = geom.posOf(r.proj.s, 0);
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
}
