import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import { Audio } from "../systems/AudioSystem";
import { ensurePokemonTexture } from "../systems/SpriteFactory";
import { STARTER_IDS } from "../constants";
import { menuKeyGuard } from "../util";
import { bindMenuCheatsShortcut } from "../systems/MenuShortcuts";

export default class TitleScene extends Phaser.Scene {
  private parade: { spr: Phaser.GameObjects.Sprite; speed: number; t: number }[] = [];

  constructor() {
    super("Title");
  }

  create() {
    this.parade = [];
    const g = this.add.graphics();
    g.fillGradientStyle(0x1a2a6a, 0x1a2a6a, 0x2a6db5, 0x2a6db5, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(0x10214a, 1).fillRect(0, GAME_H - 150, GAME_W, 150);
    g.fillStyle(0xffffff, 0.06);
    for (let i = 0; i < 40; i++) {
      g.fillCircle(Math.random() * GAME_W, Math.random() * (GAME_H - 200), 1 + Math.random() * 2);
    }

    this.add.image(GAME_W / 2, 180, "ui-pokeball").setScale(4.4).setAlpha(0.9);
    this.add.text(GAME_W / 2, 280, "POKéKART", {
      fontFamily: UI.font, fontSize: "96px", fontStyle: "bold",
      color: UI.yellow, stroke: UI.blue, strokeThickness: 14
    }).setOrigin(0.5).setShadow(0, 8, "#0a1030", 0, true, true);

    this.add.text(GAME_W / 2, 350, "— KANTO GRAND PRIX —", {
      fontFamily: UI.font, fontSize: "26px", fontStyle: "bold", color: "#dfe8ff"
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, 430, "All 151 original Pokémon. No karts — they run, fly, float, swim and stomp.", {
      fontFamily: UI.font, fontSize: "16px", color: "#aebbe8"
    }).setOrigin(0.5);

    const press = this.add.text(GAME_W / 2, 505, "PRESS ENTER", {
      fontFamily: UI.font, fontSize: "30px", fontStyle: "bold",
      color: "#ffffff", stroke: "#10214a", strokeThickness: 8
    }).setOrigin(0.5);
    this.tweens.add({ targets: press, alpha: 0.25, yoyo: true, repeat: -1, duration: 600 });

    // parade of starters across the bottom
    const ids = Phaser.Utils.Array.Shuffle([...STARTER_IDS]).slice(0, 7);
    ids.forEach((id, i) => {
      const key = ensurePokemonTexture(this, id);
      const spr = this.add.sprite(-80 - i * 150, GAME_H - 84, key, 0).setScale(1.35);
      spr.setRotation(Math.PI / 2);
      this.parade.push({ spr, speed: 150 + Math.random() * 80, t: Math.random() * 6 });
    });

    const ready = menuKeyGuard(this);
    this.input.keyboard!.on("keydown-ENTER", () => ready() && this.go());
    this.input.keyboard!.on("keydown-SPACE", () => ready() && this.go());
    bindMenuCheatsShortcut(this, ready);
    this.input.on("pointerdown", () => this.go());
    this.input.keyboard!.once("keydown", () => Audio.unlock());

    this.add.text(GAME_W - 12, GAME_H - 10, "v1.0 · local save", {
      fontFamily: UI.font, fontSize: "12px", color: "#7a86b8"
    }).setOrigin(1, 1);
  }

  private go() {
    Audio.unlock();
    Audio.sfx("select");
    this.scene.start("Menu");
  }

  update(_: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    for (const p of this.parade) {
      p.t += dt * 9;
      p.spr.x += p.speed * dt;
      p.spr.setFrame(Math.floor(p.t) % 2);
      p.spr.y = GAME_H - 84 + Math.sin(p.t * 0.8) * 4;
      if (p.spr.x > GAME_W + 90) p.spr.x = -90;
    }
  }
}
