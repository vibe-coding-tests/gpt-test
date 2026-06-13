import Phaser from "phaser";
import { GAME_W, GAME_H, UI, GP_POINTS } from "../constants";
import type { StandingRow } from "../types";
import { getTrack } from "../data/trackData";
import { CUPS } from "../data/cups";
import { GameState, gpAdvance } from "../state/GameState";
import { ensurePokemonTexture } from "../systems/SpriteFactory";
import { getPokemon } from "../data/pokemonData";
import { Audio } from "../systems/AudioSystem";
import { Save } from "../systems/SaveSystem";
import { MOVES } from "../data/movesData";
import { fmtTime, menuKeyGuard, ordinal } from "../util";
import { bindMenuCheatsShortcut } from "../systems/MenuShortcuts";

interface Payload {
  mode: "gp" | "tt" | "battle";
  demo: boolean;
  standings: StandingRow[];
  isFinalRace: boolean;
  playerCupPlace: number;
  unlockedIds: number[];
  newMoves?: string[]; // freshly unlocked signature moves
  newBest: boolean;
  trackId: number;
  timeMs: number;
  playerRank: number;
}

export default class ResultsScene extends Phaser.Scene {
  private data2!: Payload;
  private phase: "table" | "podium" = "table";

  constructor() {
    super("Results");
  }

  init(data: Payload) {
    this.data2 = data;
  }

  create() {
    this.phase = "table";
    this.drawTable();

    const kb = this.input.keyboard!;
    const ready = menuKeyGuard(this, 600);
    kb.on("keydown-ENTER", () => ready() && this.advance());
    kb.on("keydown-SPACE", () => ready() && this.advance());
    kb.on("keydown-ESC", () => {
      if (!ready()) return;
      Audio.sfx("back");
      Audio.stopBgm();
      this.scene.start("Menu");
    });
    bindMenuCheatsShortcut(this, ready);

    if (this.data2.playerRank === 1) Audio.sfx("victory");
    else if (this.data2.playerRank >= 6 && this.data2.mode === "gp") Audio.sfx("losejingle");
  }

