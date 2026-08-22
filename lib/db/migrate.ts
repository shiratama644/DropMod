/**
 * LocalStorage → Dexie (IndexedDB) データ移行ロジック
 *
 * Sub-Phase 8-A: 初回起動時に 1 回だけ実行する。
 *
 * 設計方針 (ユーザー決定事項):
 *   ✅ 自動移行  — ユーザー操作なしで初回アクセス時に走る
 *   ✅ 安全性優先 — 移行成功後も LocalStorage を 7 日間バックアップとして残す
 *                  → Dexie 側で問題があればロールバック可能
 *   ✅ 冪等      — 何度呼んでも 1 回しか実行されない (migratedAt を成功時のみ書く)
 *   ✅ 失敗許容   — 例外が起きたら migratedAt を書かない = 次回起動時に再試行される
 *
 * 呼び出し場所: `hooks/useProfiles.ts` の hydration useEffect 内 (client only)
 */

import { db, getMeta } from './dexie';
import { sanitizeLoadedState } from '@/lib/state/sanitize';

const STORAGE_KEY = 'dropmod_state_v2';
const LEGACY_STORAGE_KEY = 'craftforge_state_v2'; // Vite 版時代のキー
const BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 日

const META_MIGRATED_AT = 'migratedAt';
const META_BACKUP_EXPIRES_AT = 'localStorageBackupExpiresAt';
const META_THEME = 'theme';
const META_CURRENT_PROFILE_ID = 'currentProfileId';
const META_SCHEMA_VERSION = 'schemaVersion';

// ============================================================================
// 型
// ============================================================================

export interface MigrationResult {
  status: 'skipped' | 'migrated' | 'no-data' | 'failed';
  profilesMigrated: number;
  themeMigrated: boolean;
  error?: unknown;
}

// ============================================================================
// メイン API
// ============================================================================

/**
 * LocalStorage の旧データを Dexie に移行する。
 *
 * 挙動:
 *   1. migratedAt メタが既にあれば `skipped` を返して何もしない
 *   2. LocalStorage を読む (新キー → 旧キーの順)。無ければ空 DB を確定させて `no-data`
 *   3. sanitizeLoadedState で bang-safe 正規化
 *   4. profiles + theme + currentProfileId を各テーブルに投入
 *   5. migratedAt + localStorageBackupExpiresAt を meta に書く
 *   6. ⚠️ LocalStorage はまだ削除しない (7 日バックアップ)
 *
 * 例外が起きた場合:
 *   - migratedAt を書かないので、次回起動時に再度移行を試みる
 *   - コンソールに error を出力
 *   - MigrationResult.status = 'failed', error に例外を格納
 */
export async function migrateFromLocalStorage(): Promise<MigrationResult> {
  // SSR ガード
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { status: 'skipped', profilesMigrated: 0, themeMigrated: false };
  }

  // 既に移行済みなら何もしない
  const already = await getMeta(META_MIGRATED_AT);
  if (already) {
    return { status: 'skipped', profilesMigrated: 0, themeMigrated: false };
  }

  // LocalStorage 読み込み (新キー → 旧キー)
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    // localStorage 自体が使えない (プライベートブラウズ等) → 移行不要扱い
    console.warn('[DropMod] LocalStorage read failed during migration:', e);
    await markMigrated(false); // 空でも migratedAt を書いて再試行を止める
    return { status: 'no-data', profilesMigrated: 0, themeMigrated: false };
  }

  if (!raw) {
    // 新規ユーザー: 何も移行するものが無い
    await markMigrated(false);
    return { status: 'no-data', profilesMigrated: 0, themeMigrated: false };
  }

  // 移行本体
  try {
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeLoadedState(parsed);

    let profilesMigrated = 0;
    let themeMigrated = false;

    await db.transaction('rw', db.profiles, db.meta, async () => {
      if (sanitized?.profiles && sanitized.profiles.length > 0) {
        const now = Date.now();
        await db.profiles.bulkPut(
          sanitized.profiles.map((p) => ({ ...p, updatedAt: now }))
        );
        profilesMigrated = sanitized.profiles.length;
      }

      if (sanitized?.theme) {
        await db.meta.put({ key: META_THEME, value: sanitized.theme });
        themeMigrated = true;
      }

      if (sanitized?.currentProfileId) {
        await db.meta.put({
          key: META_CURRENT_PROFILE_ID,
          value: sanitized.currentProfileId
        });
      }

      // 移行完了フラグ + 7 日バックアップ期限
      const now = Date.now();
      await db.meta.bulkPut([
        { key: META_MIGRATED_AT, value: String(now) },
        { key: META_BACKUP_EXPIRES_AT, value: String(now + BACKUP_TTL_MS) },
        { key: META_SCHEMA_VERSION, value: '1' }
      ]);
    });

    return { status: 'migrated', profilesMigrated, themeMigrated };
  } catch (e) {
    console.error('[DropMod] LocalStorage → Dexie 移行失敗:', e);
    return { status: 'failed', profilesMigrated: 0, themeMigrated: false, error: e };
  }
}

