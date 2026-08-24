/**
 * E2E: プレビューモーダル と 詳細ページ のフロー (ルーティング再設計)
 *
 * 新 URL 設計:
 *   検索一覧   : /discover/mods
 *   プレビューモーダル : /discover/mods/<slug>   (Intercept: 一覧を破棄せず重ねる)
 *   詳細ページ : /mod/<slug>
 *
 * シナリオ:
 *   1. /discover/mods (検索一覧) にアクセス
 *   2. カードクリック → モーダルが開く (URL は /discover/mods/<slug> に変わる)
 *   3. Escape で閉じる → router.back() で一覧に戻る (状態保持)
 *   4. 直接 /mod/<slug> アクセス → フル詳細ページ (モーダルではない)
 */

import { test, expect } from '@playwright/test';

test.describe('Project preview modal & detail page flow', () => {
  test('opens preview modal from card on /discover/mods and closes with back()', async ({
    page
  }) => {
    await page.goto('/discover/mods');

    const firstCard = page.locator('.mod-card-item').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 });

    // モバイルは Header、PC は DesktopSidebar が常時表示
    await expect(page.locator('#desktop-sidebar, #app-header').first()).toBeVisible();

    // クリック前の URL は一覧
    await expect(page).toHaveURL('/discover/mods');

    // カードクリック → モーダル (Intercept)
    await firstCard.click();
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // URL が /discover/mods/<slug> に変わる (Intercepting Route)
    await expect(page).toHaveURL(/\/discover\/mods\/[^/]+$/);

    // Escape で閉じる → router.back() で一覧に戻る
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL('/discover/mods');
  });

  test('hides mobile BottomNav while preview modal is open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/discover/mods');
    const firstCard = page.locator('.mod-card-item').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.locator('#bottom-nav')).toBeVisible();

    await firstCard.click();
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(page.locator('#bottom-nav')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#bottom-nav')).toBeVisible();
  });

  test('preview modal has a 詳細ページ button linking to /<型>/<slug>', async ({
    page
  }) => {
    await page.goto('/discover/mods');
    const firstCard = page.locator('.mod-card-item').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 });
    await firstCard.click();
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // モーダルに「詳細ページ」ボタンがあり、詳細ページ (/<型>/<slug>) へ遷移する
    const detailLink = dialog.getByRole('link', { name: /詳細ページ/ });
    await expect(detailLink).toBeVisible();
    const href = await detailLink.getAttribute('href');
    expect(href).toMatch(/^\/(mod|modpack|resourcepack|shader)\/[^/]+$/);
  });

  test('direct URL access to /mod/<slug> renders full detail page (not modal)', async ({
    page
  }) => {
    // 直接 URL アクセス → フル詳細ページ (ModDetailPageView)
    await page.goto('/mod/sodium');

    // ブレッドクラム「Mod 一覧に戻る」
    await expect(page.getByRole('link', { name: /Mod 一覧に戻る|検索に戻る/ })).toBeVisible({
      timeout: 15_000
    });
    // モバイル Header / PC DesktopSidebar は表示されたまま
    await expect(page.locator('#desktop-sidebar, #app-header').first()).toBeVisible();
    // dialog は無い (フルページ)
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // ページ h1 = Mod タイトル (SEO)
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
