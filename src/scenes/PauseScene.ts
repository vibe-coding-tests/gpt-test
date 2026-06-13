import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import { Audio } from "../systems/AudioSystem";
import { GameState } from "../state/GameState";
import { menuKeyGuard } from "../util";
import type RaceScene from "./RaceScene";

interface PauseOption {
  label: string;
  desc: string;
  act: () => void;
}

export default class PauseScene extends Phaser.Scene {
  private cursor = 0;
  private rows: Phaser.GameObjects.Text[] = [];
  private descText!: Phaser.GameObjects.Text;
  private options: PauseOption[] = [];

  constructor() {
    super("Pause");
  }

  create() {
    this.cursor = 0;
    this.rows = [];

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05060f, 0.72);
    this.add.text(GAME_W / 2, 170, "PAUSED", {
      fontFamily: UI.font, fontSize: "64px", fontStyle: "bold",
      color: UI.yellow, stroke: UI.blue, strokeThickness: 10
    }).setOrigin(0.5);

    const isGp = GameState.mode === "gp";
    const isBattle = GameState.mode === "battle";
    this.options = [
      { label: "RESUME", desc: isBattle ? "Back to the battle  (ESC / P)" : "Back to the race  (ESC / P)", act: () => this.resumeRace() },
      {
        label: isBattle ? "RESTART BATTLE" : "RESTART RACE",
        desc: isGp ? "Retry this race — cup points so far are kept" : "Retry from the line  (R)",
        act: () => this.restartRace()
      },
      {
        label: isBattle ? "SWITCH FIGHTER" : "SWITCH RACER",
        desc: isGp ? "Pick a new Pokémon — restarts the whole cup" : isBattle ? "Pick a new Pokémon and arena" : "Pick a new Pokémon and track",
        act: () => this.exitTo("Select", { flow: GameState.mode })
      },
      { label: "QUIT TO MENU", desc: isBattle ? "Abandon the battle  (Q)" : "Abandon the race  (Q)", act: () => this.exitTo("Menu") }
    ];

    this.options.forEach((opt, i) => {
      const t = this.add.text(GAME_W / 2, 290 + i * 62, opt.label, {
        fontFamily: UI.font, fontSize: "32px", fontStyle: "bold", color: "#ffffff",
        stroke: "#0a1030", strokeThickness: 7
      }).setOrigin(0.5);
      this.rows.push(t);
    });

    this.descText = this.add.text(GAME_W / 2, 556, "", {
      fontFamily: UI.font, fontSize: "17px", color: "#aebbe8"
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, GAME_H - 40, "M — mute   ·   C — camera mode", {
      fontFamily: UI.font, fontSize: "15px", color: "#7a86b8"
    }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    const ready = menuKeyGuard(this);
    kb.on("keydown-UP", () => ready() && this.move(-1));
    kb.on("keydown-DOWN", () => ready() && this.move(1));
    kb.on("keydown-ENTER", () => ready() && this.options[this.cursor].act());
    kb.on("keydown-SPACE", () => ready() && this.options[this.cursor].act());
    kb.on("keydown-P", () => ready() && this.resumeRace());
    kb.on("keydown-ESC", () => ready() && this.resumeRace());
    kb.on("keydown-R", () => ready() && this.restartRace());
    kb.on("keydown-Q", () => ready() && this.exitTo("Menu"));
    kb.on("keydown-M", () => Audio.toggleMute());
    kb.on("keydown-C", () => (this.scene.get("Race") as RaceScene)?.cycleView());

    this.refresh();
  }

  private move(dir: number) {
    this.cursor = (this.cursor + dir + this.options.length) % this.options.length;
    Audio.sfx("ui");
    this.refresh();
  }

  private refresh() {
    this.rows.forEach((t, i) => {
      const sel = i === this.cursor;
      t.setColor(sel ? UI.yellow : "#ffffff");
      t.setScale(sel ? 1.1 : 1);
      t.setText((sel ? "▶ " : "") + this.options[i].label + (sel ? " ◀" : ""));
    });
    this.descText.setText(this.options[this.cursor].desc);
  }

  private resumeRace() {
    Audio.sfx("ui");
    this.scene.resume("Race");
    this.scene.stop();
  }

  private restartRace() {
    Audio.sfx("select");
    Audio.stopBgm();
    this.scene.stop("Hud");
    this.scene.stop("Race");
    this.scene.stop();
    this.scene.start("Loading");
  }

  private exitTo(key: string, data?: object) {
    Audio.sfx("back");
    Audio.stopBgm();
    this.scene.stop("Hud");
    this.scene.stop("Race");
    this.scene.stop();
    this.scene.start(key, data);
  }
}
