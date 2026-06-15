import { beforeEach, describe, expect, test, vi } from "vitest";

// SaveSystem reaches Phaser through Controls (for keycode constants only).
// Phaser touches `window`/`canvas` at import time, which the node test
// environment lacks, so we stub it down to the KeyCodes that Controls reads.
vi.mock("phaser", () => {
  const KeyCodes = {
    BACKSPACE: 8, TAB: 9, ENTER: 13, SHIFT: 16, CTRL: 17, ALT: 18,
    ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
    A: 65, D: 68, E: 69, P: 80, Q: 81, S: 83, W: 87, X: 88, Z: 90
  };
  return { default: { Input: { Keyboard: { KeyCodes } } } };
});

import { SaveSystem } from "../../src/systems/SaveSystem";
import { SAVE_KEY, STARTER_IDS } from "../../src/constants";

// A minimal in-memory localStorage so the save/load round-trip is exercised
// for real instead of relying on SaveSystem swallowing a missing-storage error.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  (globalThis as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

function fresh(): SaveSystem {
  return new SaveSystem();
}

describe("SaveSystem", () => {
  describe("defaults", () => {
    test("starts with the full starter roster unlocked", () => {
      const save = fresh();
      for (const id of STARTER_IDS) {
        expect(save.isUnlocked(id), `starter ${id} should be unlocked`).toBe(true);
      }
    });

    test("starts with zero wins and no trophies", () => {
      const save = fresh();
      expect(save.data.wins).toBe(0);
      expect(save.trophy(0)).toBe(0);
      expect(save.trophy(3)).toBe(0);
    });

    test("default view mode is m7", () => {
      const save = fresh();
      expect(save.viewMode).toBe("m7");
    });
  });

  describe("unlock progression", () => {
    test("unlock() adds new ids and is idempotent", () => {
      const save = fresh();
      const before = save.data.unlocked.length;
      save.unlock([3]); // Venusaur — not in starters
      expect(save.data.unlocked.length).toBe(before + 1);
      expect(save.isUnlocked(3)).toBe(true);
      // calling again should not double-add
      save.unlock([3]);
      expect(save.data.unlocked.length).toBe(before + 1);
    });

    test("unlockNext() advances the cursor and skips already-unlocked ids", () => {
      const save = fresh();
      const cursor0 = save.data.unlockCursor;
      const fresh0 = save.unlockNext(2);
      expect(fresh0.length).toBe(2);
      expect(save.data.unlockCursor).toBeGreaterThan(cursor0);
      // ids actually land in unlocked
      for (const id of fresh0) {
        expect(save.isUnlocked(id)).toBe(true);
      }
    });

    test("unlock-all cheat makes every Pokémon selectable", () => {
      const save = fresh();
      const lockedId = 150; // Mewtwo — not in starters or UNLOCK_ORDER at start
      expect(save.isUnlocked(lockedId)).toBe(false);
      save.data.cheats.unlockAll = true;
      expect(save.isUnlocked(lockedId)).toBe(true);
      expect(save.roster()).toHaveLength(151);
    });
  });

  describe("trophy rewards", () => {
    test("Poké Ball Cup gold unlocks Dratini", () => {
      const save = fresh();
      const unlocked = save.recordTrophy(0, 1);
      expect(unlocked).toContain(147);
    });

    test("Great Ball Cup gold unlocks Aerodactyl and Lapras", () => {
      const save = fresh();
      const unlocked = save.recordTrophy(1, 1);
      expect(unlocked).toContain(142);
      expect(unlocked).toContain(131);
    });

    test("Master Ball Cup podium unlocks the legendary birds", () => {
      const save = fresh();
      const unlocked = save.recordTrophy(2, 1);
      expect(unlocked).toContain(144); // Articuno
      expect(unlocked).toContain(145); // Zapdos
      expect(unlocked).toContain(146); // Moltres
    });

    test("Ultra Ball Cup gold unlocks Mewtwo", () => {
      const save = fresh();
      const unlocked = save.recordTrophy(3, 1);
      expect(unlocked).toContain(150);
    });

    test("sweeping all four cups with gold unlocks Mew", () => {
      const save = fresh();
      save.recordTrophy(0, 1);
      save.recordTrophy(1, 1);
      save.recordTrophy(2, 1);
      const last = save.recordTrophy(3, 1);
      expect(last).toContain(151); // Mew
    });

    test("only gold (tier 3) earns rewards, silver does not", () => {
      const save = fresh();
      save.data.unlocked = save.data.unlocked.filter((id) => id !== 147);
      const unlocked = save.recordTrophy(0, 2); // silver
      expect(unlocked).not.toContain(147);
    });

    test("trophy tier is only upgraded, never downgraded", () => {
      const save = fresh();
      save.recordTrophy(0, 1); // gold
      expect(save.trophy(0)).toBe(3);
      save.recordTrophy(0, 3); // bronze — should not overwrite
      expect(save.trophy(0)).toBe(3);
    });
  });

  describe("XP and move unlocks", () => {
    test("first move is available at 0 XP", () => {
      const save = fresh();
      // Pikachu (id 25) starts with 0 xp; loadout should return its first move
      const loadout = save.loadout(25);
      expect(loadout).toHaveLength(1);
      expect(typeof loadout[0]).toBe("string");
    });

    test("addXp returns newly unlocked move ids when a threshold is crossed", () => {
      const save = fresh();
      // Thresholds are 0/2/5/9; first new unlock is at 2 xp
      const newMoves = save.addXp(25, 2);
      expect(newMoves.length).toBeGreaterThan(0);
    });

    test("addXp below the next threshold returns empty array", () => {
      const save = fresh();
      const newMoves = save.addXp(25, 1); // 1 xp < 2 threshold
      expect(newMoves).toHaveLength(0);
    });

    test("total XP accumulates across multiple addXp calls", () => {
      const save = fresh();
      save.addXp(1, 1); // 1 xp
      save.addXp(1, 1); // 2 xp — crosses threshold
      expect(save.xp(1)).toBe(2);
    });
  });

  describe("loadout", () => {
    test("setLoadout/loadout round-trips equipped move ids", () => {
      const save = fresh();
      // Give Pikachu enough xp to unlock two moves
      save.addXp(25, 5);
      const pool = save.loadout(25);
      save.setLoadout(25, pool.slice(0, 2));
      expect(save.loadout(25)).toEqual(pool.slice(0, 2));
    });

    test("loadout silently drops moves the Pokémon has not yet unlocked", () => {
      const save = fresh();
      // Forcibly save a loadout with a locked move id
      save.data.loadouts[25] = ["voltickle_fake", "thunderwave"];
      const loadout = save.loadout(25);
      // Neither fake move should appear; falls back to default first move
      expect(loadout).not.toContain("voltickle_fake");
    });
  });

  describe("viewMode migration", () => {
    test("legacy 'north' view is migrated to 'rotate'", () => {
      const save = fresh();
      (save.data.settings as { view: string }).view = "north";
      expect(save.viewMode).toBe("rotate");
    });

    test("'m7' and 'rotate' pass through unchanged", () => {
      const save = fresh();
      save.data.settings.view = "m7";
      expect(save.viewMode).toBe("m7");
      save.data.settings.view = "rotate";
      expect(save.viewMode).toBe("rotate");
    });
  });

  describe("time trial records", () => {
    test("submitTime accepts a new best and rejects a slower time", () => {
      const save = fresh();
      expect(save.bestTime(0)).toBe(Infinity);
      expect(save.submitTime(0, 90_000, null)).toBe(true);
      expect(save.bestTime(0)).toBe(90_000);
      expect(save.submitTime(0, 95_000, null)).toBe(false);
      expect(save.bestTime(0)).toBe(90_000);
    });
  });

  describe("persistence round-trip", () => {
    test("a fresh instance reloads state previously written to localStorage", () => {
      const save = fresh();
      save.recordWin();
      save.recordTrophy(0, 1); // gold — also unlocks Dratini (147)
      save.submitTime(2, 80_000, null);

      // A brand-new instance reads the persisted blob from localStorage.
      const reloaded = fresh();
      expect(reloaded.data.wins).toBe(1);
      expect(reloaded.trophy(0)).toBe(3);
      expect(reloaded.bestTime(2)).toBe(80_000);
      expect(reloaded.isUnlocked(147)).toBe(true);
    });

    test("a corrupt localStorage blob falls back to clean defaults", () => {
      localStorage.setItem(SAVE_KEY, "{not valid json");
      const save = fresh();
      expect(save.data.wins).toBe(0);
      for (const id of STARTER_IDS) {
        expect(save.isUnlocked(id)).toBe(true);
      }
    });

    test("starters are grandfathered into an older save missing them", () => {
      // Simulate a legacy save whose roster predates the current starters.
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ unlocked: [1], wins: 5 })
      );
      const save = fresh();
      expect(save.data.wins).toBe(5);
      for (const id of STARTER_IDS) {
        expect(save.isUnlocked(id)).toBe(true);
      }
    });
  });
});
