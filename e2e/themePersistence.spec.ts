/**
 * Sub-Phase 8-D E2E: theme 切替と永続化
 *
 * シナリオ:
 *   1. /discover/mods にアクセス (LP は Header 非表示のため)
 *   2. 初期は dark
 *   3. テーマ切替 → light
 *   4. リロード後も light
 *
 * 2026-08-27 修正 (初回 CI 実行の失敗分析):
 *   - `#desktop-sidebar, #app-header` の .first() はモバイルで非表示の sidebar を
 *     掴むため `:visible` で実際に見えている側を掴む
 *   - hydration 完了前に click するとハンドラが未アタッチで no-op になる競合が
 *     あったため `html[data-hydrated]` を待ってから操作する
 *     (AppShell が hydration 完了時に data-hydrated を付与)
 */

import { test, expect } from '@playwright/test';
import { waitForAppHydrated, navVisible } from './helpers/appReady';

test.describe('Theme persistence', () => {
  test('toggles theme and persists across reload', async ({ page }) => {
    await page.goto('/discover/mods');
    await waitForAppHydrated(page);
    await navVisible(page).first().waitFor({ state: 'visible' });

    const initialClass = await page.locator('html').getAttribute('class');
    expect(initialClass).toContain('dark');

    const themeButton = page.locator(
      '#header-theme-toggle:visible, #desktop-sidebar button[aria-label="ライトモード"]:visible'
    );
    await expect(themeButton).toBeVisible();

    // hydration 後でも稀にイベント取り込みが遅れるケースに備え、
    // 「クリック → light になる」をまとめてリトライする (no-op クリックの吸収)。
    await expect(async () => {
      await themeButton.click();
      await expect(page.locator('html')).not.toHaveClass(/\bdark\b/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await page.reload();
    await waitForAppHydrated(page);
    await navVisible(page).first().waitFor({ state: 'visible' });

    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });
});
