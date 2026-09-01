/**
 * E2E: /discover/mods のスケルトン → 結果表示 (COV-4)
 *
 * 検証フロー (計画 §10.4):
 *   1. /discover/mods を開き、SSR 結果 (initialHits) が表示されることを確認
 *   2. 以降のクライアント検索 fetch (/api/modrinth/search) を page.route で
 *      ゲート (遅延モック) する
 *   3. カテゴリ変更 (新規クエリ = initialData 無効) → スケルトン 6 枚が表示
 *   4. ゲート解放 → スケルトンが消えて検索結果が表示される
 *
 * ポイント: カテゴリ変更で initialMatches が false になり initialData が無効化
 * されるため、fetch 中は `isLoading && safeHits.length === 0` → スケルトンが
 * 出る。ゲートでこの期間を決定的にする。
 */

import { test, expect } from '@playwright/test';

test.describe('discover スケルトン (COV-4)', () => {
  test('カテゴリ変更でスケルトン → 結果表示 (route 遅延モック)', async ({ page }) => {
    // 初期ロード (SSR) の結果を待つ
    await page.goto('/discover/mods');
    await page.locator('.mod-card-item').first().waitFor({ state: 'visible', timeout: 20_000 });
    await expect(page.locator('#mod-grid .skeleton-shimmer')).toHaveCount(0);

    // --- クライアント検索 fetch をゲートする ---
    let releaseSearch!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSearch = resolve;
    });
    let searchRequests = 0;
    await page.route('**/api/modrinth/search*', async (route) => {
      searchRequests += 1;
      await gate;
      await route.continue();
    });

    // --- カテゴリ 'Optimization' をクリック → 新規クエリ fetch (ゲート中) ---
    const categoryButton = page.getByRole('button', { name: 'Optimization' });
    await expect(categoryButton).toBeVisible();
    await categoryButton.click();

    // fetch が始まり、スケルトン (6 枚) が表示される
    await expect(page.locator('#mod-grid .skeleton-shimmer')).toHaveCount(6, {
      timeout: 5_000
    });
    expect(searchRequests).toBeGreaterThanOrEqual(1);
    // ゲート中は結果カードが出ない
    await expect(page.locator('.mod-card-item')).toHaveCount(0);

    // --- 解放 → スケルトンが消えて結果が表示される ---
    releaseSearch();
    await expect(page.locator('.mod-card-item').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#mod-grid .skeleton-shimmer')).toHaveCount(0);
    // カテゴリが適用済み (aria-pressed)
    await expect(categoryButton).toHaveAttribute('aria-pressed', 'true');
  });
});
