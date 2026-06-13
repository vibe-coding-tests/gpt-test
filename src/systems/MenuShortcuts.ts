import type Phaser from "phaser";
import { Audio } from "./AudioSystem";

/** Hidden menu-only shortcut for saved debug/cheat switches. */
export function bindMenuCheatsShortcut(
  scene: Phaser.Scene,
  ready: () => boolean,
  canOpen: () => boolean = () => true
) {
  scene.input.keyboard?.on("keydown-F9", () => {
    if (!ready() || !canOpen()) return;

    const returnTo = scene.scene.key;
    Audio.unlock();
    Audio.sfx("select");
    scene.scene.pause(returnTo);
    scene.scene.launch("Cheats", { returnTo });
    scene.scene.bringToTop("Cheats");
  });
}
