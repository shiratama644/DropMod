/**
 * Sync 用のローカル環境スキャン (Phase 12-B)。
 *
 * `computeSyncPlan()` が必要とする `LocalFileEntry[]` を生成する。
 *
 * Phase 11 の `analyzeEnvironmentSource()` は Modrinth 照合 (`/version_files`) まで
 * 行う **Import 用の重い処理**。Sync は「Profile (SSOT) と実体を突き合わせる」だけなので
 * ネットワークを使わず、**列挙 + 読み込み + SHA-1** の 3 段に留める。
 *
 * 拡張子ルール (`CATEGORY_EXTENSIONS`) は analyzer と共有する。
 * Import と Sync で対象ファイルの定義がずれると、台帳と実体が噛み合わなくなり
 * §10.2 の削除判定が壊れるため。
 */

import type { ContentCategory, LinkedSource } from '@/types';
import { CATEGORY_EXTENSIONS, hasExtension } from '@/features/env-import';
import type { LocalFileEntry } from '@/features/sync/utils/diff';
import { computeHashes } from './hashWorker';
import type { EnvironmentSource } from './source';

export type ScanPhase = 'scan' | 'read' | 'hash';

export interface ScanProgress {
  phase: ScanPhase;
  done: number;
  total: number;
}

export interface ScanResult {
  /** 台帳と突き合わせる対象 */
  entries: LocalFileEntry[];
  /**
   * 読み取り・ハッシュ化に失敗して除外したパス。
   * 1 ファイルの権限エラー等で Sync 全体を落とさないための記録 (UI で表示する)。
   */
  skipped: string[];
}

/**
 * `LinkedSource.contentDirs` を「カテゴリ → ディレクトリ」の配列に展開する。
 * 未検出のディレクトリは含めない (対象ディレクトリが無い = 空として継続)。
 */
export function categoryDirs(
  contentDirs: LinkedSource['contentDirs']
): Array<{ category: ContentCategory; dir: string }> {
  const pairs: Array<[ContentCategory, string | undefined]> = [
    ['mod', contentDirs.mods],
    ['resourcepack', contentDirs.resourcepacks],
    ['shader', contentDirs.shaderpacks]
  ];
  return pairs.flatMap(([category, dir]) => (dir ? [{ category, dir }] : []));
}

/**
 * フォルダ内を走査して `LocalFileEntry[]` を作る。
 *
 * パスは**環境ルートからの相対** (`${dir}/${filename}`) で、
 * `ManagedFileRecord.path` と同じ基準にする (§10.2 の突き合わせが
 * 文字列一致に依存しているため)。
 */
export async function scanLocalEnvironment(
  source: EnvironmentSource,
  contentDirs: LinkedSource['contentDirs'],
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanResult> {
  // ① 列挙 (非再帰。拡張子で対象を絞る)
  onProgress?.({ phase: 'scan', done: 0, total: 1 });
  const scanned: Array<{ category: ContentCategory; path: string }> = [];
  for (const { category, dir } of categoryDirs(contentDirs)) {
    const filenames = await source.listFiles(dir);
    for (const filename of filenames) {
      if (hasExtension(filename, CATEGORY_EXTENSIONS[category])) {
        scanned.push({ category, path: `${dir}/${filename}` });
      }
    }
  }
  onProgress?.({ phase: 'scan', done: 1, total: 1 });

  if (scanned.length === 0) {
    return { entries: [], skipped: [] };
  }

  // ② 読み込み。1 ファイルの失敗で Sync 全体を落とさない
  const readable: Array<{ category: ContentCategory; path: string; data: Uint8Array }> = [];
  const skipped: string[] = [];
  for (let i = 0; i < scanned.length; i++) {
    const file = scanned[i];
    if (!file) continue;
    try {
      readable.push({ category: file.category, path: file.path, data: await source.readFile(file.path) });
    } catch {
      skipped.push(file.path);
    }
    onProgress?.({ phase: 'read', done: i + 1, total: scanned.length });
  }

  if (readable.length === 0) {
    return { entries: [], skipped };
  }

  // ③ SHA-1 (Worker / メインスレッド自動 fallback)
  const hashes = await computeHashes(
    readable.map((file) => ({ path: file.path, data: file.data })),
    (p) => onProgress?.({ phase: 'hash', done: p.done, total: p.total })
  );
  const sha1ByPath = new Map(hashes.map((h) => [h.path, h.sha1]));

  const entries: LocalFileEntry[] = [];
  for (const file of readable) {
    const sha1 = sha1ByPath.get(file.path);
    if (sha1 === undefined) {
      // ハッシュ化できなかったファイルは突き合わせ対象から外す
      skipped.push(file.path);
      continue;
    }
    entries.push({
      category: file.category,
      path: file.path,
      sha1,
      size: file.data.byteLength
    });
  }

  return { entries, skipped };
}
