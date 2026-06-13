import type { DerivedStats, PokemonDef, PokeType } from "../types";
import { clamp } from "../util";

/**
 * Class bases. Every class is a side-grade, not a tier: each trades a real
 * weakness for its strength, and no class wins on every axis.
 *   runner  — best accel + cornering, modest top speed, light
 *   flyer   — high top speed + gap/slope/terrain privilege, but wide turns
 *   floater — nimble and skims rough ground, but drifts wide (low grip)
 *   swimmer — average on land, surges in water, on the heavy side
 *   heavy   — fastest top speed + huge mass (bulldozes), but sluggish to
 *             accelerate and steer, and ruled by gravity on slopes
 */
const CLASS_BASE: Record<string, { sp: number; ac: number; hd: number; wt: number }> = {
  runner: { sp: 0.74, ac: 0.88, hd: 0.86, wt: 0.32 },
  flyer: { sp: 0.80, ac: 0.72, hd: 0.60, wt: 0.34 },
  floater: { sp: 0.74, ac: 0.80, hd: 0.70, wt: 0.26 },
  swimmer: { sp: 0.72, ac: 0.74, hd: 0.78, wt: 0.46 },
  heavy: { sp: 0.88, ac: 0.46, hd: 0.52, wt: 0.96 }
};

const CLASS_HANDLING: Record<string, {
  front: number; rear: number; steer: number; wheelbase: number; cgFront: number; inertia: number; catch: number;
}> = {
  runner: { front: 1.07, rear: 1.04, steer: 0.56, wheelbase: 48, cgFront: 0.53, inertia: 0.82, catch: 0.82 },
  flyer: { front: 0.88, rear: 0.92, steer: 0.47, wheelbase: 54, cgFront: 0.5, inertia: 0.94, catch: 0.58 },
  floater: { front: 0.98, rear: 0.82, steer: 0.53, wheelbase: 52, cgFront: 0.51, inertia: 0.86, catch: 0.68 },
  swimmer: { front: 1.0, rear: 0.98, steer: 0.51, wheelbase: 53, cgFront: 0.53, inertia: 0.98, catch: 0.64 },
  heavy: { front: 0.96, rear: 1.09, steer: 0.41, wheelbase: 62, cgFront: 0.49, inertia: 1.38, catch: 0.45 }
};

/**
 * Type modifiers are trade-offs: each gives with one hand and takes with the
 * other, so picking a type is a flavor choice, never a free stat bump. (wt
 * raises mass — good for shoving, bad for getting redirected.)
 */
const TYPE_MODS: Partial<Record<PokeType, Partial<Record<"sp" | "ac" | "hd" | "wt", number>>>> = {
  fire: { sp: 0.06, hd: -0.05 },          // quick but loose
  water: { hd: 0.05, sp: -0.04 },         // planted, slower
  electric: { ac: 0.07, hd: -0.05 },      // explosive launch, nervous grip
  grass: { hd: 0.05, ac: -0.04 },         // grippy, slow to rev
  ice: { sp: 0.05, hd: -0.06 },           // fast and slick
  fighting: { ac: 0.06, wt: 0.04, sp: -0.04 },
  poison: { hd: 0.04, wt: 0.02, sp: -0.03 },
  ground: { wt: 0.12, ac: -0.04 },        // heavy-footed
  flying: { sp: 0.04, wt: -0.04, hd: -0.03 }, // light and fast, loose
  psychic: { hd: 0.05, ac: 0.03, sp: -0.05 }, // finesse, low top end
  bug: { ac: 0.05, sp: -0.04 },           // nimble, slow
  rock: { wt: 0.20, sp: -0.04, ac: -0.05 }, // tanky and sluggish
  ghost: { hd: 0.05, sp: 0.02, wt: -0.12 }, // floaty and nimble
  dragon: { sp: 0.06, wt: 0.08, ac: -0.05 }, // powerful, heavy, slow to spin up
  normal: { ac: 0.02, hd: 0.02, sp: -0.02 }  // jack of all trades
};

