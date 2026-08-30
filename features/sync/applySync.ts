/**
 * Sync の実行 + 台帳更新 (Phase 12-B)。
 *
 * `prepareSync()` が用意した Preview をユーザーが承認したあとに呼ぶ。
 * React に依存しないので、UI ラッパ (`hooks/useSync.ts`) を用意せずに
 * ロジックだけをテストできる。
 *
 * ## 台帳更新のタイミング
 *
 * `executeSync` が `completed` になったときだけ台帳を書き換える。
 * `rolled-back` / `aborted-quota` / `failed` では**環境が元に戻っている (または
 * 何も触っていない)** ので、台帳も変えない。ここで台帳だけ進めると
 * 実体と fingerprint が食い違い、次回 Sync の削除判定 (§10.2) が壊れる。
 */

import {
  getManagedFiles,
  getSyncTransaction,
  setSyncTransactionLedgerBefore,
  syncManagedFiles
} from '@/lib/db/dexie';
import type { Profile } from '@/types';
import { excludeDeletions } from './diff';
import { executeSync, type ExecuteSyncResult } from './executor';
import { applyJournalToLedger } from './managed';
import { createContentResolver } from '@/lib/env/resolve';
import { OpfsBackupStore, type BackupStore } from './backup';
import { estimateFreeBytes, type ReadySyncOutcome } from './syncPrep';

export type { ReadySyncOutcome };

export interface ApplySyncDeps {
  backup?: BackupStore;
  estimateFreeBytes?: () => Promise<number | undefined>;
  execute?: typeof executeSync;
  getManaged?: typeof getManagedFiles;
  saveLedger?: typeof syncManagedFiles;
  getTx?: typeof getSyncTransaction;
  setLedgerBefore?: typeof setSyncTransactionLedgerBefore;
  fetchImpl?: typeof fetch;
}

export interface ApplySyncInput {
  profile: Profile;
  prepared: ReadySyncOutcome;
  /**
   * Preview でユーザーが「保持」を選んだ削除予定のパス (§10.3)。
   * 指定すると実行前に Plan から外す。
   */
  excludedDeletionPaths?: readonly string[];
  onProgress?: (progress: { done: number; total: number; path: string }) => void;
  deps?: ApplySyncDeps;
}

export interface ApplySyncResult {
  result: ExecuteSyncResult;
  /** 台帳を書き換えたか (completed のときのみ true) */
  ledgerUpdated: boolean;
}

/**
 * Preview を実環境に適用する。
 *
 * 例外を投げない (`executeSync` が失敗を `outcome` で返す設計に揃える)。
 */
export async function applySync(input: ApplySyncInput): Promise<ApplySyncResult> {
  const { profile, prepared, excludedDeletionPaths, onProgress, deps = {} } = input;
  const backup = deps.backup ?? new OpfsBackupStore();
  const estimateFree = deps.estimateFreeBytes ?? estimateFreeBytes;
  const execute = deps.execute ?? executeSync;
  const getManaged = deps.getManaged ?? getManagedFiles;
  const saveLedger = deps.saveLedger ?? syncManagedFiles;
  const getTx = deps.getTx ?? getSyncTransaction;
  const setLedgerBefore = deps.setLedgerBefore ?? setSyncTransactionLedgerBefore;

  const result = await execute({
    profileId: profile.id,
    plan: excludeDeletions(prepared.plan, excludedDeletionPaths ?? []),
    sink: prepared.sink,
    backup,
    resolveContent: createContentResolver({
      profile,
      contentDirs: profile.linkedSource?.contentDirs,
      fetchImpl: deps.fetchImpl
    }),
    onProgress,
    freeBytes: await estimateFree()
  });

  // 台帳は「適用が完了したとき」だけ更新する
  if (result.outcome !== 'completed' || !result.transactionId) {
    return { result, ledgerUpdated: false };
  }

  const tx = await getTx(result.transactionId);
  if (!tx) return { result, ledgerUpdated: false };

  const existing = await getManaged(profile.id);
  // **Undo 用**: 書き換える前の台帳を Journal に保存する。
  // Journal を逆にたどる復元では update の元 fingerprint や delete の元レコードを
  // 完全には戻せないため、Sync 前の状態をそのまま持つ。
  await setLedgerBefore(result.transactionId, existing);
  const records = applyJournalToLedger(profile.id, tx.operations, existing);
  await saveLedger(profile.id, records);

  return { result, ledgerUpdated: true };
}
