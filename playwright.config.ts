/**
 * Playwright E2E テスト設定 (Sub-Phase 8-D、Phase 10-P4 追記)
 *
 * 実行方針:
 *   - ローカル (Sandbox 含む) では Chromium バイナリ install 不可な環境がある
 *     → pnpm exec playwright install --with-deps chromium を明示的に走らせて使用
 *   - CI (GitHub Actions) では上記コマンドを常時走らせる
 *
 * webServer は pnpm build → pnpm start を裏で立ち上げる。
 * CI では reuseExistingServer=false で毎回新規起動、
 * ローカルでは既存サーバー流用可能。
 *
 * ブラウザプロジェクト方針 (Phase 10-P4):
 *   - `chromium-desktop`: Desktop Chrome 相当の Chromium
 *   - `chromium-mobile`:  モバイル viewport を持たせた Chromium (Pixel 7)
 *     ※ 従来は devices['iPhone 14'] を使っていたが、それは
 *        `defaultBrowserType: 'webkit'` なので WebKit バイナリを要求する。
 *        ローカル環境 (playwright install chromium のみ実行) では起動不能。
 *        Pixel 7 は `defaultBrowserType: 'chromium'` なので chromium 単独で動く。
 *   - どちらも launchOptions.args に `--disable-gpu` を渡し、GPU プロセスが
 *     使えない sandbox / Docker 環境で headless_shell が SIGTRAP で落ちるのを
 *     防ぐ (実際に発生した現象: "GPU process isn't usable. Goodbye.")。
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// sandbox / Docker で headless Chromium の GPU プロセスが起動失敗する対策。
// SwiftShader も含めて GPU 使用を完全にオフにする。
const CHROMIUM_LAUNCH_ARGS = [
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage'
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    // 失敗テストを GitHub アノテーションに出力 (エージェントが API で読めるように。2026-08-27)
    ['./e2e/helpers/annotationReporter.ts']
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
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: CHROMIUM_LAUNCH_ARGS }
      }
    },
    {
      name: 'chromium-mobile',
      // Pixel 7 は defaultBrowserType='chromium' なので WebKit 不要。
      // 従来 iPhone 14 だと WebKit バイナリを要求してローカルで起動不能だった。
      use: {
        ...devices['Pixel 7'],
        launchOptions: { args: CHROMIUM_LAUNCH_ARGS }
      }
    }
  ],
  webServer: {
    // H7-5 修正: CI では build 済み成果物 (.next) を再利用して start のみ実行
    //   → build job で成果物生成 → e2e job で pnpm build && pnpm start は build 二重実行
    //   → CI 検出時は start のみ、ローカルは既存挙動 (build + start)
    // ローカルでも .next が新しければ build スキップされる仕組みは Next.js 側にないので
    // ローカルは build + start のまま (dev の最新反映を優先)。
    command: process.env.CI
      ? `pnpm start --port ${PORT} --hostname 0.0.0.0`
      : `pnpm build && pnpm start --port ${PORT} --hostname 0.0.0.0`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
