/**
 * Playwright E2E テスト設定 (Sub-Phase 8-D)
 *
 * 実行方針:
 *   - ローカル (Sandbox 含む) では Chromium バイナリ install 不可な環境がある
 *     → pnpm exec playwright install --with-deps chromium を明示的に走らせて使用
 *   - CI (GitHub Actions) では上記コマンドを常時走らせる
 *
 * webServer は pnpm build → pnpm start を裏で立ち上げる。
 * CI では reuseExistingServer=false で毎回新規起動、
 * ローカルでは既存サーバー流用可能。
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list']
  ],
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['iPhone 14'] }
    }
  ],
  webServer: {
    // production ビルドを使う (dev mode のオーバーヘッドと HMR ノイズを避ける)
    command: 'pnpm build && pnpm start --port ' + PORT + ' --hostname 0.0.0.0',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