  private drawTable() {
    const d = this.data2;
    const track = getTrack(d.trackId);

    const g = this.add.graphics();
    g.fillGradientStyle(0x141838, 0x141838, 0x1c2a5a, 0x1c2a5a, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);

    this.add.text(GAME_W / 2, 56,
      d.mode === "tt" ? `TIME TRIAL — ${track.name.toUpperCase()}`
        : d.mode === "battle" ? `BATTLE — ${track.name.toUpperCase()}`
        : `RESULTS — ${track.name.toUpperCase()}`, {
        fontFamily: UI.font, fontSize: "34px", fontStyle: "bold",
        color: UI.yellow, stroke: UI.blue, strokeThickness: 8
      }).setOrigin(0.5);

    if (d.mode === "tt") {
      this.drawTimeTrial();
      return;
    }
    if (d.mode === "battle") {
      this.drawBattle(g);
      return;
    }

    g.fillStyle(UI.panel, 0.95).fillRoundedRect(220, 100, 840, 470, 14);
    g.lineStyle(2, 0x3a4380, 1).strokeRoundedRect(220, 100, 840, 470, 14);

    this.add.text(300, 122, "POS", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });
    this.add.text(420, 122, "RACER", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });
    this.add.text(720, 122, "TIME", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });
    this.add.text(870, 122, "PTS", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });
    this.add.text(960, 122, "TOTAL", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });

    d.standings.forEach((row, i) => {
      const y = 168 + i * 50;
      if (row.isPlayer) {
        this.add.rectangle(640, y, 800, 46, 0xffcb05, 0.14).setStrokeStyle(2, 0xffcb05);
      }
      const posColor = i === 0 ? "#ffd23a" : i === 1 ? "#c8d0e0" : i === 2 ? "#c88a50" : "#8ecdff";
      this.add.text(300, y, ordinal(row.position), {
        fontFamily: UI.font, fontSize: "22px", fontStyle: "bold", color: posColor
      }).setOrigin(0, 0.5);
      const key = ensurePokemonTexture(this, row.speciesId);
      this.add.sprite(390, y, key, 2).setScale(0.62);
      this.add.text(420, y, row.name + (row.isPlayer ? "  ◀ YOU" : ""), {
        fontFamily: UI.font, fontSize: "19px", fontStyle: "bold",
        color: row.isPlayer ? "#ffffff" : "#cfd8ff"
      }).setOrigin(0, 0.5);
      this.add.text(720, y, fmtTime(row.timeMs), {
        fontFamily: UI.font, fontSize: "16px", color: "#aebbe8"
      }).setOrigin(0, 0.5);
      this.add.text(870, y, `+${row.points}`, {
        fontFamily: UI.font, fontSize: "18px", fontStyle: "bold", color: "#9ad05a"
      }).setOrigin(0, 0.5);
      this.add.text(960, y, `${row.gpTotal}`, {
        fontFamily: UI.font, fontSize: "18px", fontStyle: "bold", color: "#ffffff"
      }).setOrigin(0, 0.5);
    });

    this.drawUnlocks(600);

    this.add.text(GAME_W / 2, GAME_H - 36,
      d.isFinalRace ? "ENTER — cup podium" : "ENTER — next race   ·   ESC — quit to menu", {
        fontFamily: UI.font, fontSize: "17px", fontStyle: "bold", color: "#ffffff"
      }).setOrigin(0.5);
  }

  private drawBattle(g: Phaser.GameObjects.Graphics) {
    const d = this.data2;
    g.fillStyle(UI.panel, 0.95).fillRoundedRect(220, 100, 840, 470, 14);
    g.lineStyle(2, 0x3a4380, 1).strokeRoundedRect(220, 100, 840, 470, 14);

    const verdict = d.playerRank === 1 ? "LAST POKéMON STANDING!" : `KNOCKED OUT — ${ordinal(d.playerRank)}`;
    this.add.text(GAME_W / 2, 126, verdict, {
      fontFamily: UI.font, fontSize: "22px", fontStyle: "bold",
      color: d.playerRank === 1 ? UI.yellow : "#ff8a8a"
    }).setOrigin(0.5);

    this.add.text(300, 156, "PLACE", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });
    this.add.text(420, 156, "POKéMON", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });
    this.add.text(760, 156, "BALLOONS", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });
    this.add.text(930, 156, "HITS", { fontFamily: UI.font, fontSize: "14px", color: "#8a94c8" });

    d.standings.forEach((row, i) => {
      const y = 196 + i * 45;
      if (row.isPlayer) {
        this.add.rectangle(640, y, 800, 42, 0xffcb05, 0.14).setStrokeStyle(2, 0xffcb05);
      }
      const posColor = i === 0 ? "#ffd23a" : i === 1 ? "#c8d0e0" : i === 2 ? "#c88a50" : "#8ecdff";
      this.add.text(300, y, ordinal(row.position), {
        fontFamily: UI.font, fontSize: "20px", fontStyle: "bold", color: posColor
      }).setOrigin(0, 0.5);
      const key = ensurePokemonTexture(this, row.speciesId);
      this.add.sprite(390, y, key, 2).setScale(0.58);
      this.add.text(420, y, row.name + (row.isPlayer ? "  ◀ YOU" : ""), {
        fontFamily: UI.font, fontSize: "18px", fontStyle: "bold",
        color: row.isPlayer ? "#ffffff" : "#cfd8ff"
      }).setOrigin(0, 0.5);
      const balloons = row.balloons ?? 0;
      for (let b = 0; b < 3; b++) {
        const c = this.add.circle(776 + b * 26, y, 8, balloons > b ? 0xff5a5a : 0x10122a);
        c.setStrokeStyle(2, balloons > b ? 0xffffff : 0x3a4380);
      }
      this.add.text(930, y, `${row.hitsScored ?? 0}`, {
        fontFamily: UI.font, fontSize: "18px", fontStyle: "bold", color: "#9ad05a"
      }).setOrigin(0, 0.5);
    });

    this.drawUnlocks(584);

    this.add.text(GAME_W / 2, GAME_H - 36, "ENTER — rematch   ·   ESC — quit to menu", {
      fontFamily: UI.font, fontSize: "17px", fontStyle: "bold", color: "#ffffff"
    }).setOrigin(0.5);
  }

  private drawTimeTrial() {
    const d = this.data2;
    this.add.text(GAME_W / 2, 220, fmtTime(d.timeMs), {
      fontFamily: UI.font, fontSize: "84px", fontStyle: "bold",
      color: "#ffffff", stroke: UI.blue, strokeThickness: 10
    }).setOrigin(0.5);

    if (d.newBest) {
      const t = this.add.text(GAME_W / 2, 310, "★ NEW RECORD! ghost saved ★", {
        fontFamily: UI.font, fontSize: "30px", fontStyle: "bold", color: UI.yellow
      }).setOrigin(0.5);
      this.tweens.add({ targets: t, scale: 1.12, yoyo: true, repeat: -1, duration: 380 });
      Audio.sfx("victory");
    } else {
      const best = Save.bestTime(d.trackId);
      this.add.text(GAME_W / 2, 310, `best: ${fmtTime(best)}`, {
        fontFamily: UI.font, fontSize: "22px", color: "#8ecdff"
      }).setOrigin(0.5);
    }

    const key = ensurePokemonTexture(this, d.standings[0]?.speciesId ?? GameState.playerSpeciesId);
    this.add.sprite(GAME_W / 2, 420, key, 2).setScale(2.6);

    this.drawUnlocks(490);

    this.add.text(GAME_W / 2, GAME_H - 36, "ENTER — retry   ·   ESC — menu", {
      fontFamily: UI.font, fontSize: "17px", fontStyle: "bold", color: "#ffffff"
    }).setOrigin(0.5);
  }

  private drawUnlocks(y: number) {
    const ids = this.data2.unlockedIds;
    const moves = this.data2.newMoves ?? [];

    if (moves.length) {
      Audio.sfx("unlock");
      const names = moves.map((m) => MOVES[m]?.name ?? m).join("  ·  ");
      const who = getPokemon(GameState.playerSpeciesId).name;
      const mt = this.add.text(GAME_W / 2, y + (ids.length ? -2 : 24), `★ ${who} LEARNED ${names.toUpperCase()}! equip it next race ★`, {
        fontFamily: UI.font, fontSize: "17px", fontStyle: "bold", color: "#8af0c8",
        stroke: "#0a1030", strokeThickness: 6
      }).setOrigin(0.5);
      this.tweens.add({ targets: mt, scale: 1.07, yoyo: true, repeat: -1, duration: 420 });
    }

    if (!ids.length) return;
    Audio.sfx("unlock");
    const names = ids.map((id) => getPokemon(id).name).join("  ·  ");
    const t = this.add.text(GAME_W / 2, y + 24, `NEW POKéMON UNLOCKED:  ${names}`, {
      fontFamily: UI.font, fontSize: "17px", fontStyle: "bold", color: "#9ad05a",
      stroke: "#0a1030", strokeThickness: 6
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, alpha: 0.5, yoyo: true, repeat: -1, duration: 500 });
    ids.slice(0, 8).forEach((id, i) => {
      const key = ensurePokemonTexture(this, id);
      this.add.sprite(GAME_W / 2 - (ids.length - 1) * 30 + i * 60, y + 70, key, 2).setScale(0.9);
    });
  }

  private advance() {
    const d = this.data2;
    Audio.sfx("select");
    if (this.phase === "podium") {
      Audio.stopBgm();
      this.scene.start("Menu");
      return;
    }
    if (d.mode === "tt" || d.mode === "battle") {
      this.scene.start("Loading"); // retry / rematch, GameState unchanged
      return;
    }
    if (d.isFinalRace) {
      this.phase = "podium";
      this.children.removeAll();
      this.drawPodium();
      return;
    }
    gpAdvance();
    this.scene.start("Loading");
  }

  private drawPodium() {
    const d = this.data2;
    const gp = GameState.gp;
    const cupName = gp ? CUPS[gp.cupId].name : "Cup";

    const g = this.add.graphics();
    g.fillGradientStyle(0x101430, 0x101430, 0x232865, 0x232865, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);

    this.add.text(GAME_W / 2, 70, `${cupName.toUpperCase()} — FINAL STANDINGS`, {
      fontFamily: UI.font, fontSize: "34px", fontStyle: "bold",
      color: UI.yellow, stroke: UI.blue, strokeThickness: 8
    }).setOrigin(0.5);

    const totals = [...d.standings].sort((a, b) => b.gpTotal - a.gpTotal);
    const podium = totals.slice(0, 3);
    const layout = [
      { x: GAME_W / 2, h: 170, color: 0xffd23a, label: "1st" },
      { x: GAME_W / 2 - 230, h: 120, color: 0xc8d0e0, label: "2nd" },
      { x: GAME_W / 2 + 230, h: 90, color: 0xc88a50, label: "3rd" }
    ];
    const baseY = 520;

    podium.forEach((row, i) => {
      const L = layout[i];
      const gg = this.add.graphics();
      gg.fillStyle(0x2a3270, 1).fillRect(L.x - 90, baseY - L.h, 180, L.h);
      gg.lineStyle(3, L.color, 1).strokeRect(L.x - 90, baseY - L.h, 180, L.h);
      this.add.text(L.x, baseY - L.h / 2, L.label, {
        fontFamily: UI.font, fontSize: "30px", fontStyle: "bold", color: "#10122a"
      }).setOrigin(0.5).setTint(L.color);

      const key = ensurePokemonTexture(this, row.speciesId);
      const spr = this.add.sprite(L.x, baseY - L.h - 50, key, 2).setScale(2);
      this.tweens.add({
        targets: spr, y: baseY - L.h - 62, yoyo: true, repeat: -1,
        duration: 500 + i * 90, ease: "Quad.easeInOut"
      });
      this.add.text(L.x, baseY - L.h - 110, `${row.name}${row.isPlayer ? " (YOU)" : ""}`, {
        fontFamily: UI.font, fontSize: "19px", fontStyle: "bold",
        color: row.isPlayer ? "#ffd23a" : "#ffffff", stroke: "#0a1030", strokeThickness: 5
      }).setOrigin(0.5);
      this.add.text(L.x, baseY + 22, `${row.gpTotal} pts`, {
        fontFamily: UI.font, fontSize: "17px", color: "#aebbe8"
      }).setOrigin(0.5);
    });

    const place = d.playerCupPlace;
    this.add.image(GAME_W / 2, 150, "ui-trophy").setScale(2.4)
      .setTint(place === 1 ? 0xffd23a : place === 2 ? 0xc8d0e0 : place === 3 ? 0xc88a50 : 0x33395c);
    this.add.text(GAME_W / 2, 200, place <= 3 ? `You took ${ordinal(place)} place!` : `You finished ${ordinal(place)} — top 3 earns a trophy`, {
      fontFamily: UI.font, fontSize: "20px", fontStyle: "bold", color: "#ffffff"
    }).setOrigin(0.5);

    if (place <= 3) {
      Audio.sfx("victory");
      this.spawnConfetti();
    } else {
      Audio.sfx("losejingle");
    }

    this.drawUnlocks(556);

    this.add.text(GAME_W / 2, GAME_H - 36, "ENTER — back to menu", {
      fontFamily: UI.font, fontSize: "17px", fontStyle: "bold", color: "#ffffff"
    }).setOrigin(0.5);
  }

  private spawnConfetti() {
    const colors = [0xffd23a, 0xee1515, 0x58c8f0, 0x9ad05a, 0xc878f0, 0xffffff];
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * GAME_W;
      const img = this.add.image(x, -20 - Math.random() * 400, "fx-px")
        .setTint(colors[i % colors.length])
        .setDisplaySize(6 + Math.random() * 6, 10 + Math.random() * 6)
        .setAngle(Math.random() * 360);
      this.tweens.add({
        targets: img,
        y: GAME_H + 30,
        x: x + (Math.random() * 160 - 80),
        angle: img.angle + 360 * (Math.random() > 0.5 ? 1 : -1),
        duration: 2600 + Math.random() * 2400,
        repeat: -1,
        delay: Math.random() * 1200
      });
    }
  }
}
