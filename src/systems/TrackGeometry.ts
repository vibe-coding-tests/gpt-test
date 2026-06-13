import type { Feature, Surface, TrackDef } from "../types";
import { clamp, wrap01 } from "../util";

const SAMPLES = 1024;
const MARGIN = 280;

export interface Projection {
  s: number;   // 0..1 along the lap
  d: number;   // signed lateral offset px
  idx: number; // nearest sample index (projection hint)
}

export interface SafeSpot {
  x: number;
  y: number;
  heading: number;
  s: number;
  d: number;
}

interface SafeSpotOpts {
  /** Keep the search inside the painted road instead of the whole corridor. */
  roadOnly?: boolean;
  /** Keep candidates this far inside the chosen lateral boundary. */
  margin?: number;
  /** How far ahead/behind the requested s to search, in world pixels. */
  sSearchPx?: number;
  /** Candidate spacing in lateral and longitudinal sweeps. */
  stepPx?: number;
  /** Surfaces considered valid. Defaults to solid, non-damaging terrain. */
  surfaces?: readonly Surface[];
}

const FEATURE_PRIORITY: Record<string, number> = {
  gap: 9, ramp: 8, boost: 7, lava: 6, water: 5, ice: 4, mud: 3
};

const DEFAULT_SAFE_SURFACES: readonly Surface[] = ["road", "offroad", "boost", "ramp", "ice", "mud"];

/**
 * Closed-loop Catmull-Rom centerline with arc-length parameterization.
 * Everything on a track is expressed as (s, d): lap position + lateral offset.
 */
export class TrackGeometry {
  readonly def: TrackDef;
  readonly xs = new Float64Array(SAMPLES);
  readonly ys = new Float64Array(SAMPLES);
  readonly tx = new Float64Array(SAMPLES);
  readonly ty = new Float64Array(SAMPLES);
  readonly nx = new Float64Array(SAMPLES);
  readonly ny = new Float64Array(SAMPLES);
  readonly cum = new Float64Array(SAMPLES + 1);
  total = 0;
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
  worldW = 0; worldH = 0;
  hasHills = false;
  /** height (world px) and slope (dh per px travelled) sampled along the lap */
  private hts = new Float64Array(SAMPLES);
  private slopes = new Float64Array(SAMPLES);
  private arcIndex = new Uint32Array(SAMPLES + 1);
  private featuresSorted: Feature[];

  constructor(def: TrackDef) {
    this.def = def;
    const P = def.points;
    const n = P.length;

    const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (
        2 * p1 + (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
      );
    };

    for (let k = 0; k < SAMPLES; k++) {
      const g = (k / SAMPLES) * n;
      const i = Math.floor(g);
      const u = g - i;
      const a = P[(i - 1 + n) % n], b = P[i % n], c = P[(i + 1) % n], e = P[(i + 2) % n];
      this.xs[k] = cr(a[0], b[0], c[0], e[0], u);
      this.ys[k] = cr(a[1], b[1], c[1], e[1], u);
    }

    for (let k = 0; k < SAMPLES; k++) {
      const k2 = (k + 1) % SAMPLES;
      const segLen = Math.hypot(this.xs[k2] - this.xs[k], this.ys[k2] - this.ys[k]);
      this.cum[k + 1] = this.cum[k] + segLen;
    }
    this.total = this.cum[SAMPLES];

    for (let k = 0; k < SAMPLES; k++) {
      const prev = (k - 1 + SAMPLES) % SAMPLES;
      const next = (k + 1) % SAMPLES;
      let dx = this.xs[next] - this.xs[prev];
      let dy = this.ys[next] - this.ys[prev];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      this.tx[k] = dx; this.ty[k] = dy;
      this.nx[k] = -dy; this.ny[k] = dx;
    }

    // Uniform arc -> sample index lookup table.
    let k = 0;
    for (let j = 0; j <= SAMPLES; j++) {
      const arc = (j / SAMPLES) * this.total;
      while (k < SAMPLES - 1 && this.cum[k + 1] < arc) k++;
      this.arcIndex[j] = k;
    }

    const reach = def.corridorHalf + MARGIN;
    for (let i = 0; i < SAMPLES; i++) {
      this.minX = Math.min(this.minX, this.xs[i] - reach);
      this.minY = Math.min(this.minY, this.ys[i] - reach);
      this.maxX = Math.max(this.maxX, this.xs[i] + reach);
      this.maxY = Math.max(this.maxY, this.ys[i] + reach);
    }
    this.minX = Math.max(0, this.minX);
    this.minY = Math.max(0, this.minY);
    this.worldW = this.maxX;
    this.worldH = this.maxY;

    this.featuresSorted = [...def.features].sort(
      (a, b) => (FEATURE_PRIORITY[b.kind] ?? 0) - (FEATURE_PRIORITY[a.kind] ?? 0)
    );

    // --- elevation profile (sum of wrapped gaussian bumps) ---
    const hills = def.hills ?? [];
    this.hasHills = hills.length > 0;
    if (this.hasHills) {
      for (let k = 0; k < SAMPLES; k++) {
        const s = k / SAMPLES;
        let h = 0;
        for (const b of hills) {
          let ds = Math.abs(s - b.s);
          if (ds > 0.5) ds = 1 - ds;
          const u = ds / b.w;
          h += b.h * Math.exp(-u * u * 2.2);
        }
        this.hts[k] = h;
      }
      for (let k = 0; k < SAMPLES; k++) {
        const prev = (k - 1 + SAMPLES) % SAMPLES;
        const next = (k + 1) % SAMPLES;
        const run = (this.cum[k + 1] - this.cum[k]) + (this.cum[prev + 1] - this.cum[prev]);
        this.slopes[k] = (this.hts[next] - this.hts[prev]) / Math.max(run, 1);
      }
    }
  }

