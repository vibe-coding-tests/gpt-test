import Phaser from "phaser";
import { getTrack } from "../data/trackData";
import type { TrackDef, StandingRow } from "../types";
import { TrackGeometry } from "../systems/TrackGeometry";
import { buildTrackWorld } from "../systems/TrackRenderer";
import { Racer, DRIFT_COLORS } from "../race/Racer";
import { AIDriver } from "../race/AIDriver";
import { BattleAI } from "../race/BattleAI";
import { ItemManager } from "../race/ItemManager";
import { MoveManager } from "../race/MoveManager";
import { MOVES, movePool } from "../data/movesData";
import { HazardManager } from "../race/HazardManager";
import { RaceDirector } from "../race/RaceDirector";
import { GhostRecorder, GhostPlayer } from "../race/Ghost";
import { GameState, gpAdvance } from "../state/GameState";
import { CUPS } from "../data/cups";
import { GP_POINTS } from "../constants";
import { Save } from "../systems/SaveSystem";
import { Audio } from "../systems/AudioSystem";
import { burst, afterimage } from "../systems/effects";
import { clamp, rotLerp, wrap01 } from "../util";
import { ThreeView, VIEW_LABELS } from "../systems/ThreeView";
import type { TrackWorld } from "../systems/TrackRenderer";
import { Scenery } from "../systems/Scenery";
import { SpeedFX } from "../systems/SpeedFX";
import { ITEMS, ITEM_LIST } from "../data/itemsData";
import type HudScene from "./HudScene";

export default class RaceScene extends Phaser.Scene {
  trackDef!: TrackDef;
  geom!: TrackGeometry;
  view!: ThreeView;
  racers: Racer[] = [];
  player!: Racer;
  aiDrivers: AIDriver[] = [];
  battleAIs: BattleAI[] = [];
  playerAuto: AIDriver | BattleAI | null = null;
  items!: ItemManager;
  moves!: MoveManager; // Racer.onLand finds this by name for slam moves
  hazards!: HazardManager;
  director!: RaceDirector;
  scenery!: Scenery;
  ghostRec: GhostRecorder | null = null;
  ghostPlay: GhostPlayer | null = null;

  countdownT = 0;
  raceStarted = false;
  raceTime = 0;
  finishLinger = 0;
  ended = false;
  finishHandled = false;
  lapShown = 1;
  holdStart = -1;
  fxAcc = 0;
  zAcc = 0;
  camRot = 0;
  isBattle = false;
  battleTimer = 0;
  private prevAlive = 0;
  private lapFloor = new Map<Racer, number>();
  private cheatItemIdx = 0;
  private prevRank = -1;
  private rankBlipCd = 0;
  private speedFX!: SpeedFX;
  private speedK = 0; // smoothed 0..1 rush factor for FOV + speed lines
  private world!: TrackWorld;

  private keys!: {
    up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key; shift: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("Race");
  }

