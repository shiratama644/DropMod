/**
 * E2E: .mrpack (Modrinth Modpack) インポートフロー (Phase 10-D)
 *
 * シナリオ:
 *   1. /profile にアクセス
 *   2. ハンバーガーメニュー (モバイル) or DesktopSidebar (PC) の
 *      「ZIP 読込」<label> input[type=file] にダミー .mrpack を setInputFiles
 *   3. useZipImport が .mrpack を検知 → NewProfileModal が
 *      pendingImportData 付きで開く
 *   4. NewProfileModal が可視化されることを確認 (プロファイル作成モーダル)
 *
 * ダミー .mrpack は e2e/helpers/mrpack.ts で jszip 生成 (Node 側)。
 * setInputFiles は buffer を渡せるので fs 書き込み不要。
 *
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

    // NewProfileModal (プロファイル作成) が開くはず
    // dialog role で「新規プロファイル」など
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル|プロファイル作成|E2E Import Pack/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // 開いていることが確認できれば OK (自動 close は URL 変化不要)
    await expect(dialog).toBeVisible();
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

    // NewProfileModal が開く
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル|プロファイル作成|E2E Mobile Import/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(dialog).toBeVisible();
  });
});
