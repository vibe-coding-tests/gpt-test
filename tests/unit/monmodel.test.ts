import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { ALL_IDS } from "../../src/data/pokemonData";
import { buildMonRig } from "../../src/systems/monmodel";

function minYOf(obj: THREE.Object3D): number {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj).min.y;
}

describe("3D Pokemon rigs", () => {
  test("all Pokemon stay above the ground plane while animated", () => {
    for (const id of ALL_IDS) {
      const rig = buildMonRig(id, 56);
      try {
        expect(minYOf(rig.group), `Pokemon ${id} initial floor clearance`).toBeGreaterThanOrEqual(-0.01);

        for (const speed of [0, 2.5, 5.5]) {
          for (let frame = 0; frame < 48; frame++) {
            rig.anim(1 / 60, { speed, water: false });
            expect(minYOf(rig.group), `Pokemon ${id} speed ${speed} frame ${frame}`).toBeGreaterThanOrEqual(-0.01);
          }
        }
      } finally {
        rig.dispose();
      }
    }
  });
});
