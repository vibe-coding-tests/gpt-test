import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import { Save } from "../systems/SaveSystem";
import { Audio } from "../systems/AudioSystem";
import { getPokemon, CLASS_LABEL, CLASS_DESC, TYPE_COLORS } from "../data/pokemonData";
import { deriveStats } from "../systems/Stats";
import { ensurePokemonTexture } from "../systems/SpriteFactory";
import { CUPS } from "../data/cups";
import { TRACKS, RACE_TRACKS, ARENAS } from "../data/trackData";
import { GameState, startGp, startTimeTrial, startBattle } from "../state/GameState";
import { movePool, unlockedCount, xpToNext, LEVEL_XP } from "../data/movesData";
import { fmtTime, menuKeyGuard } from "../util";
import { bindMenuCheatsShortcut } from "../systems/MenuShortcuts";

const COLS = 6;
const CELL = 84;
const GRID_X = 64;
const GRID_Y = 168;
const VISIBLE_ROWS = 5;

type Phase = "racer" | "moves" | "cup" | "track";

const FLOW_TITLE: Record<string, string> = {
  gp: "GRAND PRIX — CHOOSE YOUR RACER",
  tt: "TIME TRIAL — CHOOSE YOUR RACER",
  battle: "BALLOON BATTLE — CHOOSE YOUR FIGHTER"
};

