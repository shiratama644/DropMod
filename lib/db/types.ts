import type { ContentCategory, ManagedFileRecord, Profile } from '@/types';

/**
 * profiles テーブル行。
 *
 * `Profile` に `updatedAt` を追加し、リストの並び順制御に使う。
 * ID は Profile.id と同じ (Dexie の primary key)。
 */
export interface ProfileRow extends Profile {
  updatedAt: number;
}

/**
 * apiCache テーブル行。
 *
 * TanStack Query の persister が Storage 互換 API を要求するため、
 * key = canonical query key、
 * data = **既にシリアライズ済みの string** (persister が渡す value をそのまま保存)。
 * expiresAt を index にしておくと期限切れの掃除が O(log n) で走る。
 *
 * H7-1 修正: 以前は `data: unknown` として setItem 内で JSON.parse していたが、
 *   persister 側の serialize (JSON.stringify) と合わせて JSON round-trip が 2 回
 *   発生していた。data を string のまま保存することで CPU コストを半減し、
 *   `undefined`/`function`/`BigInt`/`Date` などの JSON 損失リスクも回避。
 */
export interface ApiCacheRow {
  key: string;
  data: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * meta テーブル行 (単純 key-value)。
 *
 * 使う key:
 *   - 'schemaVersion'                  — 将来のスキーマ移行検出用 (現状 "1")
 *   - 'theme'                          — 'dark' | 'light'
 *   - 'currentProfileId'               — アクティブプロファイル ID
 *   - 'migratedAt'                     — LocalStorage → Dexie 移行完了時刻 (Date.now)
 *   - 'localStorageBackupExpiresAt'    — LocalStorage を削除して良くなる時刻 (migratedAt + 7 日)
 */
export interface MetaRow {
  key: string;
  value: string;
}

/**
 * managedFiles テーブル行 (Phase 12-A)。
 *
 * `ManagedFileRecord` そのもの。`id` = `${profileId}::${path}` で一意。
 * Sync の削除可否判定 (PHASE12_PLAN.md §10.2 の 3 条件) に使う台帳。
 */
export type ManagedFileRow = ManagedFileRecord;

/**
 * dirHandles テーブル行 (Phase 12-A)。
 *
 * `FileSystemDirectoryHandle` は IndexedDB の structured clone でそのまま保存できる
 * (File System Access API の設計どおり)。ただし **JSON 直列化はできない**ため
 * `Profile` 本体には持たせず、このテーブルへ分離する
 * (`Profile.linkedSource.handleId` から参照)。
 *
 * ブラウザ再起動後は `handle.requestPermission()` で再許可が必要な場合がある
 * (§11 Gotchas: dirHandles の再許可フロー)。
 */
export interface DirHandleRow {
  /** 一意 ID (`generateId('dh')`)。Profile.linkedSource.handleId が指す */
  id: string;
  profileId: string;
  handle: FileSystemDirectoryHandle;
  /** フォルダ名 (表示用。handle.name の複製) */
  name: string;
  savedAt: number;
}

/**
 * Sync 操作のジャーナル 1 エントリ (Phase 12-B / PHASE12_PLAN.md §10.4)。
 *
 * **操作ごとに 1 エントリを記録し、失敗時は逆順で巻き戻す。**
 * `done` フラグにより idempotent な再実行が可能
 * (クラッシュ後に再開しても完了済み操作を二重適用しない)。
 */
export interface SyncOperationJournalEntry {
  kind: 'add' | 'update' | 'delete';
  category: ContentCategory;
  path: string;
  projectId?: string;
  /** 書き込んだ (あるいは削除した) 実体の fingerprint */
  sha1?: string;
  /**
   * **Plan 生成時点**の対象ファイル fingerprint (update / delete のみ)。
   * Executor が実行直前に再検証する (§10.4: Preview → Apply の間の外部変更検知)。
   * これと現値が食い違ったらその操作はスキップする。
   */
  expectedSha1?: string;
  size: number;
  /**
   * Backup の格納キー (`BackupStore.save` の返り値)。
   * update / delete のみ設定 (add には戻す先が無い)。
   */
  backupId?: string;
  /**
   * 実際に書き込み/削除したパス。
   * Plan 時点で `path` が未確定 (空) の追加操作では、ダウンロード後に
   * 確定したパスをここに記録する (Rollback が正しい対象を消せるようにするため)。
   */
  appliedPath?: string;
  /** スキップした理由 (外部変更検知など)。`done === false` のまま残る */
  skippedReason?: string;
  /** 実行済みか。Rollback / 再開時の二重適用防止に使う */
  done: boolean;
}

/** `markOperationDone` に渡す差分 */
export interface SyncOperationPatch {
  backupId?: string;
  appliedPath?: string;
  /**
   * 実際に書き込んだ実体の fingerprint。
   * Plan 時点で `sha1` が未確定の追加操作 (artifact を持たない `source:'dropmod'`) では
   * ダウンロード後に確定した値をここに記録する。**Sync 後の台帳更新がこの値を使う**
   * (台帳の fingerprint が実体と食い違うと §10.2 の削除判定が壊れるため)。
   */
  sha1?: string;
  /** 実際に書き込んだ実体のサイズ (台帳の `size` を実体と一致させるため) */
  size?: number;
  skippedReason?: string;
}

/**
 * Sync トランザクションの状態遷移:
 * `pending` → `running` → `completed` / `failed` → (`rolled-back`)
 *
 * **D-4 (2026-08-27 確定)**: 起動時に `running` のまま残っているレコードは
 * 「前回の Sync が中断された」とみなし、ユーザーに確認して Rollback する。
 */
export type SyncTransactionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'rolled-back'
  | 'failed';

/**
 * syncTransactions テーブル行 (Phase 12-B)。
 * Transaction Journal そのもの。Sync History UI (§10.4) と Rollback (§10.4) が読む。
 */
export interface SyncTransactionRow {
  id: string;
  profileId: string;
  status: SyncTransactionStatus;
  startedAt: number;
  finishedAt?: number;
  operations: SyncOperationJournalEntry[];
  /** Rollback を完了した時刻 (D-4) */
  rolledBackAt?: number;
  /** 失敗理由 (`status === 'failed'` のとき) */
  error?: string;
  /**
   * **この Sync を実行する前の台帳スナップショット** (Undo 用)。
   *
   * Journal を逆にたどって台帳を復元することもできるが、`update` の
   * 元 fingerprint や `delete` の元レコードを Journal から完全には復元できない。
   * 「Sync 前の状態」をそのまま持っているほうが確実なので保存する。
   *
   * Dexie のスキーマは**インデックスだけ**を宣言するため、非インデックスの
   * フィールド追加にマイグレーションは不要 (既存行は undefined になる)。
   */
  ledgerBefore?: ManagedFileRow[];
}
