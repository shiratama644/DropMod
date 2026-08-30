/**
 * Sync の取り消し (Phase 12-B / PHASE12_PLAN.md §9.1「Sync History + Undo」)。
 *
 * 完了した Sync を 1 件だけ戻す。実体の復元は `rollbackSync()`
 * (Journal の逆順、`done` の操作のみ、冪等) に委譲し、ここでは
 * **台帳とバックアップの後始末**を担う。
 *
 * ## 台帳は「Sync 前のスナップショット」から戻す
 *
 * Journal を逆にたどって台帳を復元することはできない。`update` の元
 * fingerprint や `delete` の元レコードは Journal に完全には残らないため。
 * そのため `applySync()` が Sync 前の台帳を `ledgerBefore` として
 * Journal に保存してあり、ここから戻す。
 *
 * ## 一部だけ失敗した場合
 *
 * 復元に失敗した操作が 1 件でもあれば、環境は**半端な状態**なので
 * `status: 'failed'` にして **バックアップを消さない**。ユーザーが
 * もう一度 Undo を試せるようにするため (rollbackSync は冪等)。
 * 台帳も触らない。
 */

import { getSyncTransaction, syncManagedFiles, updateSyncTransactionStatus } from './db';
import { OpfsBackupStore, type BackupStore } from './backup';
import { rollbackSync } from './executor';
import type { EnvironmentSink } from './sink';

export interface UndoSyncDeps {
  backup?: BackupStore;
  rollback?: typeof rollbackSync;
  getTx?: typeof getSyncTransaction;
  saveLedger?: typeof syncManagedFiles;
  updateStatus?: typeof updateSyncTransactionStatus;
}

export interface UndoSyncInput {
  transactionId: string;
  sink: EnvironmentSink;
  deps?: UndoSyncDeps;
}

export interface UndoSyncResult {
  ok: boolean;
  /** バックアップから復元したファイル数 */
  restored: number;
  /** Sync で追加したために消したファイル数 */
  removed: number;
  errors: string[];
  /** 台帳を書き戻したか */
  ledgerUpdated: boolean;
  /** ok === false のときの理由 */
  message?: string;
}

/** 取り消しを行わなかったときの結果 (毎回新しい配列を返す) */
function notUndone(message: string): UndoSyncResult {
  return { ok: false, restored: 0, removed: 0, errors: [], ledgerUpdated: false, message };
}

export async function undoSync(input: UndoSyncInput): Promise<UndoSyncResult> {
  const { transactionId, sink, deps = {} } = input;
  const getTx = deps.getTx ?? getSyncTransaction;
  const rollback = deps.rollback ?? rollbackSync;

  const tx = await getTx(transactionId);
  if (!tx) {
    return notUndone('この履歴は既になくなっています。');
  }
  if (tx.status !== 'completed') {
    return notUndone('完了した Sync だけを取り消せます。');
  }

  const backup = deps.backup ?? new OpfsBackupStore();
  const result = await rollback(transactionId, sink, backup);

  // 1 件でも復元に失敗したら、環境が半端な状態。台帳もバックアップも触らない
  if (result.errors.length > 0) {
    const detail = result.errors.join(' / ');
    await (deps.updateStatus ?? updateSyncTransactionStatus)(transactionId, 'failed', {
      error: `取り消しに失敗しました: ${detail}`
    });
    return {
      ...result,
      ok: false,
      ledgerUpdated: false,
      message: '一部のファイルを復元できませんでした。もう一度お試しください。'
    };
  }

  const saveLedger = deps.saveLedger ?? syncManagedFiles;
  const updateStatus = deps.updateStatus ?? updateSyncTransactionStatus;

  // 台帳を Sync 前の状態に戻す。ledgerBefore が無い (古い行) 場合は空にするより
  // **触らない**ほうが安全 — 実体と食い違う台帳を作らない。
  let ledgerUpdated = false;
  if (tx.ledgerBefore) {
    await saveLedger(tx.profileId, tx.ledgerBefore);
    ledgerUpdated = true;
  }

  // バックアップは役目を終えたので解放する (OPFS 容量の節約、D-5)
  await backup.removeTransaction(transactionId);
  await updateStatus(transactionId, 'rolled-back', { rolledBackAt: Date.now() });

  return {
    ok: true,
    restored: result.restored,
    removed: result.removed,
    errors: [],
    ledgerUpdated
  };
}
