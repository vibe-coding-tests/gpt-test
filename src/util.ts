import type Phaser from "phaser";

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const wrap01 = (v: number) => ((v % 1) + 1) % 1;

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Lerp between two angles along the shortest arc. */
export function rotLerp(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * clamp(t, 0, 1);
}

export const dist = (x1: number, y1: number, x2: number, y2: number) =>
  Math.hypot(x2 - x1, y2 - y1);

/** Small deterministic LCG random generator. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }
}

export function fmtTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "--:--.---";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor(ms % 1000);
  return `${m}:${s.toString().padStart(2, "0")}.${t.toString().padStart(3, "0")}`;
}

export const midi2freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Guard for menu key handlers. Resets lingering key state from the previous
 * scene and swallows events for a short grace period after create(), so a
 * single keypress can't cascade through two scenes (e.g. Results -> Menu -> Select).
 */
export function menuKeyGuard(scene: Phaser.Scene, graceMs = 250): () => boolean {
  scene.input.keyboard?.resetKeys();
  const readyAt = scene.time.now + graceMs;
  return () => scene.time.now >= readyAt;
}

export const ordinal = (n: number) =>
  n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