export default class SelectScene extends Phaser.Scene {
  private flow: "gp" | "tt" | "battle" = "gp";
  private phase: Phase = "racer";
  private ids: number[] = [];
  private cursor = 0;
  private scrollRow = 0;
  private cells: { c: Phaser.GameObjects.Container; spr: Phaser.GameObjects.Sprite }[] = [];
  private gridContainer!: Phaser.GameObjects.Container;
  private selRect!: Phaser.GameObjects.Rectangle;
  private panel: Phaser.GameObjects.GameObject[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private listContainer: Phaser.GameObjects.Container | null = null;
  private listCursor = 0;
  private lastCryId = -1;
  private panelGfx!: Phaser.GameObjects.Graphics;
  private equipped: string[] = []; // working loadout for the moves phase

  constructor() {
    super("Select");
  }

  init(data: { flow?: "gp" | "tt" | "battle" }) {
    this.flow = data.flow ?? "gp";
  }

  /** Tracks shown in the list phase: arenas for battle, circuits otherwise. */
  private trackList() {
    return this.flow === "battle" ? ARENAS : RACE_TRACKS;
  }

  create() {
    this.phase = "racer";
    this.cells = [];
    this.panel = [];
    this.listContainer = null;
    this.listCursor = 0;
    this.scrollRow = 0;

    const g = this.add.graphics();
    g.fillGradientStyle(0x141838, 0x141838, 0x1a2450, 0x1a2450, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    this.panelGfx = this.add.graphics();
    this.drawPanels("two");

    this.titleText = this.add.text(GAME_W / 2, 70, FLOW_TITLE[this.flow], {
      fontFamily: UI.font, fontSize: "30px", fontStyle: "bold",
      color: UI.yellow, stroke: UI.blue, strokeThickness: 7
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, GAME_H - 32, "ARROWS: move · ENTER: confirm · ESC: back", {
      fontFamily: UI.font, fontSize: "14px", color: "#7a86b8"
    }).setOrigin(0.5);

    this.ids = Save.roster().sort((a, b) => a - b);
    const last = this.ids.indexOf(GameState.playerSpeciesId);
    this.cursor = last >= 0 ? last : 0;

    this.gridContainer = this.add.container(0, 0);
    this.ids.forEach((id, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = GRID_X + col * CELL + CELL / 2;
      const y = GRID_Y + row * CELL + CELL / 2;
      const c = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, CELL - 10, CELL - 10, 0x202760).setStrokeStyle(2, 0x3a4380);
      const key = ensurePokemonTexture(this, id);
      const spr = this.add.sprite(0, -4, key, 2).setScale(0.86);
      const num = this.add.text(0, CELL / 2 - 18, `#${id}`, {
        fontFamily: UI.font, fontSize: "11px", color: "#8a94c8"
      }).setOrigin(0.5);
      c.add([bg, spr, num]);
      this.gridContainer.add(c);
      this.cells.push({ c, spr });
    });

    this.selRect = this.add.rectangle(0, 0, CELL - 6, CELL - 6)
      .setStrokeStyle(4, 0xffcb05).setFillStyle(0xffcb05, 0.08);

    const kb = this.input.keyboard!;
    const ready = menuKeyGuard(this);
    kb.on("keydown-LEFT", () => ready() && this.onArrow(-1, 0));
    kb.on("keydown-RIGHT", () => ready() && this.onArrow(1, 0));
    kb.on("keydown-UP", () => ready() && this.onArrow(0, -1));
    kb.on("keydown-DOWN", () => ready() && this.onArrow(0, 1));
    kb.on("keydown-ENTER", () => ready() && this.onConfirm());
    kb.on("keydown-SPACE", () => ready() && this.onConfirm());
    kb.on("keydown-ESC", () => ready() && this.onBack());
    bindMenuCheatsShortcut(this, ready);

    this.refreshGrid();
  }

  /** Backdrop: two side-by-side panels (grid + info) or one wide panel (track list). */
  private drawPanels(mode: "two" | "wide") {
    const g = this.panelGfx;
    g.clear();
    if (mode === "two") {
      g.fillStyle(UI.panel, 1).fillRoundedRect(40, 140, 560, 470, 14);
      g.fillStyle(UI.panel, 1).fillRoundedRect(640, 140, 600, 470, 14);
      g.lineStyle(2, 0x3a4380, 1).strokeRoundedRect(40, 140, 560, 470, 14);
      g.lineStyle(2, 0x3a4380, 1).strokeRoundedRect(640, 140, 600, 470, 14);
    } else {
      g.fillStyle(UI.panel, 1).fillRoundedRect(20, 140, 1240, 470, 14);
      g.lineStyle(2, 0x3a4380, 1).strokeRoundedRect(20, 140, 1240, 470, 14);
    }
  }

  // ---------- racer grid ----------

  private onArrow(dx: number, dy: number) {
    Audio.sfx("ui");
    if (this.phase === "racer") {
      const next = this.cursor + dx + dy * COLS;
      if (next >= 0 && next < this.ids.length) this.cursor = next;
      this.refreshGrid();
    } else {
      const n = this.phase === "cup" ? CUPS.length
        : this.phase === "moves" ? movePool(getPokemon(GameState.playerSpeciesId)).length + 1
        : this.trackList().length;
      this.listCursor = (this.listCursor + dy + (dx !== 0 ? dx : 0) + n) % n;
      this.refreshList();
    }
  }

  private refreshGrid() {
    const row = Math.floor(this.cursor / COLS);
    if (row < this.scrollRow) this.scrollRow = row;
    if (row > this.scrollRow + VISIBLE_ROWS - 1) this.scrollRow = row - VISIBLE_ROWS + 1;
    this.gridContainer.y = -this.scrollRow * CELL;

    this.cells.forEach(({ c }, i) => {
      const r = Math.floor(i / COLS);
      c.setVisible(r >= this.scrollRow && r < this.scrollRow + VISIBLE_ROWS);
    });

    const col = this.cursor % COLS;
    this.selRect.setPosition(
      GRID_X + col * CELL + CELL / 2,
      GRID_Y + (row - this.scrollRow) * CELL + CELL / 2
    );
    this.renderInfo(this.ids[this.cursor]);
  }

  private renderInfo(id: number) {
    for (const o of this.panel) o.destroy();
    this.panel = [];
    const def = getPokemon(id);
    if (this.lastCryId !== id) {
      this.lastCryId = id;
      Audio.cry(id, 0.45);
    }
    const stats = deriveStats(def);
    const px = 680, py = 170;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.panel.push(o); return o; };

    const key = ensurePokemonTexture(this, id);
    add(this.add.sprite(px + 70, py + 70, key, 2).setScale(2.1));
    add(this.add.text(px + 160, py + 16, def.name, {
      fontFamily: UI.font, fontSize: "30px", fontStyle: "bold", color: "#ffffff"
    }));
    add(this.add.text(px + 160, py + 52, `#${String(id).padStart(3, "0")}`, {
      fontFamily: UI.font, fontSize: "15px", color: "#8a94c8"
    }));

    let tx = px + 160;
    for (const t of def.types) {
      const w = t.length * 10 + 22;
      const r = add(this.add.rectangle(tx + w / 2, py + 92, w, 24, TYPE_COLORS[t] ?? 0x888888));
      r.setStrokeStyle(2, 0x10122a);
      add(this.add.text(tx + w / 2, py + 92, t.toUpperCase(), {
        fontFamily: UI.font, fontSize: "12px", fontStyle: "bold", color: "#10122a"
      }).setOrigin(0.5));
      tx += w + 8;
    }

    add(this.add.text(px + 160, py + 116, CLASS_LABEL[def.cls].toUpperCase(), {
      fontFamily: UI.font, fontSize: "17px", fontStyle: "bold", color: UI.yellow
    }));
    add(this.add.text(px, py + 156, CLASS_DESC[def.cls], {
      fontFamily: UI.font, fontSize: "14px", color: "#aebbe8", wordWrap: { width: 520 }
    }));

    const bars: [string, number, number][] = [
      ["SPEED", stats.sp, 0xff6a5a],
      ["ACCEL", stats.ac, 0xffc93a],
      ["HANDLING", stats.hd, 0x58c8f0],
      ["WEIGHT", stats.wt, 0xb08af0]
    ];
    bars.forEach(([label, v, color], i) => {
      const by = py + 210 + i * 38;
      add(this.add.text(px, by, label, { fontFamily: UI.font, fontSize: "14px", fontStyle: "bold", color: "#cfd8ff" }));
      add(this.add.rectangle(px + 130, by + 8, 360, 14, 0x10122a).setOrigin(0, 0.5));
      add(this.add.rectangle(px + 130, by + 8, 360 * v, 14, color).setOrigin(0, 0.5));
    });

    let evoNote = "Final form — 2 Rare Candies trigger a MAX POWER rush (big boost + permanent stat stack).";
    if (def.evosRemaining > 0) {
      const names = def.evos.map((e) => getPokemon(e).name).join(" / ");
      evoNote = `Evolves into ${names} with 2 Rare Candies (×${def.evosRemaining} stages).`;
    }
    add(this.add.text(px, py + 372, evoNote, {
      fontFamily: UI.font, fontSize: "14px", color: "#9ad05a", wordWrap: { width: 540 }
    }));
  }

  // ---------- cup / track lists ----------

  private onConfirm() {
    Audio.sfx("select");
    if (this.phase === "racer") {
      GameState.playerSpeciesId = this.ids[this.cursor];
      this.equipped = Save.loadout(GameState.playerSpeciesId);
      this.enterPhase("moves");
      return;
    }
    if (this.phase === "moves") {
      this.onMovesConfirm();
      return;
    }
    if (this.phase === "cup") {
      if (this.cupLocked(this.listCursor)) {
        Audio.sfx("back");
        return;
      }
      startGp(this.listCursor, GameState.playerSpeciesId);
      Audio.stopBgm();
      this.scene.start("Loading");
      return;
    }
    const picked = this.trackList()[this.listCursor];
    if (this.flow === "battle") startBattle(picked.id, GameState.playerSpeciesId);
    else startTimeTrial(picked.id, GameState.playerSpeciesId);
    Audio.stopBgm();
    this.scene.start("Loading");
  }

  /** Swap the scene between its phases, fixing panels / title / grid visibility. */
  private enterPhase(phase: Phase) {
    this.phase = phase;
    this.listCursor = 0;
    if (this.listContainer) {
      this.listContainer.destroy();
      this.listContainer = null;
    }
    if (phase === "racer") {
      this.titleText.setText(FLOW_TITLE[this.flow]);
      this.drawPanels("two");
      this.gridContainer.setVisible(true);
      this.selRect.setVisible(true);
      this.refreshGrid();
      return;
    }
    this.gridContainer.setVisible(false);
    this.selRect.setVisible(false);
    if (phase === "moves") {
      const def = getPokemon(GameState.playerSpeciesId);
      this.titleText.setText(`EQUIP MOVES — ${def.name.toUpperCase()}`);
      this.drawPanels("wide");
      for (const o of this.panel) o.destroy();
      this.panel = [];
    } else if (phase === "cup") {
      this.titleText.setText("CHOOSE A CUP");
      this.drawPanels("two");
      this.renderInfo(GameState.playerSpeciesId); // bring the racer card back
    } else {
      this.titleText.setText(this.flow === "battle" ? "CHOOSE AN ARENA" : "CHOOSE A TRACK");
      this.drawPanels("wide");
      for (const o of this.panel) o.destroy();
      this.panel = [];
    }
    this.refreshList();
  }

  /** Moves phase: toggle the highlighted move, or continue from the last row. */
  private onMovesConfirm() {
    const id = GameState.playerSpeciesId;
    const pool = movePool(getPokemon(id));
    const open = unlockedCount(Save.xp(id));

    if (this.listCursor >= pool.length) {
      // READY row — persist and move on
      if (this.equipped.length === 0) this.equipped = [pool[0].id];
      Save.setLoadout(id, this.equipped);
      this.enterPhase(this.flow === "gp" ? "cup" : "track");
      return;
    }

    const move = pool[this.listCursor];
    if (this.listCursor >= open) {
      Audio.sfx("back"); // still locked — race more with this Pokémon
      return;
    }
    const at = this.equipped.indexOf(move.id);
    if (at >= 0) {
      this.equipped.splice(at, 1);
    } else if (this.equipped.length < 2) {
      this.equipped.push(move.id);
    } else {
      // both slots full: swap the older pick out
      this.equipped = [this.equipped[1], move.id];
    }
    this.refreshList();
  }

  private cupLocked(cupId: number): boolean {
    if (Save.cheats.unlockAll) return false;
    if (cupId <= 1) return false; // Poké and Great Ball Cups are open from the start
    if (cupId === 2) return Save.trophy(0) === 0 && Save.trophy(1) === 0;
    return Save.trophy(2) === 0;
  }

  private refreshList() {
    if (this.listContainer) this.listContainer.destroy();
    const c = this.add.container(0, 0);
    this.listContainer = c;

    if (this.phase === "moves") {
      this.renderMovesList(c);
      return;
    }
    if (this.phase === "cup") {
      CUPS.forEach((cup, i) => {
        const y = 196 + i * 108;
        const sel = i === this.listCursor;
        const locked = this.cupLocked(i);
        const bg = this.add.rectangle(320, y, 520, 96, sel ? 0x2a3270 : 0x202760)
          .setStrokeStyle(sel ? 4 : 2, sel ? 0xffcb05 : 0x3a4380);
        c.add(bg);
        const ballTint = cup.ball === "poke" ? 0xffffff
          : cup.ball === "great" ? 0x58a8f0
          : cup.ball === "master" ? 0xb06af0 : 0xf0d048;
        c.add(this.add.image(110, y, "ui-pokeball").setScale(1.45).setTint(ballTint).setAlpha(locked ? 0.35 : 1));
        c.add(this.add.text(160, y - 30, cup.name, {
          fontFamily: UI.font, fontSize: "22px", fontStyle: "bold",
          color: locked ? "#5a6390" : "#ffffff"
        }));
        const tracks = cup.trackIds.map((t) => TRACKS[t].name).join("  ·  ");
        const lockMsg = i === 2 ? "Locked — earn a trophy in any earlier cup" : "Locked — earn a Master Ball Cup trophy";
        c.add(this.add.text(160, y + 2, locked ? lockMsg : tracks, {
          fontFamily: UI.font, fontSize: "12px", color: locked ? "#5a6390" : "#aebbe8"
        }));
        const trophy = Save.trophy(i);
        if (trophy > 0) {
          c.add(this.add.image(540, y - 18, "ui-trophy")
            .setTint(trophy === 3 ? 0xffd23a : trophy === 2 ? 0xc8d0e0 : 0xc88a50));
        }
      });
      c.add(this.add.text(900, 582, "Win races to unlock new Pokémon · trophies unlock legendaries!", {
        fontFamily: UI.font, fontSize: "13px", color: "#8a94c8", align: "center"
      }).setOrigin(0.5));
    } else {
      const list = this.trackList();
      list.forEach((t, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const x = 230 + col * 410, y = 196 + row * 112;
        const sel = i === this.listCursor;
        const bg = this.add.rectangle(x, y, 380, 102, sel ? 0x2a3270 : 0x202760)
          .setStrokeStyle(sel ? 4 : 2, sel ? 0xffcb05 : 0x3a4380);
        c.add(bg);
        c.add(this.add.rectangle(x - 152, y, 48, 80, t.theme.road).setStrokeStyle(2, 0x10122a));
        c.add(this.add.text(x - 112, y - 36, t.name, {
          fontFamily: UI.font, fontSize: "17px", fontStyle: "bold", color: "#ffffff"
        }));
        c.add(this.add.text(x - 112, y - 11, t.subtitle.replace("Battle arena — ", ""), {
          fontFamily: UI.font, fontSize: "11px", color: "#aebbe8", wordWrap: { width: 290 }
        }));
        if (this.flow === "battle") {
          c.add(this.add.text(x - 112, y + 24, "3 BALLOONS · LAST ONE STANDING", {
            fontFamily: UI.font, fontSize: "12px", color: UI.yellow
          }));
        } else {
          const best = Save.bestTime(t.id);
          c.add(this.add.text(x - 112, y + 24, `BEST  ${isFinite(best) ? fmtTime(best) : "--:--.---"}`, {
            fontFamily: UI.font, fontSize: "12px", color: UI.yellow
          }));
        }
      });
    }
  }

  /**
   * Loadout screen: the species' 4-move pool with unlock levels, equip
   * badges for the two slots, XP progress and a READY row to continue.
   */
  private renderMovesList(c: Phaser.GameObjects.Container) {
    const id = GameState.playerSpeciesId;
    const def = getPokemon(id);
    const pool = movePool(def);
    const xp = Save.xp(id);
    const open = unlockedCount(xp);
    const next = xpToNext(xp);

    // header: sprite + progression summary
    const key = ensurePokemonTexture(this, id);
    c.add(this.add.sprite(96, 196, key, 2).setScale(1.5));
    c.add(this.add.text(150, 172, `MOVE LEVEL ${open} / ${pool.length}`, {
      fontFamily: UI.font, fontSize: "19px", fontStyle: "bold", color: UI.yellow
    }));
    c.add(this.add.text(150, 200, next === null
      ? `${xp} XP — every move mastered!`
      : `${xp} XP — next move in ${next} XP (finish a race: +1 · podium: +2 · win: +3)`, {
      fontFamily: UI.font, fontSize: "13px", color: "#aebbe8"
    }));
    c.add(this.add.text(1230, 186, "EQUIP UP TO 2", {
      fontFamily: UI.font, fontSize: "15px", fontStyle: "bold", color: "#8ecdff"
    }).setOrigin(1, 0.5));

    pool.forEach((m, i) => {
      const y = 262 + i * 64;
      const sel = i === this.listCursor;
      const locked = i >= open;
      const slot = this.equipped.indexOf(m.id);

      const bg = this.add.rectangle(640, y, 1180, 56, sel ? 0x2a3270 : 0x202760)
        .setStrokeStyle(sel ? 4 : 2, sel ? 0xffcb05 : slot >= 0 ? 0x8af0c8 : 0x3a4380);
      c.add(bg);

      // type chip
      const tw = m.type.length * 9 + 20;
      c.add(this.add.rectangle(96 + tw / 2, y, tw, 22, locked ? 0x3a4060 : (TYPE_COLORS[m.type] ?? 0x888888))
        .setStrokeStyle(2, 0x10122a));
      c.add(this.add.text(96 + tw / 2, y, m.type.toUpperCase(), {
        fontFamily: UI.font, fontSize: "11px", fontStyle: "bold", color: locked ? "#7a86b8" : "#10122a"
      }).setOrigin(0.5));

      c.add(this.add.text(210, y - 12, m.name.toUpperCase(), {
        fontFamily: UI.font, fontSize: "18px", fontStyle: "bold",
        color: locked ? "#5a6390" : "#ffffff"
      }).setOrigin(0, 0.5));
      c.add(this.add.text(210, y + 13, locked
        ? `Locked — reach ${LEVEL_XP[i]} XP with ${def.name} (${LEVEL_XP[i] - xp} to go)`
        : m.desc, {
        fontFamily: UI.font, fontSize: "12px", color: locked ? "#5a6390" : "#aebbe8"
      }).setOrigin(0, 0.5));

      c.add(this.add.text(1080, y, `COST ${m.cost}`, {
        fontFamily: UI.font, fontSize: "14px", fontStyle: "bold",
        color: locked ? "#5a6390" : "#8ecdff"
      }).setOrigin(0.5));

      if (slot >= 0) {
        c.add(this.add.rectangle(1170, y, 76, 30, 0x8af0c8).setStrokeStyle(2, 0x10122a));
        c.add(this.add.text(1170, y, slot === 0 ? "[ Z ]" : "[ X ]", {
          fontFamily: UI.font, fontSize: "14px", fontStyle: "bold", color: "#10122a"
        }).setOrigin(0.5));
      } else if (locked) {
        c.add(this.add.text(1170, y, "LOCKED", {
          fontFamily: UI.font, fontSize: "13px", fontStyle: "bold", color: "#5a6390"
        }).setOrigin(0.5));
      }
    });

    // READY row
    const ry = 262 + pool.length * 64 + 8;
    const rsel = this.listCursor >= pool.length;
    const names = this.equipped.map((e) => pool.find((m) => m.id === e)?.name ?? e);
    c.add(this.add.rectangle(640, ry, 560, 48, rsel ? 0x2a3270 : 0x202760)
      .setStrokeStyle(rsel ? 4 : 2, rsel ? 0xffcb05 : 0x3a4380));
    c.add(this.add.text(640, ry, names.length
      ? `READY!  ${names.join(" + ").toUpperCase()}  →`
      : "READY! (first move auto-equips)  →", {
      fontFamily: UI.font, fontSize: "17px", fontStyle: "bold",
      color: rsel ? "#ffd23a" : "#9ad05a"
    }).setOrigin(0.5));

    c.add(this.add.text(GAME_W / 2, 604, "ENTER: equip / continue · in-race: Z and X fire your moves (Q / E on WASD)", {
      fontFamily: UI.font, fontSize: "13px", color: "#8a94c8"
    }).setOrigin(0.5));
  }

  private onBack() {
    Audio.sfx("back");
    if (this.phase === "racer") {
      this.scene.start("Menu");
    } else if (this.phase === "moves") {
      this.enterPhase("racer");
    } else {
      this.enterPhase("moves");
    }
  }
}