/**
 * 7 日経過後、LocalStorage のバックアップを削除する。
 *
 * 呼び出しタイミング: アプリ起動時 (migrateFromLocalStorage の後)
 * これ以降は Dexie が唯一の正 (source of truth) となる。
 */
export async function cleanupExpiredBackup(): Promise<'kept' | 'removed' | 'no-backup'> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'no-backup';
  }

  const expiryStr = await getMeta(META_BACKUP_EXPIRES_AT);
  if (!expiryStr) return 'no-backup';

  const expiryMs = Number(expiryStr);
  if (!Number.isFinite(expiryMs) || Date.now() < expiryMs) {
    return 'kept'; // まだバックアップ期間内
  }

  // 期限切れ → LocalStorage を消して meta も掃除
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    console.warn('[DropMod] LocalStorage backup cleanup failed:', e);
  }
  await db.meta.delete(META_BACKUP_EXPIRES_AT);
  return 'removed';
}

/**
 * バックアップからの復元 (緊急用)。
 *
 * ユーザーが Settings で「Dexie を破棄して LocalStorage から再構築」を選んだ場合に呼ぶ。
 * Dexie の profiles / meta を全消去 → LocalStorage を読んで再度移行する。
 *
 * 呼び出し後は `window.location.reload()` 推奨。
 */
export async function restoreFromLocalStorageBackup(): Promise<MigrationResult> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { status: 'no-data', profilesMigrated: 0, themeMigrated: false };
  }

  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    return { status: 'no-data', profilesMigrated: 0, themeMigrated: false };
  }

  // 現在の Dexie profiles / meta を全消去 (apiCache は保持: Modrinth のキャッシュは無関係)
  await db.transaction('rw', db.profiles, db.meta, async () => {
    await db.profiles.clear();
    await db.meta.clear();
  });

  // 再度移行
  return migrateFromLocalStorage();
}

// ============================================================================
// 内部ヘルパ
// ============================================================================

/**
 * 移行完了フラグを書く (プロファイル 0 でも呼ぶ)。
 * `withBackup=true` の場合はバックアップ期限も設定する。
 * `withBackup=false` の場合は元 LocalStorage が無いのでバックアップも設定しない。
 */
async function markMigrated(withBackup: boolean): Promise<void> {
  const now = Date.now();
  const rows = [
    { key: META_MIGRATED_AT, value: String(now) },
    { key: META_SCHEMA_VERSION, value: '1' }
  ];
  if (withBackup) {
    rows.push({ key: META_BACKUP_EXPIRES_AT, value: String(now + BACKUP_TTL_MS) });
  }
  await db.meta.bulkPut(rows);
}

/**
 * 移行状況を人間可読な形式で取得する (デバッグ / Settings 表示用)。
 */
export async function getMigrationStatus(): Promise<{
  migrated: boolean;
  migratedAt: Date | null;
  backupAvailable: boolean;
  backupExpiresAt: Date | null;
  schemaVersion: string | null;
}> {
  const [migratedAtStr, backupExpiresAtStr, schemaVersion] = await Promise.all([
    getMeta(META_MIGRATED_AT),
    getMeta(META_BACKUP_EXPIRES_AT),
    getMeta(META_SCHEMA_VERSION)
  ]);

  const backupInLocalStorage =
    typeof window !== 'undefined' &&
    typeof localStorage !== 'undefined' &&
    (!!localStorage.getItem(STORAGE_KEY) || !!localStorage.getItem(LEGACY_STORAGE_KEY));

  return {
    migrated: !!migratedAtStr,
    migratedAt: migratedAtStr ? new Date(Number(migratedAtStr)) : null,
    backupAvailable: backupInLocalStorage,
    backupExpiresAt: backupExpiresAtStr ? new Date(Number(backupExpiresAtStr)) : null,
    schemaVersion
  };
}

// key 名を export しておくと他モジュールから hard-code 依存を避けられる
export const META_KEYS = {
  MIGRATED_AT: META_MIGRATED_AT,
  BACKUP_EXPIRES_AT: META_BACKUP_EXPIRES_AT,
  THEME: META_THEME,
  CURRENT_PROFILE_ID: META_CURRENT_PROFILE_ID,
  SCHEMA_VERSION: META_SCHEMA_VERSION
} as const;

export const LOCAL_STORAGE_KEYS = {
  CURRENT: STORAGE_KEY,
  LEGACY: LEGACY_STORAGE_KEY
} as const;
