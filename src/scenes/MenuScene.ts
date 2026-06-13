import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import { Audio } from "../systems/AudioSystem";
import { Save } from "../systems/SaveSystem";
import { CUPS } from "../data/cups";
import { menuKeyGuard } from "../util";
import { bindMenuCheatsShortcut } from "../systems/MenuShortcuts";

const OPTIONS = [
  { key: "gp", label: "GRAND PRIX", desc: "4 cups · 3 races each · podium finish" },
  { key: "battle", label: "BALLOON BATTLE", desc: "Arena brawl — 3 balloons each, last Pokémon standing wins" },
  { key: "tt", label: "TIME TRIAL", desc: "Race the clock and your ghost" },
  { key: "dex", label: "POKéDEX", desc: "Your roster — win races to unlock all 151" },
  { key: "help", label: "HOW TO PLAY", desc: "Controls and racing tips" },
  { key: "controls", label: "CONTROLS", desc: "View and remap your keys" }
];

export default class MenuScene extends Phaser.Scene {
  private cursor = 0;
  private rows: Phaser.GameObjects.Text[] = [];
  private descText!: Phaser.GameObjects.Text;
  private helpPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("Menu");
  }

  create() {
    this.rows = [];
    this.cursor = 0;
    this.helpPanel = null;

    const g = this.add.graphics();
    g.fillGradientStyle(0x141838, 0x141838, 0x1c2a5a, 0x1c2a5a, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);

    this.add.text(GAME_W / 2, 80, "POKéKART", {
      fontFamily: UI.font, fontSize: "56px", fontStyle: "bold",
      color: UI.yellow, stroke: UI.blue, strokeThickness: 10
    }).setOrigin(0.5);

    // trophy shelf
    let tx = GAME_W / 2 - ((CUPS.length - 1) * 60) / 2;
    for (const cup of CUPS) {
      const t = Save.trophy(cup.id);
      const img = this.add.image(tx, 140, "ui-trophy").setScale(1.1);
      img.setTint(t === 3 ? 0xffd23a : t === 2 ? 0xc8d0e0 : t === 1 ? 0xc88a50 : 0x33395c);
      tx += 60;
    }

    OPTIONS.forEach((opt, i) => {
      const t = this.add.text(GAME_W / 2, 206 + i * 52, opt.label, {
        fontFamily: UI.font, fontSize: "34px", fontStyle: "bold", color: "#ffffff",
        stroke: "#0a1030", strokeThickness: 8
      }).setOrigin(0.5);
      this.rows.push(t);
    });

    this.descText = this.add.text(GAME_W / 2, 600, "", {
      fontFamily: UI.font, fontSize: "17px", color: "#aebbe8"
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, GAME_H - 36,
      `Pokédex: ${Save.data.unlocked.length}/151   ·   M: sound ${Save.muted ? "OFF" : "ON"}   ·   ESC: title`, {
        fontFamily: UI.font, fontSize: "14px", color: "#7a86b8"
      }).setOrigin(0.5).setName("footer");

    const kb = this.input.keyboard!;
    const ready = menuKeyGuard(this);
    kb.on("keydown-UP", () => ready() && this.move(-1));
    kb.on("keydown-DOWN", () => ready() && this.move(1));
    kb.on("keydown-ENTER", () => ready() && this.choose());
    kb.on("keydown-SPACE", () => ready() && this.choose());
    bindMenuCheatsShortcut(this, ready);
    kb.on("keydown-ESC", () => {
      if (!ready()) return;
      Audio.sfx("back");
      Audio.stopBgm();
      this.scene.start("Title");
    });
    kb.on("keydown-M", () => {
      Audio.toggleMute();
      const f = this.children.getByName("footer") as Phaser.GameObjects.Text;
      f.setText(`Pokédex: ${Save.data.unlocked.length}/151   ·   M: sound ${Save.muted ? "OFF" : "ON"}   ·   ESC: title`);
    });

    Audio.playBgm(9);
    this.refresh();
  }

  private move(dir: number) {
    if (this.helpPanel) return;
    this.cursor = (this.cursor + dir + OPTIONS.length) % OPTIONS.length;
    Audio.sfx("ui");
    this.refresh();
  }

  private refresh() {
    this.rows.forEach((t, i) => {
      const sel = i === this.cursor;
      t.setColor(sel ? UI.yellow : "#ffffff");
      t.setScale(sel ? 1.12 : 1);
      t.setText((sel ? "▶ " : "") + OPTIONS[i].label + (sel ? " ◀" : ""));
    });
    this.descText.setText(OPTIONS[this.cursor].desc);
  }

  private choose() {
    if (this.helpPanel) {
      this.helpPanel.destroy();
      this.helpPanel = null;
      return;
    }
    Audio.sfx("select");
    const key = OPTIONS[this.cursor].key;
    if (key === "gp") this.scene.start("Select", { flow: "gp" });
    else if (key === "battle") this.scene.start("Select", { flow: "battle" });
    else if (key === "tt") this.scene.start("Select", { flow: "tt" });
    else if (key === "dex") this.scene.start("Pokedex");
    else if (key === "controls") this.scene.start("Controls");
    else this.showHelp();
  }

  private showHelp() {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0x05060f, 0.92).fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(UI.panel, 1).fillRoundedRect(140, 60, GAME_W - 280, GAME_H - 120, 16);
    g.lineStyle(3, 0xffcb05, 0.8).strokeRoundedRect(140, 60, GAME_W - 280, GAME_H - 120, 16);
    c.add(g);
    const lines = [
      ["CONTROLS", ""],
      ["↑ / ↓", "accelerate / brake"],
      ["← / →", "steer"],
      ["SPACE (hold)", "hop + drift — charge blue → orange → purple sparks, release to boost"],
      ["SHIFT", "use your item"],
      ["Z / X", "fire your equipped signature moves (Q / E works too)"],
      ["P or ESC", "pause menu — restart, switch racer or quit mid-race"],
      ["M / C / V", "mute   ·   view mode   ·   camera rig"],
      ["", ""],
      ["RACING TIPS", ""],
      ["Rocket start", "hold ↑ just as the GO! flashes"],
      ["Signature moves", "equip 2 before a race; drift, draft and laps charge the energy bar"],
      ["Move XP", "finishing races levels that Pokémon up and unlocks its deeper moves"],
      ["Slipstream", "tail a rival closely to charge a free burst of speed"],
      ["Rare Candies", "grab 2 to evolve mid-race — final forms get a MAX POWER rush instead"],
      ["Type matchups", "items follow the chart: soak fire types, zap flyers — ground ignores Thunderbolt"],
      ["STAB", "use a move matching your type for an upgraded version — rolls favor it too"],
      ["Terrain", "grass loves grass types, water boosts swimmers, lava burns (not fire types)"],
      ["Hills", "climbs are slow, descents fast — crest at speed to catch air"],
      ["Movement classes", "runners corner, flyers cross gaps, floaters skim rough ground,"],
      ["", "swimmers surge in water, heavies bulldoze everyone aside"],
      ["Balloon Battle", "3 balloons each in an open arena — hits and falls pop one, last standing wins"]
    ];
    let y = 92;
    for (const [a, b] of lines) {
      if (a) {
        c.add(this.add.text(180, y, a, {
          fontFamily: UI.font, fontSize: a === a.toUpperCase() && !b ? "21px" : "15px",
          fontStyle: "bold", color: !b ? UI.yellow : "#8ecdff"
        }));
      }
      if (b) {
        c.add(this.add.text(420, y, b, { fontFamily: UI.font, fontSize: "15px", color: "#e8ecff" }));
      }
      y += !b && a ? 33 : 25;
    }
    c.add(this.add.text(GAME_W / 2, GAME_H - 92, "ENTER to close", {
      fontFamily: UI.font, fontSize: "15px", color: "#7a86b8"
    }).setOrigin(0.5));
    this.helpPanel = c;
  }
}
