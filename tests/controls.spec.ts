import { test, expect, type Page } from "@playwright/test";

const SAVE_KEY = "pokekart-save-v1";
const K = { ENTER: 13, I: 73 };

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

async function waitScene(page: Page, key: string) {
  await page.waitForFunction(
    (k) =>
      (window as any).__game?.isBooted &&
      (window as any).__game.scene.getScenes(true).some((s: any) => s.scene.key === k),
    key,
    { timeout: 15_000 }
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
  await page.reload();
  await waitScene(page, "Title");
});

test("remapping a key in the Controls screen persists to the save", async ({ page }) => {
  await fireKey(page, "Enter", K.ENTER); // Title -> Menu
  await waitScene(page, "Menu");
  await page.waitForTimeout(350); // clear the menu's input grace window

  // place the cursor on the CONTROLS row (index 5) and open it
  await page.evaluate(() => {
    (window as any).__game.scene.getScene("Menu").cursor = 5;
  });
  await fireKey(page, "Enter", K.ENTER);
  await waitScene(page, "Controls");
  await page.waitForTimeout(350);

  // rebind the top action (Accelerate) to the I key
  await fireKey(page, "Enter", K.ENTER); // begin listening
  await page.waitForTimeout(200);
  await fireKey(page, "i", K.I);
  await page.waitForTimeout(250);

  const accelBind = await page.evaluate((k) => {
    const blob = JSON.parse(localStorage.getItem(k)!);
    return blob.keybinds?.accel;
  }, SAVE_KEY);
  expect(accelBind).toEqual([K.I]);

  // and it survives a reload
  await page.reload();
  await waitScene(page, "Title");
  const afterReload = await page.evaluate((k) => {
    const blob = JSON.parse(localStorage.getItem(k)!);
    return blob.keybinds?.accel;
  }, SAVE_KEY);
  expect(afterReload).toEqual([K.I]);
});

test("the removed north-up view migrates to the rotate view on load", async ({ page }) => {
  // seed a legacy save that still pins the retired "north" view
  await page.evaluate((k) => {
    localStorage.setItem(
      k,
      JSON.stringify({
        unlocked: [1],
        settings: { muted: false, view: "north", cam: 0 }
      })
    );
  }, SAVE_KEY);

  await page.reload();
  await waitScene(page, "Title");

  // the live save folds the retired "north" mode into "rotate" on read
  const migrated = await page.evaluate(() => (window as any).__save.viewMode as string);
  expect(migrated).toBe("rotate");
});
