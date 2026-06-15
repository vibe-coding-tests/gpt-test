import { describe, expect, test } from "vitest";
import { LEVEL_XP, MOVES, movePool, unlockedCount, xpToNext } from "../../src/data/movesData";
import { ALL_IDS, getPokemon } from "../../src/data/pokemonData";

const DEFENSIVE_CATS = new Set(["stance", "guard", "transform"]);

describe("unlockedCount", () => {
  test("the first move is always free (xp 0 unlocks 1)", () => {
    expect(unlockedCount(0)).toBe(1);
    expect(unlockedCount(-5)).toBe(1); // never drops below 1
  });

  test("crosses each LEVEL_XP threshold exactly", () => {
    // thresholds are [0, 2, 5, 9]
    expect(unlockedCount(1)).toBe(1);
    expect(unlockedCount(2)).toBe(2);
    expect(unlockedCount(4)).toBe(2);
    expect(unlockedCount(5)).toBe(3);
    expect(unlockedCount(8)).toBe(3);
    expect(unlockedCount(9)).toBe(4);
  });

  test("caps at the four-move pool size", () => {
    expect(unlockedCount(1_000)).toBe(4);
  });
});

describe("xpToNext", () => {
  test("reports the gap to the next threshold", () => {
    expect(xpToNext(0)).toBe(2); // need 2 for move 2
    expect(xpToNext(2)).toBe(3); // 5 - 2
    expect(xpToNext(5)).toBe(4); // 9 - 5
  });

  test("returns null once fully maxed", () => {
    expect(xpToNext(LEVEL_XP[LEVEL_XP.length - 1])).toBeNull();
    expect(xpToNext(50)).toBeNull();
  });
});

describe("movePool", () => {
  test("every species gets a pool of exactly four moves", () => {
    for (const id of ALL_IDS) {
      const pool = movePool(getPokemon(id));
      expect(pool, `species ${id}`).toHaveLength(4);
    }
  });

  test("pools never contain duplicate moves", () => {
    for (const id of ALL_IDS) {
      const ids = movePool(getPokemon(id)).map((m) => m.id);
      expect(new Set(ids).size, `species ${id}`).toBe(ids.length);
    }
  });

  test("every move in a pool resolves to a known move definition", () => {
    for (const id of ALL_IDS) {
      for (const move of movePool(getPokemon(id))) {
        expect(MOVES[move.id], `move ${move.id}`).toBeDefined();
      }
    }
  });

  test("every species has a defensive option in its first two unlocks", () => {
    for (const id of ALL_IDS) {
      const early = movePool(getPokemon(id)).slice(0, 2);
      const hasDefense = early.some((m) => DEFENSIVE_CATS.has(m.cat));
      expect(hasDefense, `species ${id} lacks an early defensive move`).toBe(true);
    }
  });
});
