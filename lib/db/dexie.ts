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
import type { ManagedFileRecord, Profile, ProjectItem } from '@/types';
import { normalizeProfileForV2 } from '@/lib/state/sanitize';
import { generateId } from '@/lib/utils/id';

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

// ============================================================================
// DB クラス
// ============================================================================

class DropModDatabase extends Dexie {
  // "!" は Dexie 側で version().stores() 呼び出しの副作用として初期化される
  profiles!: Table<ProfileRow, string>;
  apiCache!: Table<ApiCacheRow, string>;
  meta!: Table<MetaRow, string>;
  // ---- Phase 12-A で追加 ----
  managedFiles!: Table<ManagedFileRow, string>;
  dirHandles!: Table<DirHandleRow, string>;

  constructor() {
    super('DropModDB');
    // v1 スキーマ: primary key はカラム名の 1 番目、以降はインデックス
    this.version(1).stores({
      profiles: 'id, updatedAt',
      apiCache: 'key, expiresAt',
      meta: 'key'
    });

    // v2 (Phase 11-A): Profile 形状変更。index は不変 (スキーマ宣言は v1 と同一)、
    // upgrade で保存済み row を新形状に一括変換する:
    //   - flat な mcVersion / loader / loaderVersion → environment に集約
    //     (loader の不正値は 'Fabric' に正規化)
    //   - ModItem → ProjectItem: id→projectId / title→name /
    //     projectType?→type (未設定は 'mod') / selectedVersionId→versionId /
    //     selectedVersionNumber→versionNumber
    //   - resourcepacks / shaderpacks / unknownFiles は optional のため
    //     旧データはそのまま互換 (設定されないだけ)
    // 変換ロジックは lib/state/sanitize.ts の normalizeProfileForV2 と共用
    // (LocalStorage 旧データの流入経路と同一 semantics を保証)。
    this.version(2)
      .stores({
        profiles: 'id, updatedAt',
        apiCache: 'key, expiresAt',
        meta: 'key'
      })
      .upgrade(async (tx) => {
        const table = tx.table('profiles');
        const rows = (await table.toArray()) as Array<
          Record<string, unknown> & { updatedAt?: unknown }
        >;
        const converted = rows
          .map((row) => {
            const normalized = normalizeProfileForV2(row);
            if (!normalized) return null;
            return {
              ...normalized,
              updatedAt:
                typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt)
                  ? row.updatedAt
                  : Date.now()
            };
          })
          .filter((row): row is Profile & { updatedAt: number } => row !== null);
        if (converted.length > 0) {
          await table.clear();
          await table.bulkPut(converted);
        }
      });

    // v3 (Phase 12-A): Sync 基盤のテーブルを追加。
    //   - managedFiles: 管理下ファイルの台帳 (削除可否の fingerprint 判定に使用)
    //   - dirHandles:   FileSystemDirectoryHandle の永続化 (Profile.linkedSource から参照)
    //
    // **既存テーブルの index は不変・upgrade 関数なし**。新規テーブルの追加のみなので
    // 既存データは無変換のまま読み出せる (v2 の Profile 形状変換とは独立)。
    // 旧バージョンの DB を開いたユーザーは「空の台帳」から始まる = 紐付け直後の
    // 初回 Sync まで deletion は発生しない (§10.2 の「台帳に存在する」条件を満たさないため)。
    // これは安全側の挙動であり、意図したもの。
    //
    // ※ SyncTransaction テーブルは P12-B (Executor / Rollback) で v4 として追加する。
    //   P12-A のスコープ (§9) に含めないため、ここで先回りはしない。
    this.version(3).stores({
      profiles: 'id, updatedAt',
      apiCache: 'key, expiresAt',
      meta: 'key',
      managedFiles: 'id, profileId, category, projectId, sha1',
      dirHandles: 'id, profileId'
    });
  }
}

// シングルトンとして export。複数回 import されても同じインスタンスを返す。
export const db = new DropModDatabase();

// ============================================================================
// 便利ヘルパ (呼び出し側の書き味を良くするため)
// ============================================================================

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
// Phase 12-A: Managed File 台帳 / DirectoryHandle の操作
// ============================================================================

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

// ============================================================================
// テスト用 (fake-indexeddb 環境で DB をリセット)
// ============================================================================

/**
 * 全テーブルをクリアする (テスト・完全リセット用)。
 * ⚠️ ユーザーデータが消えるので本番機能からは呼ばない。
 */
export async function _clearAllForTesting(): Promise<void> {
  await db.transaction(
    'rw',
    db.profiles,
    db.apiCache,
    db.meta,
    db.managedFiles,
    db.dirHandles,
    async () => {
      await db.profiles.clear();
      await db.apiCache.clear();
      await db.meta.clear();
      await db.managedFiles.clear();
      await db.dirHandles.clear();
    }
  );
}

// 型 re-export (ProjectItem を使う側の import 減らし)
export type { Profile, ProjectItem };
