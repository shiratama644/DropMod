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
 * ## 診断性
 *
 * `SyncButton` は **`prepare()` が `'ready'` のときだけ Preview を出す**
 * (`blocked-environment` / `not-linked` / `folder-unavailable` では理由が
 * セクション側に出てモーダルは出ない)。単にモーダルを待つだけだと
 * **「なぜ出なかったか」が CI ログから分からない**ため、
 * タイムアウト時はセクションの表示文言をエラーメッセージに含める。
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

/** 「環境との同期」セクション (D-9 で設定ページに集約されている) */
function syncSection(page: Page) {
  return page.locator('section[aria-labelledby="env-sync-heading"]');
}

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
    .filter({ hasText: /新規プロファイル/ })
    .first();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  // 解析完了を待ってから作成する
  const analysis = dialog.getByRole('status', { name: '解析結果' });
  await analysis.waitFor({ state: 'visible', timeout: 20_000 });

  await dialog.getByRole('button', { name: /作成する/ }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** 設定ページでフォルダを紐付ける */
async function linkFolder(page: Page): Promise<void> {
  await page.goto('/settings');
  await waitForAppReady(page);

  const section = syncSection(page);
  await section.waitFor({ state: 'visible', timeout: 10_000 });

  await section.getByRole('button', { name: /フォルダを選択して紐付ける/ }).click();

  // Sync ボタンが出る = 紐付け完了 (SyncButton は linkedSource があるときだけ描画される)
  const syncButton = section.getByRole('button', { name: /差分を確認して同期/ });
  await syncButton.waitFor({ state: 'visible', timeout: 15_000 });
  await expect(syncButton).toBeEnabled({ timeout: 15_000 });
}

/**
 * Sync Preview を開く。
 *
 * **タイムアウトしたらセクションの表示文言を添えて失敗する。**
 * `prepare()` が `'ready'` 以外 (D-1 の環境不一致 / 未紐付け / フォルダ消失) を
 * 返した場合、モーダルは出ず理由だけがセクションに出るため。
 */
async function openSyncPreview(page: Page) {
  const section = syncSection(page);
  await section.getByRole('button', { name: /差分を確認して同期/ }).click();

  const preview = page
    .getByRole('dialog')
    .filter({ hasText: /同期プレビュー/ })
    .first();

  try {
    await preview.waitFor({ state: 'visible', timeout: 15_000 });
  } catch (e) {
    // 診断情報: なぜ Preview が出なかったかを CI ログに残す
    const sectionText = (await section.innerText().catch(() => '(取得失敗)'))
      .replace(/\s+/g, ' ')
      .slice(0, 600);
    const toasts = (
      await page
        .locator('[role="status"], [role="alert"]')
        .allInnerTexts()
        .catch(() => [] as string[])
    )
      .join(' / ')
      .slice(0, 300);
    throw new Error(
      `Sync Preview が出ませんでした。\n` +
        `--- 「環境との同期」セクション ---\n${sectionText}\n` +
        `--- toast ---\n${toasts || '(なし)'}\n` +
        `--- 元のエラー ---\n${e instanceof Error ? e.message : String(e)}`
    );
  }

  return preview;
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
    await linkFolder(page);

    const preview = await openSyncPreview(page);
    await preview.getByRole('button', { name: /^同期する/ }).click();
    await expect(preview).toBeHidden({ timeout: 20_000 });

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
    await linkFolder(page);

    const preview = await openSyncPreview(page);
    await preview.getByRole('button', { name: /^同期する/ }).click();
    await expect(preview).toBeHidden({ timeout: 20_000 });

    // Rollback 済み = **中途半端なファイルが残っていない**
    const files = await listMockFiles(page);
    expect(files.filter((p) => p.startsWith('mods/'))).toHaveLength(0);

    // 環境は壊れていない
    expect(files.some((p) => p.startsWith('versions/'))).toBe(true);
  });

  test('復帰: 中断された Sync を検出して確認ダイアログを出す (D-4)', async ({ page }) => {
    await installFolderPickerMock(page, '.minecraft', SYNC_TARGET_FILES);

    // ① まずアプリを起動して **Dexie (DropModDB) を作らせる**。
    //    addInitScript で先に indexedDB.open すると v1 で開いてしまい、
    //    `syncTransactions` が無い & アプリの v4 昇格をブロックする危険がある。
    await page.goto('/profile');
    await waitForAppReady(page);

    // ② 中断された Sync を Dexie に仕込む。
    //    実ブラウザでは「Sync 中にタブを閉じた」状態に相当する。
    const seeded = await page.evaluate(async () => {
      const idb = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('DropModDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        if (!idb.objectStoreNames.contains('syncTransactions')) return false;
        await new Promise<void>((resolve, reject) => {
          const tx = idb.transaction('syncTransactions', 'readwrite');
          tx.objectStore('syncTransactions').put({
            id: 'e2e-interrupted-tx',
            profileId: 'e2e-interrupted-profile',
            status: 'running',
            startedAt: Date.now() - 60_000,
            operations: []
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return true;
      } finally {
        idb.close();
      }
    });
    expect(seeded).toBe(true);

    // ③ `useInterruptedSync` は**起動時に 1 回だけ**確認するので、リロードして拾わせる
    await page.goto('/profile');
    await waitForAppReady(page);

    // **D-4**: 未完成の Journal を検出し、確認を出す (無言の自動 Rollback はしない)
    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /前回の同期が完了していません/ })
      .first();
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // 「勝手に Rollback しない」= ユーザーが選ぶ操作が残っている
    await expect(dialog.getByRole('button', { name: /ロールバック|取り消|戻す/ }).first()).toBeVisible();
  });
});
