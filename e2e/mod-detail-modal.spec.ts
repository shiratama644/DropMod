/**
 * E2E: Mod 詳細モーダルの開閉フロー (Phase 9-F: URL 再設計対応)
 *
 * シナリオ:
 *   1. /mods (Mod 検索一覧) にアクセス
 *   2. Mod カードをクリック → モーダルが開く (URL は /mods/[slug] に変わる)
 *   3. Escape でモーダルを閉じる → router.back() で /mods に戻る
 *
 * 検証観点:
 *   - Intercepting Routes による URL 変更 + モーダル表示
 *   - router.back() でスムーズに元の一覧に戻る (Phase 9-E で router.replace('/') から変更)
 *   - フルページ (直接 URL アクセス) との差別化
 */

import { test, expect } from '@playwright/test';

test.describe('Mod detail modal flow (Phase 9-F)', () => {
  test('opens modal from mod card on /mods and closes cleanly with back()', async ({
    page
  }) => {
    // Phase 9-F: Home → /mods に URL 変更 (Modrinth 検索は /mods で提供)
    await page.goto('/discover/mods');

    // Mod カードが表示されるまで待つ
    // (SSR 経由の initialHits があれば即表示、無ければ CSR fetch 完了待ち)
    const firstCard = page.locator('.mod-card-item').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 });

    // モバイルは Header、PC は DesktopSidebar が常時表示
    await expect(page.locator('#desktop-sidebar, #app-header').first()).toBeVisible();

    // Mod カードクリック前の URL は /mods
    await expect(page).toHaveURL('/discover/mods');

    // Mod カードをクリック
    await firstCard.click();

    // モーダル (variant="modal") が開く。dialog role で判定
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // URL が /mods/[slug] に変わる (Intercepting Route)
    await expect(page).toHaveURL(/\/mods\/[^/]+$/);

    // Escape で閉じる
    await page.keyboard.press('Escape');

    // モーダルが消える
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Phase 9-F: router.back() で /mods に戻る (旧 router.replace('/') は撤廃)
    await expect(page).toHaveURL('/discover/mods');
  });

  test('direct URL access to /mods/[slug] renders full page (not modal)', async ({
    page
  }) => {
    // 直接 URL アクセス → Intercepting Route は発火せず、フルページ描画
    await page.goto('/mods/sodium');

    // Phase 10-P1: 詳細ページを ModDetailPageView に刷新。
    //   - Header と BottomNav は「通常ページ」として表示されたままにする
    //     (旧: body に mod-fullpage クラスが付いて Header 非表示、を撤廃)
    //   - 上部にブレッドクラム的な「Mod 一覧に戻る」リンクがある
    //   - dialog role は付いていない (モーダルではないため)
    await expect(page.getByRole('link', { name: /Mod 一覧に戻る/ })).toBeVisible({
      timeout: 15_000
    });
    // モバイルは Header、PC は DesktopSidebar が表示されたまま
    await expect(page.locator('#desktop-sidebar, #app-header').first()).toBeVisible();
    // dialog は無い (フルページなのでモーダルではない)
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // ページ h1 = Mod タイトル (SEO 継続)
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('legacy /mod/[slug] URL redirects to /mods/[slug] (SEO 保全)', async ({
    page
  }) => {
    // Phase 9-F: 旧 URL に 308 permanent redirect が設定されている (next.config.ts)
    const response = await page.goto('/mod/sodium', { waitUntil: 'networkidle' });
    // リダイレクト先の最終 URL が /mods/sodium であること
    await expect(page).toHaveURL('/mods/sodium');
    // response 自体は 200 (redirect chain 後) だが、初回応答は 308 permanent redirect のはず
    // (Playwright は自動的に follow するので status は 200)
    expect(response?.status()).toBeLessThan(400);
  });
});
