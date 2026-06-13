import Phaser from "phaser";
import type { GhostData } from "../types";
import { Racer } from "./Racer";
import { ensurePokemonTexture } from "../systems/SpriteFactory";
import { rotLerp } from "../util";
import type { ThreeView } from "../systems/ThreeView";

const SAMPLE_MS = 125;

export class GhostRecorder {
  private frames: number[] = [];
  private acc = 0;

  update(dtMs: number, racer: Racer) {
    this.acc += dtMs;
    while (this.acc >= SAMPLE_MS) {
      this.acc -= SAMPLE_MS;
      this.frames.push(Math.round(racer.x), Math.round(racer.y), Math.round(racer.heading * 1000));
    }
  }

  data(timeMs: number, speciesId: number): GhostData {
    return { dtMs: SAMPLE_MS, timeMs, speciesId, frames: this.frames.slice() };
  }
}

export class GhostPlayer {
  sprite: Phaser.GameObjects.Sprite;
  data: GhostData;
  wx = 0;
  wy = 0;
  private scene: Phaser.Scene;
  private animT = 0;

  constructor(scene: Phaser.Scene, data: GhostData) {
    this.scene = scene;
    this.data = data;
    const key = ensurePokemonTexture(scene, data.speciesId);
    this.sprite = scene.add.sprite(0, 0, key, 0)
      .setAlpha(0.42)
      .setTint(0xaaccff)
      .setDepth(4.5);
  }

  update(tMs: number, dt: number) {
    const f = this.data.frames;
    const n = Math.floor(f.length / 3);
    if (n < 2) return;
    const idxF = Math.min(tMs / this.data.dtMs, n - 1.001);
    const i0 = Math.floor(idxF);
    const i1 = Math.min(i0 + 1, n - 1);
    const t = idxF - i0;
    this.wx = f[i0 * 3] + (f[i1 * 3] - f[i0 * 3]) * t;
    this.wy = f[i0 * 3 + 1] + (f[i1 * 3 + 1] - f[i0 * 3 + 1]) * t;
    const h = rotLerp(f[i0 * 3 + 2] / 1000, f[i1 * 3 + 2] / 1000, t);
    this.animT += dt * 8;
    this.sprite.setFrame(Math.floor(this.animT) % 2);
    const view = (this.scene as Phaser.Scene & { view: ThreeView }).view;
    view.submit(this.sprite, this.wx, this.wy, { face: h, lift: 4, topDepth: 4.5 });
  }

  destroy() {
    this.sprite.destroy();
  }
}
