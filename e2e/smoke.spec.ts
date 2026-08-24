/**
 * スモークテスト: 全主要ページが 200 で返ること
 */
import { test, expect } from '@playwright/test';

// ルーティング再設計: 検索一覧は /discover/<複数形>
const PAGES = [
  '/',
  '/mods',
  '/discover/mods',
  '/discover/modpacks',
  '/discover/resourcepacks',
  '/discover/shaders',
  '/profile',
  '/settings',
  '/modpack',
  '/resourcepack',
  '/shader',
  '/api/health',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest'
];

for (const path of PAGES) {
  test(`GET ${path} returns 200`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
  });
}

test('GET /nonexistent returns 404', async ({ request }) => {
  const res = await request.get('/nonexistent');
  expect(res.status()).toBe(404);
});

test('Home page renders header with h1 "DropMod"', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText(/DropMod/);
  // h1 は 1 個だけ (C6-1 継続確認)
  await expect(page.locator('h1')).toHaveCount(1);
});
