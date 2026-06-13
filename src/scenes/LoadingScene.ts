import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import { getTrack } from "../data/trackData";
import { GameState } from "../state/GameState";

/**
 * A lightweight curtain shown while RaceScene builds its (heavy) 3D world.
 * Spinning up the track, scenery and eight procedural racer models is all
 * synchronous and blocks the main thread for a beat — without this screen that
 * beat freezes the menu you came from. We paint this cheap curtain, let the
 * browser show it, then build the race *underneath* it and only lift once the
 * race has drawn its first frame. The spike now happens behind the curtain.
 */
export default class LoadingScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private ball!: Phaser.GameObjects.Image;
  private dotsText!: Phaser.GameObjects.Text;
  private frames = 0;
  private elapsed = 0;
  private launched = false;
  private fading = false;
  private dotAcc = 0;

  constructor() {
    super("Loading");
  }

  create() {
    this.frames = 0;
    this.elapsed = 0;
    this.launched = false;
    this.fading = false;
    this.dotAcc = 0;
    this.registry.set("raceReady", false);
    this.registry.set("raceInteractive", false);
    this.registry.set("raceLoading", true);

    const track = getTrack(GameState.trackId);
    const theme = track.theme;

    this.root = this.add.container(0, 0);

    // fully opaque base so the curtain hides the 3D canvas building underneath,
    // tinted toward the track's own palette, with soft letterbox bands
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0c1a, 1).fillRect(0, 0, GAME_W, GAME_H);
    bg.fillStyle(theme.bg, 0.45).fillRect(0, 0, GAME_W, GAME_H);
    bg.fillStyle(0x000000, 0.28).fillRect(0, 0, GAME_W, 96);
    bg.fillStyle(0x000000, 0.28).fillRect(0, GAME_H - 96, GAME_W, 96);
    this.root.add(bg);

    this.ball = this.add.image(GAME_W / 2, GAME_H / 2 - 26, "ui-pokeball").setScale(4);
    this.root.add(this.ball);

    const modeLabel = GameState.mode === "tt" ? "TIME TRIAL"
      : GameState.mode === "battle" ? "BALLOON BATTLE" : "GRAND PRIX";
    const name = this.add.text(GAME_W / 2, GAME_H / 2 + 56, track.name.toUpperCase(), {
      fontFamily: UI.hudFont, fontSize: "32px", fontStyle: "bold", color: UI.text
    }).setOrigin(0.5).setLetterSpacing(2);
    const sub = this.add.text(GAME_W / 2, GAME_H / 2 + 92, `${modeLabel}  ·  ${track.subtitle.toUpperCase()}`, {
      fontFamily: UI.hudFont, fontSize: "14px", fontStyle: "bold", color: "#8ecdff"
    }).setOrigin(0.5).setLetterSpacing(3);
    this.dotsText = this.add.text(GAME_W / 2, GAME_H - 64, "LOADING", {
      fontFamily: UI.hudFont, fontSize: "15px", fontStyle: "bold", color: "#9aa3c7"
    }).setOrigin(0.5).setLetterSpacing(5);
    this.root.add([name, sub, this.dotsText]);
  }

  update(_: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += dt;
    this.frames++;

    this.ball.rotation += dt * 6.5;
    this.dotAcc += dt;
    this.dotsText.setText("LOADING" + ".".repeat(Math.floor(this.dotAcc * 3) % 4));

    // paint a couple of frames so the curtain is definitely on screen, then
    // build the race underneath and pull this scene to the front to cover it
    if (!this.launched && this.frames >= 2) {
      this.launched = true;
      if (this.scene.isActive("Race") || this.scene.isPaused("Race")) this.scene.stop("Race");
      this.scene.launch("Race");
      this.scene.bringToTop();
    }

    // lift once the race has drawn its first frame (or a safety timeout fires),
    // holding a brief minimum so a fast load doesn't just flash the curtain
    if (this.launched && !this.fading) {
      const ready = this.registry.get("raceReady") === true && this.elapsed > 0.45;
      if (ready || this.elapsed > 6) {
        this.fading = true;
        this.tweens.add({
          targets: this.root,
          alpha: 0,
          duration: 260,
          ease: "Quad.easeIn",
          onComplete: () => {
            this.registry.set("raceInteractive", true);
            this.registry.set("raceLoading", false);
            this.scene.stop();
          }
        });
      }
    }
  }
}
