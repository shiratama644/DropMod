/**
 * 中断された Sync の検出と復旧 (Phase 12-B / **D-4**)。
 *
 * D-4 の決定:
 *   - 起動時に未完了の Journal を検出したら**ユーザーに確認する**
 *     (勝手に Rollback しない / 勝手に再開もしない)
 *   - 既定の選択肢は **Rollback**
 *
 * 「勝手に再開しない」理由: Sync は 1 本のトランザクションとして設計してあり、
 * 途中から続けると Preview で見せた差分と実際に書いたものが食い違う。
 * 一度巻き戻して Sync し直すほうが安全。
 */

import {
  findInterruptedSyncTransactions,
  getSyncTransaction,
  updateSyncTransactionStatus
} from '@/lib/db/dexie';
import type { BackupStore } from './backup';
import { OpfsBackupStore } from './backup';
import { rollbackSync } from './executor';
import type { EnvironmentSink } from './sink';

/** UI に出す中断情報 */
export interface InterruptedSyncInfo {
  transactionId: string;
  profileId: string;
  startedAt: number;
  /** 中断までに適用された操作数 */
  applied: number;
  /** Journal に入った操作の総数 */
  total: number;
  /** `pending` = 実行開始前に中断 / `running` = 実行中に中断 */
  status: 'pending' | 'running';
}

/**
 * 未完了の Journal を古い順に返す。
 *
 * `pending` も含める (`findInterruptedSyncTransactions` 参照)。
 */
export async function findInterruptedSyncs(): Promise<InterruptedSyncInfo[]> {
  const rows = await findInterruptedSyncTransactions();
  return rows.map((row) => ({
    transactionId: row.id,
    profileId: row.profileId,
    startedAt: row.startedAt,
    applied: row.operations.filter((op) => op.done && !op.skippedReason).length,
    total: row.operations.length,
    status: row.status === 'pending' ? 'pending' : 'running'
  }));
}

/**
 * ユーザーの選択 (**D-4**)。
 *
 * - `rollback`: 適用済みの操作を戻す (既定)
 * - `keep`:     環境をこのままにする。Journal は `failed` にして履歴に残す
 *               (二度と確認ダイアログを出さないため)。**バックアップは消さない** —
 *               データを失う選択肢は取らない (D-5 の eviction に任せる)
 */
export type InterruptedSyncChoice = 'rollback' | 'keep';

export interface RecoverInterruptedSyncInput {
  transactionId: string;
  choice: InterruptedSyncChoice;
  /** `keep` では不要 */
  sink?: EnvironmentSink;
  deps?: {
    backup?: BackupStore;
    rollback?: typeof rollbackSync;
    getTx?: typeof getSyncTransaction;
    updateStatus?: typeof updateSyncTransactionStatus;
  };
}

export interface RecoverInterruptedSyncResult {
  ok: boolean;
  choice: InterruptedSyncChoice;
  restored: number;
  removed: number;
  errors: string[];
  message?: string;
}

const KEEP_MESSAGE = '前回の同期が完了しないまま中断されていました。環境は変更していません。';

export async function recoverInterruptedSync(
  input: RecoverInterruptedSyncInput
): Promise<RecoverInterruptedSyncResult> {
  const { transactionId, choice, sink, deps = {} } = input;
  const getTx = deps.getTx ?? getSyncTransaction;
  const updateStatus = deps.updateStatus ?? updateSyncTransactionStatus;

  const tx = await getTx(transactionId);
  if (!tx) {
    return {
      ok: false,
      choice,
      restored: 0,
      removed: 0,
      errors: [],
      message: 'この履歴は既になくなっています。'
    };
  }
  // 復旧済みの行に対しては何もしない (二度実行しても安全)
  if (tx.status !== 'pending' && tx.status !== 'running') {
    return {
      ok: false,
      choice,
      restored: 0,
      removed: 0,
      errors: [],
      message: 'この Sync は既に復旧済みです。'
    };
  }

  if (choice === 'keep') {
    await updateStatus(transactionId, 'failed', {
      error: `${KEEP_MESSAGE} (${tx.operations.filter((o) => o.done).length} 件適用済み)`
    });
    return { ok: true, choice, restored: 0, removed: 0, errors: [], message: KEEP_MESSAGE };
  }

  if (!sink) {
    return {
      ok: false,
      choice,
      restored: 0,
      removed: 0,
      errors: [],
      message: 'フォルダを開けないため巻き戻せませんでした。'
    };
  }

  const backup = deps.backup ?? new OpfsBackupStore();
  const rollback = deps.rollback ?? rollbackSync;
  const result = await rollback(transactionId, sink, backup);

  if (result.errors.length > 0) {
    // 一部しか戻せていない = 環境が半端。failed にして再試行できるようにする
    const detail = result.errors.join(' / ');
    await updateStatus(transactionId, 'failed', { error: `巻き戻しに失敗しました: ${detail}` });
    return {
      ...result,
      ok: false,
      choice,
      message: '一部のファイルを戻せませんでした。もう一度お試しください。'
    };
  }

  await backup.removeTransaction(transactionId);
  await updateStatus(transactionId, 'rolled-back', { rolledBackAt: Date.now() });

  return {
    ok: true,
    choice,
    restored: result.restored,
    removed: result.removed,
    errors: []
  };
}
