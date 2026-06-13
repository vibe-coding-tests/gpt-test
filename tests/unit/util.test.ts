import { describe, expect, test } from "vitest";
import { clamp, fmtTime, lerp, ordinal, Rng, rotLerp, wrap01, wrapAngle } from "../../src/util";

describe("util", () => {
  test("clamps and interpolates numbers", () => {
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  test("wraps normalized positions and angles", () => {
    expect(wrap01(1.25)).toBeCloseTo(0.25);
    expect(wrap01(-0.25)).toBeCloseTo(0.75);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(rotLerp(0, Math.PI, 0.5)).toBeCloseTo(Math.PI / 2);
  });

  test("formats race times and ordinals", () => {
    expect(fmtTime(91_234)).toBe("1:31.234");
    expect(fmtTime(Infinity)).toBe("--:--.---");
    expect([1, 2, 3, 4].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th"]);
  });

  test("Rng is deterministic for a fixed seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);

    expect(Array.from({ length: 8 }, () => a.next())).toEqual(
      Array.from({ length: 8 }, () => b.next())
    );
  });
});
