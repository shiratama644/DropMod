/**
 * Sync の実行前編成 (Phase 12-B)。
 *
 * Preview を出すために必要な 4 段を 1 本にまとめる。**書き込みは一切行わない**
 * (§4 禁止事項: Preview なしの書き込み禁止)。
 *
 * ```
 * ① 紐付けの復元 (openLinkedFolder)
 * ② D-1 環境一致チェック → 不一致なら**ここで打ち切り** (Preview にも到達させない)
 * ③ D-7/D-2 書き込み権限の確保 → 失敗しても Read-only で解析は続ける
 * ④ スキャン → computeSyncPlan
 * ```
 *
 * React に依存しない pure な編成にしてある (テストが jsdom の store を
 * 用意せずに済むようにするため)。UI 側の薄いラッパは `hooks/useSync.ts`。
 */

import { getManagedFiles } from '@/lib/db/dexie';
import type { Profile } from '@/types';
import { computeSyncPlan, type SyncPlan } from './diff';
import { checkEnvironmentMatch, type EnvironmentCheckResult } from './environmentCheck';
import { openLinkedFolder } from './link';
import { scanLocalEnvironment, type ScanProgress } from './scan';
import type { EnvironmentSink } from './sink';

/** D-2: 書き込み権限が得られなかったときに出す理由 */
export const WRITE_PERMISSION_DENIED_MESSAGE =
  'フォルダへの書き込み権限が得られませんでした。差分の確認はできますが、' +
  'Sync は実行できません。「ZIP で書き出す」をお使いください。';

/** 編成に注入できる依存 (テストで差し替える) */
export interface PrepareSyncDeps {
  openFolder?: typeof openLinkedFolder;
  scan?: typeof scanLocalEnvironment;
  getManaged?: typeof getManagedFiles;
}

export interface PrepareSyncInput {
  profile: Profile;
  onScanProgress?: (progress: ScanProgress) => void;
  deps?: PrepareSyncDeps;
}

export type PrepareSyncOutcome =
  /** まだフォルダが紐付いていない */
  | { status: 'not-linked' }
  /** 紐付けはあるがハンドルを復元できなかった (再選択を促す) */
  | { status: 'folder-unavailable'; rootName: string }
  /** **D-1**: 環境不一致。Sync は禁止 */
  | { status: 'blocked-environment'; rootName: string; check: EnvironmentCheckResult }
  /** Preview を出せる状態 */
  | {
      status: 'ready';
      rootName: string;
      check: EnvironmentCheckResult;
      plan: SyncPlan;
      sink: EnvironmentSink;
      /** **D-2**: false なら Sync ボタンを無効化する */
      writable: boolean;
      writableReason: string | null;
      /** スキャンで読み取れず除外したパス */
      scanSkipped: string[];
    };

/**
 * Preview 用の SyncPlan を用意する。
 *
 * 例外を投げない設計。失敗は `status` で返す。
 */
export async function prepareSync(input: PrepareSyncInput): Promise<PrepareSyncOutcome> {
  const { profile, onScanProgress, deps = {} } = input;
  const openFolder = deps.openFolder ?? openLinkedFolder;
  const scan = deps.scan ?? scanLocalEnvironment;
  const getManaged = deps.getManaged ?? getManagedFiles;

  // ① 紐付け
  const linked = profile.linkedSource;
  if (!linked) return { status: 'not-linked' };

  const opened = await openFolder(linked);
  if (!opened) {
    return { status: 'folder-unavailable', rootName: linked.rootName };
  }

  // ② D-1: 環境一致チェック。**不一致なら Preview にも到達させない**
  const check = checkEnvironmentMatch(profile.environment, linked.environment);
  if (!check.ok) {
    return { status: 'blocked-environment', rootName: opened.rootName, check };
  }

  // ③ D-7 / D-2: 書き込み権限。拒否されても throw せず false が返る。
  //    解析 (Read-only) は継続し、Sync ボタンだけを無効化する。
  const writable = await opened.sink.ensureWritable();

  // ④ スキャン → diff
  const { entries, skipped } = await scan(
    opened.source,
    linked.contentDirs,
    onScanProgress
  );
  const managed = await getManaged(profile.id);
  const plan = computeSyncPlan({
    profile,
    managed,
    local: entries,
    contentDirs: linked.contentDirs
  });

  return {
    status: 'ready',
    rootName: opened.rootName,
    check,
    plan,
    sink: opened.sink,
    writable,
    writableReason: writable ? null : WRITE_PERMISSION_DENIED_MESSAGE,
    scanSkipped: skipped
  };
}

/** OPFS の空き容量 (取得できなければ undefined = 容量チェックを行わない) */
export async function estimateFreeBytes(): Promise<number | undefined> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return undefined;
    const { quota, usage } = await navigator.storage.estimate();
    if (typeof quota !== 'number' || typeof usage !== 'number') return undefined;
    return Math.max(0, quota - usage);
  } catch {
    return undefined;
  }
}
