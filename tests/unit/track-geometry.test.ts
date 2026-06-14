import { describe, expect, test } from "vitest";
import { TRACKS } from "../../src/data/trackData";
import { TrackGeometry } from "../../src/systems/TrackGeometry";
import { wrap01 } from "../../src/util";

const wrappedDelta = (a: number, b: number) => {
  const d = Math.abs(wrap01(a) - wrap01(b));
  return Math.min(d, 1 - d);
};

describe("TrackGeometry", () => {
  test("projects track-relative points back near their source coordinates", () => {
    const geom = new TrackGeometry(TRACKS[0]);

    for (const s of [0.02, 0.13, 0.31, 0.57, 0.82]) {
      for (const d of [-geom.def.roadHalf * 0.5, 0, geom.def.roadHalf * 0.5]) {
        const p = geom.posOf(s, d);
        const proj = geom.project(p.x, p.y);
        expect(wrappedDelta(proj.s, s)).toBeLessThan(0.015);
        expect(Math.abs(proj.d - d)).toBeLessThan(0.1);
      }
    }
  });

  test("reports wrapped feature ranges and surfaces", () => {
    expect(TrackGeometry.inRange(0.96, 0.9, 0.1)).toBe(true);
    expect(TrackGeometry.inRange(0.04, 0.9, 0.1)).toBe(true);
    expect(TrackGeometry.inRange(0.5, 0.9, 0.1)).toBe(false);

    const geom = new TrackGeometry(TRACKS[0]);
    expect(geom.surfaceAtProj({ s: 0.45, d: 0, idx: 0 })).toBe("boost");
    expect(geom.surfaceAtProj({ s: 0.5, d: 0, idx: 0 })).toBe("road");
    expect(geom.surfaceAtProj({ s: 0.5, d: geom.def.roadHalf + 30, idx: 0 })).toBe("offroad");
    expect(geom.surfaceAtProj({ s: 0.5, d: geom.def.corridorHalf + 30, idx: 0 })).toBe("wall");
  });

  test("projects shortcut pavement onto its own drivable corridor", () => {
    const geom = new TrackGeometry(TRACKS[1]);
    const shortcut = geom.shortcuts[0];
    const mid = geom.shortcutPos(shortcut, 0.5, 0);
    const edge = geom.shortcutPos(shortcut, 0.5, shortcut.def.roadHalf + 12);

    const midProj = geom.project(mid.x, mid.y);
    expect(midProj.shortcut).toBe(0);
    expect(geom.surfaceAtProj(midProj)).toBe(shortcut.def.surface ?? "road");

    const edgeProj = geom.project(edge.x, edge.y);
    expect(edgeProj.shortcut).toBe(0);
    expect(geom.surfaceAtProj(edgeProj)).toBe("offroad");
    expect(geom.offroadSeverityAtProj(edgeProj)).toBeGreaterThan(0);
    expect(geom.offroadSeverityAtProj(edgeProj)).toBeLessThan(1);
  });

  test("classifies segment-level guardrails and open fall edges", () => {
    const route = new TrackGeometry(TRACKS[0]);
    expect(route.isRailAt(0.2, "right")).toBe(true);
    expect(route.isRailAt(0.2, "left")).toBe(false);
    expect(route.edgeAt(0.52, -route.def.corridorHalf - 20).penalty).toBe("normal");
    expect(route.surfaceAtProj({ s: 0.52, d: -route.def.corridorHalf - 20, idx: 0 })).toBe("wall");

    const cerulean = new TrackGeometry(TRACKS[2]);
    expect(cerulean.surfaceAtProj({ s: 0.4, d: -cerulean.def.corridorHalf - 20, idx: 0 })).toBe("gap");
    expect(cerulean.surfaceAtProj({ s: 0.5, d: cerulean.def.corridorHalf + 20, idx: 0 })).toBe("wall");

    const indigo = new TrackGeometry(TRACKS[8]);
    expect(indigo.surfaceAtProj({ s: 0.1, d: indigo.def.corridorHalf + 20, idx: 0 })).toBe("wall");
    expect(indigo.surfaceAtProj({ s: 0.21, d: indigo.def.corridorHalf + 20, idx: 0 })).toBe("gap");
  });

  test("finds safe spots on solid terrain", () => {
    const geom = new TrackGeometry(TRACKS[0]);
    const spot = geom.nearestSafeSpot(0.45, 0, { roadOnly: true });

    expect(spot).toBeTruthy();
    expect(Math.abs(spot!.d)).toBeLessThanOrEqual(geom.def.roadHalf);
    expect(["road", "boost", "ramp", "ice", "mud"]).toContain(
      geom.surfaceAtProj({ s: spot!.s, d: spot!.d, idx: 0 })
    );
  });

  test("all tracks place starting grids on solid drivable terrain", () => {
    const solid = new Set(["road", "boost", "ramp", "ice", "mud", "offroad"]);

    for (const track of TRACKS) {
      const geom = new TrackGeometry(track);
      for (let slot = 0; slot < 8; slot++) {
        const grid = geom.startGrid(slot);
        const surface = geom.surfaceAtProj({ s: grid.s, d: grid.d, idx: 0 });
        expect(solid.has(surface), `${track.name} grid slot ${slot} starts on ${surface}`).toBe(true);
      }
    }
  });

  test("gap hitboxes across all tracks have matching ramp approaches", () => {
    for (const track of TRACKS) {
      for (const gap of track.features.filter((feature) => feature.kind === "gap")) {
        const hasRampApproach = track.features.some((feature) => {
          if (feature.kind !== "ramp") return false;
          const touchesStart = wrappedDelta(feature.s1, gap.s0) < 0.008;
          const overlapsLaterally = Math.min(feature.d1, gap.d1) - Math.max(feature.d0, gap.d0) > 8;
          return touchesStart && overlapsLaterally;
        });
        expect(hasRampApproach, `${track.name} gap ${gap.s0}-${gap.s1} needs a ramp approach`).toBe(true);
      }
    }
  });
});
