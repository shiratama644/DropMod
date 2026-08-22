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

    // テーマ切替ボタン: id で直接取得 (H7-3 修正)
    //   以前は `page.locator('#header-theme-icon').first().locator('..')` としていたが、
    //   Playwright の `.locator('..')` は CSS セレクタ扱いで無効 (XPath 非対応)。
    //   Header の <button id="header-theme-toggle"> を直接 click する。
    const themeButton = page.locator('#header-theme-toggle');
    await themeButton.click();

    // light に切り替わっている
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    // リロード
    await page.reload();
    await page.waitForSelector('#app-header', { state: 'visible' });

    // まだ light を維持
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});
