/**
 * E2E: .minecraft フォルダ全体 ZIP 取り込み (Phase 11-C フォールバック)
 *
 * Firefox / Safari (File System Access API 非対応) 向けのフォールバック
 * 経路。全ブラウザで使えるため Desktop / Mobile 両方で検証する。
 *
 * シナリオ:
 *   1. .minecraft 構造の ZIP (mods/ + versions/ + resourcepacks/) を
 *      helpers/minecraftEnv で生成
 *   2. Modrinth API を page.route でモック (決定論的)
 *   3. ZIP 読込 input に setInputFiles
 *   4. NewProfileModal が pendingImportData (解析結果) 付きで開く
 *   5. Analysis View (環境/件数/未識別) を確認 → 作成 → toast
 *
 * ※ Sandbox は Chromium install 不可のため CI 上のみ実行。
 */

import { test, expect } from '@playwright/test';
import {
  ENV_FIXTURE,
  buildMinecraftEnvZip,
  installModrinthApiMock
} from './helpers/minecraftEnv';

test.describe('.minecraft ZIP 取り込み (Phase 11-C fallback)', () => {
  test('Desktop: DesktopSidebar の ZIP 読込から .minecraft ZIP を解析', async ({
    page,
    viewport
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC (md 以上) 専用 UI: DesktopSidebar の ZIP 読込 <label> をテスト'
    );

    await installModrinthApiMock(page);

    await page.goto('/profile');
    const sidebar = page.locator('#desktop-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 10_000 });

    const fileInput = sidebar.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);

    const { buffer } = await buildMinecraftEnvZip();
    await fileInput.setInputFiles({
      name: 'my-e2e-env.zip',
      mimeType: 'application/zip',
      buffer
    });

    // NewProfileModal が開く
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // Analysis View: 環境検出 (公式ランチャー + Fabric 1.21.1)
    const analysis = dialog.getByRole('status', { name: '解析結果' });
    await analysis.waitFor({ state: 'visible', timeout: 20_000 });
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

    // プロファイル名は ZIP 名 (拡張子除去) から自動生成
    await expect(dialog.getByLabel('プロファイル名')).toHaveValue('my-e2e-env');

    // 作成 → toast + close
    await dialog.getByRole('button', { name: '作成する' }).click();
    await expect(page.getByText(/作成しました/).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('Desktop: .minecraft/ サブフォルダ入り ZIP も re-root して解析', async ({
    page,
    viewport
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC (md 以上) 専用 UI: DesktopSidebar の ZIP 読込 <label> をテスト'
    );

    await installModrinthApiMock(page);

    await page.goto('/profile');
    const sidebar = page.locator('#desktop-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 10_000 });
    const fileInput = sidebar.locator('input[type="file"]');

    // ZIP 直下に .minecraft/ フォルダがあるケース
    const { buffer } = await buildMinecraftEnvZip(true);
    await fileInput.setInputFiles({
      name: 'wrapped-mc.zip',
      mimeType: 'application/zip',
      buffer
    });

    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // .minecraft/versions が検出される (= re-root 成功)
    const analysis = dialog.getByRole('status', { name: '解析結果' });
    await analysis.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(
      analysis.getByText(
        `Minecraft ${ENV_FIXTURE.mcVersion} / ${ENV_FIXTURE.loader} / ${ENV_FIXTURE.loaderVersion}`
      )
    ).toBeVisible();
  });

  test('Mobile: ハンバーガーメニュー → ZIP 読込で .minecraft ZIP を解析', async ({
    page,
    viewport
  }) => {
    test.skip(
      !viewport || viewport.width >= 768,
      'モバイル (< md) 専用 UI: MenuBottomSheet の ZIP 読込をテスト'
    );

    await installModrinthApiMock(page);

    await page.goto('/profile');
    await page.waitForSelector('#bottom-nav', { state: 'visible', timeout: 10_000 });

    const menuBtn = page.locator('button[aria-controls="menu-bottom-sheet"]');
    await menuBtn.click();
    const menuDialog = page.getByRole('dialog', { name: 'メニュー' });
    await menuDialog.waitFor({ state: 'visible', timeout: 5_000 });

    const fileInput = menuDialog.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1);

    const { buffer } = await buildMinecraftEnvZip();
    await fileInput.setInputFiles({
      name: 'mobile-env.zip',
      mimeType: 'application/zip',
      buffer
    });

    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /新規プロファイル/ })
      .first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    const analysis = dialog.getByRole('status', { name: '解析結果' });
    await analysis.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(
      analysis.getByText(
        `Minecraft ${ENV_FIXTURE.mcVersion} / ${ENV_FIXTURE.loader} / ${ENV_FIXTURE.loaderVersion}`
      )
    ).toBeVisible();
  });
});
