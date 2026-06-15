import { describe, expect, test } from "vitest";
import { GameState, gpAdvance, pickRivals, startBattle, startGp, startTimeTrial } from "../../src/state/GameState";
import { ALL_IDS, getPokemon } from "../../src/data/pokemonData";
import { CUPS } from "../../src/data/cups";
import { RACER_COUNT } from "../../src/constants";

describe("pickRivals", () => {
  const PLAYER_ID = 25; // Pikachu

  test("returns exactly 7 rivals", () => {
    const rivals = pickRivals(PLAYER_ID);
    expect(rivals).toHaveLength(RACER_COUNT - 1);
  });

  test("player species is never in the rival list", () => {
    for (let i = 0; i < 20; i++) {
      const rivals = pickRivals(PLAYER_ID);
      expect(rivals).not.toContain(PLAYER_ID);
    }
  });

  test("no duplicate species in the rival list", () => {
    for (let i = 0; i < 20; i++) {
      const rivals = pickRivals(PLAYER_ID);
      expect(new Set(rivals).size).toBe(rivals.length);
    }
  });

  test("all rivals are valid Pokémon ids", () => {
    const valid = new Set(ALL_IDS);
    const rivals = pickRivals(PLAYER_ID);
    for (const id of rivals) {
      expect(valid.has(id), `invalid id ${id}`).toBe(true);
    }
  });

  test("covers at least 3 distinct movement classes", () => {
    const rivals = pickRivals(PLAYER_ID);
    const classes = new Set(rivals.map((id) => getPokemon(id).cls));
    expect(classes.size).toBeGreaterThanOrEqual(3);
  });

  test("is deterministic for a fixed rng function", () => {
    let seed = 42;
    const seededRng = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };
    const a = pickRivals(PLAYER_ID, seededRng);
    seed = 42;
    const b = pickRivals(PLAYER_ID, seededRng);
    expect(a).toEqual(b);
  });
});

describe("startGp", () => {
  test("sets mode, playerSpeciesId, and opens the first track in the cup", () => {
    startGp(0, 25);
    expect(GameState.mode).toBe("gp");
    expect(GameState.demo).toBe(false);
    expect(GameState.playerSpeciesId).toBe(25);
    expect(GameState.trackId).toBe(CUPS[0].trackIds[0]);
  });

  test("roster has RACER_COUNT entries with the player first", () => {
    startGp(1, 7); // Squirtle in cup 1
    expect(GameState.gp).not.toBeNull();
    expect(GameState.gp!.rosterIds).toHaveLength(RACER_COUNT);
    expect(GameState.gp!.rosterIds[0]).toBe(7);
  });

  test("points array is initialised to all zeros", () => {
    startGp(0, 1);
    expect(GameState.gp!.points).toHaveLength(RACER_COUNT);
    expect(GameState.gp!.points.every((p) => p === 0)).toBe(true);
  });

  test("works for all four cups", () => {
    for (let cupId = 0; cupId < CUPS.length; cupId++) {
      startGp(cupId, 25);
      expect(GameState.gp!.cupId).toBe(cupId);
      expect(GameState.trackId).toBe(CUPS[cupId].trackIds[0]);
    }
  });
});

describe("gpAdvance", () => {
  test("advances raceIndex and switches to the next track", () => {
    startGp(0, 25); // cup 0 has tracks [0, 1, 2]
    const advanced = gpAdvance();
    expect(advanced).toBe(true);
    expect(GameState.gp!.raceIndex).toBe(1);
    expect(GameState.trackId).toBe(CUPS[0].trackIds[1]);
  });

  test("returns false and does not advance past the last race", () => {
    startGp(0, 25);
    gpAdvance(); // race 1
    gpAdvance(); // race 2 (last for a 3-race cup)
    const result = gpAdvance(); // should stop here
    expect(result).toBe(false);
    expect(GameState.gp!.raceIndex).toBe(2);
  });

  test("returns false when called without an active GP session", () => {
    startTimeTrial(0, 25); // clears GameState.gp
    expect(gpAdvance()).toBe(false);
  });
});

describe("startTimeTrial", () => {
  test("sets mode to tt and clears the GP session", () => {
    startGp(0, 25);
    startTimeTrial(3, 7);
    expect(GameState.mode).toBe("tt");
    expect(GameState.trackId).toBe(3);
    expect(GameState.playerSpeciesId).toBe(7);
    expect(GameState.gp).toBeNull();
    expect(GameState.demo).toBe(false);
  });
});

describe("startBattle", () => {
  test("sets mode to battle, assigns an arena, and builds a full battle roster", () => {
    startBattle(1, 54); // Psyduck in arena 1
    expect(GameState.mode).toBe("battle");
    expect(GameState.trackId).toBe(1);
    expect(GameState.playerSpeciesId).toBe(54);
    expect(GameState.battleRoster).not.toBeNull();
    expect(GameState.battleRoster![0]).toBe(54);
    expect(GameState.battleRoster!).toHaveLength(RACER_COUNT);
    expect(GameState.gp).toBeNull();
  });
});
