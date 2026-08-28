/**
 * Dexie schema v3 → v4 upgrade test (Phase 12-B)
 *
 * v4 は **新規テーブル (`syncTransactions`) の追加のみで upgrade 関数を持たない**。
 * 既存データがそのまま読めることと、v1 から一気に v4 まで上がることを検証する。
 *
 * ※ fake-indexeddb はテストファイルごとに独立した module instance になる。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import {
  db,
  getAllProfiles,
  getDirHandle,
  getManagedFiles,
  listSyncTransactions,
  type ProfileRow,
  type SyncTransactionRow
} from '@/lib/db/dexie';
import type { ManagedFileRecord } from '@/types';

const DB_NAME = 'DropModDB';

const V1_STORES = {
  profiles: 'id, updatedAt',
  apiCache: 'key, expiresAt',
  meta: 'key'
};

const V3_STORES = {
  ...V1_STORES,
  managedFiles: 'id, profileId, category, projectId, sha1',
  dirHandles: 'id, profileId'
};

const PROFILE_ROW = {
  id: 'p1',
  name: 'My Pack',
  environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
  mods: [],
  updatedAt: 1_700_000_000_000
} satisfies ProfileRow;

const MANAGED_ROW: ManagedFileRecord = {
  id: 'p1::mods/a.jar',
  profileId: 'p1',
  category: 'mod',
  projectId: 'proj-1',
  path: 'mods/a.jar',
  sha1: 'sha-1',
  size: 100,
  source: 'import',
  managedAt: 1_700_000_000_000
};

/** app db を閉じて DB を削除し、指定バージョンのスキーマで作り直す */
async function resetDatabaseTo(
  version: 1 | 3,
  seed: (db: Dexie) => Promise<void>
): Promise<void> {
  await db.close();
  await Dexie.delete(DB_NAME);
  const legacy = new Dexie(DB_NAME);
  legacy.version(version).stores(version === 1 ? V1_STORES : V3_STORES);
  await legacy.open();
  await seed(legacy);
  legacy.close();
}

describe('Dexie schema v4 upgrade (Phase 12-B)', () => {
  beforeEach(async () => {
    await db.open();
  });

  it('v3 の DB を開くと v4 になり、既存データはそのまま読める', async () => {
    await resetDatabaseTo(3, async (legacy) => {
      await legacy.table('profiles').put(PROFILE_ROW);
      await legacy.table('managedFiles').put(MANAGED_ROW);
      await legacy.table('dirHandles').put({
        id: 'h1',
        profileId: 'p1',
        handle: {} as FileSystemDirectoryHandle,
        name: '.minecraft',
        savedAt: 1
      });
    });

    await db.open();

    expect(db.verno).toBe(4);
    expect((await getAllProfiles()).map((p) => p.id)).toEqual(['p1']);
    expect((await getManagedFiles('p1')).map((r) => r.path)).toEqual(['mods/a.jar']);
    expect((await getDirHandle('h1'))?.name).toBe('.minecraft');
    // 新テーブルは空から始まる (履歴なし)
    expect(await listSyncTransactions('p1')).toEqual([]);
  });

  it('v1 の DB は v2 の形状変換を経由して v4 まで上がる', async () => {
    await resetDatabaseTo(1, async (legacy) => {
      // v1 世代の flat Profile + ModItem
      await legacy.table('profiles').put({
        id: 'p-legacy',
        name: 'Legacy',
        mcVersion: '1.20.1',
        loader: 'Fabric',
        loaderVersion: '0.14.21',
        mods: [{ id: 'proj-9', title: 'Sodium', type: 'mod' }],
        updatedAt: 1_700_000_000_000
      });
    });

    await db.open();

    expect(db.verno).toBe(4);
    const [profile] = await getAllProfiles();
    expect(profile?.environment).toMatchObject({
      mcVersion: '1.20.1',
      loader: 'Fabric',
      loaderVersion: '0.14.21'
    });
    expect(profile?.mods[0]).toMatchObject({ projectId: 'proj-9', name: 'Sodium' });
    expect(await getManagedFiles('p-legacy')).toEqual([]);
  });

  it('status index が使える (D-4 の残存検出クエリ)', async () => {
    await resetDatabaseTo(3, async () => {});
    await db.open();

    const rows: SyncTransactionRow[] = [
      { id: 'tx-1', profileId: 'p1', status: 'running', startedAt: 1, operations: [] },
      { id: 'tx-2', profileId: 'p1', status: 'completed', startedAt: 2, operations: [] }
    ];
    await db.syncTransactions.bulkPut(rows);

    const running = await db.syncTransactions.where('status').equals('running').toArray();
    expect(running.map((r) => r.id)).toEqual(['tx-1']);
  });
});
