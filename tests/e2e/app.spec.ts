import { expect, test, type Page } from '@playwright/test';

/** Software WebGL draws about one frame a second, which would starve the physics loop. Skip the draw call only. */
async function skipDrawing(page: Page): Promise<void> {
  await page.evaluate(() => { (window as any).__lab.view.renderer.render = () => {}; });
}

async function boot(page: Page, hash = ''): Promise<string[]> {
  const external: string[] = [];
  // blob: and data: URLs are in-memory (textures inside .glb files), not network requests.
  page.on('request', (r) => { const u = r.url(); if (/^https?:/.test(u) && !u.startsWith('http://localhost:4173')) external.push(u); });
  await page.goto(`/?test${hash}`);
  await expect(page.locator('#loader')).toHaveCount(0, { timeout: 60_000 });
  return external;
}

/** The intro opens a moment after loading. Wait for it before dismissing, or it opens on top later. */
async function dismissIntro(page: Page): Promise<void> {
  await expect(page.locator('#introM')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#introM')).toBeHidden();
}

test('boots from local files only, with a modal intro', async ({ page }) => {
  const external = await boot(page);
  const intro = page.locator('#introM');
  await expect(intro).toBeVisible();
  expect(await intro.evaluate((d) => d.matches(':modal'))).toBe(true);
  await expect(page.locator('#introGuide')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(intro).toBeHidden();
  await expect(page.locator('#roN')).toHaveText('1.20 Hz');
  expect(external).toEqual([]);
});

test('the quake collapses the bare frame, and replay works', async ({ page }) => {
  await boot(page);
  await page.click('#introFree');
  await skipDrawing(page);
  await page.click('#segMode button[data-v="quake"]');
  await page.locator('#strength').fill('0.3');
  await expect(page.locator('#gOut')).toHaveText('0.30 g');
  await page.click('#shakeBtn');
  await expect(page.locator('#peakNote')).toHaveText(/Story 1 failed 6\.\d s into the quake/, { timeout: 60_000 });
  await expect(page.locator('#roD')).toHaveText('collapsed');
  await expect(page.locator('#announcer')).toHaveText(/Story \d failed/);
  await page.click('#replayBtn');
  await expect(page.locator('#replaybar')).toBeVisible();
  await page.click('#rpExit');
  await expect(page.locator('#replaybar')).toHaveCount(0);
});

test('a deep link opens and runs a guided test', async ({ page }) => {
  await boot(page, '#stop=5&run');
  // Drawing stays on here: headless Chrome stops scheduling frames when nothing on screen
  // changes, and the tour waits 0.7 s of simulated time before it starts the table.
  await expect(page.locator('#pTitle')).toHaveText('Float it');
  await expect(page.locator('.live')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => (window as any).__lab.lab.sim.type)).toBe('isolated');
});

test('the text version lists all six tests', async ({ page }) => {
  await boot(page);
  await dismissIntro(page);
  await page.click('#helpBtn');
  await page.click('#textBtn');
  await expect(page.locator('#textBody h2')).toHaveCount(6);
});

test('the guided lab asks for a prediction first and keeps it in the notebook', async ({ page }) => {
  await boot(page);
  await page.click('#introGuide');
  await expect(page.locator('#pTitle')).toHaveText('A table that makes earthquakes');
  await expect(page.locator('#toTest')).toBeDisabled();
  await page.getByLabel('Move with the table and barely bend').check();
  await page.click('#toTest');
  await expect(page.locator('#pRun')).toHaveText('Run this test');
  await page.click('#notebookBtn');
  await expect(page.locator('#notebookM')).toContainText('Prediction: Move with the table and barely bend');
  await page.keyboard.press('Escape');
  // The URL now ends in #stop=1, so the lab reopens on the lesson, with no intro.
  await page.reload();
  await expect(page.locator('#loader')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('#pTitle')).toHaveText('A table that makes earthquakes');
  await page.click('#notebookBtn');
  await expect(page.locator('#notebookM')).toContainText('Prediction: Move with the table and barely bend');
});

test('keyboard shortcuts work and are listed in Help', async ({ page }) => {
  await boot(page);
  await page.click('#introFree');
  await page.keyboard.press('2');
  await expect(page.locator('#segType button[data-v="braced"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('s');
  await expect(page.locator('#stressBtn')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('?');
  await expect(page.locator('#helpM')).toBeVisible();
  await expect(page.locator('#helpM kbd').first()).toHaveText('Space');
});

test('the control room warns when the table cannot reach the strength asked for', async ({ page }) => {
  await boot(page);
  await dismissIntro(page);
  await expect(page.locator('#preflightNote')).toHaveCount(0);
  await page.locator('#freq').fill('0.5');
  await page.locator('#strength').fill('0.6');
  await expect(page.locator('#preflightNote')).toContainText('about 0.50 g, not 0.60 g');
  await page.locator('#segMode button[data-v="quake"]').click();
  await expect(page.locator('#preflightNote')).toHaveCount(0);
});

test('the modeled hall loads its dressing after the lab is usable, from local files only', async ({ page }) => {
  const external = await boot(page);
  await dismissIntro(page);
  await expect.poll(() => page.evaluate(() => {
    const v = (window as any).__lab.view;
    return Boolean(v.scene.getObjectByName('hall')) && Boolean(v.models.rollershutter_door) && Boolean(v.models.steel_frame_shelves_01);
  }), { timeout: 60_000 }).toBe(true);
  // The orbit camera stays inside the hall walls however far it zooms out.
  const p = await page.evaluate(() => {
    const L = (window as any).__lab;
    for (let i = 0; i < 20; i++) L.view.zoomBy(1.5);
    L.view.updateCamera(L.lab);
    const c = L.view.camera.position;
    return [c.x, c.y, c.z];
  });
  expect(Math.abs(p[2])).toBeLessThan(22);
  expect(p[0]).toBeLessThan(26);
  expect(external).toEqual([]);
});

test('Space works the focused button, and single-key shortcuts can be turned off', async ({ page }) => {
  await boot(page);
  await page.click('#introFree');
  // Closing the start screen hands focus back, so wait for it before focusing the button.
  await expect(page.locator('#introM')).toBeHidden();
  await page.locator('#stressBtn').focus();
  await expect(page.locator('#stressBtn')).toBeFocused();
  await page.keyboard.press(' ');
  await expect(page.locator('#stressBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#shakeBtn')).toHaveText('Shake'); // the table did not start
  await page.click('#helpBtn');
  await page.click('#shortcutsBtn');
  await expect(page.locator('#shortcutsBtn')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await page.locator('body').press('2');
  await expect(page.locator('#segType button[data-v="bare"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#loader')).toHaveCount(0, { timeout: 60_000 });
  expect(await page.evaluate(() => (window as any).__lab.ui.shortcuts.value)).toBe(false);
});

test('the design challenge builds, tests and files a design in the notebook', async ({ page }) => {
  await boot(page, '#design');
  await skipDrawing(page);
  await expect(page.locator('#designPanel')).toBeVisible();
  await expect(page.locator('#dCost')).toHaveText('300 of 600 credits');
  await page.click('#segStory1 button[data-v="heavy"]');
  await page.click('#segStory2 button[data-v="heavy"]');
  await expect(page.locator('#dCost')).toHaveText('460 of 600 credits');
  await expect(page.locator('#dTest')).toBeDisabled(); // predict first
  await page.getByLabel('It will survive').check();
  await page.click('#dTest');
  await expect(page.locator('#dResult')).toContainText('Survived. 460 credits.', { timeout: 120_000 });
  await expect(page.locator('#dBest')).toContainText('Heavy, heavy, light, 460 credits');
  await page.click('#notebookBtn');
  await expect(page.locator('#nbDesigns')).toContainText('Heavy, heavy, light');
});
