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

import { getManagedFiles, getSyncTransaction, syncManagedFiles } from '@/lib/db/dexie';
import type { Profile } from '@/types';
import { executeSync, type ExecuteSyncResult } from './executor';
import { applyJournalToLedger } from './managed';
import { createContentResolver } from './resolve';
import { OpfsBackupStore, type BackupStore } from './backup';
import { estimateFreeBytes, type PrepareSyncOutcome } from './syncPrep';

export type ReadySyncOutcome = Extract<PrepareSyncOutcome, { status: 'ready' }>;

export interface ApplySyncDeps {
  backup?: BackupStore;
  estimateFreeBytes?: () => Promise<number | undefined>;
  execute?: typeof executeSync;
  getManaged?: typeof getManagedFiles;
  saveLedger?: typeof syncManagedFiles;
  getTx?: typeof getSyncTransaction;
  fetchImpl?: typeof fetch;
}

export interface ApplySyncInput {
  profile: Profile;
  prepared: ReadySyncOutcome;
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
  const { profile, prepared, onProgress, deps = {} } = input;
  const backup = deps.backup ?? new OpfsBackupStore();
  const estimateFree = deps.estimateFreeBytes ?? estimateFreeBytes;
  const execute = deps.execute ?? executeSync;
  const getManaged = deps.getManaged ?? getManagedFiles;
  const saveLedger = deps.saveLedger ?? syncManagedFiles;
  const getTx = deps.getTx ?? getSyncTransaction;

  const result = await execute({
    profileId: profile.id,
    plan: prepared.plan,
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
  const records = applyJournalToLedger(profile.id, tx.operations, existing);
  await saveLedger(profile.id, records);

  return { result, ledgerUpdated: true };
}
