import type { PokeType, PokemonDef } from "../types";

/**
 * Signature moves: every Pokémon carries a personal move pool derived from
 * its typing (2 moves per type, padded with normal-type staples so every
 * pool is exactly 4, and always including one defensive option). Moves are
 * fired from an energy meter charged by good driving — drift releases,
 * airtime, slipstream, boost pads, laps and landed hits — and unlock per
 * species as you race with it (XP levels).
 */

export type MoveCat =
  | "dash"       // self-propelled burst, optional contact status
  | "shot"       // projectile(s)
  | "zone"       // lingering area dropped on the track
  | "pulse"      // instant radial / cone blast
  | "stance"     // timed self state (reflect)
  | "guard"      // shields and status cleanses
  | "transform"  // dig / fly / phase
  | "buff";      // timed self stat change (incl. weather)

export interface MoveDef {
  id: string;
  name: string;
  type: PokeType;
  cost: number;       // energy 0..100
  cat: MoveCat;
  desc: string;       // loadout screen blurb
}

const M = (id: string, name: string, type: PokeType, cost: number, cat: MoveCat, desc: string): MoveDef =>
  ({ id, name, type, cost, cat, desc });

export const MOVES: Record<string, MoveDef> = Object.fromEntries([
  // normal — the universal staples that pad every shallow pool
  M("quickattack", "Quick Attack", "normal", 30, "dash", "Instant short dash with razor-sharp steering."),
  M("swift", "Swift", "normal", 40, "shot", "Homing star — never misses the nearest racer ahead."),
  M("bodyslam", "Body Slam", "normal", 45, "pulse", "Leap and slam down — the shockwave spins anyone nearby."),
  M("roar", "Roar", "normal", 40, "pulse", "Bellow ahead — racers in the cone flinch, slow and scatter."),
  // guards — the defensive layer: shields, shells and cleanses
  M("harden", "Harden", "normal", 30, "guard", "Tense up — a tough hide blocks the next hit for a while."),
  M("recover", "Recover", "normal", 35, "guard", "Shrug off every status and surge back up to pace."),
  M("withdraw", "Withdraw", "water", 40, "guard", "Tuck into the shell — soaks the next TWO hits."),
  M("haze", "Haze", "ice", 40, "guard", "Icy veil: wipes your statuses and shrouds you, untouchable."),
  M("acidarmor", "Acid Armor", "poison", 45, "guard", "Melt into ooze — blocks a hit, poisons anyone who bumps you."),
  // fire
  M("flamecharge", "Flame Charge", "fire", 45, "dash", "Blazing sprint — burns on contact, lava can't touch you."),
  M("firespin", "Fire Spin", "fire", 50, "zone", "Drop a fire vortex that scorches whoever drives through."),
  // water
  M("aquajet", "Aqua Jet", "water", 40, "dash", "Water dash — twice the surge if you fire it on water."),
  M("raindance", "Rain Dance", "water", 60, "buff", "Summon rain: rivals slip and slow, water types speed up."),
  // electric
  M("volttackle", "Volt Tackle", "electric", 50, "dash", "Electric charge — paralyzes everyone you blast through."),
  M("thunderwave", "Thunder Wave", "electric", 35, "pulse", "Crackling arc ahead — paralyzes in a cone."),
  // grass
  M("vinewhip", "Vine Whip", "grass", 40, "pulse", "Lash the racer ahead: they spin, you slingshot forward."),
  M("stunspore", "Stun Spore", "grass", 40, "zone", "Drop a paralyzing spore cloud behind you."),
  // ice
  M("iceshard", "Ice Shard", "ice", 35, "shot", "Cheap, fast icicle — a quick freeze for whoever's ahead."),
  M("frostmist", "Frost Mist", "ice", 45, "zone", "Trail a freezing mist that chills your pursuers."),
  // fighting
  M("machpunch", "Mach Punch", "fighting", 35, "dash", "Lightning lunge — first contact sends them spinning."),
  M("counter", "Counter", "fighting", 50, "stance", "Brace briefly — the next hit bounces back at the attacker."),
  // poison
  M("acidspray", "Acid Spray", "poison", 40, "shot", "Lob a glob that bursts into a lingering acid puddle."),
  M("sludgewave", "Sludge Wave", "poison", 55, "pulse", "Poison nova — everyone close gets spun and poisoned."),
  // ground
  M("dig", "Dig", "ground", 55, "transform", "Burrow under the track — untouchable, immune to terrain."),
  M("earthquake", "Earthquake", "ground", 60, "pulse", "Shake the ground — spins every GROUNDED racer near you."),
  // flying
  M("gust", "Gust", "flying", 35, "pulse", "Wing blast — physically shoves racers ahead of you aside."),
  M("fly", "Fly", "flying", 60, "transform", "Take wing — soar over gaps, hazards and everything else."),
  // psychic
  M("confusion", "Confusion", "psychic", 45, "pulse", "Scramble the racer ahead — their steering reverses."),
  M("barrier", "Barrier", "psychic", 55, "stance", "Long psychic wall — reflects hits back while it lasts."),
  // bug
  M("stringshot", "String Shot", "bug", 35, "zone", "Web the road behind — victims bog down, drifts unravel."),
  M("pinmissile", "Pin Missile", "bug", 45, "shot", "Three needle shots in a forward spread."),
  // rock
  M("rockthrow", "Rock Throw", "rock", 40, "shot", "Lob a boulder in an arc — it lands with a flattening thud."),
  M("rockpolish", "Rock Polish", "rock", 45, "buff", "Polish up: a surge of speed and offroad means nothing."),
  // ghost
  M("shadowsneak", "Shadow Sneak", "ghost", 45, "transform", "Phase out — slip through racers, shots and hazards."),
  M("lick", "Lick", "ghost", 35, "pulse", "Close-range lick — paralyzes them, you steal their pace."),
  // dragon
  M("dragonbreath", "Dragon Breath", "dragon", 45, "pulse", "Searing cone of breath — spins and numbs the pack ahead."),
  M("dragonrush", "Dragon Rush", "dragon", 55, "dash", "Bulldozing charge — scatter anyone in the way, any size.")
].map((m) => [m.id, m]));

