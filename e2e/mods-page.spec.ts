/**
 * E2E: /mods (Modrinth 検索一覧) と /profile (選択中プロファイル一覧) の基本レンダー確認
 *
 * Phase 9-F: URL 再設計
 *   - 旧 /mods (選択中プロファイル)   → /profile に移動
 *   - 新 /mods (Modrinth 検索一覧)    → 旧 Home のコンテンツ
 */

import { test, expect } from '@playwright/test';

test('/mods (Modrinth 検索一覧) renders and shows search UI', async ({ page }) => {
  await page.goto('/mods');
  await page.waitForSelector('#app-header', { state: 'visible' });

  // タイトル
  await expect(page).toHaveTitle(/DropMod/);

  // 検索入力 or Mod カードのいずれかが表示される
  const searchInput = page.locator('#search-bar-panel input[type="text"]');
  await expect(searchInput).toBeVisible({ timeout: 10_000 });
});

test('/profile (選択中プロファイル一覧) renders and shows profile info', async ({
  page
}) => {
  await page.goto('/profile');
  await page.waitForSelector('#app-header', { state: 'visible' });

  // タイトル
  await expect(page).toHaveTitle(/DropMod/);

  // 「選択中のMod一覧」見出しが見える
  await expect(page.getByText(/選択中のMod一覧/)).toBeVisible();
});

test('settings page renders', async ({ page }) => {
  await page.goto('/settings');
  await page.waitForSelector('#app-header', { state: 'visible' });
  await expect(page).toHaveTitle(/DropMod/);
});
