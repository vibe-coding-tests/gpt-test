import Phaser from "phaser";
import type { Mode7View } from "./Mode7";

/**
 * All helpers take WORLD coordinates. If the scene has an active Mode 7 view,
 * the effect is spawned in screen space at the projected point (short-lived
 * tweens run there without per-frame reprojection).
 */
function viewOf(scene: Phaser.Scene): Mode7View | undefined {
  const v = (scene as Phaser.Scene & { view?: Mode7View }).view;
  return v && v.isM7 ? v : undefined;
}

/** Returns {x, y, k, depth} in active-view space, or null when culled. */
function place(scene: Phaser.Scene, x: number, y: number, depth: number) {
  const v = viewOf(scene);
  if (!v) return { x, y, k: 1, depth };
  const p = v.project(x, y);
  if (!p.visible) return null;
  return { x: p.x, y: p.y, k: p.persp * v.SPRITE, depth: 5000 + depth };
}

/** Radial burst of tinted particles (pooled-free, tween based). */
export function burst(
  scene: Phaser.Scene, x: number, y: number,
  opts: { color?: number; n?: number; spd?: number; life?: number; size?: number; depth?: number; tex?: string } = {}
) {
  const { color = 0xffffff, n = 8, spd = 90, life = 380, size = 5, depth = 8, tex = "fx-px" } = opts;
  const at = place(scene, x, y, depth);
  if (!at) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = spd * (0.4 + Math.random() * 0.8) * at.k;
    const img = scene.add.image(at.x, at.y, tex)
      .setTint(color).setDepth(at.depth)
      .setDisplaySize(size * at.k, size * at.k).setAlpha(0.95);
    scene.tweens.add({
      targets: img,
      x: at.x + Math.cos(a) * v * (life / 1000),
      y: at.y + Math.sin(a) * v * (life / 1000),
      alpha: 0,
      scale: img.scale * 0.3,
      duration: life * (0.7 + Math.random() * 0.6),
      onComplete: () => img.destroy()
    });
  }
}

export function ringPulse(scene: Phaser.Scene, x: number, y: number, color: number, radius = 60, depth = 8) {
  const at = place(scene, x, y, depth);
  if (!at) return;
  const ring = scene.add.image(at.x, at.y, "fx-ring").setTint(color).setDepth(at.depth).setScale(0.2 * at.k).setAlpha(0.9);
  scene.tweens.add({
    targets: ring,
    scale: (radius / 32) * at.k,
    alpha: 0,
    duration: 420,
    onComplete: () => ring.destroy()
  });
}

export function floatText(
  scene: Phaser.Scene, x: number, y: number, str: string, color = "#ffffff", fontSize = 16, depth = 9
) {
  const at = place(scene, x, y, depth);
  if (!at) return;
  const t = scene.add.text(at.x, at.y, str, {
    fontFamily: '"Courier New", monospace',
    fontSize: `${fontSize}px`,
    fontStyle: "bold",
    color,
    stroke: "#10121f",
    strokeThickness: 4
  }).setOrigin(0.5).setDepth(at.depth).setScale(Math.min(at.k * 1.4, 1.6));
  scene.tweens.add({
    targets: t,
    y: at.y - 42 * Math.max(at.k, 0.5),
    alpha: 0,
    duration: 900,
    onComplete: () => t.destroy()
  });
}

/** Quick lightning bolt strike down onto a world point. */
export function boltStrike(scene: Phaser.Scene, x: number, y: number, depth = 9) {
  const at = place(scene, x, y, depth);
  if (!at) return;
  const k = at.k;
  const g = scene.add.graphics().setDepth(at.depth);
  g.lineStyle(Math.max(5 * k, 2.5), 0xfff060, 1);
  let px = at.x + (Math.random() * 30 - 15) * k, py = at.y - 320 * k;
  g.beginPath();
  g.moveTo(px, py);
  for (let i = 0; i < 5; i++) {
    px = at.x + (Math.random() * 44 - 22) * k * ((4 - i) / 4);
    py += 64 * k;
    g.lineTo(px, py);
  }
  g.lineTo(at.x, at.y);
  g.strokePath();
  g.lineStyle(Math.max(2 * k, 1), 0xffffff, 1);
  g.strokePath();
  const flash = scene.add.image(at.x, at.y, "fx-glow").setTint(0xfff8a0).setDepth(at.depth).setScale(2 * k).setAlpha(0.9);
  scene.tweens.add({ targets: flash, alpha: 0, scale: 3 * k, duration: 260, onComplete: () => flash.destroy() });
  scene.time.delayedCall(120, () => g.destroy());
}

/** Fading afterimage trail (agility / teleport). Sprite is already in view space. */
export function afterimage(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, tint = 0x88ddff) {
  if (!sprite.visible) return;
  const ghost = scene.add.image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
    .setRotation(sprite.rotation)
    .setScale(sprite.scaleX, sprite.scaleY)
    .setTint(tint)
    .setAlpha(0.5)
    .setDepth(sprite.depth - 0.1);
  scene.tweens.add({ targets: ghost, alpha: 0, duration: 300, onComplete: () => ghost.destroy() });
}
