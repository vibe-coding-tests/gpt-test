import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import { Audio } from "../systems/AudioSystem";
import { Save } from "../systems/SaveSystem";
import { ACTIONS, RESERVED_CODES, bindLabel, keyName, type Binds } from "../systems/Controls";
import { menuKeyGuard } from "../util";

/** View and remap the driving controls. */
export default class ControlsScene extends Phaser.Scene {
  private cursor = 0;
  private labels: Phaser.GameObjects.Text[] = [];
  private binders: Phaser.GameObjects.Text[] = [];
  private hint!: Phaser.GameObjects.Text;
  private listening = false; // capturing a key for the selected action
  private binds!: Binds;

  constructor() {
    super("Controls");
  }

  create() {
    this.cursor = 0;
    this.labels = [];
    this.binders = [];
    this.listening = false;
    this.binds = Save.binds();

    const g = this.add.graphics();
    g.fillGradientStyle(0x141838, 0x141838, 0x1c2a5a, 0x1c2a5a, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    const panelTop = 150;
    const panelH = ACTIONS.length * 38 + 40;
    g.fillStyle(UI.panel, 1).fillRoundedRect(180, panelTop, GAME_W - 360, panelH, 16);
    g.lineStyle(3, 0xffcb05, 0.8).strokeRoundedRect(180, panelTop, GAME_W - 360, panelH, 16);

    this.add.text(GAME_W / 2, 80, "CONTROLS", {
      fontFamily: UI.font, fontSize: "52px", fontStyle: "bold",
      color: UI.yellow, stroke: UI.blue, strokeThickness: 10
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 126, "remap your keys — saved between sessions", {
      fontFamily: UI.font, fontSize: "15px", color: "#7a86b8"
    }).setOrigin(0.5);

    ACTIONS.forEach((a, i) => {
      const y = panelTop + 32 + i * 38;
      const label = this.add.text(240, y, a.label, {
        fontFamily: UI.font, fontSize: "22px", fontStyle: "bold", color: "#ffffff",
        stroke: "#0a1030", strokeThickness: 5
      }).setOrigin(0, 0.5);
      this.labels.push(label);
      const binder = this.add.text(GAME_W - 240, y, "", {
        fontFamily: UI.font, fontSize: "22px", fontStyle: "bold", color: "#8ecdff"
      }).setOrigin(1, 0.5);
      this.binders.push(binder);
    });

    this.hint = this.add.text(GAME_W / 2, GAME_H - 64, "", {
      fontFamily: UI.font, fontSize: "16px", color: "#aebbe8"
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, GAME_H - 36,
      "↑ / ↓  choose   ·   ENTER rebind   ·   R reset all   ·   ESC back", {
        fontFamily: UI.font, fontSize: "14px", color: "#7a86b8"
      }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    const ready = menuKeyGuard(this);

    // a single low-level listener so we can capture ANY key while rebinding
    kb.on("keydown", (e: KeyboardEvent) => {
      if (this.listening) {
        this.captureKey(e);
        return;
      }
      if (!ready()) return;
      switch (e.keyCode) {
        case Phaser.Input.Keyboard.KeyCodes.UP: this.move(-1); break;
        case Phaser.Input.Keyboard.KeyCodes.DOWN: this.move(1); break;
        case Phaser.Input.Keyboard.KeyCodes.ENTER:
        case Phaser.Input.Keyboard.KeyCodes.SPACE: this.beginListen(); break;
        case Phaser.Input.Keyboard.KeyCodes.R: this.resetAll(); break;
        case Phaser.Input.Keyboard.KeyCodes.ESC:
          Audio.sfx("back");
          this.scene.start("Menu");
          break;
      }
    });

    this.refresh();
  }

  private move(dir: number) {
    this.cursor = (this.cursor + dir + ACTIONS.length) % ACTIONS.length;
    Audio.sfx("ui");
    this.refresh();
  }

  private beginListen() {
    this.listening = true;
    Audio.sfx("select");
    this.refresh();
  }

  private captureKey(e: KeyboardEvent) {
    const code = e.keyCode;
    // ESC cancels the rebind without changing anything
    if (code === Phaser.Input.Keyboard.KeyCodes.ESC) {
      this.listening = false;
      Audio.sfx("back");
      this.refresh();
      return;
    }
    if (RESERVED_CODES.has(code)) {
      Audio.sfx("back");
      this.hint.setText(`${keyName(code)} is reserved (mute / view / camera). Pick another key.`);
      return;
    }
    Save.rebind(ACTIONS[this.cursor].action, [code]);
    this.binds = Save.binds();
    this.listening = false;
    Audio.sfx("select");
    this.refresh();
  }

  private resetAll() {
    Save.resetBinds();
    this.binds = Save.binds();
    Audio.sfx("back");
    this.refresh();
  }

  private refresh() {
    ACTIONS.forEach((a, i) => {
      const sel = i === this.cursor;
      this.labels[i].setColor(sel ? UI.yellow : "#ffffff");
      this.labels[i].setText((sel ? "▶ " : "  ") + a.label);
      if (sel && this.listening) {
        this.binders[i].setText("press a key…");
        this.binders[i].setColor("#ffd23a");
      } else {
        this.binders[i].setText(bindLabel(this.binds[a.action]));
        this.binders[i].setColor(sel ? "#bfe4ff" : "#8ecdff");
      }
    });
    this.hint.setText(
      this.listening
        ? "Press the new key for this action  ·  ESC to cancel"
        : "Tip: WASD + arrows are bound by default — remap to a single key as you like."
    );
  }
}
