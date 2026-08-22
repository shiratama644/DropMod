/**
 * Sub-Phase 8-D E2E: /mods ページの基本レンダー確認
 */

import { test, expect } from '@playwright/test';

test('mods page renders and shows profile info', async ({ page }) => {
  await page.goto('/mods');
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
