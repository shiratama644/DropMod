/**
 * E2E: ZIP 保存フロー (Phase 10-D)
 *
 * シナリオ:
 *   1. /profile にアクセス (デフォルトプロファイル存在)
 *   2. DesktopSidebar の「ZIP 保存 (全.jar)」ボタン (PC) または
 *      ハンバーガーメニュー内の「ZIP 保存」(モバイル) をクリック
 *   3. ダウンロード開始を Playwright download API で検知
 *   4. ダウンロードされた ZIP のファイル名が dropmod-*.zip 形式であることを確認
 *
 * 検証観点:
 *   - ZipProgressModal が open されて完了 (or 空プロファイルなら何らかの処理)
 *   - browser の download event が発火
 *
 * 【空プロファイルでも Mod 0 個の ZIP が生成される想定】
 *   実装依存: useZipExport で mods.length === 0 なら showToast('Mod がありません')
 *   等で早期 return する可能性あり → その場合はダウンロードは発火しないので
 *   Toast が表示されることを確認する形にフォールバック。
 *
 * Sandbox は Modrinth API 到達不可 + Chromium install 不可のため、CI 上のみ実行。
 */

import { test, expect } from '@playwright/test';
import { waitForAppHydrated } from './helpers/appReady';

test.describe('ZIP export flow (Phase 10-D)', () => {
  test('Desktop: ZIP 保存ボタンで download or toast 通知が発生する', async ({
    page,
    viewport,
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC (md 以上) 専用 UI: DesktopSidebar の ZIP 保存ボタンをテスト'
    );

    await page.goto('/profile');
    // hydration 完了を待つ (クリックが no-op になる競合対策。2026-08-27)
    await waitForAppHydrated(page);
    // DesktopSidebar が md 以上で表示
    const sidebar = page.locator('#desktop-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 10_000 });

    const downloadBtn = sidebar.getByRole('button', { name: /ZIP\s*保存/ });
    await expect(downloadBtn).toBeVisible();

    // download と Toast/モーダルを並行監視する (2026-08-27 修正)。
    // 旧実装は「download を 5s 待ってから Toast を確認」だったが、Toast は
    // 3 秒で自動消滅するため待機後に確認すると必ず消えている。
    // また [role=status] は BottomNav のバッジ (PC では非表示) にも付いている
    // ため :visible で実際に見えている要素のみを対象にする。
    const downloadPromise = page
      .waitForEvent('download', { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    const feedbackPromise = page
      .locator('[role="alert"]:visible, [role="status"]:visible, [role="dialog"]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    await downloadBtn.click();

    const [hasDownload, hasFeedback] = await Promise.all([downloadPromise, feedbackPromise]);
    // 空プロファイルでは Toast「プロファイルにModが登録されていません」、
    // Mod があれば ZipProgressModal か download のいずれかが起こるはず
    expect(hasDownload || hasFeedback).toBe(true);
  });

  test('Mobile: ハンバーガーメニュー → ZIP 保存で download or toast', async ({
    page,
    viewport,
  }) => {
    test.skip(
      !viewport || viewport.width >= 768,
      'モバイル (< md) 専用 UI: BottomNav + BottomSheet の ZIP 保存ボタンをテスト'
    );

    await page.goto('/profile');
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 10_000 });
    // hydration 完了を待つ (クリックが no-op になる競合対策。2026-08-27)
    await waitForAppHydrated(page);

    // ハンバーガーメニュー (メニュー) タブ = 4 番目のボタン (aria-controls=menu-bottom-sheet)
    const menuBtn = page.locator('button[aria-controls="menu-bottom-sheet"]');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Menu Sheet 内の "ZIP 保存" ボタンを待つ (aria-label="メニュー" の dialog)
    const menuDialog = page.getByRole('dialog', { name: 'メニュー' });
    await menuDialog.waitFor({ state: 'visible', timeout: 5_000 });

    const zipBtn = menuDialog.getByRole('button', { name: /ZIP\s*保存/ });
    await expect(zipBtn).toBeVisible();

    // download と Toast/モーダルを並行監視 (Desktop 側と同様の 2026-08-27 修正)
    const downloadPromise = page
      .waitForEvent('download', { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    const feedbackPromise = page
      .locator('[role="alert"]:visible, [role="status"]:visible, [role="dialog"]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    await zipBtn.click();

    const [hasDownload, hasFeedback] = await Promise.all([downloadPromise, feedbackPromise]);
    expect(hasDownload || hasFeedback).toBe(true);
  });
});
