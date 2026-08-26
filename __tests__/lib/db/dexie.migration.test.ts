/**
 * Dexie schema v2 migration test (Phase 11-A)
 *
 * v1 (flat Profile + ModItem) の DB を作ってから v2 の app db を開き、
 * upgrade が新形状 (environment + ProjectItem) に変換することを検証する。
 *
 * ※ fake-indexeddb はテストファイルごとに独立した module instance になるため、
 *   このファイル内で DB を作り直しても他ファイルに影響しない。
 * ※ 各テストは resetDatabaseToV1() で DB を削除して v1 相当を再作成する
 *   (upgrade は「v1 DB に対して v2 を開いた時」に一度だけ走るため)。
 */

import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { db, getAllProfiles, getMeta, setMeta } from '@/lib/db/dexie';

const DB_NAME = 'DropModDB';

/**
 * app db (v2) を閉じて DB を削除 → v1 スキーマの DB を作り直して rows を投入。
 * この直後に app db の操作をすると upgrade (v1 → v2) が走る。
 */
async function resetDatabaseToV1(rows: unknown[]): Promise<void> {
  await db.close();
  await Dexie.delete(DB_NAME);
  const v1 = new Dexie(DB_NAME);
  v1.version(1).stores({
    profiles: 'id, updatedAt',
    apiCache: 'key, expiresAt',
    meta: 'key'
  });
  await v1.open();
  if (rows.length > 0) {
    await v1.table('profiles').bulkPut(rows);
  }
  v1.close();
}

describe('Dexie schema v2 migration (Phase 11-A)', () => {
  it('v1 の flat Profile + ModItem が environment + ProjectItem に変換される', async () => {
    await resetDatabaseToV1([
      {
        id: 'legacy-1',
        name: 'Legacy Profile',
        mcVersion: '1.20.1',
        loader: 'Fabric',
        loaderVersion: '0.15.11',
        description: '旧データ',
        mods: [
          {
            id: 'mod-1',
            slug: 'sodium',
            title: 'Sodium',
            description: 'Fast rendering',
            projectType: 'mod',
            selectedVersionId: 'ver-1',
            selectedVersionNumber: '0.6.0',
            versionType: 'release',
            fileUrl: 'https://cdn.modrinth.com/data/mod-1/versions/0.6.0/sodium.jar',
            filename: 'sodium-0.6.0.jar'
          },
          {
            id: 'mod-2',
            title: 'Fresh Animations'
            // projectType 未設定 → 'mod'
          }
        ],
        updatedAt: 1_000
      }
    ]);

    // app db (v2) を開く → upgrade が走る
    await db.open();
    const rows = await getAllProfiles();

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe('legacy-1');
    expect(row.name).toBe('Legacy Profile');
    expect(row.updatedAt).toBe(1_000); // updatedAt は保持
    expect(row.environment).toEqual({
      mcVersion: '1.20.1',
      loader: 'Fabric',
      loaderVersion: '0.15.11'
    });

    expect(row.mods).toHaveLength(2);
    expect(row.mods[0]).toMatchObject({
      projectId: 'mod-1',
      slug: 'sodium',
      name: 'Sodium',
      type: 'mod',
      versionId: 'ver-1',
      versionNumber: '0.6.0',
      fileUrl: 'https://cdn.modrinth.com/data/mod-1/versions/0.6.0/sodium.jar',
      filename: 'sodium-0.6.0.jar'
    });
    // 旧 id / title / selectedVersionId 等は残っていない
    expect(row.mods[0]).not.toHaveProperty('id');
    expect(row.mods[0]).not.toHaveProperty('title');
    expect(row.mods[0]).not.toHaveProperty('selectedVersionId');
    // projectType 未設定は 'mod' に
    expect(row.mods[1]).toMatchObject({
      projectId: 'mod-2',
      name: 'Fresh Animations',
      type: 'mod'
    });
    // resourcepacks / shaderpacks / unknownFiles は optional (未設定のまま)
    expect(row.resourcepacks).toBeUndefined();
    expect(row.shaderpacks).toBeUndefined();
    expect(row.unknownFiles).toBeUndefined();
  });

  it('loader の不正値は Fabric に正規化される', async () => {
    await resetDatabaseToV1([
      {
        id: 'legacy-bad-loader',
        name: 'Bad Loader',
        mcVersion: '1.21.1',
        loader: 'X-Invalid',
        description: '',
        mods: [],
        updatedAt: 2_000
      }
    ]);

    await db.open();
    const rows = await getAllProfiles();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.environment).toEqual({ mcVersion: '1.21.1', loader: 'Fabric' });
  });

  it('v2 形状 (environment + ProjectItem + resourcepacks) の row はそのまま保持される (冪等)', async () => {
    await resetDatabaseToV1([
      {
        id: 'already-v2',
        name: 'Already v2',
        description: '新形状',
        environment: {
          mcVersion: '1.21.1',
          loader: 'NeoForge',
          loaderVersion: '21.1.0'
        },
        mods: [{ projectId: 'm1', name: 'Iris', type: 'shader' }],
        resourcepacks: [{ projectId: 'rp1', name: 'Faithful', type: 'resourcepack' }],
        unknownFiles: [
          {
            id: 'u1',
            location: 'mods',
            filename: 'custom.jar',
            path: 'mods/custom.jar',
            sha1: 'abc123',
            size: 42,
            discoveredAt: 99
          }
        ],
        updatedAt: 3_000
      }
    ]);

    await db.open();
    const rows = await getAllProfiles();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'already-v2',
      environment: { mcVersion: '1.21.1', loader: 'NeoForge', loaderVersion: '21.1.0' },
      mods: [{ projectId: 'm1', name: 'Iris', type: 'shader' }],
      resourcepacks: [{ projectId: 'rp1', name: 'Faithful', type: 'resourcepack' }],
      unknownFiles: [
        {
          id: 'u1',
          location: 'mods',
          filename: 'custom.jar',
          path: 'mods/custom.jar',
          sha1: 'abc123',
          size: 42,
          discoveredAt: 99
        }
      ],
      updatedAt: 3_000
    });
  });

  it('apiCache / meta テーブルは v2 でもそのまま読み書きできる', async () => {
    await resetDatabaseToV1([]);
    // meta への書き込みは v1 側で行っておく
    const v1 = new Dexie(DB_NAME);
    v1.version(1).stores({
      profiles: 'id, updatedAt',
      apiCache: 'key, expiresAt',
      meta: 'key'
    });
    await v1.open();
    await v1.table('meta').put({ key: 'theme', value: 'dark' });
    v1.close();

    await db.open();
    expect(await getMeta('theme')).toBe('dark');
    await setMeta('schema-check', 'ok');
    expect(await getMeta('schema-check')).toBe('ok');
  });
});