/** Two signature moves per type, in unlock-priority order. */
const TYPE_MOVES: Record<PokeType, string[]> = {
  normal: ["quickattack", "bodyslam"],
  fire: ["flamecharge", "firespin"],
  water: ["aquajet", "raindance"],
  electric: ["volttackle", "thunderwave"],
  grass: ["vinewhip", "stunspore"],
  ice: ["iceshard", "frostmist"],
  fighting: ["machpunch", "counter"],
  poison: ["acidspray", "sludgewave"],
  ground: ["dig", "earthquake"],
  flying: ["gust", "fly"],
  psychic: ["confusion", "barrier"],
  bug: ["stringshot", "pinmissile"],
  rock: ["rockthrow", "rockpolish"],
  ghost: ["shadowsneak", "lick"],
  dragon: ["dragonbreath", "dragonrush"]
};

const NORMAL_PAD = ["quickattack", "swift", "bodyslam", "roar"];

/** The defensive staple each type reaches for when its pool is all offense. */
const GUARD_BY_TYPE: Partial<Record<PokeType, string>> = {
  normal: "recover", fire: "harden", water: "withdraw", electric: "harden",
  grass: "recover", ice: "haze", fighting: "counter", poison: "acidarmor",
  ground: "harden", flying: "recover", psychic: "barrier", bug: "harden",
  rock: "harden", ghost: "recover", dragon: "harden"
};

/** Stances, guards and transforms all count as ways to not get hit. */
const DEFENSIVE_CATS: MoveCat[] = ["stance", "guard", "transform"];

/**
 * A species' move pool: interleave its types' moves, pad with normal
 * staples to exactly 4. Order = unlock order (level 1 → 4).
 * Every pool is guaranteed one defensive option — if the type moves came
 * out all offense/speed, the third unlock becomes the type's guard move.
 */
export function movePool(def: PokemonDef): MoveDef[] {
  const lists = def.types.map((t) => [...TYPE_MOVES[t]]);
  const ids: string[] = [];
  for (let round = 0; round < 2; round++) {
    for (const list of lists) {
      const id = list.shift();
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  for (const id of NORMAL_PAD) {
    if (ids.length >= 4) break;
    if (!ids.includes(id)) ids.push(id);
  }
  const pool = ids.slice(0, 4);
  if (!pool.some((id) => DEFENSIVE_CATS.includes(MOVES[id].cat))) {
    const guard = def.types.map((t) => GUARD_BY_TYPE[t]).find((g) => g && !pool.includes(g))
      ?? "harden";
    pool[Math.min(2, pool.length - 1)] = guard;
  }
  return pool.map((id) => MOVES[id]);
}

/** XP needed to have N moves unlocked (index 0 = first move, free). */
export const LEVEL_XP = [0, 2, 5, 9];

/** How many of the pool's moves this much XP unlocks (1..4). */
export function unlockedCount(xp: number): number {
  let n = 0;
  for (const need of LEVEL_XP) if (xp >= need) n++;
  return Math.max(1, Math.min(4, n));
}

/** XP still needed for the next unlock, or null when maxed. */
export function xpToNext(xp: number): number | null {
  for (const need of LEVEL_XP) if (xp < need) return need - xp;
  return null;
}
