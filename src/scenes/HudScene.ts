import Phaser from "phaser";
import { GAME_W, GAME_H, UI } from "../constants";
import type RaceScene from "./RaceScene";
import { GameState } from "../state/GameState";
import { Save } from "../systems/SaveSystem";
import { clamp, fmtTime, ordinal } from "../util";
import { ITEM_LIST } from "../data/itemsData";
import { MOVES } from "../data/movesData";
import { TYPE_COLORS } from "../data/pokemonData";
import { DRIFT_TIERS, DRIFT_COLORS } from "../race/Racer";

const POS_COLORS = ["#ffd23a", "#d7deed", "#e09a5e", "#8ecdff", "#8ecdff", "#8ecdff", "#8ecdff", "#8ecdff"];

/** Frosted-glass panel: dark backdrop with a hairline highlight stroke. */
function glass(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 14) {
  g.fillStyle(0x0b0e1f, 0.55).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(1.5, 0xffffff, 0.09).strokeRoundedRect(x, y, w, h, r);
}

export default class HudScene extends Phaser.Scene {
  private race!: RaceScene;
  private posText!: Phaser.GameObjects.Text;
  private posSufText!: Phaser.GameObjects.Text;
  private lapText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private itemIcon!: Phaser.GameObjects.Image;
  private itemLabel!: Phaser.GameObjects.Text;
  private candyPips: Phaser.GameObjects.Arc[] = [];
  private countText!: Phaser.GameObjects.Text;
  private statusBox!: Phaser.GameObjects.Container;
  private statusG!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private lastStatus = "";
  private toastBox!: Phaser.GameObjects.Container;
  private toastG!: Phaser.GameObjects.Graphics;
  private toastText!: Phaser.GameObjects.Text;
  private chargeIcons: Phaser.GameObjects.Image[] = [];
  private dynG: Phaser.GameObjects.Graphics | null = null;
  private moveNameTexts: Phaser.GameObjects.Text[] = [];
  private moveCostTexts: Phaser.GameObjects.Text[] = [];
  private moveKeyTexts: Phaser.GameObjects.Text[] = [];
  private energyText: Phaser.GameObjects.Text | null = null;
  private moveReadyWas: boolean[] = [false, false];
  private balloonPips: Phaser.GameObjects.Arc[] = [];
  private aliveText: Phaser.GameObjects.Text | null = null;
  private dots: Phaser.GameObjects.Arc[] = [];
  private ghostDot: Phaser.GameObjects.Arc | null = null;
  private toMini!: (x: number, y: number) => { x: number; y: number };
  private goShownT = 0;
  private rouletteAcc = 0;
  private rouletteWas = false;
  private driftTierWas = 0;
  private driftFlashT = 0;
  private debugText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super("Hud");
  }

  init(data: { race: RaceScene }) {
    this.race = data.race;
  }

  create() {
    this.dots = [];
    this.candyPips = [];
    this.chargeIcons = [];
    this.goShownT = 0;
    this.ghostDot = null;
    this.lastStatus = "";

    const battle = GameState.mode === "battle";
    const g = this.add.graphics();

    // static glass panels: position card, timer pill, item card
    glass(g, 20, 16, 158, battle ? 126 : 94);
    glass(g, GAME_W / 2 - 96, 14, 192, 40, 20);
    glass(g, GAME_W - 116, 16, 96, 96, 16);

    this.posText = this.add.text(40, 20, "", {
      fontFamily: UI.hudFont, fontSize: "54px", fontStyle: "bold", color: "#ffd23a"
    });
    this.posSufText = this.add.text(0, 32, "", {
      fontFamily: UI.hudFont, fontSize: "20px", fontStyle: "bold", color: "#ffd23a"
    });
    this.lapText = this.add.text(42, battle ? 110 : 82, "", {
      fontFamily: UI.hudFont, fontSize: "15px", fontStyle: "bold", color: "#aebbe8"
    }).setLetterSpacing(1.5);

    this.timeText = this.add.text(GAME_W / 2, 34, "", {
      fontFamily: UI.monoFont, fontSize: "20px", fontStyle: "bold", color: "#f4f6ff"
    }).setOrigin(0.5);
    this.bestText = this.add.text(GAME_W / 2, 64, "", {
      fontFamily: UI.hudFont, fontSize: "12px", fontStyle: "bold", color: "#8ecdff"
    }).setOrigin(0.5).setLetterSpacing(1);

    this.itemIcon = this.add.image(GAME_W - 68, 64, "ic-agility").setScale(2).setVisible(false);
    this.itemLabel = this.add.text(GAME_W - 68, 124, "", {
      fontFamily: UI.hudFont, fontSize: "11px", fontStyle: "bold", color: "#ffd23a"
    }).setOrigin(0.5).setLetterSpacing(1);

    for (let i = 0; i < 2; i++) {
      this.candyPips.push(
        this.add.circle(GAME_W - 82 + i * 28, 146, 8, 0x10142e).setStrokeStyle(2, 0x58c8f0, 0.9)
      );
    }

    // time-trial agility charges
    if (GameState.mode === "tt") {
      for (let i = 0; i < 3; i++) {
        this.chargeIcons.push(this.add.image(GAME_W - 96 + i * 28, 176, "ic-agility").setScale(0.9));
      }
    }

    // battle balloons + alive counter (inside the position card)
    this.balloonPips = [];
    this.aliveText = null;
    if (battle) {
      for (let i = 0; i < 3; i++) {
        this.balloonPips.push(
          this.add.circle(48 + i * 28, 90, 9, 0xff5a6a).setStrokeStyle(2, 0xffffff, 0.85)
        );
      }
      this.aliveText = this.add.text(42, 108, "", {
        fontFamily: UI.hudFont, fontSize: "13px", fontStyle: "bold", color: "#8ecdff"
      }).setLetterSpacing(1);
    }

    this.countText = this.add.text(GAME_W / 2, 270, "", {
      fontFamily: UI.hudFont, fontSize: "124px", fontStyle: "bold",
      color: "#ffd23a", stroke: "#0b0e1f", strokeThickness: 14
    }).setOrigin(0.5);

    // status pill (flashing, mid-low center)
    this.statusG = this.add.graphics();
    this.statusText = this.add.text(0, 0, "", {
      fontFamily: UI.hudFont, fontSize: "22px", fontStyle: "bold", color: "#ff8a8a"
    }).setOrigin(0.5).setLetterSpacing(1.5);
    this.statusBox = this.add.container(GAME_W / 2, 580, [this.statusG, this.statusText]).setAlpha(0);

    // toast pill (top-center announcements)
    this.toastG = this.add.graphics();
    this.toastText = this.add.text(0, 0, "", {
      fontFamily: UI.hudFont, fontSize: "28px", fontStyle: "bold", color: "#ffffff"
    }).setOrigin(0.5).setLetterSpacing(1);
    this.toastBox = this.add.container(GAME_W / 2, 170, [this.toastG, this.toastText]).setAlpha(0);

    this.add.text(24, GAME_H - 30, (this.race.trackDef.name + (GameState.demo ? "  ·  DEMO" : "")).toUpperCase(), {
      fontFamily: UI.hudFont, fontSize: "12px", fontStyle: "bold", color: "#8a93b8"
    }).setLetterSpacing(2);

    // signature moves: energy bar + the two equipped slots (Z / X)
    this.dynG = this.add.graphics();
    this.moveNameTexts = [];
    this.moveCostTexts = [];
    this.moveKeyTexts = [];
    this.moveReadyWas = [false, false];
    const slots = this.race.player.equippedMoves;
    for (let i = 0; i < slots.length; i++) {
      this.moveKeyTexts.push(this.add.text(0, 0, "", {
        fontFamily: UI.hudFont, fontSize: "12px", fontStyle: "bold", color: "#0b0e1f"
      }).setOrigin(0.5));
      this.moveNameTexts.push(this.add.text(0, 0, "", {
        fontFamily: UI.hudFont, fontSize: "13px", fontStyle: "bold", color: "#ffffff"
      }).setOrigin(0, 0.5).setLetterSpacing(0.5));
      this.moveCostTexts.push(this.add.text(0, 0, "", {
        fontFamily: UI.monoFont, fontSize: "11px", fontStyle: "bold", color: "#9aa3c7"
      }).setOrigin(1, 0.5));
    }
    this.energyText = slots.length
      ? this.add.text(0, 0, "", {
          fontFamily: UI.monoFont, fontSize: "11px", fontStyle: "bold", color: "#9fb6d8"
        }).setOrigin(0, 0.5)
      : null;

    this.debugText = null;
    if (Save.cheats.overlay) {
      const bg = this.add.graphics();
      glass(bg, 18, battle ? 152 : 122, 260, 192, 8);
      this.debugText = this.add.text(28, (battle ? 152 : 122) + 8, "", {
        fontFamily: UI.monoFont, fontSize: "12px", color: "#9af89a", lineSpacing: 4
      });
    }

    this.buildMinimap();
  }

  private buildMinimap() {
    const geom = this.race.geom;
    const size = 158;
    const pad = 14;
    const ox = GAME_W - size - 26, oy = GAME_H - size - 30;

    const w = geom.maxX - geom.minX;
    const h = geom.maxY - geom.minY;
    const k = Math.min((size - pad * 2) / w, (size - pad * 2) / h);
    const cx = ox + size / 2 - (w * k) / 2, cy = oy + size / 2 - (h * k) / 2;
    this.toMini = (x: number, y: number) => ({
      x: cx + (x - geom.minX) * k,
      y: cy + (y - geom.minY) * k
    });

    const g = this.add.graphics();
    glass(g, ox - 8, oy - 8, size + 16, size + 16, 16);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < geom.xs.length; i += 8) {
      pts.push(this.toMini(geom.xs[i], geom.ys[i]));
    }
    g.lineStyle(7, 0x2a3158, 1).strokePoints(pts, true, true);
    g.lineStyle(2.5, 0x9aa8e8, 1).strokePoints(pts, true, true);
    const start = this.toMini(geom.xs[0], geom.ys[0]);
    g.fillStyle(0xffffff, 1).fillCircle(start.x, start.y, 3.5);

    if (this.race.ghostPlay) {
      this.ghostDot = this.add.circle(0, 0, 4, 0x9ad7ff, 0.85);
    }
    for (const r of this.race.racers) {
      const color = r.isPlayer ? 0xffd23a : 0xff5a6a;
      const dot = this.add.circle(0, 0, r.isPlayer ? 5.5 : 4, color);
      if (r.isPlayer) dot.setStrokeStyle(2, 0xffffff);
      this.dots.push(dot);
    }
  }

  toast(text: string, color = "#ffffff") {
    // the scene object outlives scene stops — don't write to destroyed text
    if (!this.scene.isActive() || !this.toastBox?.scene) return;
    this.toastText.setText(text).setColor(color);
    const w = this.toastText.width + 44, h = this.toastText.height + 16;
    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    this.toastG.clear();
    this.toastG.fillStyle(0x0b0e1f, 0.72).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.toastG.lineStyle(1.5, tint, 0.55).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.toastBox.setAlpha(1).setScale(0.7);
    this.tweens.killTweensOf(this.toastBox);
    this.tweens.add({ targets: this.toastBox, scale: 1, duration: 140, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.toastBox, alpha: 0, delay: 1300, duration: 400 });
  }

  update(_: number, deltaMs: number) {
    const race = this.race;
    if (!race || !race.player) return;
    const p = race.player;
    const dt = deltaMs / 1000;

    // position + lap (battle: balloons + countdown instead)
    if (GameState.mode === "tt") {
      this.posText.setText("TT").setColor("#8ecdff");
      this.posSufText.setText("");
    } else {
      const col = POS_COLORS[p.rank - 1] ?? "#8ecdff";
      this.posText.setText(`${p.rank}`).setColor(col);
      this.posSufText.setText(ordinal(p.rank).slice(-2).toUpperCase()).setColor(col)
        .setPosition(this.posText.x + this.posText.width + 3, 32);
    }
    if (race.isBattle) {
      this.lapText.setText("");
      const t = Math.ceil(race.battleTimer);
      this.timeText.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`)
        .setColor(t <= 30 ? "#ff8a8a" : "#f4f6ff");
      for (let i = 0; i < this.balloonPips.length; i++) {
        this.balloonPips[i].setFillStyle(i < p.balloons ? 0xff5a6a : 0x10142e);
        this.balloonPips[i].setAlpha(i < p.balloons ? 1 : 0.45);
      }
      const alive = race.racers.filter((r) => !r.eliminated).length;
      this.aliveText?.setText(p.eliminated ? "ELIMINATED" : `${alive} OF ${race.racers.length} LEFT`);
    } else {
      this.lapText.setText(`LAP ${race.director.lapOf(p)} / ${race.trackDef.laps}`);
      this.timeText.setText(fmtTime(p.finished ? p.finishTimeMs : race.raceTime));
    }
    if (GameState.mode === "tt") {
      const best = Save.bestTime(race.trackDef.id);
      this.bestText.setText(isFinite(best) ? `BEST ${fmtTime(best)}` : "NO RECORD YET — SET ONE!");
    }

    // item slot / roulette
    if (p.rouletteT > 0) {
      this.rouletteAcc += dt;
      this.rouletteWas = true;
      const idx = Math.floor(this.rouletteAcc / 0.07) % ITEM_LIST.length;
      this.itemIcon.setVisible(true).setTexture(`ic-${ITEM_LIST[idx]}`).setAlpha(0.8);
      this.itemLabel.setText("???");
    } else if (p.item) {
      if (this.rouletteWas) {
        // the roll just landed — punch the slot
        this.rouletteWas = false;
        this.itemIcon.setScale(3.2);
        this.tweens.add({ targets: this.itemIcon, scale: 2, duration: 200, ease: "Back.Out" });
      }
      this.itemIcon.setVisible(true).setTexture(`ic-${p.item}`).setAlpha(1);
      this.itemLabel.setText(p.item.toUpperCase());
    } else {
      this.rouletteWas = false;
      this.itemIcon.setVisible(false);
      this.itemLabel.setText(GameState.mode === "tt" ? "SHIFT: AGILITY" : "");
    }

    // candy pips
    for (let i = 0; i < 2; i++) {
      this.candyPips[i].setFillStyle(i < p.candies ? 0x58c8f0 : 0x10142e);
    }
    for (let i = 0; i < this.chargeIcons.length; i++) {
      this.chargeIcons[i].setAlpha(i < p.agilityCharges ? 1 : 0.18);
    }

    // countdown
    const t = race.countdownT;
    if (!race.raceStarted) {
      const n = t > 2.2 ? (t > 3.2 ? "" : "3") : t > 1.2 ? "2" : "1";
      this.countText.setText(n).setColor("#ffd23a");
    } else if (this.goShownT < 0.9) {
      this.goShownT += dt;
      this.countText.setText("GO!").setColor("#9ad05a");
      this.countText.setAlpha(1 - this.goShownT / 0.9);
    } else {
      this.countText.setText("");
      this.countText.setAlpha(1);
    }

    // status pill flash
    let status = "";
    if (p.status.freeze > 0) status = "FROZEN!";
    else if (p.status.sleep > 0) status = "ASLEEP!";
    else if (p.status.squash > 0) status = "SQUASHED!";
    else if (p.status.confuse > 0) status = "CONFUSED! (REVERSED)";
    else if (p.status.paralysis > 0) status = "PARALYZED!";
    else if (p.status.burn > 0) status = "BURNED!";
    else if (p.status.poison > 0) status = "POISONED!";
    else if (p.status.leech > 0) status = "SEEDED!";
    else if (p.status.drowsy > 0) status = "DROWSY...";
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.statusText.setText(status);
      this.statusG.clear();
      if (status) {
        const w = this.statusText.width + 40, h = this.statusText.height + 14;
        this.statusG.fillStyle(0x1c0b12, 0.7).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        this.statusG.lineStyle(1.5, 0xff6a7a, 0.6).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      }
    }
    this.statusBox.setAlpha(status ? (Math.sin(Date.now() / 90) > 0 ? 1 : 0.45) : 0);

    this.drawDynamic(dt);

    // debug overlay (cheats)
    if (this.debugText) {
      const fps = Math.round(this.game.loop.actualFps);
      const perf = race.perfStats;
      const view = race.view.stats();
      this.debugText.setText([
        `fps   ${fps}`,
        `ms    ${perf.frameMs.toFixed(1)}`,
        `sim   ${perf.simMs.toFixed(1)}  ren ${perf.renderMs.toFixed(1)}`,
        `draw  ${view.calls}  tri ${Math.round(view.triangles / 1000)}k`,
        `obj   ${view.bills}  rig ${view.rigs}  p ${view.particles}`,
        `spd   ${Math.round(p.speed)} / ${Math.round(p.stats.topSpeed)}`,
        `s     ${p.proj.s.toFixed(3)}  d ${Math.round(p.proj.d)}`,
        `surf  ${p.surface}${p.airT > 0 ? " (air)" : ""}`,
        `boost ${Math.max(0, p.boostT).toFixed(2)}  mult ${p.speedMult.toFixed(2)}`,
        `drift t${p.driftTier} ${p.driftCharge.toFixed(2)}  chain ${p.driftChain}`,
        `rank  ${p.rank}  candies ${p.candies}  stacks ${p.powerStacks}`
      ].join("\n"));
    }

    // minimap dots
    race.racers.forEach((r, i) => {
      const m = this.toMini(r.x, r.y);
      this.dots[i]?.setPosition(m.x, m.y).setVisible(!r.eliminated);
    });
    if (this.ghostDot && race.ghostPlay) {
      const m = this.toMini(race.ghostPlay.wx, race.ghostPlay.wy);
      this.ghostDot.setPosition(m.x, m.y);
    }
  }

  /** Per-frame chrome: energy bar, move chips, speed bar, item-card glow. */
  private drawDynamic(dt: number) {
    const g = this.dynG;
    if (!g) return;
    g.clear();
    const p = this.race.player;

    // ---- item card accent: lights up while an item is held / rolling ----
    if (p.item || p.rouletteT > 0) {
      const pulse = p.rouletteT > 0 ? 0.4 + Math.sin(Date.now() / 60) * 0.25 : 0.9;
      g.lineStyle(2, 0xffd23a, pulse).strokeRoundedRect(GAME_W - 116, 16, 96, 96, 16);
    }

    // ---- speed bar (bottom-center): how close to flat-out you are ----
    const boosting = p.boostT > 0;
    const spdFrac = clamp(p.speed / (p.stats.topSpeed * 1.12), 0, 1);
    const sw = 260, sh = 8, sx = GAME_W / 2 - sw / 2, sy = GAME_H - 34;
    g.fillStyle(0x0b0e1f, 0.5).fillRoundedRect(sx - 4, sy - 4, sw + 8, sh + 8, (sh + 8) / 2);
    g.fillStyle(0x141a36, 1).fillRoundedRect(sx, sy, sw, sh, sh / 2);
    if (spdFrac > 0.02) {
      if (boosting) g.fillGradientStyle(0xffb054, 0xffe066, 0xffb054, 0xffe066, 1);
      else g.fillGradientStyle(0x3a6df0, 0x58c8f0, 0x3a6df0, 0x58c8f0, 1);
      g.fillRoundedRect(sx, sy, Math.max(sh, sw * spdFrac), sh, sh / 2);
    }
    if (boosting) {
      g.lineStyle(2, 0xffe066, 0.5 + Math.sin(Date.now() / 50) * 0.3)
        .strokeRoundedRect(sx - 4, sy - 4, sw + 8, sh + 8, (sh + 8) / 2);
    }

    // ---- drift charge meter (just above the speed bar) ----
    if (p.driftTier > this.driftTierWas) this.driftFlashT = 0.3;
    this.driftTierWas = p.drifting ? p.driftTier : 0;
    this.driftFlashT = Math.max(0, this.driftFlashT - dt);
    if (p.drifting || this.driftFlashT > 0) {
      const maxC = DRIFT_TIERS[2];
      const cfrac = clamp(p.driftCharge / maxC, 0, 1);
      const tierCol = p.driftTier > 0 ? DRIFT_COLORS[p.driftTier - 1] : 0x8ecdff;
      const dw = 220, dh = 7, dx = GAME_W / 2 - dw / 2, dy = sy - 16;
      g.fillStyle(0x0b0e1f, 0.5).fillRoundedRect(dx - 4, dy - 4, dw + 8, dh + 8, (dh + 8) / 2);
      g.fillStyle(0x141a36, 1).fillRoundedRect(dx, dy, dw, dh, dh / 2);
      if (cfrac > 0.02) {
        g.fillStyle(tierCol, 1).fillRoundedRect(dx, dy, Math.max(dh, dw * cfrac), dh, dh / 2);
      }
      // tier boundary ticks
      g.fillStyle(0xffffff, 0.35);
      for (let i = 0; i < 2; i++) {
        g.fillRect(dx + dw * (DRIFT_TIERS[i] / maxC) - 1, dy, 2, dh);
      }
      // pulse on tier-up; steady shimmer once maxed
      const flash = this.driftFlashT > 0 ? this.driftFlashT / 0.3 : 0;
      if (flash > 0 || p.driftTier >= 3) {
        const a = p.driftTier >= 3 ? 0.4 + Math.sin(Date.now() / 60) * 0.3 : flash * 0.85;
        g.lineStyle(2, tierCol, a).strokeRoundedRect(dx - 4, dy - 4, dw + 8, dh + 8, (dh + 8) / 2);
      }
    }

    // ---- signature moves: energy bar + the equipped Z / X chips ----
    const slots = p.equippedMoves;
    if (!slots.length) return;

    const x0 = 26, w = 240, barH = 10;
    const barY = GAME_H - 58;

    glass(g, x0 - 6, barY - 5, w + 12, barH + 10, 10);
    g.fillStyle(0x141a36, 1).fillRoundedRect(x0, barY, w, barH, barH / 2);
    const frac = clamp(p.energy / 100, 0, 1);
    if (frac > 0.02) {
      if (frac >= 0.999) g.fillGradientStyle(0x58e8c8, 0x8af0c8, 0x58e8c8, 0x8af0c8, 1);
      else g.fillGradientStyle(0x3a8df0, 0x58c8f0, 0x3a8df0, 0x58c8f0, 1);
      g.fillRoundedRect(x0, barY, Math.max(barH, w * frac), barH, barH / 2);
    }
    if (frac >= 0.999) {
      g.lineStyle(2, 0x8af0c8, 0.45 + Math.sin(Date.now() / 90) * 0.25)
        .strokeRoundedRect(x0 - 6, barY - 5, w + 12, barH + 10, 10);
    }
    for (const id of slots) {
      const m = MOVES[id];
      if (!m) continue;
      g.fillStyle(0xffffff, 0.35).fillRect(x0 + w * (m.cost / 100) - 1, barY, 2, barH);
    }
    this.energyText?.setPosition(x0 + w + 12, barY + barH / 2).setText(`${Math.floor(p.energy)}`);

    // chips
    const keys = ["Z", "X"];
    const chipW = 252, chipH = 28;
    for (let i = 0; i < slots.length; i++) {
      const m = MOVES[slots[i]];
      if (!m) continue;
      const cy = barY - 28 - (slots.length - 1 - i) * 34;
      const ready = p.energy >= m.cost && p.moveCdT <= 0;
      const tcol = TYPE_COLORS[m.type] ?? 0xffffff;

      g.fillStyle(0x0b0e1f, ready ? 0.62 : 0.4).fillRoundedRect(x0 - 6, cy - chipH / 2, chipW, chipH, 9);
      g.lineStyle(1.5, 0xffffff, ready ? 0.1 : 0.05).strokeRoundedRect(x0 - 6, cy - chipH / 2, chipW, chipH, 9);
      // type-color accent bar on the left edge
      g.fillStyle(tcol, ready ? 1 : 0.35).fillRoundedRect(x0 - 6, cy - chipH / 2 + 5, 4, chipH - 10, 2);
      // key cap
      g.fillStyle(ready ? 0xffd23a : 0x2a3158, 1).fillRoundedRect(x0 + 4, cy - 10, 20, 20, 6);

      this.moveKeyTexts[i]?.setPosition(x0 + 14, cy).setText(keys[i])
        .setColor(ready ? "#0b0e1f" : "#9aa3c7");
      this.moveNameTexts[i]?.setPosition(x0 + 32, cy)
        .setText(m.name.toUpperCase())
        .setAlpha(ready ? 1 : 0.55)
        .setColor(ready ? "#ffffff" : "#aab3d7");
      this.moveCostTexts[i]?.setPosition(x0 - 6 + chipW - 10, cy)
        .setText(`${m.cost}`)
        .setAlpha(ready ? 0.9 : 0.45)
        .setColor(ready ? "#9fb6d8" : "#9aa3c7");

      if (ready && !this.moveReadyWas[i]) {
        const txt = this.moveNameTexts[i];
        if (txt) {
          txt.setScale(1.3);
          this.tweens.add({ targets: txt, scale: 1, duration: 220, ease: "Back.Out" });
        }
      }
      this.moveReadyWas[i] = ready;
    }
  }
}
