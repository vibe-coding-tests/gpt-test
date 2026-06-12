import type { DerivedStats, PokemonDef, PokeType } from "../types";
import { clamp } from "../util";

const CLASS_BASE: Record<string, { sp: number; ac: number; hd: number; wt: number }> = {
  runner: { sp: 0.78, ac: 0.85, hd: 0.85, wt: 0.35 },
  flyer: { sp: 0.82, ac: 0.7, hd: 0.58, wt: 0.4 },
  floater: { sp: 0.72, ac: 0.78, hd: 0.68, wt: 0.3 },
  swimmer: { sp: 0.7, ac: 0.68, hd: 0.72, wt: 0.45 },
  heavy: { sp: 0.68, ac: 0.55, hd: 0.6, wt: 0.95 }
};

const TYPE_MODS: Partial<Record<PokeType, Partial<Record<"sp" | "ac" | "hd" | "wt", number>>>> = {
  fire: { sp: 0.07 },
  flying: { sp: 0.05, hd: 0.02 },
  electric: { sp: 0.04, ac: 0.08 },
  dragon: { sp: 0.06, wt: 0.08 },
  water: { sp: 0.02 },
  normal: { sp: 0.02, ac: 0.02 },
  bug: { ac: 0.04 },
  fighting: { ac: 0.05, wt: 0.04 },
  psychic: { hd: 0.06, ac: 0.03 },
  ghost: { hd: 0.04, wt: -0.12 },
  grass: { hd: 0.03 },
  ice: { hd: -0.04, wt: 0.06 },
  rock: { wt: 0.22, sp: -0.04 },
  ground: { wt: 0.12 },
  poison: { wt: 0.02 }
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

  wt += def.size * 0.18 - 0.05;
  hd += (1 - def.size) * 0.04;
  if (def.size === 2) sp += 0.03;

  if (def.legendary) { sp += 0.05; ac += 0.04; }

  // Pre-evolutions are weaker; collecting Rare Candies closes the gap.
  const stageMult = 1 - 0.07 * def.evosRemaining;
  sp = sp * stageMult + (def.pow ?? 0);
  ac = ac * stageMult + (def.pow ?? 0) * 0.6;

  sp = clamp(sp, 0.05, 1);
  ac = clamp(ac, 0.05, 1);
  hd = clamp(hd, 0.05, 1);
  wt = clamp(wt, 0.05, 1);

  const gripByClass: Record<string, number> = {
    runner: 9, flyer: 5.5, floater: 4.5, swimmer: 6.5, heavy: 7.5
  };

  return {
    sp, ac, hd, wt,
    topSpeed: 300 + sp * 150,
    accel: 260 + ac * 340,
    turnRate: 1.9 + hd * 1.2,
    mass: 0.8 + wt * 1.7,
    grip: gripByClass[def.cls],
    radius: 15 + def.size * 3.5 + (def.cls === "heavy" ? 3 : 0)
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

/** Multiplier for slow terrain off the road, by movement class. */
export function offroadMult(def: PokemonDef, offroadKind: string): number {
  if (def.cls === "floater") return 1.0;       // glides over rough ground
  if (def.cls === "flyer") return 0.85;        // hovers above most of it
  if (def.types.includes("grass") && offroadKind === "grass") return 1.06;
  if (def.types.includes("ground") && (offroadKind === "sand" || offroadKind === "rock")) return 0.8;
  if (def.cls === "heavy") return 0.62;
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
