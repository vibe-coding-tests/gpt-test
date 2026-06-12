import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import { Save } from "../systems/SaveSystem";
import { Audio } from "../systems/AudioSystem";
import { getPokemon, CLASS_LABEL, TYPE_COLORS } from "../data/pokemonData";
import { deriveStats } from "../systems/Stats";
import { ensurePokemonTexture } from "../systems/SpriteFactory";
import { menuKeyGuard } from "../util";

const COLS = 8;
const ROWS = 4;
const PER_PAGE = COLS * ROWS;
const PAGES = Math.ceil(151 / PER_PAGE);
const CELL = 86;
const GRID_X = 100;
const GRID_Y = 130;

export default class PokedexScene extends Phaser.Scene {
  private cursor = 0;
  private page = -1;
  private cellObjs: Phaser.GameObjects.GameObject[] = [];
  private panelObjs: Phaser.GameObjects.GameObject[] = [];
  private selRect!: Phaser.GameObjects.Rectangle;
  private pageText!: Phaser.GameObjects.Text;

  constructor() {
    super("Pokedex");
  }

  create() {
    this.cursor = 0;
    this.page = -1;
    this.cellObjs = [];
    this.panelObjs = [];

    const g = this.add.graphics();
    g.fillGradientStyle(0x401418, 0x401418, 0x6a1a20, 0x6a1a20, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(0x2a0d10, 1).fillRoundedRect(60, 110, 740, 400, 14);
    g.lineStyle(3, 0xee3340, 1).strokeRoundedRect(60, 110, 740, 400, 14);
    g.fillStyle(0x2a0d10, 1).fillRoundedRect(830, 110, 390, 400, 14);
    g.lineStyle(3, 0xee3340, 1).strokeRoundedRect(830, 110, 390, 400, 14);

    this.add.image(86, 70, "ui-pokeball").setScale(1.6);
    this.add.text(120, 70, "POKéDEX", {
      fontFamily: UI.font, fontSize: "40px", fontStyle: "bold",
      color: "#ffffff", stroke: "#7a1018", strokeThickness: 8
    }).setOrigin(0, 0.5);

    this.add.text(GAME_W - 80, 70, `OWNED  ${Save.data.unlocked.length} / 151`, {
      fontFamily: UI.font, fontSize: "22px", fontStyle: "bold", color: UI.yellow
    }).setOrigin(1, 0.5);

    this.pageText = this.add.text(430, 540, "", {
      fontFamily: UI.font, fontSize: "16px", color: "#ffb8b8"
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, GAME_H - 32,
      "ARROWS: browse · ESC: back   —   win races to register new Pokémon", {
        fontFamily: UI.font, fontSize: "14px", color: "#d88a90"
      }).setOrigin(0.5);

    this.selRect = this.add.rectangle(0, 0, CELL - 8, CELL - 8)
      .setStrokeStyle(4, 0xffcb05).setFillStyle(0xffffff, 0.06).setDepth(5);

    const kb = this.input.keyboard!;
    const ready = menuKeyGuard(this);
    kb.on("keydown-LEFT", () => ready() && this.move(-1));
    kb.on("keydown-RIGHT", () => ready() && this.move(1));
    kb.on("keydown-UP", () => ready() && this.move(-COLS));
    kb.on("keydown-DOWN", () => ready() && this.move(COLS));
    kb.on("keydown-ESC", () => {
      if (!ready()) return;
      Audio.sfx("back");
      this.scene.start("Menu");
    });

    this.refresh();
  }

  private move(d: number) {
    const next = this.cursor + d;
    if (next < 0 || next >= 151) return;
    this.cursor = next;
    Audio.sfx("ui");
    this.refresh();
  }

  private refresh() {
    const newPage = Math.floor(this.cursor / PER_PAGE);
    if (newPage !== this.page) {
      this.page = newPage;
      for (const o of this.cellObjs) o.destroy();
      this.cellObjs = [];
      for (let i = 0; i < PER_PAGE; i++) {
        const id = this.page * PER_PAGE + i + 1;
        if (id > 151) break;
        const col = i % COLS, row = Math.floor(i / COLS);
        const x = GRID_X + col * CELL, y = GRID_Y + row * 92 + 40;
        const bg = this.add.rectangle(x, y, CELL - 12, 82, 0x401418).setStrokeStyle(2, 0x7a2a30);
        this.cellObjs.push(bg);
        const unlocked = Save.isUnlocked(id);
        const key = ensurePokemonTexture(this, id);
        const spr = this.add.sprite(x, y - 8, key, 2).setScale(0.78);
        if (!unlocked) spr.setTintFill(0x1a0608).setAlpha(0.85);
        this.cellObjs.push(spr);
        this.cellObjs.push(this.add.text(x, y + 28, unlocked ? `${id}` : "???", {
          fontFamily: UI.font, fontSize: "11px", color: unlocked ? "#ffd0d0" : "#7a3a40"
        }).setOrigin(0.5));
      }
      this.pageText.setText(`PAGE ${this.page + 1} / ${PAGES}`);
    }

    const i = this.cursor % PER_PAGE;
    const col = i % COLS, row = Math.floor(i / COLS);
    this.selRect.setPosition(GRID_X + col * CELL, GRID_Y + row * 92 + 40);

    this.renderDetail(this.cursor + 1);
  }

  private renderDetail(id: number) {
    for (const o of this.panelObjs) o.destroy();
    this.panelObjs = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.panelObjs.push(o); return o; };
    const unlocked = Save.isUnlocked(id);
    const def = getPokemon(id);
    const px = 860, py = 140;

    const key = ensurePokemonTexture(this, id);
    const spr = add(this.add.sprite(px + 60, py + 60, key, 2).setScale(2.2));
    if (!unlocked) spr.setTintFill(0x1a0608);

    add(this.add.text(px + 130, py + 30, unlocked ? def.name : "???", {
      fontFamily: UI.font, fontSize: "26px", fontStyle: "bold", color: "#ffffff"
    }));
    add(this.add.text(px + 130, py + 64, `#${String(id).padStart(3, "0")}`, {
      fontFamily: UI.font, fontSize: "15px", color: "#d88a90"
    }));

    if (!unlocked) {
      add(this.add.text(px, py + 140, "Not yet registered.\n\nWin races and cups to\nadd it to your roster.", {
        fontFamily: UI.font, fontSize: "16px", color: "#b86a70"
      }));
      return;
    }

    let tx = px;
    for (const t of def.types) {
      const w = t.length * 10 + 20;
      add(this.add.rectangle(tx + w / 2, py + 116, w, 22, TYPE_COLORS[t] ?? 0x888888).setStrokeStyle(2, 0x10122a));
      add(this.add.text(tx + w / 2, py + 116, t.toUpperCase(), {
        fontFamily: UI.font, fontSize: "11px", fontStyle: "bold", color: "#10122a"
      }).setOrigin(0.5));
      tx += w + 8;
    }
    add(this.add.text(px + 250, py + 116, CLASS_LABEL[def.cls].toUpperCase(), {
      fontFamily: UI.font, fontSize: "15px", fontStyle: "bold", color: UI.yellow
    }).setOrigin(0.5));

    const stats = deriveStats(def);
    const bars: [string, number, number][] = [
      ["SPD", stats.sp, 0xff6a5a],
      ["ACC", stats.ac, 0xffc93a],
      ["HND", stats.hd, 0x58c8f0],
      ["WGT", stats.wt, 0xb08af0]
    ];
    bars.forEach(([label, v, color], bi) => {
      const by = py + 158 + bi * 32;
      add(this.add.text(px, by, label, { fontFamily: UI.font, fontSize: "13px", fontStyle: "bold", color: "#ffd0d0" }));
      add(this.add.rectangle(px + 56, by + 8, 280, 12, 0x1a0608).setOrigin(0, 0.5));
      add(this.add.rectangle(px + 56, by + 8, 280 * v, 12, color).setOrigin(0, 0.5));
    });

    let note = "Final form.";
    if (def.evosRemaining > 0) {
      note = `Evolves: ${def.evos.map((e) => Save.isUnlocked(e) || true ? getPokemon(e).name : "???").join(" / ")}`;
    }
    if (def.legendary) note += "  ★ LEGENDARY";
    add(this.add.text(px, py + 296, note, {
      fontFamily: UI.font, fontSize: "13px", color: "#9ad05a", wordWrap: { width: 330 }
    }));
  }
}
