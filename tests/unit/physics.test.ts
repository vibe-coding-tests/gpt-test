import { describe, expect, test } from "vitest";
import { getPokemon } from "../../src/data/pokemonData";
import { loadSplit, surfaceGrip, tireCurve } from "../../src/systems/Handling";
import { deriveStats } from "../../src/systems/Stats";

describe("grip-core handling primitives", () => {
  test("straight-line acceleration settles near top speed without runaway overshoot", () => {
    const stats = deriveStats(getPokemon(25));
    let fwd = 0;
    const dt = 1 / 120;

    for (let i = 0; i < 120 * 8; i++) {
      if (fwd < stats.topSpeed) fwd += stats.accel * dt;
      if (fwd > stats.topSpeed) {
        fwd += (stats.topSpeed - fwd) * (1 - Math.exp(-3.2 * dt));
      }
    }

    expect(fwd).toBeGreaterThan(stats.topSpeed * 0.96);
    expect(fwd).toBeLessThan(stats.topSpeed * 1.08);
  });

  test("zero slip and zero steer produce no self-spin", () => {
    const stats = deriveStats(getPokemon(25));
    const fwd = 260;
    const lat = 0;
    const yawRate = 0;
    const steerAngle = 0;
    const a = stats.wheelbase * (1 - stats.cgFront);
    const b = stats.wheelbase * stats.cgFront;
    const alphaF = Math.atan2(lat + yawRate * a, fwd) - steerAngle;
    const alphaR = Math.atan2(lat - yawRate * b, fwd);

    expect(tireCurve(alphaF)).toBeCloseTo(0, 6);
    expect(tireCurve(alphaR)).toBeCloseTo(0, 6);
  });

  test("tire curve builds grip progressively and falls off gently past the peak", () => {
    const small = tireCurve(0.04);
    const peakish = tireCurve(0.22);
    const over = tireCurve(0.75);

    expect(small).toBeGreaterThan(0);
    expect(peakish).toBeGreaterThan(small);
    expect(over).toBeLessThan(peakish);
    expect(over).toBeGreaterThan(0.55);
  });

  test("surface grip makes ice slide more than road while preserving ice-type advantage", () => {
    const pikachu = getPokemon(25);
    const jynx = getPokemon(124);

    expect(surfaceGrip("road", pikachu, false, false)).toBeGreaterThan(surfaceGrip("ice", pikachu, false, false));
    expect(surfaceGrip("ice", jynx, false, false)).toBeGreaterThan(surfaceGrip("ice", pikachu, false, false));
  });

  test("braking shifts load forward and throttle shifts it rearward", () => {
    const neutral = loadSplit(0.52, 0);
    const braking = loadSplit(0.52, -520);
    const throttle = loadSplit(0.52, 520);

    expect(braking.front).toBeGreaterThan(neutral.front);
    expect(throttle.front).toBeLessThan(neutral.front);
    expect(braking.front + braking.rear).toBeCloseTo(1, 5);
  });

  test("class archetypes preserve runner agility and heavy yaw inertia", () => {
    const runner = deriveStats(getPokemon(25));
    const heavy = deriveStats(getPokemon(143));

    expect(runner.steerLock).toBeGreaterThan(heavy.steerLock);
    expect(runner.catchAssist).toBeGreaterThan(heavy.catchAssist);
    expect(heavy.izz).toBeGreaterThan(runner.izz);
  });
});