  /** Ground height (world px) at lap position s. */
  heightAt(s: number): number {
    if (!this.hasHills) return 0;
    const f = wrap01(s) * SAMPLES;
    const k = Math.floor(f) % SAMPLES;
    const k2 = (k + 1) % SAMPLES;
    return this.hts[k] + (this.hts[k2] - this.hts[k]) * (f - k);
  }

  /** Slope along the direction of travel (dh per px) at lap position s. */
  slopeAt(s: number): number {
    if (!this.hasHills) return 0;
    const f = wrap01(s) * SAMPLES;
    const k = Math.floor(f) % SAMPLES;
    const k2 = (k + 1) % SAMPLES;
    return this.slopes[k] + (this.slopes[k2] - this.slopes[k]) * (f - k);
  }

  /** Point + frame at lap position s. */
  sample(s: number) {
    const arc = wrap01(s) * this.total;
    const j = Math.min(SAMPLES, Math.floor((arc / this.total) * SAMPLES));
    let k = this.arcIndex[j];
    while (k < SAMPLES - 1 && this.cum[k + 1] < arc) k++;
    const k2 = (k + 1) % SAMPLES;
    const segLen = this.cum[k + 1] - this.cum[k] || 1;
    const f = clamp((arc - this.cum[k]) / segLen, 0, 1);
    const lx = this.xs[k] + (this.xs[k2] - this.xs[k]) * f;
    const ly = this.ys[k] + (this.ys[k2] - this.ys[k]) * f;
    let dx = this.tx[k] + (this.tx[k2] - this.tx[k]) * f;
    let dy = this.ty[k] + (this.ty[k2] - this.ty[k]) * f;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    return { x: lx, y: ly, tx: dx, ty: dy, nx: -dy, ny: dx, idx: k };
  }

  posOf(s: number, d: number) {
    const p = this.sample(s);
    return { x: p.x + p.nx * d, y: p.y + p.ny * d, heading: Math.atan2(p.ty, p.tx) };
  }

  headingAt(s: number) {
    const p = this.sample(s);
    return Math.atan2(p.ty, p.tx);
  }

