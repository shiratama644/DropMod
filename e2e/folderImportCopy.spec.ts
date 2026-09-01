/**
 * E2E: フォルダ選択モーダルの文言 (COV-4)
 *
 * 2026-09-01 の UI 変更で更新された文言を検証する (計画 §10.4):
 *   - フォルダ選択セクションのヘルパーテキスト
 *     「.minecraft または Prism インスタンス などを選ぶと、環境とファイルを自動解析します。」
 *   - 解析完了後の Analysis View の見出し「解析結果」 (role=status / aria-label="解析結果")
 *   - 非対応ブラウザ (showDirectoryPicker 無し) でのフォールバック文言
 *
 * Desktop は File System Access API が使えるため folderPickerMock で選択する。
 * Mobile (chromium-mobile) はデスクトップ Chromium 相当のため API が存在してしまう
 * ので、addInitScript で削除して「非対応ブラウザ」状態を作って文言を検証する。
 */

import { test, expect } from '@playwright/test';
import {
  ENV_FILES,
  ENV_FIXTURE,
  installModrinthApiMock
} from './helpers/minecraftEnv';
import { installFolderPickerMock } from './helpers/folderPickerMock';

test.describe('フォルダ選択モーダルの文言 (COV-4)', () => {
  test('Desktop: ヘルパー文言 → フォルダ選択 → 解析結果が表示される', async ({
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

    await sidebar.getByRole('button', { name: '新規プロファイル作成' }).click();
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // 更新後のヘルパー文言
    await expect(
      dialog.getByText(/などを選ぶと、環境とファイルを自動解析します/)
    ).toBeVisible();
    await expect(dialog.getByText('.minecraft または Prism インスタンス')).toBeVisible();

    // フォルダを選択 → 解析 → 解析結果 (role=status) が表示される
    await dialog.getByRole('button', { name: /フォルダを選択/ }).click();
    const analysis = dialog.getByRole('status', { name: '解析結果' });
    await analysis.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(analysis.getByText('解析結果')).toBeVisible();

    // 環境検出 (公式ランチャー + Fabric 1.21.1 / 0.16.0)。
    // 失敗時は解析結果の実テキストを診断として先頭に含める (annotationReporter は先頭 200 字)
    await expect(async () => {
      const text = (await analysis.innerText()).replace(/\s+/g, ' ');
      expect(
        text,
        `DIAG[analysis] ${text.slice(0, 200)}`
      ).toContain(
        `Minecraft ${ENV_FIXTURE.mcVersion} / ${ENV_FIXTURE.loader} / ${ENV_FIXTURE.loaderVersion}`
      );
    }).toPass({ timeout: 10_000 });
  });

  test('Mobile: showDirectoryPicker 非対応のフォールバック文言が表示される', async ({
    page,
    viewport
  }) => {
    test.skip(
      !viewport || viewport.width >= 768,
      'モバイル (< md) 専用: 非対応ブラウザの文言を検証'
    );

    // 非対応ブラウザ状態を作る (chromium-mobile も API 自体は存在するため削除する)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
    });

    await page.goto('/profile');
    await page.locator('#app-header:visible').waitFor({ state: 'visible', timeout: 10_000 });

    await page.getByRole('button', { name: '新規プロファイル作成' }).click();
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // フォルダ選択ボタンは非対応表示になり、フォールバック文言が出る
    await expect(dialog.getByText('このブラウザでは非対応')).toBeVisible();
    await expect(
      dialog.getByText(/Firefox \/ Safari \/ モバイルはフォルダ選択非対応です/)
    ).toBeVisible();
  });
});
