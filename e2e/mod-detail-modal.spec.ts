/**
 * Sub-Phase 8-D E2E: Mod 詳細モーダルの開閉フロー (M4-5 検証込み)
 *
 * シナリオ:
 *   1. Home にアクセス
 *   2. Mod カードをクリック → モーダルが開く
 *   3. Escape でモーダルを閉じる
 *   4. URL が / に戻る (router.replace('/') が効いている)
 */

import { test, expect } from '@playwright/test';

test.describe('Mod detail modal flow', () => {
  test('opens modal from mod card and closes cleanly', async ({ page }) => {
    await page.goto('/');

    // Mod カードが表示されるまで待つ
    // (SSR 経由の initialHits があれば即表示、無ければ CSR fetch 完了待ち)
    const firstCard = page.locator('.mod-card-item').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 });

    // Header は常に表示
    await expect(page.locator('#app-header')).toBeVisible();

    // Mod カードをクリック
    await firstCard.click();

    // モーダル (variant="modal") が開く。dialog role で判定
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // Escape で閉じる
    await page.keyboard.press('Escape');

    // モーダルが消えることを確認
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // URL が / に戻っている (router.replace('/'))
    await expect(page).toHaveURL('/');
  });
});
