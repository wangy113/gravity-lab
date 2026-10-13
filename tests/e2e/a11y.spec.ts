/**
 * Automated accessibility audit (axe-core) of every screen, against WCAG 2.2 A and AA.
 * Automated checks find about a third of real problems, so this complements the manual
 * keyboard and screen reader checks in docs/ARCHITECTURE.md 9.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, hash = ''): Promise<void> {
  await page.goto(`/?test${hash}`);
  await expect(page.locator('#loader')).toHaveCount(0, { timeout: 60_000 });
  // axe reads the page, not the 3D view. Skipping the draw keeps software WebGL from slowing the run.
  await page.evaluate(() => { (window as any).__lab.view.renderer.render = () => {}; });
}

async function audit(page: Page, include?: string): Promise<string[]> {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) b = b.include(include);
  const r = await b.analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
}

test('the start screen', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#introM')).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test('explore mode with the control room', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#introM')).toBeVisible();
  await page.locator('#introFree').click();
  expect(await audit(page)).toEqual([]);
});

test('a guided test', async ({ page }) => {
  await boot(page, '#stop=2');
  await expect(page.locator('#pTitle')).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

for (const [name, button] of [['notebook', '#notebookBtn'], ['instructors', '#teachBtn'], ['help', '#helpBtn']] as const) {
  test(`the ${name} dialog`, async ({ page }) => {
    await boot(page);
    await expect(page.locator('#introM')).toBeVisible();
    await page.locator('#introFree').click();
    await page.locator(button).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    expect(await audit(page, 'dialog[open]')).toEqual([]);
  });
}

for (const [name, button] of [['about', '#aboutBtn'], ['text version', '#textBtn']] as const) {
  test(`the ${name} dialog`, async ({ page }) => {
    await boot(page);
    await expect(page.locator('#introM')).toBeVisible();
    await page.locator('#introFree').click();
    await page.locator('#helpBtn').click();
    await page.locator(button).click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    expect(await audit(page, 'dialog[open]')).toEqual([]);
  });
}
