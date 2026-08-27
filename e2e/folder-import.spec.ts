/**
 * E2E: Minecraft フォルダ取り込み (Phase 11-B/C, Chromium Desktop 専用)
 *
 * シナリオ:
 *   1. showDirectoryPicker をモック (helpers/folderPickerMock) して
 *      fake .minecraft ツリー (Fabric 環境 + 既知 Mod + 未知ファイル) を返す
 *   2. Modrinth API (/version_files, /projects) を page.route でモック
 *   3. /profile → DesktopSidebar の「新規プロファイル作成」→ NewProfileModal
 *   4. 「フォルダを選択」→ 解析 → Analysis View (環境/件数/検査/未識別) を確認
 *   5. 「作成する」→ プロファイル作成 toast
 *
 * ※ File System Access API は Chromium Desktop のみのため、
 *   モバイル viewport ではスキップする。
 * ※ Sandbox は Chromium install 不可のため CI 上のみ実行。
 */

import { test, expect } from '@playwright/test';
import {
  ENV_FIXTURE,
  ENV_FILES,
  installModrinthApiMock
} from './helpers/minecraftEnv';
import { installFolderPickerMock } from './helpers/folderPickerMock';

test.describe('Minecraft フォルダ取り込み (Phase 11, Read-only)', () => {
  test('フォルダ選択 → 解析 → Analysis View → プロファイル作成の一連', async ({
    page,
    viewport
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC 専用: File System Access API (Desktop Chromium) のみ'
    );

    await installFolderPickerMock(page, 'My E2E Instance', ENV_FILES);
    await installModrinthApiMock(page);

    await page.goto('/profile');
    const sidebar = page.locator('#desktop-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 10_000 });

    // モックが有効化されていること (addInitScript が効いている前提の防御確認)
    const pickerReady = await page.evaluate(
      () => typeof window.showDirectoryPicker === 'function'
    );
    expect(pickerReady).toBe(true);

    // 新規プロファイル作成モーダルを開く
    await sidebar.getByRole('button', { name: '新規プロファイル作成' }).click();
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // フォルダを選択 → 解析が走る
    await dialog.getByRole('button', { name: /フォルダを選択/ }).click();

    // Analysis View が表示される (解析完了)
    const analysis = dialog.getByRole('status', { name: '解析結果' });
    await analysis.waitFor({ state: 'visible', timeout: 20_000 });

    // 環境検出 (公式ランチャー + Fabric 1.21.1 / 0.16.0)
    await expect(analysis.getByText(/公式ランチャー \(\.minecraft\)/)).toBeVisible();
    await expect(
      analysis.getByText(
        `Minecraft ${ENV_FIXTURE.mcVersion} / ${ENV_FIXTURE.loader} / ${ENV_FIXTURE.loaderVersion}`
      )
    ).toBeVisible();

    // 件数: 2 Mods (既知 1 + 未知 1) / 1 RP (未知) / 未識別 2 個
    await expect(
      analysis.getByText('2 個のMod / 1 個のリソースパック / 0 個のシェーダー / 未識別 2 個')
    ).toBeVisible();

    // §5 検査: 未識別ファイルの warning
    await expect(
      analysis.getByText('2 個のファイルを Modrinth と照合できませんでした')
    ).toBeVisible();

    // プロファイル名はフォルダ名から自動生成 (§6.1)
    await expect(dialog.getByLabel('プロファイル名')).toHaveValue('My E2E Instance');

    // 作成 → toast + モーダル close
    await dialog.getByRole('button', { name: '作成する' }).click();
    await expect(page.getByText(/作成しました/).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('不適切なフォルダ名 (.minecraft) は検出環境からプロファイル名を生成 (§6.1)', async ({
    page,
    viewport
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC 専用: File System Access API (Desktop Chromium) のみ'
    );

    await installFolderPickerMock(page, '.minecraft', ENV_FILES);
    await installModrinthApiMock(page);

    await page.goto('/profile');
    const sidebar = page.locator('#desktop-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 10_000 });

    await sidebar.getByRole('button', { name: '新規プロファイル作成' }).click();
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    await dialog.getByRole('button', { name: /フォルダを選択/ }).click();
    const analysis = dialog.getByRole('status', { name: '解析結果' });
    await analysis.waitFor({ state: 'visible', timeout: 20_000 });

    // .minecraft は特定名 → 検出環境から生成
    await expect(dialog.getByLabel('プロファイル名')).toHaveValue(
      `${ENV_FIXTURE.loader} ${ENV_FIXTURE.mcVersion}`
    );
  });
});
