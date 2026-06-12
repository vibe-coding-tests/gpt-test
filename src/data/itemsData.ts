import type { ItemKind, PokeType } from "../types";
import { ITEM_WEIGHTS } from "../constants";

export interface ItemInfo {
  kind: ItemKind;
  name: string;
  color: number;
  desc: string;
}

export const ITEMS: Record<ItemKind, ItemInfo> = {
  thunderbolt: { kind: "thunderbolt", name: "Thunderbolt", color: 0xf8d030, desc: "Storm cloud zaps the racer ahead" },
  substitute: { kind: "substitute", name: "Substitute", color: 0x9bbf6a, desc: "Drops a decoy that spins out rivals" },
  agility: { kind: "agility", name: "Agility", color: 0x58c8f0, desc: "Instant burst of speed" },
  sleeppowder: { kind: "sleeppowder", name: "Sleep Powder", color: 0x9ad05a, desc: "Lulls nearby racers to sleep" },
  protect: { kind: "protect", name: "Protect", color: 0x58e8c8, desc: "Blocks the next hit" },
  teleport: { kind: "teleport", name: "Teleport", color: 0xc878f0, desc: "Warp several positions ahead" },
  ember: { kind: "ember", name: "Ember", color: 0xff7a30, desc: "Fireball that bounces off the rails" },
  hydropump: { kind: "hydropump", name: "Hydro Pump", color: 0x4aa8f0, desc: "Water jet that homes onto the racer ahead" },
  razorleaf: { kind: "razorleaf", name: "Razor Leaf", color: 0x7ac74c, desc: "Spinning leaves shield you and slash rivals" },
  rollout: { kind: "rollout", name: "Rollout", color: 0xb8a890, desc: "Boulder that flattens whoever it hits" },
  icebeam: { kind: "icebeam", name: "Ice Beam", color: 0x8ad8f0, desc: "Straight-line shot that freezes solid" },
  toxic: { kind: "toxic", name: "Toxic", color: 0xb05ae8, desc: "Drops a lingering poison puddle behind you" },
  hyperbeam: { kind: "hyperbeam", name: "Hyper Beam", color: 0xffa050, desc: "Blasts everyone on the road ahead" },
  leechseed: { kind: "leechseed", name: "Leech Seed", color: 0x8ac84c, desc: "Saps the racer ahead to fuel your boost" }
};

/** Move type of each item, for STAB upgrades and same-type roll bias. */
export const ITEM_TYPE: Record<ItemKind, PokeType> = {
  thunderbolt: "electric",
  substitute: "normal",
  agility: "psychic",
  sleeppowder: "grass",
  protect: "normal",
  teleport: "psychic",
  ember: "fire",
  hydropump: "water",
  razorleaf: "grass",
  rollout: "rock",
  icebeam: "ice",
  toxic: "poison",
  hyperbeam: "normal",
  leechseed: "grass"
};

/**
 * Roll an item for a racer in the given position (1-based).
 * Pass the racer's types to bias the roll toward same-type moves —
 * a fire type sees Ember more often, a poison type sees Toxic, etc.
 */
/**
 * Position-weighted item roll. `desperation` (0..1) is the rubber-band kicker:
 * racers far behind the leader roll from one or two positions further back
 * than they actually are, so a distant 5th still sees rescue items.
 */
export function rollItem(position: number, rnd: () => number, types?: PokeType[], desperation = 0): ItemKind {
  const shifted = position + (desperation > 0.62 ? 2 : desperation > 0.27 ? 1 : 0);
  const idx = Math.min(Math.max(shifted - 1, 0), 7);
  const kinds = Object.keys(ITEM_WEIGHTS) as ItemKind[];
  const w = (k: ItemKind) =>
    ITEM_WEIGHTS[k][idx] * (types && types.includes(ITEM_TYPE[k]) ? 1.8 : 1);
  let total = 0;
  for (const k of kinds) total += w(k);
  let roll = rnd() * total;
  for (const k of kinds) {
    roll -= w(k);
    if (roll <= 0) return k;
  }
  return "agility";
}

export const ITEM_LIST = Object.keys(ITEMS) as ItemKind[];
