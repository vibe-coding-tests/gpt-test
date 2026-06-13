import Phaser from "phaser";
import { GameState, startGp, startTimeTrial, startBattle } from "../state/GameState";
import { CUPS } from "../data/cups";
import { ALL_IDS } from "../data/pokemonData";
import { TRACKS } from "../data/trackData";
import { startRaceLoad } from "../systems/RaceTransition";

/** Generates all the small shared textures, then routes by URL params. */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create() {
    this.makeTextures();

    const q = new URLSearchParams(location.search);
    if (q.has("battle")) {
      // battle test mode: ?battle=12 (arena id) or ?battle=0..2 (arena index)
      let id = parseInt(q.get("battle") ?? "12", 10) || 12;
      if (id < 12) id += 12;
      id = Math.min(TRACKS.length - 1, Math.max(12, id));
      const demo = q.has("demo");
      const species = demo ? ALL_IDS[Math.floor(Math.random() * ALL_IDS.length)] : 25;
      startBattle(id, species);
      GameState.demo = demo;
      startRaceLoad(this);
      return;
    }
    if (q.has("demo")) {
      // attract/test mode: AI drives the player through a full race
      const trackId = Math.min(TRACKS.length - 1, Math.max(0, parseInt(q.get("track") ?? "0", 10) || 0));
      GameState.demo = true;
      const species = ALL_IDS[Math.floor(Math.random() * ALL_IDS.length)];
      if (TRACKS[trackId].arena) {
        startBattle(trackId, species);
        GameState.demo = true;
        startRaceLoad(this);
        return;
      }
      const cupId = CUPS.findIndex((c) => c.trackIds.includes(trackId));
      startGp(Math.max(0, cupId), species);
      GameState.demo = true;
      GameState.gp!.raceIndex = CUPS[Math.max(0, cupId)].trackIds.indexOf(trackId);
      GameState.trackId = trackId;
      startRaceLoad(this);
      return;
    }
    if (q.has("race")) {
      const trackId = Math.min(11, Math.max(0, parseInt(q.get("race") ?? "0", 10) || 0));
      const cupId = Math.max(0, CUPS.findIndex((c) => c.trackIds.includes(trackId)));
      startGp(cupId, 25);
      GameState.gp!.raceIndex = CUPS[cupId].trackIds.indexOf(trackId);
      GameState.trackId = trackId;
      startRaceLoad(this);
      return;
    }
    if (q.has("tt")) {
      startTimeTrial(Math.min(11, Math.max(0, parseInt(q.get("tt") ?? "0", 10) || 0)), 25);
      startRaceLoad(this);
      return;
    }
    this.scene.start("Title");
  }

  private makeTextures() {
    const g = this.add.graphics();

    // white pixel
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4);
    g.generateTexture("fx-px", 4, 4);
    g.clear();

    // ring
    g.lineStyle(6, 0xffffff, 1).strokeCircle(32, 32, 26);
    g.generateTexture("fx-ring", 64, 64);
    g.clear();

    // shadow
    g.fillStyle(0x000000, 1).fillEllipse(32, 20, 56, 30);
    g.generateTexture("fx-shadow", 64, 40);
    g.clear();

    // spark diamond
    g.fillStyle(0xffffff, 1);
    g.fillPoints([{ x: 8, y: 0 }, { x: 16, y: 8 }, { x: 8, y: 16 }, { x: 0, y: 8 }], true);
    g.generateTexture("fx-spark", 16, 16);
    g.clear();

    // item box
    g.fillStyle(0x2a86d8, 0.95).fillRoundedRect(2, 2, 36, 36, 9);
    g.lineStyle(3, 0xbfe8ff, 1).strokeRoundedRect(2, 2, 36, 36, 9);
    this.drawPokeball(g, 20, 20, 10);
    g.generateTexture("fx-box", 40, 40);
    g.clear();

    // rare candy
    g.fillStyle(0xf8a8d0, 1);
    g.fillTriangle(2, 12, 8, 6, 8, 18);
    g.fillTriangle(22, 12, 16, 6, 16, 18);
    g.fillStyle(0x6ac8f8, 1).fillCircle(12, 12, 8);
    g.lineStyle(2, 0xffffff, 0.9);
    g.beginPath();
    g.arc(12, 12, 4.5, -0.5, 2.4);
    g.strokePath();
    g.generateTexture("fx-candy", 24, 24);
    g.clear();

    // substitute doll
    g.fillStyle(0x9bbf6a, 1);
    g.fillTriangle(7, 6, 12, 1, 14, 8);
    g.fillTriangle(23, 6, 18, 1, 16, 8);
    g.fillCircle(15, 10, 8);
    g.fillEllipse(15, 22, 16, 14);
    g.fillStyle(0x6a8a44, 1).fillEllipse(15, 24, 10, 7);
    g.fillStyle(0x222222, 1).fillCircle(12, 9, 1.6).fillCircle(18, 9, 1.6);
    g.generateTexture("fx-doll", 30, 30);
    g.clear();

    // cloud (white, tinted at use)
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(32, 36, 17);
    g.fillCircle(19, 38, 12);
    g.fillCircle(45, 38, 12);
    g.fillCircle(26, 28, 12);
    g.fillCircle(40, 29, 11);
    g.generateTexture("fx-cloud", 64, 64);
    g.clear();

    // dirt mound
    g.fillStyle(0x5a4026, 1).fillEllipse(16, 13, 30, 13);
    g.fillStyle(0x7a5a36, 1).fillEllipse(16, 11, 24, 9);
    g.generateTexture("fx-mound", 32, 20);
    g.clear();

    // pokeball UI
    this.drawPokeball(g, 12, 12, 10);
    g.generateTexture("ui-pokeball", 24, 24);
    g.clear();

    // trophy (white for tinting)
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(6, 4, 20, 14, { tl: 4, tr: 4, bl: 8, br: 8 });
    g.fillRect(13, 17, 6, 6);
    g.fillRect(8, 23, 16, 4);
    g.lineStyle(3, 0xffffff, 1);
    g.beginPath(); g.arc(6, 9, 5, Math.PI * 0.5, Math.PI * 1.5); g.strokePath();
    g.beginPath(); g.arc(26, 9, 5, Math.PI * 1.5, Math.PI * 0.5); g.strokePath();
    g.generateTexture("ui-trophy", 32, 28);
    g.clear();

    // item icons (26x26)
    g.fillStyle(0xf8d030, 1);
    g.fillPoints([
      { x: 15, y: 1 }, { x: 7, y: 12 }, { x: 12, y: 13 }, { x: 8, y: 25 },
      { x: 19, y: 11 }, { x: 14, y: 10 }, { x: 18, y: 1 }
    ], true);
    g.generateTexture("ic-thunderbolt", 26, 26);
    g.clear();

    g.fillStyle(0x9bbf6a, 1);
    g.fillTriangle(6, 6, 10, 1, 12, 7);
    g.fillTriangle(20, 6, 16, 1, 14, 7);
    g.fillCircle(13, 9, 6);
    g.fillEllipse(13, 19, 13, 11);
    g.fillStyle(0x222222, 1).fillCircle(11, 8, 1.3).fillCircle(15, 8, 1.3);
    g.generateTexture("ic-substitute", 26, 26);
    g.clear();

    g.fillStyle(0x58c8f0, 1);
    for (let i = 0; i < 3; i++) {
      const x = 4 + i * 6;
      g.fillTriangle(x, 5, x, 21, x + 7, 13);
    }
    g.generateTexture("ic-agility", 26, 26);
    g.clear();

    g.fillStyle(0x9ad05a, 0.95);
    g.fillCircle(13, 15, 8);
    g.fillCircle(7, 17, 5);
    g.fillCircle(19, 17, 5);
    g.fillStyle(0x4a7a2a, 1);
    g.fillCircle(9, 8, 2).fillCircle(16, 5, 2).fillCircle(20, 9, 2);
    g.generateTexture("ic-sleeppowder", 26, 26);
    g.clear();

    g.lineStyle(4, 0x58e8c8, 1).strokeCircle(13, 13, 9);
    g.lineStyle(2, 0xb0fff0, 1).strokeCircle(13, 13, 5);
    g.generateTexture("ic-protect", 26, 26);
    g.clear();

    g.lineStyle(4, 0xc878f0, 1);
    g.beginPath(); g.arc(13, 13, 10, 0, Math.PI * 1.4); g.strokePath();
    g.lineStyle(3, 0xe0b0ff, 1);
    g.beginPath(); g.arc(13, 13, 5.5, Math.PI, Math.PI * 2.5); g.strokePath();
    g.fillStyle(0xffffff, 1).fillCircle(13, 13, 2);
    g.generateTexture("ic-teleport", 26, 26);
    g.clear();

    // ember: fireball with a flame lick
    g.fillStyle(0xff7a30, 1).fillCircle(13, 15, 8);
    g.fillTriangle(8, 10, 13, 1, 16, 9);
    g.fillStyle(0xffc93a, 1).fillCircle(13, 15, 4.6);
    g.fillStyle(0xfff0b0, 1).fillCircle(13, 15, 2);
    g.generateTexture("ic-ember", 26, 26);
    g.clear();

    // hydro pump: water droplet
    g.fillStyle(0x4aa8f0, 1);
    g.fillTriangle(13, 1, 6, 14, 20, 14);
    g.fillCircle(13, 17, 7.5);
    g.fillStyle(0xbfe4ff, 1).fillCircle(10.5, 16, 2.4);
    g.generateTexture("ic-hydropump", 26, 26);
    g.clear();

    // razor leaf
    g.fillStyle(0x7ac74c, 1).fillTriangle(3, 21, 22, 3, 15, 23);
    g.lineStyle(2, 0x3a7a2c, 1).lineBetween(6, 19, 20, 6);
    g.generateTexture("ic-razorleaf", 26, 26);
    g.clear();

    // rollout: cratered boulder
    g.fillStyle(0xa89878, 1).fillCircle(13, 13, 11);
    g.fillStyle(0xc8b898, 1).fillCircle(10, 10, 7);
    g.fillStyle(0x786850, 0.9).fillCircle(17, 15, 3).fillCircle(9, 17, 2.2).fillCircle(15, 7, 1.8);
    g.generateTexture("ic-rollout", 26, 26);
    g.clear();

    // ice beam: crystal snowflake
    g.lineStyle(3, 0x8ad8f0, 1);
    g.lineBetween(13, 2, 13, 24);
    g.lineBetween(3, 7.5, 23, 18.5);
    g.lineBetween(3, 18.5, 23, 7.5);
    g.fillStyle(0xd8f4ff, 1).fillCircle(13, 13, 4);
    g.generateTexture("ic-icebeam", 26, 26);
    g.clear();

    // toxic: bubbling purple droplet
    g.fillStyle(0xb05ae8, 1);
    g.fillTriangle(13, 1, 6, 14, 20, 14);
    g.fillCircle(13, 16, 8);
    g.fillStyle(0x7a2ab8, 1).fillCircle(10, 16, 2.4).fillCircle(16, 13, 1.8).fillCircle(15, 19, 1.5);
    g.generateTexture("ic-toxic", 26, 26);
    g.clear();

    // hyper beam: starburst blast
    g.fillStyle(0xffa050, 1);
    g.fillRect(1, 10, 24, 6);
    g.fillStyle(0xffd8a0, 1).fillRect(1, 12, 24, 2);
    g.fillStyle(0xffffff, 1).fillCircle(20, 13, 4);
    g.fillStyle(0xffa050, 1);
    g.fillTriangle(20, 4, 17, 10, 23, 10);
    g.fillTriangle(20, 22, 17, 16, 23, 16);
    g.generateTexture("ic-hyperbeam", 26, 26);
    g.clear();

    // leech seed: sprouting seed
    g.fillStyle(0x8a6a3a, 1).fillEllipse(13, 17, 14, 11);
    g.fillStyle(0xa8884a, 1).fillEllipse(11, 15, 7, 5);
    g.lineStyle(2.5, 0x5aa83c, 1);
    g.beginPath(); g.arc(16, 8, 5, Math.PI * 0.5, Math.PI * 1.4); g.strokePath();
    g.fillStyle(0x8ac84c, 1).fillEllipse(18, 5, 8, 4);
    g.generateTexture("ic-leechseed", 26, 26);
    g.clear();

    // projectile sprites
    g.fillStyle(0xff7a30, 1).fillCircle(11, 11, 9);
    g.fillStyle(0xffc93a, 1).fillCircle(11, 11, 5.5);
    g.fillStyle(0xfff0b0, 1).fillCircle(11, 11, 2.5);
    g.generateTexture("fx-fire", 22, 22);
    g.clear();

    g.fillStyle(0x4aa8f0, 0.96).fillEllipse(13, 11, 22, 14);
    g.fillStyle(0x9ad0ff, 0.9).fillEllipse(9, 8.5, 8, 5);
    g.generateTexture("fx-drop", 26, 22);
    g.clear();

    g.lineStyle(3, 0x1d4a16, 1).strokeTriangle(2, 16, 17, 2, 11, 17);
    g.fillStyle(0x9ae85c, 1).fillTriangle(2, 16, 17, 2, 11, 17);
    g.lineStyle(1.5, 0x2d6a24, 1).lineBetween(4, 14, 15, 4);
    g.generateTexture("fx-leaf", 20, 20);
    g.clear();

    // rolling boulder
    g.fillStyle(0x8a7a60, 1).fillCircle(14, 14, 13);
    g.fillStyle(0xb0a080, 1).fillCircle(11, 11, 8);
    g.fillStyle(0x5a4e3c, 0.95).fillCircle(19, 16, 3.6).fillCircle(9, 19, 2.6).fillCircle(17, 7, 2.2);
    g.lineStyle(2, 0x4a4034, 0.9).strokeCircle(14, 14, 13);
    g.generateTexture("fx-boulder", 28, 28);
    g.clear();

    // ice shard
    g.fillStyle(0xbfe8ff, 1);
    g.fillPoints([{ x: 12, y: 0 }, { x: 20, y: 11 }, { x: 12, y: 22 }, { x: 4, y: 11 }], true);
    g.fillStyle(0xffffff, 0.9);
    g.fillPoints([{ x: 12, y: 4 }, { x: 16, y: 11 }, { x: 12, y: 18 }, { x: 8, y: 11 }], true);
    g.generateTexture("fx-shard", 24, 24);
    g.clear();

    // leech seed pod
    g.fillStyle(0x8a6a3a, 1).fillEllipse(10, 11, 13, 10);
    g.fillStyle(0xa8884a, 1).fillEllipse(8, 9, 6, 4);
    g.fillStyle(0x8ac84c, 1).fillEllipse(14, 4, 8, 5);
    g.generateTexture("fx-seed", 20, 18);
    g.clear();

    g.destroy();

    // radial glow (canvas gradient)
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.textures.addCanvas("fx-glow", c);
  }

  private drawPokeball(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
    g.fillStyle(0xffffff, 1).fillCircle(x, y, r);
    g.fillStyle(0xee1515, 1).slice(x, y, r, Math.PI, Math.PI * 2, false).fillPath();
    g.fillStyle(0x222222, 1).fillRect(x - r, y - 1.5, r * 2, 3);
    g.fillStyle(0xffffff, 1).fillCircle(x, y, r * 0.32);
    g.lineStyle(1.5, 0x222222, 1).strokeCircle(x, y, r * 0.32);
    g.lineStyle(1.5, 0x222222, 1).strokeCircle(x, y, r);
  }
}
