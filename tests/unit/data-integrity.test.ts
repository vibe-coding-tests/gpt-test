import { describe, expect, test } from "vitest";
import { ITEM_WEIGHTS, STARTER_IDS, UNLOCK_ORDER } from "../../src/constants";
import { MOVES, movePool } from "../../src/data/movesData";
import { ALL_IDS, getPokemon, POKEMON } from "../../src/data/pokemonData";
import { TRACKS } from "../../src/data/trackData";

const DEFENSIVE_CATS = new Set(["stance", "guard", "transform"]);

describe("data integrity", () => {
  test("contains the original 151 Pokemon exactly once", () => {
    expect(POKEMON.size).toBe(151);
    expect(ALL_IDS).toHaveLength(151);
    expect(ALL_IDS[0]).toBe(1);
    expect(ALL_IDS[ALL_IDS.length - 1]).toBe(151);
    expect(new Set(ALL_IDS).size).toBe(151);
  });

  test("unlock lists reference valid Pokemon and contain no duplicates", () => {
    const valid = new Set(ALL_IDS);
    for (const id of [...STARTER_IDS, ...UNLOCK_ORDER]) {
      expect(valid.has(id), `unknown Pokemon id ${id}`).toBe(true);
    }
    expect(new Set(STARTER_IDS).size).toBe(STARTER_IDS.length);
    expect(new Set(UNLOCK_ORDER).size).toBe(UNLOCK_ORDER.length);
  });

  test("every Pokemon move pool is complete and gets an early defensive option", () => {
    for (const id of ALL_IDS) {
      const pool = movePool(getPokemon(id));
      expect(pool, `pool for ${id}`).toHaveLength(4);
      for (const move of pool) {
        expect(MOVES[move.id], `missing move ${move.id}`).toBe(move);
      }
      expect(
        pool.slice(0, 2).some((move) => DEFENSIVE_CATS.has(move.cat)),
        `pool for ${id} lacks early defense`
      ).toBe(true);
    }
  });

  test("item weights have one non-negative column for each race position", () => {
    for (const [item, weights] of Object.entries(ITEM_WEIGHTS)) {
      expect(weights, item).toHaveLength(8);
      expect(weights.every((weight) => weight >= 0), item).toBe(true);
      expect(weights.some((weight) => weight > 0), item).toBe(true);
    }
  });

  test("tracks have valid ids, ranges, and feature bounds", () => {
    expect(TRACKS).toHaveLength(15);
    expect(new Set(TRACKS.map((track) => track.id)).size).toBe(TRACKS.length);

    for (const track of TRACKS) {
      expect(track.points.length, track.name).toBeGreaterThanOrEqual(4);
      expect(track.roadHalf, track.name).toBeGreaterThan(0);
      expect(track.corridorHalf, track.name).toBeGreaterThanOrEqual(track.roadHalf);
      expect(track.laps, track.name).toBeGreaterThan(0);

      for (const feature of track.features) {
        expect(feature.s0, track.name).toBeGreaterThanOrEqual(0);
        expect(feature.s0, track.name).toBeLessThanOrEqual(1);
        expect(feature.s1, track.name).toBeGreaterThanOrEqual(0);
        expect(feature.s1, track.name).toBeLessThanOrEqual(1);
        expect(feature.d0, track.name).toBeLessThanOrEqual(feature.d1);
        expect(feature.d0, track.name).toBeGreaterThanOrEqual(-track.corridorHalf);
        expect(feature.d1, track.name).toBeLessThanOrEqual(track.corridorHalf);
      }

      for (const row of track.itemRows) {
        expect(row, track.name).toBeGreaterThanOrEqual(0);
        expect(row, track.name).toBeLessThanOrEqual(1);
      }
    }
  });
});
