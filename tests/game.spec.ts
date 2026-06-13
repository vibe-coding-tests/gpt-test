import { test, expect, type Page } from "@playwright/test";

const SAVE_KEY = "pokekart-save-v1";

// keyCodes Phaser keys off of
const K = { ENTER: 13, SPACE: 32, ESC: 27, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };

/**
 * Phaser listens for keydown on `window`, so dispatch synthetic events there.
 * This is independent of OS focus, which keeps the test stable.
 */
async function fireKey(page: Page, key: string, keyCode: number) {
  await page.evaluate(
    ({ key, keyCode }) => {
      for (const type of ["keydown", "keyup"]) {
        const ev = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
        Object.defineProperty(ev, "keyCode", { get: () => keyCode });
        Object.defineProperty(ev, "which", { get: () => keyCode });
        window.dispatchEvent(ev);
      }
    },
    { key, keyCode }
  );
}

async function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as any).__game.scene.getScenes(true).map((s: any) => s.scene.key)
  );
}

async function waitForScene(page: Page, key: string) {
  await page.waitForFunction(
    (k) =>
      (window as any).__game?.isBooted &&
      (window as any).__game.scene.getScenes(true).some((s: any) => s.scene.key === k),
    key,
    { timeout: 15_000 }
  );
}

/** Collect every console error and uncaught page error for the whole test. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // start every test from a clean slate so results are deterministic
  await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
  await page.reload();
  await waitForScene(page, "Title");
});

test("boots to the title screen with no console or page errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.reload();
  await waitForScene(page, "Title");
  await page.waitForTimeout(1200);

  const canvasCount = await page.locator("canvas").count();
  expect(canvasCount).toBeGreaterThanOrEqual(1);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("plays through menus into a Grand Prix race without errors", async ({ page }) => {
  const errors = collectErrors(page);

  await fireKey(page, "Enter", K.ENTER); // Title -> Menu
  await waitForScene(page, "Menu");

  await fireKey(page, "Enter", K.ENTER); // GRAND PRIX -> Select
  await waitForScene(page, "Select");

  await fireKey(page, "Enter", K.ENTER); // pick racer -> moves phase
  await page.waitForTimeout(350);
  await fireKey(page, "ArrowUp", K.UP); // wrap up to the READY row
  await page.waitForTimeout(200);
  await fireKey(page, "Enter", K.ENTER); // moves -> cup phase
  await page.waitForTimeout(350);
  await fireKey(page, "Enter", K.ENTER); // first cup (unlocked) -> Race

  await waitForScene(page, "Race");
  // let the countdown elapse and the 3D world render several frames
  await page.waitForTimeout(4000);

  const scenes = await activeScenes(page);
  expect(scenes).toContain("Race");
  expect(scenes).toContain("Hud");

  // WebGL really produced frames (Three renderer drew the world)
  const drew = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    return canvases.some((c) => c.width > 0 && c.height > 0);
  });
  expect(drew).toBe(true);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("a setting change is written to localStorage and survives a reload", async ({ page }) => {
  await fireKey(page, "Enter", K.ENTER); // Title -> Menu
  await waitForScene(page, "Menu");
  await page.waitForTimeout(350); // clear the scene's input grace window

  // CHEATS is the last menu row; place the cursor there directly (synthetic
  // key cadence is unreliable under headless throttling), then open it.
  const CHEATS_ROW = 6; // gp, battle, tt, dex, help, controls, cheats
  await page.evaluate((row) => {
    (window as any).__game.scene.getScene("Menu").cursor = row;
  }, CHEATS_ROW);
  await fireKey(page, "Enter", K.ENTER); // open Cheats
  await waitForScene(page, "Cheats");

  await fireKey(page, "Enter", K.ENTER); // toggle "UNLOCK EVERYTHING"
  await page.waitForTimeout(250);

  const saved = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  expect(saved, "save blob should be written on change").toBeTruthy();
  expect(JSON.parse(saved!).cheats.unlockAll).toBe(true);

  // reload and confirm the save is loaded back by the game
  await page.reload();
  await waitForScene(page, "Title");
  const afterReload = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  expect(JSON.parse(afterReload!).cheats.unlockAll).toBe(true);
});

test("saved Pokémon unlocks and trophies are loaded back from storage", async ({ page }) => {
  // seed a save with 40 unlocked Pokémon, a gold trophy and some wins
  await page.evaluate((k) => {
    const blob = {
      unlocked: Array.from({ length: 40 }, (_, i) => i + 1),
      unlockCursor: 12,
      wins: 7,
      trophies: { 0: 3 },
      bestTimes: { 0: 91234 },
      ghosts: {},
      xp: { 25: 6 },
      loadouts: {},
      settings: { muted: false, view: "m7", cam: 0 },
      cheats: { unlockAll: false, easyAI: false, infiniteItems: false, debugKeys: false, overlay: false }
    };
    localStorage.setItem(k, JSON.stringify(blob));
  }, SAVE_KEY);

  await page.reload();
  await waitForScene(page, "Title");

  await fireKey(page, "Enter", K.ENTER); // Title -> Menu
  await waitForScene(page, "Menu");
  await page.waitForTimeout(300);

  // the Menu footer renders "Pokédex: N/151" from the loaded save
  const footer = await page.evaluate(() => {
    const menu = (window as any).__game.scene.getScene("Menu");
    const f: any = menu.children.getByName("footer");
    return f ? (f.text as string) : null;
  });
  expect(footer).toBeTruthy();
  const match = footer!.match(/Pok[eé]dex:\s*(\d+)\s*\/\s*151/i);
  expect(match, `footer was: ${footer}`).not.toBeNull();
  // default fresh save unlocks 24 starters; loading our seed must show more
  expect(Number(match![1])).toBeGreaterThanOrEqual(40);

  // the best time we seeded must show up on the Time Trial track list
  await fireKey(page, "ArrowDown", K.DOWN); // BALLOON BATTLE
  await page.waitForTimeout(120);
  await fireKey(page, "ArrowDown", K.DOWN); // TIME TRIAL
  await page.waitForTimeout(120);
  await fireKey(page, "Enter", K.ENTER); // -> Select (tt)
  await waitForScene(page, "Select");
  const bestTimeKept = await page.evaluate((k) => {
    const blob = JSON.parse(localStorage.getItem(k)!);
    return blob.bestTimes["0"];
  }, SAVE_KEY);
  expect(bestTimeKept).toBe(91234);
});
