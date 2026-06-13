import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import { Audio } from "../systems/AudioSystem";
import { Save, type CheatSettings } from "../systems/SaveSystem";
import { menuKeyGuard } from "../util";

const ROWS: { key: keyof CheatSettings; label: string; desc: string }[] = [
  { key: "unlockAll", label: "UNLOCK EVERYTHING", desc: "All 151 Pokémon and every cup selectable — your real Pokédex progress is untouched" },
  { key: "easyAI", label: "EASY RIVALS", desc: "AI racers ease off hard — relaxed racing for testing tracks and items" },
  { key: "infiniteItems", label: "INFINITE ITEMS", desc: "Your held item isn't consumed when used" },
  { key: "debugKeys", label: "DEBUG KEYS", desc: "In race:  1 cycle item · 2 +1 candy · 3 evolve · 4 boost · 5 warp ahead" },
  { key: "overlay", label: "DEBUG OVERLAY", desc: "Live speed / track position / FPS readout during races" }
];

export default class CheatsScene extends Phaser.Scene {
  private cursor = 0;
  private labels: Phaser.GameObjects.Text[] = [];
  private pips: Phaser.GameObjects.Text[] = [];
  private descText!: Phaser.GameObjects.Text;

  constructor() {
    super("Cheats");
  }

  create() {
    this.cursor = 0;
    this.labels = [];
    this.pips = [];

    const g = this.add.graphics();
    g.fillGradientStyle(0x141838, 0x141838, 0x1c2a5a, 0x1c2a5a, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(UI.panel, 1).fillRoundedRect(180, 150, GAME_W - 360, 360, 16);
    g.lineStyle(3, 0xffcb05, 0.8).strokeRoundedRect(180, 150, GAME_W - 360, 360, 16);

    this.add.text(GAME_W / 2, 80, "DEBUG", {
      fontFamily: UI.font, fontSize: "52px", fontStyle: "bold",
      color: UI.yellow, stroke: UI.blue, strokeThickness: 10
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 126, "saved debug switches — off by default", {
      fontFamily: UI.font, fontSize: "15px", color: "#7a86b8"
    }).setOrigin(0.5);

    ROWS.forEach((row, i) => {
      const y = 196 + i * 64;
      const t = this.add.text(240, y, row.label, {
        fontFamily: UI.font, fontSize: "26px", fontStyle: "bold", color: "#ffffff",
        stroke: "#0a1030", strokeThickness: 6
      }).setOrigin(0, 0.5);
      this.labels.push(t);
      const pip = this.add.text(GAME_W - 240, y, "OFF", {
        fontFamily: UI.font, fontSize: "26px", fontStyle: "bold", color: "#5a6390"
      }).setOrigin(1, 0.5);
      this.pips.push(pip);
    });

    this.descText = this.add.text(GAME_W / 2, 552, "", {
      fontFamily: UI.font, fontSize: "16px", color: "#aebbe8",
      wordWrap: { width: GAME_W - 320 }, align: "center"
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, GAME_H - 36, "↑ / ↓  choose   ·   ENTER toggle   ·   ESC back", {
      fontFamily: UI.font, fontSize: "14px", color: "#7a86b8"
    }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    const ready = menuKeyGuard(this);
    kb.on("keydown-UP", () => ready() && this.move(-1));
    kb.on("keydown-DOWN", () => ready() && this.move(1));
    kb.on("keydown-ENTER", () => ready() && this.toggle());
    kb.on("keydown-SPACE", () => ready() && this.toggle());
    kb.on("keydown-ESC", () => {
      if (!ready()) return;
      Audio.sfx("back");
      this.scene.start("Menu");
    });

    this.refresh();
  }

  private move(dir: number) {
    this.cursor = (this.cursor + dir + ROWS.length) % ROWS.length;
    Audio.sfx("ui");
    this.refresh();
  }

  private toggle() {
    const key = ROWS[this.cursor].key;
    Save.cheats[key] = !Save.cheats[key];
    Save.persist();
    Audio.sfx(Save.cheats[key] ? "select" : "back");
    this.refresh();
  }

  private refresh() {
    ROWS.forEach((row, i) => {
      const sel = i === this.cursor;
      const on = Save.cheats[row.key];
      this.labels[i].setColor(sel ? UI.yellow : "#ffffff");
      this.labels[i].setText((sel ? "▶ " : "  ") + row.label);
      this.pips[i].setText(on ? "ON" : "OFF");
      this.pips[i].setColor(on ? "#6af86a" : "#5a6390");
    });
    this.descText.setText(ROWS[this.cursor].desc);
  }
}
