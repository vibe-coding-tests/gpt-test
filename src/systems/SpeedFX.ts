import Phaser from "phaser";
import { GAME_W, GAME_H } from "../constants";
import { clamp } from "../util";
import type { ThreeView } from "./ThreeView";

interface Streak {
  img: Phaser.GameObjects.Image;
  a: number;    // angle out from the vanishing point
  r: number;    // current radius
  spd: number;  // px/s outward
}

/**
 * Screen-space anime speed lines for the first-person view: short streaks
 * radiating out of the vanishing point, denser and warmer while boosting.
 * Top-down views skip them (the camera zoom carries speed there).
 */
export class SpeedFX {
  private scene: Phaser.Scene;
  private live: Streak[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private acc = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private obtain(): Phaser.GameObjects.Image {
    return this.pool.pop()
      ?? this.scene.add.image(0, 0, "fx-px").setDepth(4800).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** k: 0..1 speed-rush factor (same one driving the FOV stretch). */
  update(dt: number, view: ThreeView, k: number, boosting: boolean) {
    const active = view.isM7 && k > 0.04;
    const cx = GAME_W / 2;
    const cy = clamp(view.hor, 90, GAME_H * 0.6); // vanishing point rides the horizon

    if (active) {
      const rate = k * k * 26 + (boosting ? 16 : 0);
      this.acc += dt * rate;
      while (this.acc >= 1) {
        this.acc -= 1;
        if (this.live.length >= 26) continue;
        const img = this.obtain();
        img.setVisible(true).setTint(boosting ? 0xffc878 : 0xffffff);
        this.live.push({
          img,
          a: Math.random() * Math.PI * 2,
          r: 130 + Math.random() * 150,
          spd: (560 + 760 * k) * (0.7 + Math.random() * 0.6)
        });
      }
    } else {
      this.acc = 0;
    }

    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i];
      s.r += s.spd * dt;
      const x = cx + Math.cos(s.a) * s.r;
      const y = cy + Math.sin(s.a) * s.r * 0.62; // flattened: widescreen framing
      const gone = x < -90 || x > GAME_W + 90 || y < -70 || y > GAME_H + 70;
      if (gone || !active) {
        s.img.setVisible(false);
        this.pool.push(s.img);
        this.live.splice(i, 1);
        continue;
      }
      const len = 26 + s.r * 0.3;
      s.img.setPosition(x, y)
        .setRotation(Math.atan2(Math.sin(s.a) * 0.62, Math.cos(s.a)))
        .setDisplaySize(len, 2.4)
        .setAlpha(clamp((s.r - 130) / 90, 0, 0.55));
    }
  }
}
