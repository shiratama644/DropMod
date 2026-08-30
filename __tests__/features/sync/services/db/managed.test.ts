/**
 * Dexie schema v3 (Phase 12-A) test
 *
 * `managedFiles` / `dirHandles` テーブルの追加と、台帳・handle の操作ヘルパを検証する。
 *
 * ※ fake-indexeddb はテストファイルごとに独立した module instance になるため、
 *   このファイル内で DB を作り直しても他ファイルに影響しない。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import {
  db,
  getAllProfiles,
  _clearAllForTesting
} from '@/lib/db/dexie';
import {
  deleteDirHandle,
  deleteManagedFilesForProfile,
  getDirHandle,
  getManagedFiles,
  saveDirHandle,
  syncManagedFiles,
  type ManagedFileRow
} from '@/features/sync';
import type { ManagedFileRecord } from '@/types';

const DB_NAME = 'DropModDB';

function makeRecord(overrides: Partial<ManagedFileRecord> = {}): ManagedFileRow {
  return {
    id: 'p1::mods/a.jar',
    profileId: 'p1',
    category: 'mod',
    projectId: 'proj-1',
    path: 'mods/a.jar',
    sha1: 'sha-1',
    size: 100,
    source: 'import',
    managedAt: 1_700_000_000_000,
    ...overrides
  };
}

/** Chromium 以外の環境に FileSystemDirectoryHandle が無いためスタブで代替する */
function fakeHandle(name: string): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

beforeEach(async () => {
  await _clearAllForTesting();
});

describe('Dexie schema v3 (Phase 12-A)', () => {
  it('managedFiles / dirHandles テーブルが開ける', async () => {
    await db.open();
    expect(db.managedFiles).toBeDefined();
    expect(db.dirHandles).toBeDefined();
    expect(db.verno).toBeGreaterThanOrEqual(3);
  });

  it('v2 の DB を v3 で開いても既存 profiles は保持され、新規テーブルは空', async () => {
    // v2 相当の DB を作り、Profile を 1 件投入
    await db.close();
    await Dexie.delete(DB_NAME);
    const v2 = new Dexie(DB_NAME);
    v2.version(1).stores({ profiles: 'id, updatedAt', apiCache: 'key, expiresAt', meta: 'key' });
    v2.version(2).stores({ profiles: 'id, updatedAt', apiCache: 'key, expiresAt', meta: 'key' });
    await v2.open();
    await v2.table('profiles').put({
      id: 'legacy',
      name: 'Legacy',
      environment: { mcVersion: '1.21.1', loader: 'Fabric' },
      mods: [],
      updatedAt: 1
    });
    v2.close();

    // app db (v3) で開き直す → upgrade が走る
    await db.open();
    const profiles = await getAllProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.id).toBe('legacy');
    // 新規テーブルは空 = 紐付け直後は deletion が発生しない (安全側)
    expect(await getManagedFiles('legacy')).toEqual([]);
  });
});

describe('syncManagedFiles / getManagedFiles', () => {
  it('台帳を一括保存し、path 昇順で取得できる', async () => {
    await syncManagedFiles('p1', [
      makeRecord({ id: 'p1::mods/b.jar', path: 'mods/b.jar', projectId: 'b' }),
      makeRecord({ id: 'p1::mods/a.jar', path: 'mods/a.jar', projectId: 'a' })
    ]);

    const rows = await getManagedFiles('p1');
    expect(rows.map((r) => r.path)).toEqual(['mods/a.jar', 'mods/b.jar']);
  });

  it('差分同期: 渡されなかった既存行は削除される', async () => {
    await syncManagedFiles('p1', [
      makeRecord({ id: 'p1::mods/a.jar', path: 'mods/a.jar' }),
      makeRecord({ id: 'p1::mods/gone.jar', path: 'mods/gone.jar', projectId: 'gone' })
    ]);
    await syncManagedFiles('p1', [makeRecord({ id: 'p1::mods/a.jar', path: 'mods/a.jar' })]);

    const rows = await getManagedFiles('p1');
    expect(rows.map((r) => r.path)).toEqual(['mods/a.jar']);
  });

  it('既存行は上書き更新される (sha1 の更新が反映される)', async () => {
    await syncManagedFiles('p1', [makeRecord({ sha1: 'old' })]);
    await syncManagedFiles('p1', [makeRecord({ sha1: 'new' })]);

    const rows = await getManagedFiles('p1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sha1).toBe('new');
  });

  it('他 Profile の台帳には影響しない', async () => {
    await syncManagedFiles('p1', [makeRecord()]);
    await syncManagedFiles('p2', [
      makeRecord({ id: 'p2::mods/x.jar', profileId: 'p2', path: 'mods/x.jar' })
    ]);
    // p1 を空で同期 → p1 の行だけ消える
    await syncManagedFiles('p1', []);

    expect(await getManagedFiles('p1')).toEqual([]);
    expect(await getManagedFiles('p2')).toHaveLength(1);
  });

  it('deleteManagedFilesForProfile は指定 Profile の台帳だけを消す', async () => {
    await syncManagedFiles('p1', [makeRecord()]);
    await syncManagedFiles('p2', [
      makeRecord({ id: 'p2::mods/x.jar', profileId: 'p2', path: 'mods/x.jar' })
    ]);

    await deleteManagedFilesForProfile('p1');

    expect(await getManagedFiles('p1')).toEqual([]);
    expect(await getManagedFiles('p2')).toHaveLength(1);
  });
});

describe('saveDirHandle / getDirHandle / deleteDirHandle', () => {
  it('handle を保存して id で取り出せる', async () => {
    const id = await saveDirHandle('p1', fakeHandle('.minecraft'), '.minecraft');
    expect(id).toMatch(/^dh[-_]/);

    const row = await getDirHandle(id);
    expect(row).not.toBeNull();
    expect(row?.profileId).toBe('p1');
    expect(row?.name).toBe('.minecraft');
    expect(typeof row?.savedAt).toBe('number');
  });

  it('存在しない id は null を返す', async () => {
    expect(await getDirHandle('no-such-id')).toBeNull();
  });

  it('deleteDirHandle で削除できる', async () => {
    const id = await saveDirHandle('p1', fakeHandle('.minecraft'), '.minecraft');
    await deleteDirHandle(id);
    expect(await getDirHandle(id)).toBeNull();
  });
});
