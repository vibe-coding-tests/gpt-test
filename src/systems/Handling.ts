import type { PokemonDef, Surface } from "../types";
import { clamp } from "../util";

export const HANDLING_STEP = 1 / 120;

export const HANDLING_TUNE = {
  tireB: 6.2,
  tireC: 1.28,
  lateralAccel: 1550,
  yawGain: 0.014,
  yawDamping: 4.4,
  loadShift: 0.16,
  maxLoadShift: 0.18
};

/** Progressive arcade tire curve: rises quickly, peaks, then falls off gently. */
export function tireCurve(alpha: number): number {
  const sign = Math.sign(alpha) || 1;
  const a = Math.abs(alpha);
  const base = Math.sin(HANDLING_TUNE.tireC * Math.atan(HANDLING_TUNE.tireB * a));
  const falloff = 1 - clamp((a - 0.32) / 1.1, 0, 1) * 0.28;
  return sign * base * falloff;
}

/** Grip is separate from speed penalties: ice/offroad make the body slide. */
export function surfaceGrip(surface: Surface, def: PokemonDef, airborne: boolean, offroadFree: boolean): number {
  if (airborne) return 0.18;
  if (offroadFree) return Math.max(1, baseSurfaceGrip(surface, def));
  return baseSurfaceGrip(surface, def);
}

function baseSurfaceGrip(surface: Surface, def: PokemonDef): number {
  switch (surface) {
    case "ice": return def.types.includes("ice") ? 0.92 : 0.34;
    case "offroad": return def.cls === "floater" ? 0.86 : def.cls === "flyer" ? 0.78 : def.cls === "heavy" ? 0.7 : 0.62;
    case "water": return def.cls === "swimmer" ? 0.98 : def.types.includes("water") ? 0.9 : def.cls === "flyer" ? 0.82 : 0.52;
    case "mud": return def.cls === "floater" ? 0.88 : def.cls === "flyer" ? 0.72 : 0.45;
    case "lava": return def.types.includes("fire") ? 0.9 : 0.58;
    case "boost": return 1.05;
    case "ramp": return 0.96;
    case "gap": return 0.18;
    case "wall": return 0.55;
    default: return 1;
  }
}

export function loadSplit(staticFront: number, longAccel: number): { front: number; rear: number } {
  const shift = clamp((-longAccel / 1300) * HANDLING_TUNE.loadShift, -HANDLING_TUNE.maxLoadShift, HANDLING_TUNE.maxLoadShift);
  const front = clamp(staticFront + shift, 0.34, 0.68);
  return { front, rear: 1 - front };
}
