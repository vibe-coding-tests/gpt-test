import Phaser from "phaser";

/**
 * Entering a race should always clear the parallel race scenes first. Several
 * menus can route to Loading, and stale Race/Hud state leaves duplicate input
 * handlers or a second Three.js canvas behind.
 */
export function startRaceLoad(scene: Phaser.Scene) {
  const mgr = scene.scene;
  if (mgr.isActive("Hud") || mgr.isPaused("Hud")) mgr.stop("Hud");
  if (mgr.isActive("Race") || mgr.isPaused("Race")) mgr.stop("Race");
  scene.registry.set("raceReady", false);
  scene.registry.set("raceInteractive", false);
  scene.registry.set("raceLoading", true);
  mgr.start("Loading");
}
