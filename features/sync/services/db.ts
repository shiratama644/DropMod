/**
 * Sync 用 Dexie ヘルパ (ARCH-2D)。
 *
 * スキーマ / `db` シングルトンは `@/lib/db/dexie` に残す。
 * 実装は `db/managed.ts` と `db/transactions.ts`。公開識別子はこのバレルから再 export。
 */

export {
  syncManagedFiles,
  getManagedFiles,
  deleteManagedFilesForProfile,
  saveDirHandle,
  getDirHandle,
  deleteDirHandle
} from './db/managed';

export type { DirHandleRow, ManagedFileRow } from './db/managed';

export {
  createSyncTransaction,
  getSyncTransaction,
  listSyncTransactions,
  updateSyncTransactionStatus,
  setSyncTransactionLedgerBefore,
  markOperationDone,
  findInterruptedSyncTransactions,
  deleteSyncTransaction
} from './db/transactions';

export type {
  SyncOperationJournalEntry,
  SyncOperationPatch,
  SyncTransactionRow,
  SyncTransactionStatus
} from './db/transactions';