  /** Map a world point to (s, d). Pass the previous idx as a hint when possible. */
  project(x: number, y: number, hint?: number): Projection {
    let bestK = 0;
    let bestD2 = Infinity;
    if (hint !== undefined) {
      for (let o = -36; o <= 36; o++) {
        const k = (hint + o + SAMPLES) % SAMPLES;
        const dx = x - this.xs[k], dy = y - this.ys[k];
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestK = k; }
      }
    } else {
      for (let k = 0; k < SAMPLES; k += 4) {
        const dx = x - this.xs[k], dy = y - this.ys[k];
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestK = k; }
      }
      for (let o = -4; o <= 4; o++) {
        const k = (bestK + o + SAMPLES) % SAMPLES;
        const dx = x - this.xs[k], dy = y - this.ys[k];
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; bestK = k; }
      }
    }
    const k = bestK;
    const px = x - this.xs[k], py = y - this.ys[k];
    const along = px * this.tx[k] + py * this.ty[k];
    const d = px * this.nx[k] + py * this.ny[k];
    const s = wrap01((this.cum[k] + along) / this.total);
    return { s, d, idx: k };
  }

  /** Whether s lies inside [s0, s1] (range may wrap past 1). */
  static inRange(s: number, s0: number, s1: number): boolean {
    return s0 <= s1 ? s >= s0 && s <= s1 : s >= s0 || s <= s1;
  }

  featureAtProj(p: Projection): Feature | null {
    for (const f of this.featuresSorted) {
      if (p.d >= f.d0 && p.d <= f.d1 && TrackGeometry.inRange(p.s, f.s0, f.s1)) return f;
    }
    return null;
  }

  featuresNear(sA: number, sB: number): Feature[] {
    return this.featuresSorted.filter(
      (f) => TrackGeometry.inRange(sA, f.s0, f.s1) || TrackGeometry.inRange(sB, f.s0, f.s1)
    );
  }

  /** True when a guardrail section protects the corridor edge at s. */
  railAt(s: number): boolean {
    const rails = this.def.rails;
    if (!rails) return false;
    for (const r of rails) {
      if (TrackGeometry.inRange(s, r.s0, r.s1)) return true;
    }
    return false;
  }

  surfaceAtProj(p: Projection): Surface {
    if (Math.abs(p.d) > this.def.corridorHalf) {
      if (this.def.edgeMode === "fall" && !this.railAt(p.s)) return "gap";
      return "wall";
    }
    const f = this.featureAtProj(p);
    if (f) return f.kind;
    return Math.abs(p.d) <= this.def.roadHalf ? "road" : "offroad";
  }

  nearestSafeSpot(s: number, preferredD = 0, opts: SafeSpotOpts = {}): SafeSpot | null {
    const margin = opts.margin ?? 18;
    const half = Math.max(0, (opts.roadOnly ? this.def.roadHalf : this.def.corridorHalf) - margin);
    const step = Math.max(8, opts.stepPx ?? 18);
    const searchPx = Math.max(0, opts.sSearchPx ?? 260);
    const safe = new Set(opts.surfaces ?? DEFAULT_SAFE_SURFACES);
    const wantD = clamp(preferredD, -half, half);
    const sBase = wrap01(s);
    const sOffsets = [0];
    for (let off = step; off <= searchPx; off += step) {
      sOffsets.push(-off, off);
    }

    let best: SafeSpot | null = null;
    let bestScore = Infinity;
    const steps = Math.max(1, Math.ceil((half * 2) / step));
    for (const sOffPx of sOffsets) {
      const ss = wrap01(sBase + sOffPx / this.total);
      for (let i = 0; i <= steps; i++) {
        const d = half <= 0 ? 0 : -half + (i / steps) * half * 2;
        if (!safe.has(this.surfaceAtProj({ s: ss, d, idx: 0 }))) continue;
        const score = Math.abs(d - wantD) + Math.abs(sOffPx) * 0.35;
        if (score >= bestScore) continue;
        const p = this.posOf(ss, d);
        best = { ...p, s: ss, d };
        bestScore = score;
      }
    }

    return best;
  }

  /** Starting grid pose for slot i (0 = front). Row spacing is in pixels so racers never spawn overlapping. */
  startGrid(i: number) {
    const rowGapPx = 52;
    const s = 1 - (70 + i * rowGapPx) / this.total;
    const d = (i % 2 === 0 ? -0.36 : 0.36) * this.def.roadHalf;
    const pos = this.posOf(s, d);
    return { ...pos, s: wrap01(s), d };
  }
}
