/**
 * DropMod Dexie (IndexedDB) データベース定義
 *
 * Sub-Phase 8-A: LocalStorage → IndexedDB 化
 *
 * テーブル構成:
 *   - profiles: プロファイル本体 (id PK, updatedAt Index)
 *   - apiCache: TanStack Query の persister 用キャッシュ (Sub-Phase 8-B で使用)
 *   - meta:     単純な key-value (theme, currentProfileId, migratedAt など)
 *   - managedFiles / dirHandles / syncTransactions: Sync (Phase 12)
 *
 * SSR 安全性:
 *   - Dexie は IndexedDB (ブラウザ API) 依存なので SSR では触らない
 *   - すべての呼び出しは Client Component 内の useEffect / event handler 経由
 *   - このモジュール自体は import しても副作用なし (new Dexie() は class 内)
 */

import Dexie, { type Table } from 'dexie';
import type { Profile, ProjectItem } from '@/types';
import { registerDropModSchema } from './migrations';
import type {
  ApiCacheRow,
  DirHandleRow,
  ManagedFileRow,
  MetaRow,
  ProfileRow,
  SyncTransactionRow
} from './types';

export type {
  ApiCacheRow,
  DirHandleRow,
  ManagedFileRow,
  MetaRow,
  ProfileRow,
  SyncOperationJournalEntry,
  SyncOperationPatch,
  SyncTransactionRow,
  SyncTransactionStatus
} from './types';

class DropModDatabase extends Dexie {
  // "!" は Dexie 側で version().stores() 呼び出しの副作用として初期化される
  profiles!: Table<ProfileRow, string>;
  apiCache!: Table<ApiCacheRow, string>;
  meta!: Table<MetaRow, string>;
  managedFiles!: Table<ManagedFileRow, string>;
  dirHandles!: Table<DirHandleRow, string>;
  syncTransactions!: Table<SyncTransactionRow, string>;

  constructor() {
    super('DropModDB');
    registerDropModSchema(this);
  }
}

// シングルトンとして export。複数回 import されても同じインスタンスを返す。
export const db = new DropModDatabase();

/**
 * ProjectItem[] を含む Profile 全体をそのまま IndexedDB に put する。
 * upsert 挙動 (同 id が既にあれば上書き) なので冪等に使える。
 *
 * ⚠️ Sub-Phase 8-A 時点では未使用 (現状は syncProfiles を diff 同期に使用中)。
 *    Phase 9 で「単一プロファイルの直接保存 API」として利用予定。
 */
export async function putProfile(profile: Profile): Promise<void> {
  await db.profiles.put({ ...profile, updatedAt: Date.now() });
}

/**
 * 複数プロファイルを一括 put する。
 * 削除・追加も含めた「現在の profiles 全体」を上書きしたい場合は
 * `syncProfiles` を使う (下記)。
 *
 * ⚠️ Sub-Phase 8-A 時点では未使用。Phase 9 で ZIP インポート後の一括投入等で使用予定。
 */
export async function bulkPutProfiles(profiles: Profile[]): Promise<void> {
  if (profiles.length === 0) return;
  const now = Date.now();
  await db.profiles.bulkPut(profiles.map((p) => ({ ...p, updatedAt: now })));
}

/**
 * 現在の profiles 配列を "正" として DB を同期する。
 *
 * 1. DB にあるが profiles には無い ID → 削除
 * 2. profiles にある全レコード → bulkPut (追加 or 更新)
 *
 * 単一 transaction で実行するため、中断されても整合性が保たれる。
 */
export async function syncProfiles(profiles: Profile[]): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    const currentIds = new Set(profiles.map((p) => p.id));
    const dbIds = await db.profiles.toCollection().primaryKeys();
    const idsToDelete = dbIds.filter((id) => !currentIds.has(id));
    if (idsToDelete.length > 0) {
      await db.profiles.bulkDelete(idsToDelete);
    }
    if (profiles.length > 0) {
      const now = Date.now();
      await db.profiles.bulkPut(profiles.map((p) => ({ ...p, updatedAt: now })));
    }
  });
}

/** meta key-value を取得。存在しなければ null。 */
export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

/** meta key-value を設定。 */
export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

/** meta key-value を削除。 */
export async function deleteMeta(key: string): Promise<void> {
  await db.meta.delete(key);
}

/**
 * すべての profiles を updatedAt 降順で取得。
 * (現状は挿入順を維持したいので使い方は用途に応じて調整)
 */
export async function getAllProfiles(): Promise<ProfileRow[]> {
  return db.profiles.toArray();
}

/**
 * 全テーブルをクリアする (テスト・完全リセット用)。
 * ⚠️ ユーザーデータが消えるので本番機能からは呼ばない。
 */
export async function _clearAllForTesting(): Promise<void> {
  // テーブルを配列で渡す (Dexie の可変長オーバーロードは最大 7 引数のため、
  // テーブル数が増えた v4 以降は配列形式が安全)
  await db.transaction(
    'rw',
    [db.profiles, db.apiCache, db.meta, db.managedFiles, db.dirHandles, db.syncTransactions],
    async () => {
      await db.profiles.clear();
      await db.apiCache.clear();
      await db.meta.clear();
      await db.managedFiles.clear();
      await db.dirHandles.clear();
      await db.syncTransactions.clear();
    }
  );
}

export type { Profile, ProjectItem };