/** Derive racing stats from a Pokémon's class, types, size and evolution stage. */
export function deriveStats(def: PokemonDef): DerivedStats {
  const base = CLASS_BASE[def.cls];
  let sp = base.sp, ac = base.ac, hd = base.hd, wt = base.wt;

  def.types.forEach((t, i) => {
    const mods = TYPE_MODS[t];
    if (!mods) return;
    const scale = i === 0 ? 1 : 0.5;
    sp += (mods.sp ?? 0) * scale;
    ac += (mods.ac ?? 0) * scale;
    hd += (mods.hd ?? 0) * scale;
    wt += (mods.wt ?? 0) * scale;
  });

  // Size is a genuine trade-off, not a free upgrade.
  if (def.size === 0) {
    ac += 0.05; hd += 0.05; wt -= 0.08;       // small: nimble + light, but easily shoved
  } else if (def.size === 2) {
    sp += 0.05; wt += 0.16; ac -= 0.06; hd -= 0.05; // large: fast + massive, sluggish to turn/rev
  }

  // Legendaries are side-grades: extra pace paid for with looser handling.
  if (def.legendary) { sp += 0.05; hd -= 0.05; }

  // Pre-evolutions are weaker; collecting Rare Candies closes the gap.
  const stageMult = 1 - 0.05 * def.evosRemaining;
  sp = sp * stageMult + (def.pow ?? 0);
  ac = ac * stageMult + (def.pow ?? 0) * 0.6;

  sp = clamp(sp, 0.05, 1);
  ac = clamp(ac, 0.05, 1);
  hd = clamp(hd, 0.05, 1);
  wt = clamp(wt, 0.05, 1);

  const handling = CLASS_HANDLING[def.cls];
  const mass = 0.8 + wt * 1.7;
  const radius = 15 + def.size * 3.5 + (def.cls === "heavy" ? 3 : 0);
  const gripFromHd = 0.78 + hd * 0.36;
  const wheelbase = handling.wheelbase + def.size * 3.5;

  return {
    sp, ac, hd, wt,
    topSpeed: 300 + sp * 150,
    accel: 260 + ac * 340,
    mass,
    gripFront: clamp(handling.front * gripFromHd, 0.55, 1.35),
    gripRear: clamp(handling.rear * (0.8 + hd * 0.34), 0.5, 1.32),
    steerLock: clamp(handling.steer * (0.82 + hd * 0.28), 0.32, 0.7),
    wheelbase,
    cgFront: handling.cgFront,
    izz: mass * wheelbase * wheelbase * 0.12 * handling.inertia,
    catchAssist: handling.catch,
    radius
  };
}

/**
 * Gen-1-flavored effectiveness chart, limited to the attack types items use.
 * Multipliers stack across the defender's types (2 × 0.5 = 1, like the games).
 */
const TYPE_CHART: Partial<Record<PokeType, Partial<Record<PokeType, number>>>> = {
  fire: { grass: 2, ice: 2, bug: 2, fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  electric: { water: 2, flying: 2, ground: 0, electric: 0.5, grass: 0.5, dragon: 0.5 },
  grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5 },
  ice: { grass: 2, ground: 2, flying: 2, dragon: 2, water: 0.5, ice: 0.5 },
  ghost: { ghost: 2, psychic: 2, normal: 0 }
};

/** 0 = immune, 0.25/0.5 = resisted, 1 = neutral, 2/4 = super effective. */
export function typeEffect(attack: PokeType, defenderTypes: PokeType[]): number {
  const row = TYPE_CHART[attack];
  if (!row) return 1;
  let m = 1;
  for (const t of defenderTypes) m *= row[t] ?? 1;
  return m;
}

/**
 * Multiplier for slow terrain off the road, by movement class. Always < 1 so
 * cutting a corner onto the rough always costs you something — specialists just
 * pay less. (Cutting is also gated by lap checkpoints; this is the speed tax.)
 */
export function offroadMult(def: PokemonDef, offroadKind: string): number {
  if (def.cls === "floater") return 0.9;       // glides, but the rough still nips
  if (def.cls === "flyer") return 0.82;        // hovers above most of it
  if (def.types.includes("grass") && offroadKind === "grass") return 0.92; // at home, not faster than road
  if (def.types.includes("ground") && (offroadKind === "sand" || offroadKind === "rock")) return 0.8;
  if (def.cls === "heavy") return 0.66; // bulldozes through, slowly
  return 0.55;
}

/** Multiplier inside water features. */
export function waterMult(def: PokemonDef): number {
  if (def.cls === "swimmer") return 1.28;
  if (def.types.includes("water")) return 1.15;
  if (def.cls === "flyer") return 1.0;   // hovers over it
  if (def.cls === "floater") return 0.9;
  return 0.55;
}
