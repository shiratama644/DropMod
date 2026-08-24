/**
 * Sub-Phase 8-D E2E: theme 切替と永続化
 *
 * シナリオ:
 *   1. /mods にアクセス (LP は Header 非表示のため)
 *   2. 初期は dark
 *   3. テーマ切替 → light
 *   4. リロード後も light
 */

import { test, expect } from '@playwright/test';

test.describe('Theme persistence', () => {
  test('toggles theme and persists across reload', async ({ page }) => {
    await page.goto('/discover/mods');
    await page.locator('#desktop-sidebar, #app-header').first().waitFor({ state: 'visible' });

    const initialClass = await page.locator('html').getAttribute('class');
    expect(initialClass).toContain('dark');

    const themeButton = page
      .locator('#header-theme-toggle, #desktop-sidebar [aria-label="ライトモード"]')
      .first();
    await expect(themeButton).toBeVisible();
    await themeButton.click();

    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    await page.reload();
    await page.locator('#desktop-sidebar, #app-header').first().waitFor({ state: 'visible' });

    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});
