/**
 * DropMod Dexie (IndexedDB) データベース定義
 *
 * Sub-Phase 8-A: LocalStorage → IndexedDB 化
 *
 * 3 テーブル構成:
 *   - profiles: プロファイル本体 (id PK, updatedAt Index)
 *   - apiCache: TanStack Query の persister 用キャッシュ (Sub-Phase 8-B で使用)
 *   - meta:     単純な key-value (theme, currentProfileId, migratedAt など)
 *
 * SSR 安全性:
 *   - Dexie は IndexedDB (ブラウザ API) 依存なので SSR では触らない
 *   - すべての呼び出しは Client Component 内の useEffect / event handler 経由
 *   - このモジュール自体は import しても副作用なし (new Dexie() は class 内)
 */

import Dexie, { type Table } from 'dexie';
import type { Profile, ModItem } from '@/types';

// ============================================================================
// 行 (Row) 型定義
// ============================================================================

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
 * key = canonical query key、data = JSON.stringify 可能な payload。
 * expiresAt を index にしておくと期限切れの掃除が O(log n) で走る。
 */
export interface ApiCacheRow {
  key: string;
  data: unknown;
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

// ============================================================================
// DB クラス
// ============================================================================

class DropModDatabase extends Dexie {
  // "!" は Dexie 側で version().stores() 呼び出しの副作用として初期化される
  profiles!: Table<ProfileRow, string>;
  apiCache!: Table<ApiCacheRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('DropModDB');
    // v1 スキーマ: primary key はカラム名の 1 番目、以降はインデックス
    this.version(1).stores({
      profiles: 'id, updatedAt',
      apiCache: 'key, expiresAt',
      meta: 'key'
    });
  }
}

// シングルトンとして export。複数回 import されても同じインスタンスを返す。
export const db = new DropModDatabase();

// ============================================================================
// 便利ヘルパ (呼び出し側の書き味を良くするため)
// ============================================================================

/**
 * ModItem[] を含む Profile 全体をそのまま IndexedDB に put する。
 * upsert 挙動 (同 id が既にあれば上書き) なので冪等に使える。
 */
export async function putProfile(profile: Profile): Promise<void> {
  await db.profiles.put({ ...profile, updatedAt: Date.now() });
}

/**
 * 複数プロファイルを一括 put する。
 * 削除・追加も含めた「現在の profiles 全体」を上書きしたい場合は
 * `syncProfiles` を使う (下記)。
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

/**
 * meta key-value を取得。存在しなければ null。
 */
export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

/**
 * meta key-value を設定。
 */
export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

/**
 * meta key-value を削除。
 */
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

// ============================================================================
// テスト用 (fake-indexeddb 環境で DB をリセット)
// ============================================================================

/**
 * 全テーブルをクリアする (テスト・完全リセット用)。
 * ⚠️ ユーザーデータが消えるので本番機能からは呼ばない。
 */
export async function _clearAllForTesting(): Promise<void> {
  await db.transaction('rw', db.profiles, db.apiCache, db.meta, async () => {
    await db.profiles.clear();
    await db.apiCache.clear();
    await db.meta.clear();
  });
}

// 型 re-export (ModItem を使う側の import 減らし)
export type { Profile, ModItem };
