import { SAVE_KEY, STARTER_IDS, UNLOCK_ORDER } from "../constants";
import { ALL_IDS, getPokemon } from "../data/pokemonData";
import { movePool, unlockedCount } from "../data/movesData";
import { type Action, type Binds, normalizeBinds } from "./Controls";
import type { GhostData } from "../types";

type ViewSetting = "m7" | "rotate";

export interface CheatSettings {
  unlockAll: boolean;      // every Pokémon + every cup selectable
  easyAI: boolean;         // rivals ease off
  infiniteItems: boolean;  // player's item isn't consumed
  debugKeys: boolean;      // in-race hotkeys (item / candy / evolve / boost / warp)
  overlay: boolean;        // live telemetry readout in the HUD
}

interface SaveBlob {
  unlocked: number[];
  unlockCursor: number;        // index into UNLOCK_ORDER
  wins: number;
  trophies: Record<number, number>; // cupId -> 1 bronze / 2 silver / 3 gold
  bestTimes: Record<number, number>;
  ghosts: Record<number, GhostData>;
  xp: Record<number, number>;            // speciesId -> move XP (races finished etc.)
  loadouts: Record<number, string[]>;    // speciesId -> equipped move ids (max 2)
  settings: { muted: boolean; view: ViewSetting; cam: number };
  keybinds: Partial<Binds>;               // remapped controls (missing actions use defaults)
  cheats: CheatSettings;
}

function defaultCheats(): CheatSettings {
  return { unlockAll: false, easyAI: false, infiniteItems: false, debugKeys: false, overlay: false };
}

function defaults(): SaveBlob {
  return {
    unlocked: [...STARTER_IDS],
    unlockCursor: 0,
    wins: 0,
    trophies: {},
    bestTimes: {},
    ghosts: {},
    xp: {},
    loadouts: {},
    settings: { muted: false, view: "m7", cam: 0 },
    keybinds: {},
    cheats: defaultCheats()
  };
}

export class SaveSystem {
  data: SaveBlob;

