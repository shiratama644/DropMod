/**
 * E2E: .mrpack (Modrinth Modpack) インポートフロー (Phase 10-D)
 *
 * シナリオ:
 *   1. /profile にアクセス
 *   2. ハンバーガーメニュー (モバイル) or DesktopSidebar (PC) の
 *      「ZIP 読込」<label> input[type=file] にダミー .mrpack を setInputFiles
 *   3. useZipImport が .mrpack を検知 → 解析 → プロファイルを
 *      **直接作成** (モーダルは開かない) → 成功 Toast が表示される
 *
 * 2026-08-27 修正: .mrpack は「モーダルで確認」から「ダイレクト追加」仕様に
 * 変更されている (hooks/useZipImport.ts)。旧仕様 (NewProfileModal が開く) の
 * アサーションは失敗するため、現在の挙動 (Toast role=status で検出) に更新。
 *
 * ダミー .mrpack は e2e/helpers/mrpack.ts で jszip 生成 (Node 側)。
 * Sandbox は Chromium install 不可のため CI 上のみ実行。
 */

import { test, expect } from '@playwright/test';
import { buildMinimalMrpack } from './helpers/mrpack';

test.describe('ZIP import (.mrpack) flow (Phase 10-D)', () => {
  test('Desktop: DesktopSidebar から .mrpack を読み込むと NewProfileModal が開く', async ({
    page,
    viewport,
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC (md 以上) 専用 UI: DesktopSidebar の ZIP 読込 <label> をテスト'
    );

    await page.goto('/profile');
    const sidebar = page.locator('#desktop-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 10_000 });

    // DesktopSidebar 内の hidden file input を探す (label 経由)
    const fileInput = sidebar.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);

    const mrpackBuffer = await buildMinimalMrpack({ name: 'E2E Import Pack' });
    await fileInput.setInputFiles({
      name: 'e2e-test-pack.mrpack',
      mimeType: 'application/zip',
      buffer: mrpackBuffer,
    });

    // .mrpack はダイレクト追加 (モーダルなし) → 成功 Toast (role=status) が出る
    const toast = page
      .getByRole('status')
      .filter({ hasText: /インポート完了/ })
      .first();
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(toast).toBeVisible();
  });

  test('Mobile: ハンバーガーメニュー → ZIP 読込で NewProfileModal が開く', async ({
    page,
    viewport,
  }) => {
    test.skip(
      !viewport || viewport.width >= 768,
      'モバイル (< md) 専用 UI: BottomNav + MenuBottomSheet の ZIP 読込をテスト'
    );

    await page.goto('/profile');
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 10_000 });

    // ハンバーガーメニュータブ open
    const menuBtn = page.locator('button[aria-controls="menu-bottom-sheet"]');
    await menuBtn.click();

    const menuDialog = page.getByRole('dialog', { name: 'メニュー' });
    await menuDialog.waitFor({ state: 'visible', timeout: 5_000 });

    // Menu Sheet 内の hidden file input
    const fileInput = menuDialog.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);

    const mrpackBuffer = await buildMinimalMrpack({ name: 'E2E Mobile Import' });
    await fileInput.setInputFiles({
      name: 'e2e-mobile-pack.mrpack',
      mimeType: 'application/zip',
      buffer: mrpackBuffer,
    });

    // .mrpack はダイレクト追加 (モーダルなし) → 成功 Toast (role=status) が出る
    const toast = page
      .getByRole('status')
      .filter({ hasText: /インポート完了/ })
      .first();
    await toast.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(toast).toBeVisible();
  });
});
