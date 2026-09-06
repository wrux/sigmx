import { expect, test } from '@playwright/test';

test('the in-page suite passes in a real browser', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tests/browser/index.html');
  await page.waitForFunction(() => window.__done === true, null, { timeout: 60_000 });
  const results = await page.evaluate(() => window.__results);
  const failed = results.filter((r) => !r.ok);
  expect(failed, failed.map((f) => `${f.name}: ${f.error}`).join('\n')).toEqual([]);
  expect(results.length).toBeGreaterThan(15);
  expect(errors).toEqual([]);
});

test('the standalone build boots from a script tag and talks to the server', async ({ page }) => {
  await page.goto('/tests/browser/standalone.html');
  await expect(page.locator('#out')).toHaveText('2');
  await page.click('#inc');
  await expect(page.locator('#out')).toHaveText('4');
  await page.click('#get');
  await expect(page.locator('#srv')).toHaveText('42');
  expect(await page.evaluate(() => typeof window.sigmx)).toBe('object');
});
