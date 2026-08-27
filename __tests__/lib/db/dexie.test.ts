/**
 * lib/db/dexie.ts test (Sub-Phase 9-C.5)
 *
 * fake-indexeddb 上で Dexie の低レベル API をテスト。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  putProfile,
  bulkPutProfiles,
  syncProfiles,
  getMeta,
  setMeta,
  deleteMeta,
  getAllProfiles,
  _clearAllForTesting
} from '@/lib/db/dexie';
import type { Profile } from '@/types';

function makeProfile(id: string, name = `P-${id}`): Profile {
  return {
    id,
    name,
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    description: '',
    mods: []
  };
}

describe('lib/db/dexie', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  describe('putProfile / bulkPutProfiles', () => {
    it('putProfile: 1 プロファイル upsert + updatedAt が現在時刻', async () => {
      await putProfile(makeProfile('a', 'Alpha'));
      const rows = await db.profiles.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('Alpha');
      expect(rows[0]!.updatedAt).toBeGreaterThan(0);
    });

    it('bulkPutProfiles: 複数を一括 put、空配列は no-op', async () => {
      await bulkPutProfiles([]);
      expect(await db.profiles.count()).toBe(0);

      await bulkPutProfiles([
        makeProfile('a'),
        makeProfile('b'),
        makeProfile('c')
      ]);
      expect(await db.profiles.count()).toBe(3);
    });

    it('putProfile 再呼び出しで既存を上書き (upsert)', async () => {
      await putProfile(makeProfile('a', 'First'));
      await putProfile(makeProfile('a', 'Updated'));
      const rows = await db.profiles.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('Updated');
    });
  });

  describe('syncProfiles', () => {
    it('DB に無い ID を追加、無くなった ID を削除する', async () => {
      // 初期: a, b, c
      await syncProfiles([
        makeProfile('a'),
        makeProfile('b'),
        makeProfile('c')
      ]);
      expect(await db.profiles.count()).toBe(3);

      // 次: a, c, d (b が消えて d が新規)
      await syncProfiles([
        makeProfile('a', 'A2'),
        makeProfile('c'),
        makeProfile('d')
      ]);
      const rows = await db.profiles.toArray();
      const ids = rows.map((r) => r.id).sort();
      expect(ids).toEqual(['a', 'c', 'd']);
      // 更新も反映
      const a = rows.find((r) => r.id === 'a');
      expect(a?.name).toBe('A2');
    });

    it('空配列を渡すと DB を全部消す', async () => {
      await syncProfiles([makeProfile('a'), makeProfile('b')]);
      await syncProfiles([]);
      expect(await db.profiles.count()).toBe(0);
    });

    it('DB 空 + profiles=[] は no-op でクラッシュしない', async () => {
      await syncProfiles([]);
      expect(await db.profiles.count()).toBe(0);
    });
  });

  describe('getMeta / setMeta / deleteMeta', () => {
    it('未設定なら null', async () => {
      expect(await getMeta('nonexistent')).toBeNull();
    });

    it('setMeta + getMeta の round trip', async () => {
      await setMeta('theme', 'dark');
      expect(await getMeta('theme')).toBe('dark');
      await setMeta('theme', 'light');
      expect(await getMeta('theme')).toBe('light');
    });

    it('deleteMeta で消去', async () => {
      await setMeta('key1', 'val1');
      await deleteMeta('key1');
      expect(await getMeta('key1')).toBeNull();
    });
  });

  describe('getAllProfiles', () => {
    it('全 profile を返す (ProfileRow に updatedAt 付与)', async () => {
      await bulkPutProfiles([makeProfile('a'), makeProfile('b')]);
      const rows = await getAllProfiles();
      expect(rows).toHaveLength(2);
      expect(typeof rows[0]!.updatedAt).toBe('number');
    });
  });

  describe('_clearAllForTesting', () => {
    it('profiles / apiCache / meta を全消去', async () => {
      await bulkPutProfiles([makeProfile('a')]);
      await setMeta('theme', 'dark');
      await db.apiCache.put({
        key: 'k1',
        data: 'v1',
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000
      });

      await _clearAllForTesting();

      expect(await db.profiles.count()).toBe(0);
      expect(await db.meta.count()).toBe(0);
      expect(await db.apiCache.count()).toBe(0);
    });
  });
});
