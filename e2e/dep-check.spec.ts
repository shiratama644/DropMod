/**
 * E2E: 依存関係・競合チェックモーダル (Phase 10-D)
 *
 * シナリオ:
 *   1. /profile にアクセス
 *   2. DesktopSidebar (PC) or Header モバイルアクション の
 *      「依存・競合チェック」ボタンをクリック
 *   3. DependencyCheckModal が開く
 *   4. 空プロファイル / Mod 未追加でも「問題ありません」等のメッセージが表示される
 *   5. モーダル閉じるを確認
 *
 * ※ 実際の依存 mod 追加は Modrinth API 依存で Sandbox / CI で不安定
 *    → モーダルが正しく open/close することを主眼に検証
 *
 * Sandbox は Chromium install 不可のため CI 上のみ実行。
 */

import { test, expect } from '@playwright/test';

test.describe('Dependency check modal (Phase 10-D)', () => {
  test('Desktop: DesktopSidebar から依存・競合チェックを起動 → モーダル開閉', async ({
    page,
    viewport,
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC (md 以上) 専用 UI: DesktopSidebar の依存チェックボタンをテスト'
    );

    await page.goto('/profile');
    const sidebar = page.locator('#desktop-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 10_000 });

    const depBtn = sidebar.getByRole('button', { name: /依存.*競合.*チェック/ });
    await expect(depBtn).toBeVisible();
    await depBtn.click();

    // DependencyCheckModal が open (dialog role)
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /依存|競合/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(dialog).toBeVisible();

    // Escape or close ボタンで閉じる
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('Mobile: Header モバイルアクションから依存・競合チェックを起動', async ({
    page,
    viewport,
  }) => {
    test.skip(
      !viewport || viewport.width >= 768,
      'モバイル (< md) 専用 UI: Header 内のモバイルアクションをテスト'
    );

    await page.goto('/profile');
    await page.waitForSelector('#app-header', { state: 'visible', timeout: 10_000 });

    // Header 内 (モバイル領域) の依存・競合チェックボタン
    // aria-label="依存・競合チェック" で検索
    const depBtn = page
      .locator('#app-header')
      .getByRole('button', { name: /依存.*競合.*チェック/ })
      .first();
    await expect(depBtn).toBeVisible();
    await depBtn.click();

    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /依存|競合/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