  constructor() {
    this.data = defaults();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = {
          ...defaults(), ...parsed,
          settings: { ...defaults().settings, ...parsed.settings },
          cheats: { ...defaultCheats(), ...parsed.cheats }
        };
        // older saves predate the bigger default roster — grandfather it in
        for (const id of STARTER_IDS) {
          if (!this.data.unlocked.includes(id)) this.data.unlocked.push(id);
        }
      }
    } catch {
      this.data = defaults();
    }
  }

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable — play without saving */
    }
  }

  get cheats(): CheatSettings { return this.data.cheats; }

  isUnlocked(id: number) {
    return this.data.cheats.unlockAll || this.data.unlocked.includes(id);
  }

  /** Selectable roster — everything when the unlock-all cheat is on. */
  roster(): number[] {
    return this.data.cheats.unlockAll ? [...ALL_IDS] : [...this.data.unlocked];
  }

  unlock(ids: number[]): number[] {
    const fresh: number[] = [];
    for (const id of ids) {
      if (!this.data.unlocked.includes(id)) {
        this.data.unlocked.push(id);
        fresh.push(id);
      }
    }
    if (fresh.length) this.persist();
    return fresh;
  }

  /** Pull the next n Pokémon from the unlock order. */
  unlockNext(n: number): number[] {
    const fresh: number[] = [];
    while (n > 0 && this.data.unlockCursor < UNLOCK_ORDER.length) {
      const id = UNLOCK_ORDER[this.data.unlockCursor++];
      if (!this.data.unlocked.includes(id)) {
        this.data.unlocked.push(id);
        fresh.push(id);
        n--;
      }
    }
    if (fresh.length) this.persist();
    return fresh;
  }

  recordWin() {
    this.data.wins++;
    this.persist();
  }

  /** Returns newly-unlocked legendaries etc. for trophy milestones. */
  recordTrophy(cupId: number, place: number): number[] {
    const tier = place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0;
    if (tier > (this.data.trophies[cupId] ?? 0)) this.data.trophies[cupId] = tier;
    this.persist();

    const rewards: number[] = [];
    if (cupId === 0 && tier >= 3) rewards.push(147); // Dratini
    if (cupId === 1 && tier >= 3) rewards.push(142, 131); // Aerodactyl, Lapras
    if (cupId === 2 && tier >= 1) rewards.push(144, 145, 146); // legendary birds
    if (cupId === 3 && tier >= 3) rewards.push(150); // Mewtwo guards the Ultra Ball Cup
    if ([0, 1, 2, 3].every((c) => (this.data.trophies[c] ?? 0) === 3)) {
      rewards.push(151); // Mew for the full sweep
    }
    return this.unlock(rewards);
  }

  trophy(cupId: number) {
    return this.data.trophies[cupId] ?? 0;
  }

  bestTime(trackId: number): number {
    return this.data.bestTimes[trackId] ?? Infinity;
  }

  submitTime(trackId: number, ms: number, ghost: GhostData | null): boolean {
    if (ms < this.bestTime(trackId)) {
      this.data.bestTimes[trackId] = ms;
      if (ghost) this.data.ghosts[trackId] = ghost;
      this.persist();
      return true;
    }
    return false;
  }

  ghost(trackId: number): GhostData | null {
    return this.data.ghosts[trackId] ?? null;
  }

  // ---- signature-move progression ----

  xp(speciesId: number): number {
    return this.data.xp[speciesId] ?? 0;
  }

  /** Award move XP; returns ids of any newly unlocked moves. */
  addXp(speciesId: number, amount: number): string[] {
    const before = unlockedCount(this.xp(speciesId));
    this.data.xp[speciesId] = this.xp(speciesId) + amount;
    const after = unlockedCount(this.xp(speciesId));
    this.persist();
    if (after <= before) return [];
    const pool = movePool(getPokemon(speciesId));
    return pool.slice(before, after).map((m) => m.id);
  }

  /** Equipped move ids for a species (defaults to its first unlocked move). */
  loadout(speciesId: number): string[] {
    const pool = movePool(getPokemon(speciesId));
    const open = pool.slice(0, unlockedCount(this.xp(speciesId))).map((m) => m.id);
    const saved = (this.data.loadouts[speciesId] ?? []).filter((id) => open.includes(id));
    return saved.length ? saved.slice(0, 2) : [open[0]];
  }

  setLoadout(speciesId: number, moveIds: string[]) {
    this.data.loadouts[speciesId] = moveIds.slice(0, 2);
    this.persist();
  }

  get muted() { return this.data.settings.muted; }
  set muted(v: boolean) { this.data.settings.muted = v; this.persist(); }
  get viewMode(): ViewSetting {
    // the old "north" top-down mode was retired — fold it into the rotating top-down
    const v = this.data.settings.view as string;
    return v === "rotate" || v === "north" ? "rotate" : "m7";
  }
  set viewMode(v: ViewSetting) { this.data.settings.view = v; this.persist(); }
  get camPreset(): number { return this.data.settings.cam ?? 0; }
  set camPreset(v: number) { this.data.settings.cam = v; this.persist(); }

  /** Full keybind map: saved overrides merged onto the defaults. */
  binds(): Binds {
    return normalizeBinds(this.data.keybinds);
  }

  /** Rebind an action to new key codes, clearing those codes from every other action. */
  rebind(action: Action, codes: number[]) {
    const binds = this.binds();
    binds[action] = codes.slice(0, 2);
    for (const a of Object.keys(binds) as Action[]) {
      if (a === action) continue;
      binds[a] = binds[a].filter((c) => !codes.includes(c));
    }
    this.data.keybinds = binds;
    this.persist();
  }

  resetBinds() {
    this.data.keybinds = {};
    this.persist();
  }
}

export const Save = new SaveSystem();
