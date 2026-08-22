/**
 * Sub-Phase 8-D E2E: theme 切替と永続化
 *
 * シナリオ:
 *   1. Home にアクセス、初期は dark (デフォルト)
 *   2. Header のテーマ切替ボタンをクリック → light に
 *   3. リロード
 *   4. light がまだ適用されている (Dexie 永続化 → theme init script で FOUC 回避)
 */

import { test, expect } from '@playwright/test';

test.describe('Theme persistence', () => {
  test('toggles theme and persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app-header', { state: 'visible' });

    // 初期は dark クラスが <html> に付いている
    const initialClass = await page.locator('html').getAttribute('class');
    expect(initialClass).toContain('dark');

    // テーマ切替ボタン (Header 内、theme icon を持つボタン)
    const themeButton = page.locator('#header-theme-icon').first();
    // 親の button を取得してクリック
    const parentButton = themeButton.locator('..');
    await parentButton.click();

    // light に切り替わっている
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    // リロード
    await page.reload();
    await page.waitForSelector('#app-header', { state: 'visible' });

    // まだ light を維持
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});