  create() {
    this.racers = [];
    this.aiDrivers = [];
    this.battleAIs = [];
    this.playerAuto = null;
    this.ghostRec = null;
    this.ghostPlay = null;
    this.countdownT = 3.8;
    this.raceStarted = false;
    this.raceTime = 0;
    this.finishLinger = 0;
    this.ended = false;
    this.finishHandled = false;
    this.lapShown = 1;
    this.holdStart = -1;
    this.prevRank = -1;
    this.rankBlipCd = 0;
    this.isBattle = GameState.mode === "battle";
    this.battleTimer = 180;
    this.prevAlive = 0;
    this.lapFloor.clear();

    this.trackDef = getTrack(GameState.trackId);
    this.geom = new TrackGeometry(this.trackDef);
    this.cameras.main.setBackgroundColor(this.trackDef.theme.bg);
    this.world = buildTrackWorld(this, this.geom);
    this.view = new ThreeView(this, this.geom, this.trackDef.theme, this.world, Save.viewMode);
    this.scenery = new Scenery(this, this.geom, this.view);
    this.speedFX = new SpeedFX(this);
    this.speedK = 0;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      Audio.stopLoops();
      this.view.destroy();
    });

    // --- spawn racers ---
    const mode = GameState.mode;
    let rosterIds: number[];
    if (mode === "tt") {
      rosterIds = [GameState.playerSpeciesId];
    } else if (mode === "battle") {
      rosterIds = GameState.battleRoster!;
    } else {
      rosterIds = GameState.gp!.rosterIds;
    }

    // grid order: race 1 random-ish (player mid-pack), later races by standings
    let gridOrder: number[] = rosterIds.map((_, i) => i);
    if (mode === "gp") {
      const gp = GameState.gp!;
      if (gp.raceIndex > 0) {
        gridOrder = [...gridOrder].sort((a, b) => gp.points[b] - gp.points[a]);
      } else {
        gridOrder = gridOrder.slice(1);
        Phaser.Utils.Array.Shuffle(gridOrder);
        gridOrder.splice(5, 0, 0); // player starts 6th
      }
    }

    gridOrder.forEach((rosterIdx, slot) => {
      const isPlayer = rosterIdx === 0;
      const racer = new Racer(this, this.geom, rosterIds[rosterIdx], rosterIdx, isPlayer && mode !== "tt" ? true : isPlayer);
      if (this.isBattle) {
        // battle: spread everyone around the ring, facing along it
        racer.battle = true;
        racer.balloons = 3;
        const s = wrap01(slot / gridOrder.length + 0.03);
        const d = (slot % 2 === 0 ? -0.45 : 0.45) * this.geom.def.roadHalf;
        const p = this.geom.posOf(s, d);
        racer.placeAt(p.x, p.y, p.heading);
      } else {
        const grid = this.geom.startGrid(mode === "tt" ? 0 : slot);
        racer.placeAt(grid.x, grid.y, grid.heading);
      }
      this.racers.push(racer);
      if (isPlayer) this.player = racer;
    });
    this.prevAlive = this.racers.length;

    this.items = new ItemManager(this, this.geom, this.racers, mode !== "tt", this.isBattle);
    this.moves = new MoveManager(this, this.geom, this.racers, this.isBattle);
    this.hazards = new HazardManager(this, this.geom, this.racers, mode === "tt" ? 4242 : Math.floor(Math.random() * 1e9));
    this.director = new RaceDirector(this.racers, this.geom, this.trackDef.laps);

    // signature-move loadouts: player brings their saved picks, rivals run
    // their pool's first two — every Pokémon fights with its own flavor.
    // Some rivals trade their second slot for the pool's defensive move, so
    // the field shells up and counters instead of being pure offense.
    for (const r of this.racers) {
      if (r.isPlayer && !GameState.demo) {
        r.equippedMoves = Save.loadout(r.def.id);
      } else {
        const pool = movePool(r.def);
        const ids = pool.slice(0, 2).map((m) => m.id);
        const guard = pool.find((m) => m.cat === "guard" || m.cat === "stance");
        if (guard && !ids.includes(guard.id) && Math.random() < 0.4) ids[1] = guard.id;
        r.equippedMoves = ids;
      }
    }

    // brains: battle bots get the goal-driven battle brain, racers get the line-follower
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      if (this.isBattle) {
        this.battleAIs.push(new BattleAI(r, this.geom, this.items, this.racers));
        r.speedMult = 0.96; // no rubber band in battle — flat, slightly soft pace
      } else {
        this.aiDrivers.push(new AIDriver(r, this.geom));
      }
    }

    if (GameState.demo) {
      this.playerAuto = this.isBattle
        ? new BattleAI(this.player, this.geom, this.items, this.racers)
        : new AIDriver(this.player, this.geom);
      this.playerAuto.skill = 0.97;
    }

    if (mode === "tt") {
      this.player.agilityCharges = 3;
      this.ghostRec = new GhostRecorder();
      const gdata = Save.ghost(this.trackDef.id);
      if (gdata) this.ghostPlay = new GhostPlayer(this, gdata);
    }

    // --- input ---
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.UP), down: kb.addKey(K.DOWN),
      left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT),
      w: kb.addKey(K.W), a: kb.addKey(K.A), s: kb.addKey(K.S), d: kb.addKey(K.D),
      space: kb.addKey(K.SPACE), shift: kb.addKey(K.SHIFT)
    };
    // event-based (not JustDown-polled): a tap that goes down and up inside
    // one frame would otherwise be swallowed by Key.onUp clearing _justDown
    kb.on("keydown-Z", () => this.tryUseMove(0));
    kb.on("keydown-Q", () => this.tryUseMove(0));
    kb.on("keydown-X", () => this.tryUseMove(1));
    kb.on("keydown-E", () => this.tryUseMove(1));
    kb.on("keydown-P", () => this.pauseGame());
    kb.on("keydown-ESC", () => this.pauseGame());
    kb.on("keydown-M", () => Audio.toggleMute());
    kb.on("keydown-C", () => this.cycleView());
    kb.on("keydown-V", () => this.cycleCamera());
    this.bindCheatKeys(kb);

    // --- camera ---
    this.view.applyCamPreset(Save.camPreset);
    this.view.follow(this.player, 0, true);
    this.resetTopCamera();

    if (this.scene.isActive("Hud") || this.scene.isPaused("Hud")) this.scene.stop("Hud");
    this.scene.launch("Hud", { race: this });

    Audio.unlock();
    this.time.delayedCall(600, () => Audio.sfx("count"));
    this.time.delayedCall(1600, () => Audio.sfx("count"));
    this.time.delayedCall(2600, () => Audio.sfx("count"));
  }

  hud(): HudScene | null {
    return (this.scene.get("Hud") as HudScene) ?? null;
  }

  /** Cycle first-person / rotating top-down / north-up. Also used by the pause menu. */
  cycleView() {
    const mode = this.view.cycleMode();
    Save.viewMode = mode;
    this.resetTopCamera();
    this.hud()?.toast(VIEW_LABELS[mode], "#8ecdff");
  }

  /** Cycle the first-person camera rig (low / classic / high / bumper). */
  cycleCamera() {
    if (!this.view.isM7) {
      this.hud()?.toast("CAMERA RIGS ARE FIRST-PERSON ONLY (C TO SWITCH VIEW)", "#8ecdff");
      return;
    }
    const p = this.view.applyCamPreset(this.view.camPreset + 1);
    Save.camPreset = this.view.camPreset;
    this.hud()?.toast(`CAMERA: ${p.name}`, "#8ecdff");
  }

  private pauseGame() {
    if (this.ended) return;
    this.scene.launch("Pause");
    this.scene.pause();
  }

  /** In-race debug hotkeys, only bound when the DEBUG KEYS cheat is on. */
  private bindCheatKeys(kb: Phaser.Input.Keyboard.KeyboardPlugin) {
    if (!Save.cheats.debugKeys) return;
    const ok = () => !this.ended && !this.player.finished;
    kb.on("keydown-ONE", () => {
      if (!ok()) return;
      this.player.item = ITEM_LIST[this.cheatItemIdx++ % ITEM_LIST.length];
      this.player.rouletteT = 0;
      this.hud()?.toast(`CHEAT: ${ITEMS[this.player.item].name}`, "#c8d0ff");
    });
    kb.on("keydown-TWO", () => {
      if (!ok()) return;
      this.player.candies++;
      Audio.sfx("candy");
      this.hud()?.toast(`CHEAT: Rare Candy ${Math.min(this.player.candies, 2)}/2`, "#ffb8e8");
      this.player.evolveIfReady();
    });
    kb.on("keydown-THREE", () => {
      if (!ok()) return;
      this.player.candies = Math.max(this.player.candies, 2);
      this.player.evolveIfReady();
    });
    kb.on("keydown-FOUR", () => {
      if (!ok()) return;
      this.player.applyBoost(1.5, 1.6, "boost3");
      this.hud()?.toast("CHEAT: boost", "#ffd86a");
    });
    kb.on("keydown-FIVE", () => {
      if (!ok()) return;
      this.player.teleportToS(wrap01(this.player.proj.s + 0.06));
      this.hud()?.toast("CHEAT: warp ahead", "#c88aff");
    });
    kb.on("keydown-SIX", () => {
      if (!ok()) return;
      this.player.gainEnergy(100);
      this.hud()?.toast("CHEAT: full energy", "#8af0c8");
    });
  }

  // ---------------- main loop ----------------

  update(_: number, deltaMs: number) {
    const dt = clamp(deltaMs, 1, 50) / 1000;

    if (!this.raceStarted) {
      this.updateCountdown(dt);
    } else if (!this.ended) {
      this.raceTime += dt * 1000;
    }

    this.gatherPlayerInput();
    const aiCtx = {
      avoid: [...this.hazards.avoidPoints(), ...this.items.avoidPoints()],
      candies: this.hazards.candySpots(),
      raceStarted: this.raceStarted
    };
    for (const drv of this.aiDrivers) drv.update(dt, aiCtx);
    for (const brain of this.battleAIs) brain.update(dt, aiCtx);
    if (this.playerAuto) this.playerAuto.update(dt, aiCtx);

    for (const r of this.racers) {
      if (r.eliminated) continue;
      r.update(dt, this.racers, this.raceStarted, this.raceTime, this.trackDef.laps);
    }
    if (this.raceStarted) {
      for (let i = 0; i < this.racers.length; i++) {
        for (let j = i + 1; j < this.racers.length; j++) {
          Racer.collide(this.racers[i], this.racers[j], this);
        }
      }
    }

    this.items.update(dt, this.raceTime);
    if (!this.isBattle) this.items.aiUpdate(dt, this.raceStarted);
    this.moves.update(dt);
    this.moves.aiUpdate(dt, this.raceStarted);
    this.hazards.update(dt, this.raceStarted);
    this.scenery.update(dt, this.player.x, this.player.y);
    if (this.isBattle) {
      this.updateBattleRanks();
    } else {
      this.director.updateRanks();
      this.director.applyRubberBand(this.player, this.aiDrivers, dt);
    }

    // player movement audio + position-change blips
    const p = this.player;
    if (this.raceStarted && !p.finished && !p.falling) {
      const spF = clamp(p.speed / p.stats.topSpeed, 0, 1.5);
      Audio.moveLoop(dt, {
        cls: p.def.cls,
        speedFrac: spF,
        surface: p.surface,
        airborne: p.airT > 0,
        drifting: p.drifting
      });
      // continuous wind rush + skid screech, scaled by what the body is doing
      const boost = p.boostT > 0;
      const wind = clamp((spF - 0.55) / 0.55, 0, 1) ** 2 * 0.05
        + (boost ? 0.035 : 0)
        + (p.airT > 0 ? 0.025 : 0)
        + (p.draftT > 0.7 ? 0.018 : 0);
      const grounded = p.airT <= 0;
      const hardCorner = grounded && !p.drifting && p.latAbs > 95 && spF > 0.5;
      const skid = p.drifting && grounded ? 0.026 + p.driftTier * 0.007
        : hardCorner ? clamp((p.latAbs - 95) / 130, 0, 1) * 0.03 : 0;
      Audio.speedLoop({
        wind,
        windHz: 1300 + spF * 2400 + (boost ? 900 : 0),
        skid,
        skidHz: (p.surface === "ice" ? 3300 : 2300) + p.driftCharge * 220 + p.latAbs * 1.5
      });
    }
    this.rankBlipCd = Math.max(0, this.rankBlipCd - dt);
    if (!this.isBattle && this.raceStarted && this.raceTime > 2.5 && !p.finished) {
      if (this.prevRank > 0 && p.rank !== this.prevRank && this.rankBlipCd <= 0) {
        Audio.sfx(p.rank < this.prevRank ? "overtake" : "overtaken");
        this.rankBlipCd = 0.7;
      }
      this.prevRank = p.rank;
    }

    if (!this.isBattle) this.updateLapEvents();
    this.updateGhost(dt, deltaMs);
    this.updateFx(dt);
    this.updateCamera(dt);
    // speed rush: FOV stretch + screen-space speed lines, driven by how far
    // past cruising speed the player is (boosts push well beyond top speed)
    const rushTarget = clamp((p.speed / p.stats.topSpeed - 0.88) / 0.5, 0, 1)
      * (p.boostT > 0 ? 1 : 0.75);
    this.speedK += (rushTarget - this.speedK) * Math.min(1, dt * 4.5);
    this.view.setSpeed(this.speedK);
    this.speedFX.update(dt, this.view, this.speedK, p.boostT > 0);
    this.view.update(dt); // animate rigs + particles, render the 3D frame
    if (this.isBattle) this.checkBattleEnd(dt);
    else this.checkRaceEnd(dt);
  }

  // ---------------- battle mode ----------------

  /** Standings: survivors by balloons then hits scored; the fallen by KO order. */
  private updateBattleRanks() {
    const alive = this.racers.filter((r) => !r.eliminated)
      .sort((a, b) => (b.balloons - a.balloons) || (b.hitsScored - a.hitsScored));
    alive.forEach((r, i) => (r.rank = i + 1));
    for (const r of this.racers) {
      if (r.eliminated) r.rank = r.koPlace;
    }

    // KO callouts as the field thins out
    if (alive.length !== this.prevAlive) {
      this.prevAlive = alive.length;
      const fallen = this.racers.filter((r) => r.eliminated && r.koPlace === alive.length + 1)[0];
      if (fallen && !fallen.isPlayer && !this.ended) {
        this.hud()?.toast(`${fallen.def.name.toUpperCase()} IS OUT! ${alive.length} LEFT`, "#ff8a8a");
        Audio.sfx("cheer");
      }
      if (alive.length === 2) Audio.setBgmTempo(1.13); // final duel
    }
  }

  private checkBattleEnd(dt: number) {
    if (this.ended) return;
    if (this.raceStarted) this.battleTimer = Math.max(0, this.battleTimer - dt);
    const alive = this.racers.filter((r) => !r.eliminated);

    if (this.player.eliminated && !this.finishHandled) {
      this.finishHandled = true;
      Audio.sfx("losejingle");
      this.hud()?.toast(`ELIMINATED — ${["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"][this.player.koPlace]}`, "#ff8a8a");
    }
    if (alive.length === 1 && alive[0].isPlayer && !this.finishHandled) {
      this.finishHandled = true;
      Audio.sfx("victory");
      Audio.sfx("cheer");
      this.hud()?.toast("LAST POKéMON STANDING!", "#ffd23a");
    }
    if (this.battleTimer <= 0 && !this.finishHandled) {
      this.finishHandled = true;
      Audio.sfx(this.player.rank === 1 ? "victory" : "finish");
      this.hud()?.toast("TIME! MOST BALLOONS WINS", "#8ecdff");
    }

    const over = alive.length <= 1 || this.player.eliminated || this.battleTimer <= 0;
    if (over) {
      this.finishLinger += dt;
      if (this.finishLinger >= 2.4) this.finalizeBattle();
    }
  }

  private finalizeBattle() {
    this.ended = true;
    Audio.stopBgm();
    Audio.setBgmTempo(1);
    this.updateBattleRanks();

    const sorted = [...this.racers].sort((a, b) => a.rank - b.rank);
    const unlockedIds: number[] = [];
    if (!GameState.demo && this.player.rank === 1) {
      unlockedIds.push(...Save.unlockNext(1));
      unlockedIds.push(...Save.unlock([this.player.def.id]));
    }
    let newMoves: string[] = [];
    if (!GameState.demo) {
      const xpGain = this.player.rank === 1 ? 3 : this.player.rank <= 3 ? 2 : 1;
      newMoves = Save.addXp(GameState.playerSpeciesId, xpGain);
    }

    const standings: StandingRow[] = sorted.map((r) => ({
      speciesId: r.def.id,
      name: r.def.name,
      isPlayer: r.isPlayer,
      position: r.rank,
      timeMs: 0,
      points: 0,
      gpTotal: 0,
      balloons: r.eliminated ? 0 : r.balloons,
      hitsScored: r.hitsScored
    }));

    this.scene.stop("Hud");
    this.scene.start("Results", {
      mode: "battle",
      demo: GameState.demo,
      standings,
      isFinalRace: false,
      playerCupPlace: 0,
      unlockedIds,
      newMoves,
      newBest: false,
      trackId: this.trackDef.id,
      timeMs: 0,
      playerRank: this.player.rank
    });
  }

  private updateCountdown(dt: number) {
    const prev = this.countdownT;
    this.countdownT -= dt;

    // track rocket-start timing
    const throttleDown = this.keys.up.isDown || this.keys.w.isDown || !!this.playerAuto;
    if (throttleDown) {
      if (this.holdStart < 0) this.holdStart = this.countdownT;
    } else {
      this.holdStart = -1;
    }

    if (prev > 0 && this.countdownT <= 0) {
      this.raceStarted = true;
      Audio.sfx("go");
      Audio.cry(this.player.def.id, 0.7);
      Audio.playBgm(this.trackDef.musicId);

      // player rocket start
      const h = this.playerAuto ? 0.3 : this.holdStart;
      if (h >= 0 && h <= 0.5) {
        this.player.applyBoost(1.45, 1.25, "rocket");
        this.hud()?.toast("ROCKET START!", "#ffd23a");
        burst(this, this.player.x, this.player.y, { color: 0xffd23a, n: 10, spd: 130 });
      } else if (h > 0.5 && h <= 1.1) {
        this.player.applyBoost(1.2, 0.7, "boost1");
      } else if (h > 1.6) {
        Audio.sfx("wrongstart");
        this.hud()?.toast("TOO EAGER...", "#ff8a8a");
      }
      // AI rocket starts
      for (const drv of this.aiDrivers) {
        if (Math.random() < drv.skill * 0.6) drv.racer.applyBoost(1.3, 0.9);
      }
    }
  }

  private gatherPlayerInput() {
    const p = this.player;
    if (this.playerAuto) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.shift)) this.tryUseItem();
      else if (Math.random() < 0.004 && p.item) this.tryUseItem();
      if (Math.random() < 0.008) this.moves.tryUse(p, Math.random() < 0.5 ? 0 : 1);
      return;
    }
    if (p.finished) {
      p.input.throttle = 0.5;
      p.input.steer = 0;
      p.input.drift = false;
      return;
    }
    const k = this.keys;
    p.input.throttle = k.up.isDown || k.w.isDown ? 1 : 0;
    p.input.brake = k.down.isDown || k.s.isDown;
    p.input.steer = (k.left.isDown || k.a.isDown ? -1 : 0) + (k.right.isDown || k.d.isDown ? 1 : 0);
    p.input.drift = k.space.isDown;
    if (Phaser.Input.Keyboard.JustDown(k.shift)) this.tryUseItem();
  }

  private tryUseMove(slot: number) {
    const p = this.player;
    if (!this.raceStarted || p.finished || this.ended || this.playerAuto) return;
    const ok = this.moves.tryUse(p, slot);
    if (!ok && p.equippedMoves[slot]) {
      // tell the player why nothing happened instead of eating the press
      const cost = MOVES[p.equippedMoves[slot]]?.cost ?? 0;
      if (p.energy < cost) this.hud()?.toast("NOT ENOUGH ENERGY", "#8ecdff");
    }
  }

  private tryUseItem() {
    const p = this.player;
    if (!this.raceStarted || p.finished) return;
    if (GameState.mode === "tt") {
      if (p.agilityCharges > 0) {
        p.agilityCharges--;
        this.items.doAgility(p);
      }
      return;
    }
    if (p.item) this.items.use(p);
  }

  private updateLapEvents() {
    // crossing the line tops up everyone's move meter
    for (const r of this.racers) {
      const f = Math.floor(r.totalProgress + 1e-6);
      const prev = this.lapFloor.get(r) ?? 0;
      if (f !== prev) {
        this.lapFloor.set(r, f);
        if (f > prev && f > 0) r.gainEnergy(15);
      }
    }

    const lap = this.director.lapOf(this.player);
    if (lap > this.lapShown && !this.player.finished) {
      this.lapShown = lap;
      if (lap === this.trackDef.laps) {
        Audio.sfx("finallap");
        Audio.sfx("cheer");
        Audio.setBgmTempo(1.13);
        this.hud()?.toast("FINAL LAP!", "#ff8a5a");
      } else {
        Audio.sfx("lap");
        Audio.sfx("cheer");
        this.hud()?.toast(`LAP ${lap}`, "#8ecdff");
      }
    }
  }

  private updateGhost(dt: number, deltaMs: number) {
    if (this.ghostRec && !this.player.finished && this.raceStarted) {
      this.ghostRec.update(deltaMs, this.player);
    }
    if (this.ghostPlay && this.raceStarted) {
      this.ghostPlay.update(this.raceTime, dt);
    }
  }

  /** Twin dark dashes under a sliding racer, baked into the track texture. */
  private stampSkid(r: Racer) {
    const surf = r.surface;
    if (surf !== "road" && surf !== "boost" && surf !== "ice") return;
    const ice = surf === "ice";
    const va = r.speed > 1 ? Math.atan2(r.vy, r.vx) : r.heading; // marks follow travel, not nose
    const px = -Math.sin(r.heading), py = Math.cos(r.heading);
    const off = r.radius * 0.45;
    const bx = r.x - Math.cos(r.heading) * r.radius * 0.7;
    const by = r.y - Math.sin(r.heading) * r.radius * 0.7;
    const col = ice ? 0xeaf6ff : 0x12141c;
    const alpha = ice ? 0.1 : 0.13;
    this.world.stamp(bx + px * off, by + py * off, va, 11, 3, col, alpha);
    this.world.stamp(bx - px * off, by - py * off, va, 11, 3, col, alpha);
  }

  private updateFx(dt: number) {
    this.fxAcc += dt;
    if (this.fxAcc >= 0.055) {
      this.fxAcc = 0;
      for (const r of this.racers) {
        if (r.falling) continue;
        const grounded = r.airT <= 0;
        if (r.drifting && r.driftTier > 0) {
          const t = r.tailPos(1.1);
          burst(this, t.x, t.y, {
            color: DRIFT_COLORS[r.driftTier - 1], n: 2, spd: 60, size: 5, life: 260, tex: "fx-spark"
          });
          // smoke thickens with the charge tier
          burst(this, t.x, t.y, {
            color: 0xc8ccd6, n: r.driftTier, spd: 36, size: 8 + r.driftTier * 2, life: 380, tex: "fx-cloud"
          });
        } else if (r.drifting && r.speed > 100) {
          const t = r.tailPos(1.1);
          burst(this, t.x, t.y, { color: 0xdddddd, n: 1, spd: 40, size: 4, life: 200 });
        }
        // hard flat-out cornering scrubs the surface even without a drift
        const hardCorner = grounded && !r.drifting && r.latAbs > 95 && r.speed > r.stats.topSpeed * 0.5;
        if (hardCorner) {
          const t = r.tailPos(0.9);
          burst(this, t.x, t.y, { color: 0xaab0bc, n: 1, spd: 46, size: 5, life: 240 });
        }
        if (grounded && (hardCorner || (r.drifting && r.driftTier > 0))) {
          this.stampSkid(r);
        }
        if (r.boostT > 0) {
          const t = r.tailPos(1.3);
          burst(this, t.x, t.y, { color: 0xffa23a, n: 2, spd: 70, size: 6, life: 240 });
        }
        if (r.agilityFxT > 0) {
          afterimage(this, r.sprite, 0x58c8f0);
        }
        if (r.draftT > 0.7 && r.speed > 200) {
          burst(this, r.x, r.y, { color: 0xffffff, n: 1, spd: 30, size: 3, life: 160 });
        }
      }
    }
    this.zAcc += dt;
    if (this.zAcc > 0.5) {
      this.zAcc = 0;
      for (const r of this.racers) r.emitSleepZ();
    }
  }

  /** Snap the Phaser camera to a sane state for the current view mode. */
  private resetTopCamera() {
    const cam = this.cameras?.main;
    if (!cam) return;
    if (this.view.isM7) {
      cam.setScroll(0, 0);
      cam.setRotation(0);
      cam.setZoom(1);
      this.camRot = 0;
    } else {
      cam.setZoom(1.05);
      cam.centerOn(this.player.x, this.player.y);
      this.camRot = this.view.mode === "rotate" ? -(this.player.heading + Math.PI / 2) : 0;
      cam.setRotation(this.camRot);
    }
  }

  private updateCamera(dt: number) {
    const cam = this.cameras?.main;
    if (!cam) return;
    const p = this.player;

    if (this.view.isM7) {
      this.view.follow(p, dt);
      cam.setScroll(0, 0);
      cam.setRotation(0);
      cam.setZoom(1);
      return;
    }

    const speedFrac = p.speed / p.stats.topSpeed;
    const ahead = Math.min(80, p.speed * 0.16);
    cam.centerOn(p.x + Math.cos(p.heading) * ahead, p.y + Math.sin(p.heading) * ahead);
    const targetRot = this.view.mode === "rotate" ? -(p.heading + Math.PI / 2) : 0;
    this.camRot = rotLerp(this.camRot, targetRot, dt * 4.2);
    cam.setRotation(this.camRot);
    const targetZoom = 1.08 - clamp(speedFrac, 0, 1.3) * 0.13;
    cam.setZoom(cam.zoom + (targetZoom - cam.zoom) * dt * 3);
  }

  private checkRaceEnd(dt: number) {
    if (this.ended) return;
    const p = this.player;

    if (p.finished && !this.finishHandled) {
      this.finishHandled = true;
      // hand the finished player to autopilot for the cool-down lap
      if (!this.playerAuto) {
        this.playerAuto = new AIDriver(p, this.geom);
        this.playerAuto.skill = 0.9;
      }
      Audio.sfx("finish");
      Audio.sfx("cheer");
      this.hud()?.toast(`FINISH! ${["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"][p.rank]}`, "#ffd23a");
    }

    if (p.finished) {
      this.finishLinger += dt;
      const wait = GameState.mode === "tt" ? 1.2 : 4.5;
      if (this.director.allFinished() || this.finishLinger >= wait) {
        this.finalize();
      }
    }
  }

  private finalize() {
    this.ended = true;
    this.director.forceFinish(this.raceTime);
    Audio.stopBgm();
    Audio.setBgmTempo(1);

    const mode = GameState.mode;
    const sorted = [...this.racers].sort((a, b) => a.rank - b.rank);
    const unlockedIds: number[] = [];
    let newBest = false;

    if (mode === "tt") {
      const ghost = this.ghostRec ? this.ghostRec.data(this.player.finishTimeMs, this.player.def.id) : null;
      newBest = Save.submitTime(this.trackDef.id, this.player.finishTimeMs, ghost);
    } else if (!GameState.demo) {
      const gp = GameState.gp!;
      sorted.forEach((r) => {
        gp.points[r.index] += GP_POINTS[r.rank - 1] ?? 0;
      });
      // unlocks: wins pull from the unlock order; your evolved form is "caught"
      if (this.player.rank === 1) {
        Save.recordWin();
        unlockedIds.push(...Save.unlockNext(3));
      } else if (this.player.rank <= 3) {
        unlockedIds.push(...Save.unlockNext(1));
      }
      unlockedIds.push(...Save.unlock([this.player.def.id]));
    } else if (GameState.demo) {
      const gp = GameState.gp!;
      sorted.forEach((r) => {
        gp.points[r.index] += GP_POINTS[r.rank - 1] ?? 0;
      });
    }

    // move XP goes to the species you picked, however far it evolved
    let newMoves: string[] = [];
    if (!GameState.demo) {
      const xpGain = mode === "tt" ? (newBest ? 2 : 1)
        : this.player.rank === 1 ? 3 : this.player.rank <= 3 ? 2 : 1;
      newMoves = Save.addXp(GameState.playerSpeciesId, xpGain);
    }

    const gp = GameState.gp;
    const standings: StandingRow[] = sorted.map((r) => ({
      speciesId: r.def.id,
      name: r.def.name,
      isPlayer: r.isPlayer,
      position: r.rank,
      timeMs: r.finishTimeMs,
      points: mode === "gp" ? GP_POINTS[r.rank - 1] ?? 0 : 0,
      gpTotal: gp ? gp.points[r.index] : 0
    }));

    const isFinalRace = mode === "gp" && gp ? gp.raceIndex >= CUPS[gp.cupId].trackIds.length - 1 : false;
    let playerCupPlace = 0;
    if (isFinalRace && gp) {
      const order = gp.rosterIds.map((_, i) => i).sort((a, b) => gp.points[b] - gp.points[a]);
      playerCupPlace = order.indexOf(0) + 1;
      if (!GameState.demo) {
        unlockedIds.push(...Save.recordTrophy(gp.cupId, playerCupPlace));
      }
    }

    this.scene.stop("Hud");
    this.scene.start("Results", {
      mode,
      demo: GameState.demo,
      standings,
      isFinalRace,
      playerCupPlace,
      unlockedIds,
      newMoves,
      newBest,
      trackId: this.trackDef.id,
      timeMs: this.player.finishTimeMs,
      playerRank: this.player.rank
    });
  }
}
