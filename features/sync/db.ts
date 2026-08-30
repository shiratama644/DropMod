/**
 * Sync 用 Dexie ヘルパ (ARCH-2D)。
 *
 * スキーマ / `db` シングルトンは `@/lib/db/dexie` に残す。
 * ここは managedFiles / dirHandles / syncTransactions の操作だけ。
 */

import { generateId } from '@/lib/utils/id';
import {
  db,
  type DirHandleRow,
  type ManagedFileRow,
  type SyncOperationJournalEntry,
  type SyncOperationPatch,
  type SyncTransactionRow,
  type SyncTransactionStatus
} from '@/lib/db/dexie';

export type {
  DirHandleRow,
  ManagedFileRow,
  SyncOperationJournalEntry,
  SyncOperationPatch,
  SyncTransactionRow,
  SyncTransactionStatus
};

/**
 * Profile 1 件分の `ManagedFileRecord` を台帳へ**差分同期**する。
 *
 * 「現在の Profile から導出した台帳」を正として、
 * DB にあるが records に無い行を削除し、records を bulkPut する。
 * 単一 transaction のため中断されても整合性が保たれる (`syncProfiles` と同じ方針)。
 */
export async function syncManagedFiles(
  profileId: string,
  records: ManagedFileRow[]
): Promise<void> {
  await db.transaction('rw', db.managedFiles, async () => {
    const currentIds = new Set(records.map((r) => r.id));
    const dbIds = await db.managedFiles.where('profileId').equals(profileId).primaryKeys();
    const idsToDelete = dbIds.filter((id) => !currentIds.has(String(id)));
    if (idsToDelete.length > 0) {
      await db.managedFiles.bulkDelete(idsToDelete as string[]);
    }
    if (records.length > 0) {
      await db.managedFiles.bulkPut(records);
    }
  });
}

/** Profile 1 件分の台帳を取得 (path 昇順。Diff Engine / Preview 表示用) */
export async function getManagedFiles(profileId: string): Promise<ManagedFileRow[]> {
  const rows = await db.managedFiles.where('profileId').equals(profileId).toArray();
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Profile の台帳を全削除する。
 * Profile 削除時・ローカル環境の紐付け解除時に呼ぶ。
 * ⚠️ 台帳を消すと Sync は該当ファイルを「管理外」とみなし**削除対象外**にする
 *    (§10.2 の 3 条件の 1 つ目を満たさなくなるため)。安全側の挙動。
 */
export async function deleteManagedFilesForProfile(profileId: string): Promise<void> {
  await db.managedFiles.where('profileId').equals(profileId).delete();
}

/**
 * `FileSystemDirectoryHandle` を保存し、参照用 ID を返す。
 * 返り値を `Profile.linkedSource.handleId` に保存する。
 */
export async function saveDirHandle(
  profileId: string,
  handle: FileSystemDirectoryHandle,
  name: string
): Promise<string> {
  const id = generateId('dh');
  await db.dirHandles.put({ id, profileId, handle, name, savedAt: Date.now() });
  return id;
}

/** 保存済み handle を取得。無ければ null (再選択を促す) */
export async function getDirHandle(id: string): Promise<DirHandleRow | null> {
  const row = await db.dirHandles.get(id);
  return row ?? null;
}

/** 保存済み handle を削除 (紐付け解除時) */
export async function deleteDirHandle(id: string): Promise<void> {
  await db.dirHandles.delete(id);
}

/**
 * Sync トランザクションを作成する。初期状態は `'pending'`。
 * @returns 生成したトランザクション ID
 */
export async function createSyncTransaction(
  profileId: string,
  operations: SyncOperationJournalEntry[]
): Promise<string> {
  const id = generateId('tx');
  await db.syncTransactions.put({
    id,
    profileId,
    status: 'pending',
    startedAt: Date.now(),
    operations: operations.map((op) => ({ ...op, done: false }))
  });
  return id;
}

/** トランザクションを取得。無ければ null */
export async function getSyncTransaction(id: string): Promise<SyncTransactionRow | null> {
  const row = await db.syncTransactions.get(id);
  return row ?? null;
}

/** Profile の Sync 履歴を新しい順で取得 (Sync History UI 用) */
export async function listSyncTransactions(profileId: string): Promise<SyncTransactionRow[]> {
  const rows = await db.syncTransactions.where('profileId').equals(profileId).toArray();
  return rows.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * 状態を更新する。`finishedAt` は完了系状態に遷移したときだけ自動で打つ。
 */
export async function updateSyncTransactionStatus(
  id: string,
  status: SyncTransactionStatus,
  extra: Partial<Pick<SyncTransactionRow, 'error' | 'rolledBackAt'>> = {}
): Promise<void> {
  const row = await db.syncTransactions.get(id);
  if (!row) return;
  const isTerminal = status === 'completed' || status === 'failed' || status === 'rolled-back';
  await db.syncTransactions.put({
    ...row,
    status,
    ...(isTerminal ? { finishedAt: Date.now() } : {}),
    ...extra
  });
}

/**
 * Sync 前の台帳スナップショットを保存する (Undo 用)。
 *
 * 見つからない id に対しては何もしない (executeSync の失敗フローと揃える)。
 */
export async function setSyncTransactionLedgerBefore(
  id: string,
  records: ManagedFileRow[]
): Promise<void> {
  const row = await db.syncTransactions.get(id);
  if (!row) return;
  await db.syncTransactions.put({ ...row, ledgerBefore: records });
}

/**
 * ジャーナルの指定操作を実行結果で更新する。
 *
 * **1 操作ごとに即座に永続化**する (クラッシュ時の復旧精度のため)。
 * `done: false` のまま `skippedReason` だけを記録することもできる
 * (外部変更を検知してスキップした場合)。
 */
export async function markOperationDone(
  id: string,
  index: number,
  patch: SyncOperationPatch & { done?: boolean } = {}
): Promise<void> {
  const row = await db.syncTransactions.get(id);
  if (!row) return;
  const operations = row.operations.map((op, i) =>
    i === index ? { ...op, done: patch.done ?? true, ...patch } : op
  );
  await db.syncTransactions.put({ ...row, operations });
}

/**
 * **D-4**: 中断されたトランザクションを検出する。
 * アプリ起動時に呼び、ユーザーに「巻き戻しますか？」を確認する。
 *
 * **`pending` も含める。** `createSyncTransaction()` は `pending` で行を作り、
 * `executeSync()` が `running` に更新する。その**間**でタブを閉じられると
 * `pending` のまま残る — `running` だけを見ると二度と検出されず、
 * 行が永久に溜まり続ける。どちらも「完了していない Journal」なので同じ扱い。
 */
export async function findInterruptedSyncTransactions(): Promise<SyncTransactionRow[]> {
  const [running, pending] = await Promise.all([
    db.syncTransactions.where('status').equals('running').toArray(),
    db.syncTransactions.where('status').equals('pending').toArray()
  ]);
  return [...running, ...pending].sort((a, b) => a.startedAt - b.startedAt);
}

/** トランザクションを削除する (履歴の prune 用) */
export async function deleteSyncTransaction(id: string): Promise<void> {
  await db.syncTransactions.delete(id);
}
