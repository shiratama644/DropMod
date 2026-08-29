/**
 * E2E: 環境との Sync (Phase 12-E2E / PHASE12_PLAN.md §6「必須」)
 *
 * ## 検証する 3 つ (計画書 §6: 「mock handle 経由の Sync 成功/失敗/復帰」)
 *
 * | # | シナリオ | 期待 |
 * | --- | --- | --- |
 * | 1 | **成功** | Preview 承認 → ファイルがフォルダに書き込まれる |
 * | 2 | **失敗** | 書き込みが失敗 → **Rollback** され、ファイルが残らない |
 * | 3 | **復帰** | 中断された Sync (`running`) を検出し、確認ダイアログを出す (D-4) |
 *
 * ## 構成
 *
 * - **書き込み先**: `installFolderPickerMock()` が返すメモリ上の fake .minecraft。
 *   Phase 12-E2E で `createWritable` / `removeEntry` / `queryPermission` /
 *   OPFS に対応させた (従来は読むだけだった)。
 * - **Profile の中身**: 既存の `.minecraft` ZIP Import 経路で作る。
 *   Modrinth API は `installModrinthApiMock()` で決定論的にする。
 * - **実体のダウンロード**: `cdn.modrinth.com` を `page.route` で差し替える。
 *
 * ※ File System Access API は Desktop Chromium のみなので、モバイル viewport では
 *   skip する (既存の folder-import.spec.ts と同じ方針)。
 */

import { test, expect, type Page } from '@playwright/test';
import {
  FABRIC_VERSION_JSON,
  installModrinthApiMock,
  buildMinecraftEnvZip
} from './helpers/minecraftEnv';
import {
  installFolderPickerMock,
  listMockFiles,
  type FolderPickerMockOptions
} from './helpers/folderPickerMock';
import { waitForAppReady } from './helpers/appReady';

/**
 * Sync の書き込み先フォルダ。
 *
 * **mods/ を空にしておく**のが肝。Profile には既知 Mod が 1 件あるので、
 * Sync の Plan は「addition 1 件」になる。
 * versions/ は環境検出 (D-1) 用に置く — Profile の環境 (Fabric 1.21.1) と
 * 一致しないと Sync がブロックされる。
 */
const SYNC_TARGET_FILES: Record<string, string> = {
  'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json':
    FABRIC_VERSION_JSON
};

/** Sync が実体を取得する CDN URL (ENV_FIXTURE の version JSON と一致させる) */
const CDN_URL = 'https://cdn.modrinth.com/data/e2e/versions/sodium.jar';
const DOWNLOADED_JAR = 'e2e-downloaded-jar-bytes';

/**
 * `.minecraft` ZIP を Import して、既知 Mod を 1 件持つ Profile を作る。
 *
 * Sync の前提 (Profile に中身がある) を、**既存の Import 経路を再利用して**作る。
 * 独自に Dexie を直接書き換えると実装と乖離しやすいので避ける。
 */
