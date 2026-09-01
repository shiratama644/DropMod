/**
 * Sync の実体取得 (Phase 12-B)。
 *
 * `executeSync` に渡す `resolveContent` を生成する。Profile の `ProjectItem` から
 * ダウンロード先 (`fileUrl`) とファイル名を引き、実体を `Uint8Array` で返す。
 *
 * ## パスの確定
 *
 * Preview 時点で書き込み先が確定している操作 (`entry.path` あり) はそのまま使い、
 * 未確定 (`entry.path === ''`) のものはダウンロード後に
 * `buildTargetPath(contentDir, filename)` で確定して `ResolvedContent.path` で返す。
 * Executor はそれを `appliedPath` として Journal に記録する (Rollback が正しい
 * 対象を消せるようにするため)。
 *
 * ## 失敗の扱い
 *
 * 実体が取得できない場合は **throw する**。呼び出し側の `executeSync` が
 * トランザクション全体を Rollback する (§10.4: 中途半端な状態で終わらせない)。
 */

import type { ContentCategory, LinkedSource, Profile, ProjectItem } from '@/types';
import { downloadFileWithRetry } from '@/lib/utils/downloadFile';
import { buildTargetPath, CATEGORY_DIR_KEY, type SyncPlanEntry } from '@/features/sync/utils/diff';
import type { ResolveContent, ResolvedContent } from '@/features/sync/services/executor';
import { itemsOfCategory } from '@/features/sync/utils/managed';

export interface ContentResolverOptions {
  profile: Profile;
  /** 検出したコンテンツディレクトリ (パス未確定の操作で使う) */
  contentDirs?: LinkedSource['contentDirs'];
  /** 中断用。省略時は中断しない signal を使う */
  signal?: AbortSignal;
  /** テストで fetch を差し替える */
  fetchImpl?: typeof fetch;
}

/** Profile から該当カテゴリ・project のアイテムを探す */
export function findProfileItem(
  profile: Profile,
  category: ContentCategory,
  projectId: string | undefined
): ProjectItem | undefined {
  if (!projectId) return undefined;
  return itemsOfCategory(profile, category).find((item) => item.projectId === projectId);
}

/**
 * `SyncPlanEntry` → 実体 を解決するコールバックを作る。
 *
 * ファイルごとに Profile を引き直すのは、Sync 実行中に Profile が変わっても
 * 「Preview で承認した対象」を基準にし続けられるようにするため
 * ( projectId で引くので順序や追加削除の影響を受けない)。
 */
export function createContentResolver(options: ContentResolverOptions): ResolveContent {
  const { profile, contentDirs, signal, fetchImpl } = options;

  return async (entry: SyncPlanEntry): Promise<ResolvedContent> => {
    const item = findProfileItem(profile, entry.category, entry.projectId);
    if (!item) {
      throw new Error(
        `「${entry.name}」がプロファイルに見つかりません。プレビューを作り直してください。`
      );
    }
    if (!item.fileUrl) {
      throw new Error(
        `「${item.name}」のダウンロード先が不明です。バージョンを選び直してください。`
      );
    }

    const blob = await downloadFileWithRetry(item.fileUrl, signal ?? new AbortController().signal, {
      fetchImpl
    });
    if (!blob) {
      throw new Error(`「${item.name}」のダウンロードに失敗しました。`);
    }

    const data = new Uint8Array(await blob.arrayBuffer());
    const path =
      entry.path || buildTargetPath(contentDirs?.[CATEGORY_DIR_KEY[entry.category]], item.filename);

    return { data, path };
  };
}
