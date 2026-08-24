/**
 * Sub-Phase 8-D E2E: オフライン検出とバナー表示 (Sub-Phase 8-B 検証)
 *
 * シナリオ:
 *   1. Home にアクセス
 *   2. context.setOffline(true) でオフライン化
 *   3. オフラインバナーが表示される
 *   4. context.setOffline(false) でオンライン復帰
 *   5. バナーが消える
 */

import { test, expect } from '@playwright/test';

test.describe('Offline detection', () => {
  test('shows offline banner when offline, hides when online', async ({ page, context }) => {
    await page.goto('/');
    await page.locator('#desktop-sidebar, #bottom-nav, main').first().waitFor({ state: 'visible' });

    // 初期はオンライン、バナー無し
    expect(await page.locator('[role="status"]').filter({ hasText: /オフライン中/ }).count()).toBe(0);

    // オフライン化
    await context.setOffline(true);
    // ブラウザに offline イベントを発火させる
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // バナー出現
    await expect(page.locator('[role="status"]').filter({ hasText: /オフライン中/ })).toBeVisible({
      timeout: 5_000
    });

    // オンライン復帰
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // バナー消失
    await expect(
      page.locator('[role="status"]').filter({ hasText: /オフライン中/ })
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