async function importProfileWithKnownMod(page: Page): Promise<void> {
  await page.goto('/profile');
  const sidebar = page.locator('#desktop-sidebar');
  await sidebar.waitFor({ state: 'visible', timeout: 10_000 });

  const fileInput = sidebar.locator('input[type="file"]');
  await expect(fileInput).toHaveCount(1);

  const { buffer } = await buildMinecraftEnvZip();
  await fileInput.setInputFiles({
    name: 'e2e-sync-source.zip',
    mimeType: 'application/zip',
    buffer
  });

  const dialog = page
    .getByRole('dialog')
    .filter({ hasText: /新規プロファイル|ZIPからプロファイル作成/ })
    .first();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  // 解析完了を待ってから作成する
  const analysis = dialog.getByRole('status', { name: '解析結果' });
  await analysis.waitFor({ state: 'visible', timeout: 20_000 });

  await dialog.getByRole('button', { name: /作成する/ }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
}

/** 設定ページでフォルダを紐付け、Sync Preview を開いて承認する */
async function linkAndRunSync(
  page: Page,
  options: { approve: boolean }
): Promise<void> {
  await page.goto('/settings');
  await waitForAppReady(page);

  const section = page.locator('section, div').filter({ hasText: '環境との同期' }).first();
  await section.waitFor({ state: 'visible', timeout: 10_000 });

  await page.getByRole('button', { name: /フォルダを選択して紐付ける/ }).click();

  // Sync ボタンが出るまで待つ (紐付け完了の合図)
  const syncButton = page.getByRole('button', { name: /差分を確認して同期/ });
  await syncButton.waitFor({ state: 'visible', timeout: 15_000 });
  await expect(syncButton).toBeEnabled({ timeout: 15_000 });

  await syncButton.click();

  // Preview モーダル (§10.3: 実行前の必須ゲート)
  const preview = page.getByRole('dialog').filter({ hasText: /同期|プレビュー/ }).first();
  await preview.waitFor({ state: 'visible', timeout: 15_000 });

  if (!options.approve) return;

  await preview.getByRole('button', { name: /^同期する/ }).click();
  await preview.waitFor({ state: 'hidden', timeout: 20_000 });
}

test.describe('環境との Sync (Phase 12-E2E)', () => {
  test.beforeEach(async ({ page, viewport }) => {
    test.skip(
      !viewport || viewport.width < 768,
      'PC 専用: File System Access API (Desktop Chromium) のみ'
    );

    // Modrinth API + CDN をモック (実ネットワーク・レート制限に依存しない)
    await installModrinthApiMock(page);
    await page.route(CDN_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/java-archive',
        body: DOWNLOADED_JAR
      })
    );
  });

  test('成功: Preview 承認 → Mod がフォルダに書き込まれる', async ({ page }) => {
    await installFolderPickerMock(page, '.minecraft', SYNC_TARGET_FILES);

    await importProfileWithKnownMod(page);
    await linkAndRunSync(page, { approve: true });

    // **書き込み先に実体が現れている**
    const files = await listMockFiles(page);
    const written = files.filter((p) => p.startsWith('mods/'));
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('e2e-sodium');

    // versions/ は消えていない (§4: 管理外ファイルに触れない)
    expect(files.some((p) => p.startsWith('versions/'))).toBe(true);
  });

  test('失敗: 書き込みが失敗したら Rollback され、ファイルが残らない', async ({ page }) => {
    // **障害注入**: mods/ 配下への書き込みを失敗させる
    const opts: FolderPickerMockOptions = {
      failWritesFor: ['mods/e2e-sodium-0.6.0.jar']
    };
    await installFolderPickerMock(page, '.minecraft', SYNC_TARGET_FILES, opts);

    await importProfileWithKnownMod(page);
    await linkAndRunSync(page, { approve: true });

    // Rollback 済み = **中途半端なファイルが残っていない**
    const files = await listMockFiles(page);
    expect(files.filter((p) => p.startsWith('mods/'))).toHaveLength(0);

    // 環境は壊れていない
    expect(files.some((p) => p.startsWith('versions/'))).toBe(true);
  });

  test('復帰: 中断された Sync を検出して確認ダイアログを出す (D-4)', async ({ page }) => {
    await installFolderPickerMock(page, '.minecraft', SYNC_TARGET_FILES);

    // **中断された Sync を Dexie に仕込む**。
    // 実ブラウザでは「Sync 中にタブを閉じた」状態に相当する。
    await page.addInitScript(() => {
      const openRequest = indexedDB.open('DropModDB');
      openRequest.onsuccess = () => {
        const idb = openRequest.result;
        if (!idb.objectStoreNames.contains('syncTransactions')) {
          idb.close();
          return;
        }
        const tx = idb.transaction('syncTransactions', 'readwrite');
        tx.objectStore('syncTransactions').put({
          id: 'e2e-interrupted-tx',
          profileId: 'e2e-interrupted-profile',
          status: 'running',
          startedAt: Date.now() - 60_000,
          operations: []
        });
      };
    });

    await page.goto('/profile');
    await waitForAppReady(page);

    // **D-4**: 未完成の Journal を検出し、確認を出す (無言の自動 Rollback はしない)
    const dialog = page.getByRole('dialog').filter({ hasText: /中断|再開|ロールバック|取り消し/ });
    await expect(dialog.first()).toBeVisible({ timeout: 20_000 });
  });
});
