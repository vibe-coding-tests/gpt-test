import { describe, expect, test } from "vitest";
import { getPokemon } from "../../src/data/pokemonData";
import { deriveStats, offroadMult, typeEffect, waterMult } from "../../src/systems/Stats";

describe("Stats", () => {
  test("derives bounded racing stats for representative Pokemon", () => {
    for (const id of [1, 6, 25, 54, 95, 143, 150]) {
      const stats = deriveStats(getPokemon(id));
      expect(stats.sp).toBeGreaterThanOrEqual(0.05);
      expect(stats.sp).toBeLessThanOrEqual(1);
      expect(stats.ac).toBeGreaterThanOrEqual(0.05);
      expect(stats.ac).toBeLessThanOrEqual(1);
      expect(stats.hd).toBeGreaterThanOrEqual(0.05);
      expect(stats.hd).toBeLessThanOrEqual(1);
      expect(stats.wt).toBeGreaterThanOrEqual(0.05);
      expect(stats.wt).toBeLessThanOrEqual(1);
      expect(stats.topSpeed).toBeGreaterThan(300);
      expect(stats.radius).toBeGreaterThan(0);
      expect(stats.gripFront).toBeGreaterThan(0);
      expect(stats.gripRear).toBeGreaterThan(0);
      expect(stats.steerLock).toBeGreaterThan(0);
      expect(stats.wheelbase).toBeGreaterThan(0);
      expect(stats.cgFront).toBeGreaterThan(0.3);
      expect(stats.cgFront).toBeLessThan(0.7);
      expect(stats.izz).toBeGreaterThan(0);
    }
  });

  test("applies Gen-1-flavored type effectiveness", () => {
    expect(typeEffect("electric", ["ground"])).toBe(0);
    expect(typeEffect("fire", ["grass"])).toBe(2);
    expect(typeEffect("fire", ["grass", "poison"])).toBe(2);
    expect(typeEffect("water", ["fire", "rock"])).toBe(4);
    expect(typeEffect("ghost", ["normal"])).toBe(0);
  });

  test("movement classes get their terrain advantages", () => {
    expect(waterMult(getPokemon(54))).toBeGreaterThan(waterMult(getPokemon(25)));
    expect(offroadMult(getPokemon(39), "grass")).toBeGreaterThan(offroadMult(getPokemon(25), "grass"));
    expect(offroadMult(getPokemon(39), "grass")).toBeLessThan(1);
    expect(offroadMult(getPokemon(143), "grass")).toBeGreaterThan(offroadMult(getPokemon(25), "grass"));
  });
});
