/**
 * lib/db/migrate.ts test (Sub-Phase 9-C.5)
 *
 * LocalStorage → Dexie 移行の各パターン + backup 復元を検証。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  migrateFromLocalStorage,
  cleanupExpiredBackup,
  restoreFromLocalStorageBackup,
  getMigrationStatus,
  META_KEYS,
  LOCAL_STORAGE_KEYS
} from '@/lib/db/migrate';
import { db, getMeta, _clearAllForTesting } from '@/lib/db/dexie';

async function resetAll() {
  await _clearAllForTesting();
  if (typeof localStorage !== 'undefined') localStorage.clear();
}

describe('lib/db/migrate', () => {
  beforeEach(async () => {
    await resetAll();
  });

  describe('migrateFromLocalStorage', () => {
    it('LocalStorage 空 (新規ユーザー) → no-data + markMigrated', async () => {
      const res = await migrateFromLocalStorage();
      expect(res.status).toBe('no-data');
      // markMigrated が呼ばれて次回の skipped 判定に使う
      expect(await getMeta(META_KEYS.MIGRATED_AT)).not.toBeNull();
      // 新規ユーザーでも backupExpires が設定される (C7-1 修正)
      expect(await getMeta(META_KEYS.BACKUP_EXPIRES_AT)).not.toBeNull();
    });

    it('既に migratedAt があれば skipped', async () => {
      await db.meta.put({ key: META_KEYS.MIGRATED_AT, value: '12345' });
      const res = await migrateFromLocalStorage();
      expect(res.status).toBe('skipped');
    });

    it('新キーから読み取り → profiles + theme + currentProfileId 移行', async () => {
      const data = {
        theme: 'light',
        currentProfileId: 'pA',
        profiles: [
          {
            id: 'pA',
            name: 'PA',
            mcVersion: '1.20.1',
            loader: 'Fabric',
            description: '',
            mods: []
          },
          {
            id: 'pB',
            name: 'PB',
            mcVersion: '1.21.1',
            loader: 'Forge',
            description: '',
            mods: []
          }
        ]
      };
      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, JSON.stringify(data));

      const res = await migrateFromLocalStorage();
      expect(res.status).toBe('migrated');
      expect(res.profilesMigrated).toBe(2);
      expect(res.themeMigrated).toBe(true);

      expect(await db.profiles.count()).toBe(2);
      expect(await getMeta(META_KEYS.THEME)).toBe('light');
      expect(await getMeta(META_KEYS.CURRENT_PROFILE_ID)).toBe('pA');
      expect(await getMeta(META_KEYS.SCHEMA_VERSION)).toBe('1');
      expect(await getMeta(META_KEYS.MIGRATED_AT)).not.toBeNull();
      expect(await getMeta(META_KEYS.BACKUP_EXPIRES_AT)).not.toBeNull();
    });

    it('legacy キーからでも読み取れる', async () => {
      const data = {
        theme: 'dark',
        profiles: [
          {
            id: 'legacy-1',
            name: 'Legacy',
            mcVersion: '1.19.4',
            loader: 'Forge',
            description: '',
            mods: []
          }
        ]
      };
      localStorage.setItem(LOCAL_STORAGE_KEYS.LEGACY, JSON.stringify(data));

      const res = await migrateFromLocalStorage();
      expect(res.status).toBe('migrated');
      expect(res.profilesMigrated).toBe(1);
    });

    it('壊れた JSON → failed + migratedAt 書かず次回リトライ可能', async () => {
      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, '{ not valid json');
      const res = await migrateFromLocalStorage();
      expect(res.status).toBe('failed');
      expect(res.error).toBeInstanceOf(SyntaxError);
      expect(await getMeta(META_KEYS.MIGRATED_AT)).toBeNull();
    });
  });

  describe('cleanupExpiredBackup', () => {
    it('meta に backup 期限が無ければ no-backup', async () => {
      const r = await cleanupExpiredBackup();
      expect(r).toBe('no-backup');
    });

    it('期限が未来なら kept + LocalStorage 保持', async () => {
      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, '{}');
      await db.meta.put({
        key: META_KEYS.BACKUP_EXPIRES_AT,
        value: String(Date.now() + 60_000)
      });
      const r = await cleanupExpiredBackup();
      expect(r).toBe('kept');
      expect(localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT)).not.toBeNull();
    });

    it('期限切れなら removed + LocalStorage も掃除', async () => {
      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, '{}');
      localStorage.setItem(LOCAL_STORAGE_KEYS.LEGACY, '{}');
      await db.meta.put({
        key: META_KEYS.BACKUP_EXPIRES_AT,
        value: String(Date.now() - 10_000)
      });
      const r = await cleanupExpiredBackup();
      expect(r).toBe('removed');
      expect(localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT)).toBeNull();
      expect(localStorage.getItem(LOCAL_STORAGE_KEYS.LEGACY)).toBeNull();
      expect(await getMeta(META_KEYS.BACKUP_EXPIRES_AT)).toBeNull();
    });
  });

  describe('restoreFromLocalStorageBackup', () => {
    it('LocalStorage が空なら no-data', async () => {
      const r = await restoreFromLocalStorageBackup();
      expect(r.status).toBe('no-data');
    });

    it('LocalStorage 有: Dexie 全消去 → 再度移行', async () => {
      // まず migrate してから profile を消して、restore で復元されるか
      const data = {
        profiles: [
          {
            id: 'orig',
            name: 'Original',
            mcVersion: '1.20.1',
            loader: 'Fabric',
            description: '',
            mods: []
          }
        ]
      };
      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, JSON.stringify(data));

      await migrateFromLocalStorage();
      expect(await db.profiles.count()).toBe(1);

      // 手動で書き換え
      await db.profiles.put({
        id: 'garbage',
        name: 'Garbage',
        environment: { mcVersion: '1.0', loader: 'Fabric' },
        description: '',
        mods: [],
        updatedAt: Date.now()
      });
      expect(await db.profiles.count()).toBe(2);

      // restore → Dexie を消して LocalStorage から再構築
      const r = await restoreFromLocalStorageBackup();
      expect(r.status).toBe('migrated');
      expect(await db.profiles.count()).toBe(1);
      const remaining = await db.profiles.toArray();
      expect(remaining[0]!.id).toBe('orig');
    });
  });

  describe('getMigrationStatus', () => {
    it('未移行なら migrated=false', async () => {
      const s = await getMigrationStatus();
      expect(s.migrated).toBe(false);
      expect(s.migratedAt).toBeNull();
      expect(s.schemaVersion).toBeNull();
    });

    it('移行後は migrated=true + Date が入る', async () => {
      localStorage.setItem(
        LOCAL_STORAGE_KEYS.CURRENT,
        JSON.stringify({ profiles: [] })
      );
      await migrateFromLocalStorage();
      const s = await getMigrationStatus();
      expect(s.migrated).toBe(true);
      expect(s.migratedAt).toBeInstanceOf(Date);
      // schemaVersion は本移行時のみセット (no-data のみだと未設定なので、
      // 本移行を経たケースで確認)
    });

    it('backupAvailable は LocalStorage の内容を見る', async () => {
      // 空
      let s = await getMigrationStatus();
      expect(s.backupAvailable).toBe(false);

      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, '{}');
      s = await getMigrationStatus();
      expect(s.backupAvailable).toBe(true);
    });
  });
});
