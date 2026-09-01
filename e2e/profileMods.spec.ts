/**
 * E2E: 選択中一覧 (/profile) の削除操作 (COV-4)
 *
 * 検証フロー (計画 §10.4):
 *   1. .minecraft ZIP を Import して「Mod 1 件入りの Profile」を作る (決定論的)
 *   2. Mods / Resource Packs / Shaders タブの件数表示を確認
 *   3. チェックボックス選択 → 「削除」→ 確認ダイアログ → 項目が消える
 *   4. 再度 Import → 「全削除」→ 確認ダイアログ → タブが空になる
 *
 * ※ Import は既存 spec (zipEnvImport) と同じ経路 (installModrinthApiMock +
 *   buildMinecraftEnvZip) を再利用する。実 API に依存せず決定論的に動く。
 * ※ Desktop / Mobile で UI が異なる (DesktopTable / MobileList) ため、
 *   チェックボックスの選択方法を viewport で分岐する。
 */

import { test, expect } from '@playwright/test';
import type { Page, ViewportSize } from '@playwright/test';
import {
  buildMinecraftEnvZip,
  installModrinthApiMock
} from './helpers/minecraftEnv';

/**
 * .minecraft ZIP を Import して Profile を作成する。
 * 作成後はその Profile が「現在のプロファイル」になる。
 */
async function importEnvProfile(page: Page, viewport: ViewportSize | null): Promise<void> {
  await installModrinthApiMock(page);
  await page.goto('/profile');

  const fileInput = viewport && viewport.width < 768
    ? await openMobileFileInput(page)
    : await openDesktopFileInput(page);

  const { buffer } = await buildMinecraftEnvZip();
  await fileInput.setInputFiles({
    name: 'e2e-profile-src.zip',
    mimeType: 'application/zip',
    buffer
  });

  const dialog = page
    .getByRole('dialog')
    .filter({ hasText: /新規プロファイル|ZIPからプロファイル作成/ })
    .first();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  const analysis = dialog.getByRole('status', { name: '解析結果' });
  await analysis.waitFor({ state: 'visible', timeout: 20_000 });

  await dialog.getByRole('button', { name: '作成する' }).click();
  await expect(page.getByText(/作成しました/).first()).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function openDesktopFileInput(page: Page) {
  const sidebar = page.locator('#desktop-sidebar');
  await sidebar.waitFor({ state: 'visible', timeout: 10_000 });
  const fileInput = sidebar.locator('input[type="file"]');
  await expect(fileInput).toHaveCount(1);
  return fileInput;
}

async function openMobileFileInput(page: Page) {
  await page.locator('#bottom-nav').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('button[aria-controls="menu-bottom-sheet"]').click();
  const menuDialog = page.getByRole('dialog', { name: 'メニュー' });
  await menuDialog.waitFor({ state: 'visible', timeout: 5_000 });
  const fileInput = menuDialog.locator('input[type="file"]');
  await expect(fileInput).toHaveCount(1);
  return fileInput;
}

/** 選択中一覧の行チェックボックス (DesktopTable / MobileList の両方が DOM に存在するため :visible で絞る) */
function rowCheckbox(page: Page, label: string) {
  return page.locator(`input[aria-label="${label}"]:visible`);
}

test.describe('選択中一覧の削除 / 全削除 (COV-4)', () => {
  test('Desktop: チェック → 削除 → 全削除で Mods / RP / Shaders タブが更新される', async ({
    page,
    viewport
  }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC (md 以上) 専用: DesktopTable の全選択チェックボックスを検証'
    );

    // --- 1 回目: Import → Mods タブに 1 件 ---
    await importEnvProfile(page, viewport);

    // タブ件数: Mods 1 / Resource Packs 0 / Shaders 0
    const modsTab = page.getByRole('tab', { name: /Mods/ });
    await expect(modsTab).toBeVisible();
    await expect(modsTab).toContainText('1');
    await expect(page.getByRole('tab', { name: /Resource Packs/ })).toContainText('0');
    await expect(page.getByRole('tab', { name: /Shaders/ })).toContainText('0');

    // 行が 1 件表示されている
    const sodiumCheckbox = rowCheckbox(page, 'E2E Sodium を選択');
    await expect(sodiumCheckbox).toBeVisible();

    // --- チェックボックスで選択 → 削除 (1) ---
    await page.getByLabel('表示中をすべて選択').check();
    const deleteButton = page.getByRole('button', { name: /^削除 \(1\)$/ });
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    // 確認ダイアログ → 「削除する」
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('選択した項目を削除しますか？');
    await confirm.getByRole('button', { name: '削除する' }).click();

    // 削除され、Mods タブが空になる
    await expect(page.getByText(/1 個を削除しました/).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(page.locator('#empty-mods-state')).toBeVisible();
    await expect(modsTab).toContainText('0');
    await expect(sodiumCheckbox).toHaveCount(0);

    // --- 2 回目: Import → 全削除 ---
    await importEnvProfile(page, viewport);
    await expect(page.getByRole('tab', { name: /Mods/ })).toContainText('1');
    await expect(sodiumCheckbox).toBeVisible();

    await page.getByRole('button', { name: '全削除' }).click();
    const confirmAll = page.getByRole('alertdialog');
    await expect(confirmAll).toBeVisible();
    await expect(confirmAll).toContainText('Modをすべて削除しますか？');
    await confirmAll.getByRole('button', { name: 'すべて削除' }).click();

    await expect(page.getByText(/すべてのModを削除しました/).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(page.locator('#empty-mods-state')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Mods/ })).toContainText('0');
  });

  test('Mobile: 個別チェック → 削除で Mods タブが空になる', async ({ page, viewport }) => {
    test.skip(
      !viewport || viewport.width >= 768,
      'モバイル (< md) 専用: MobileList の個別チェックボックスを検証'
    );

    await importEnvProfile(page, viewport);

    const modsTab = page.getByRole('tab', { name: /Mods/ });
    await expect(modsTab).toContainText('1');
    const sodiumCheckbox = rowCheckbox(page, 'E2E Sodium を選択');
    await expect(sodiumCheckbox).toBeVisible();

    // 個別チェック → 削除 (1)
    await sodiumCheckbox.check();
    const deleteButton = page.getByRole('button', { name: /^削除 \(1\)$/ });
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '削除する' }).click();

    await expect(page.getByText(/1 個を削除しました/).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(page.locator('#empty-mods-state')).toBeVisible();
    await expect(modsTab).toContainText('0');
  });
});
