import { ALL_IDS, getPokemon } from "../data/pokemonData";
import { CUPS } from "../data/cups";
import { RACER_COUNT } from "../constants";
import type { MoveClass } from "../types";

export interface GpSession {
  cupId: number;
  raceIndex: number;
  rosterIds: number[];   // index 0 = player
  points: number[];      // parallel to rosterIds
}

interface State {
  mode: "gp" | "tt" | "battle";
  demo: boolean;
  playerSpeciesId: number;
  trackId: number;
  gp: GpSession | null;
  battleRoster: number[] | null; // index 0 = player
}

export const GameState: State = {
  mode: "gp",
  demo: false,
  playerSpeciesId: 25,
  trackId: 0,
  gp: null,
  battleRoster: null
};

/** Pick 7 AI species with movement-class variety. */
export function pickRivals(playerId: number, rnd: () => number = Math.random): number[] {
  const classes: MoveClass[] = ["runner", "flyer", "floater", "swimmer", "heavy"];
  const chosen = new Set<number>([playerId]);
  const rivals: number[] = [];

  for (const cls of classes) {
    const pool = ALL_IDS.filter((id) => !chosen.has(id) && getPokemon(id).cls === cls);
    if (pool.length && rivals.length < RACER_COUNT - 1) {
      const pick = pool[Math.floor(rnd() * pool.length)];
      chosen.add(pick);
      rivals.push(pick);
    }
  }
  while (rivals.length < RACER_COUNT - 1) {
    const pick = ALL_IDS[Math.floor(rnd() * ALL_IDS.length)];
    if (chosen.has(pick)) continue;
    chosen.add(pick);
    rivals.push(pick);
  }
  return rivals;
}

export function startGp(cupId: number, playerSpeciesId: number) {
  GameState.mode = "gp";
  GameState.demo = false;
  GameState.playerSpeciesId = playerSpeciesId;
  GameState.gp = {
    cupId,
    raceIndex: 0,
    rosterIds: [playerSpeciesId, ...pickRivals(playerSpeciesId)],
    points: new Array(RACER_COUNT).fill(0)
  };
  GameState.trackId = CUPS[cupId].trackIds[0];
}

export function startTimeTrial(trackId: number, playerSpeciesId: number) {
  GameState.mode = "tt";
  GameState.demo = false;
  GameState.playerSpeciesId = playerSpeciesId;
  GameState.trackId = trackId;
  GameState.gp = null;
}

export function startBattle(arenaId: number, playerSpeciesId: number) {
  GameState.mode = "battle";
  GameState.demo = false;
  GameState.playerSpeciesId = playerSpeciesId;
  GameState.trackId = arenaId;
  GameState.gp = null;
  GameState.battleRoster = [playerSpeciesId, ...pickRivals(playerSpeciesId)];
}

export function gpAdvance(): boolean {
  const gp = GameState.gp;
  if (!gp) return false;
  if (gp.raceIndex >= CUPS[gp.cupId].trackIds.length - 1) return false;
  gp.raceIndex++;
  GameState.trackId = CUPS[gp.cupId].trackIds[gp.raceIndex];
  return true;
}
