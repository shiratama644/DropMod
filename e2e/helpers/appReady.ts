/**
 * E2E 共通ヘルパー: アプリの操作可能状態を待つ (2026-08-27)
 *
 * 背景 (初回 CI 実行の失敗分析より):
 * - SSR HTML は hydration 前でも visible 判定になるため、`waitFor(visible)` 直後の
 *   click / setInputFiles が React のイベントハンドラ未アタッチ状態で no-op になる
 *   競合が発生した (theme トグル等が安定失敗)。
 *   → AppShell が hydration 完了時に `html[data-hydrated]` を付与するため、
 *   これを待ってから操作する。
 * - `#desktop-sidebar` は `hidden md:flex` で DOM 常駐のため、
 *   `locator('#desktop-sidebar, #app-header').first()` はモバイルで
 *   「非表示の sidebar」を掴んで永久タイムアウトする。
 *   → `:visible` 擬似クラスで実際に見えている側を掴む navVisible を使う。
 */

import type { Locator, Page } from '@playwright/test';

/** React hydration 完了 (イベントハンドラ有効) を待つ */
export async function waitForAppHydrated(page: Page, timeout = 15_000): Promise<void> {
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached', timeout });
}

/** 現在のビューポートで実際に表示されているナビ (PC: sidebar / モバイル: header) */
export function navVisible(page: Page): Locator {
  return page.locator('#desktop-sidebar:visible, #app-header:visible');
}

/** ナビ系が見える + hydration 済みの状態まで待つ (ページ遷移直後の基本待機) */
export async function waitForAppReady(page: Page, timeout = 15_000): Promise<void> {
  await waitForAppHydrated(page, timeout);
  await navVisible(page).first().waitFor({ state: 'visible', timeout });
}
