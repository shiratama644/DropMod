/**
 * lib/env/managed.ts test (Phase 12-A / PHASE12_PLAN.md §10.5)
 *
 * Profile → ManagedFileRecord の導出と、既存台帳とのマージを検証する。
 * pure function のため DB 不要。
 */

import { describe, it, expect } from 'vitest';
import {
  buildManagedFileId,
  deriveManagedSource,
  expandProfileToManaged,
  itemsOfCategory,
  MANAGED_CATEGORIES,
  MANAGED_ID_SEPARATOR,
  mergeManagedRecords,
  parseManagedFileId
} from '@/lib/env/managed';
import type { ManagedFileRecord, Profile, ProjectItem } from '@/types';

const NOW = 1_700_000_000_000;

function makeItem(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return { projectId: 'proj-1', name: 'Sodium', type: 'mod', ...overrides };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Test Profile',
    environment: { mcVersion: '1.21.1', loader: 'Fabric' },
    mods: [],
    ...overrides
  };
}

describe('buildManagedFileId / parseManagedFileId', () => {
  it('profileId と path を "::" で連結する', () => {
    expect(buildManagedFileId('p1', 'mods/sodium.jar')).toBe('p1::mods/sodium.jar');
  });

  it('path に "::" が含まれても最初の区切りで正しく分解できる', () => {
    const id = buildManagedFileId('p1', 'mods/a::b.jar');
    expect(parseManagedFileId(id)).toEqual({ profileId: 'p1', path: 'mods/a::b.jar' });
  });

  it('区切りを含まない不正 id は null を返す', () => {
    expect(parseManagedFileId('no-separator')).toBeNull();
  });

  it('profileId が空の id は null を返す (idx <= 0)', () => {
    expect(parseManagedFileId(`${MANAGED_ID_SEPARATOR}mods/a.jar`)).toBeNull();
  });
});

describe('itemsOfCategory', () => {
  it('未設定カテゴリは空配列を返す (既存 Profile 互換)', () => {
    const profile = makeProfile({ mods: [makeItem()] });
    expect(itemsOfCategory(profile, 'mod')).toHaveLength(1);
    expect(itemsOfCategory(profile, 'resourcepack')).toEqual([]);
    expect(itemsOfCategory(profile, 'shader')).toEqual([]);
  });

  it('3 カテゴリすべてを参照できる', () => {
    expect(MANAGED_CATEGORIES).toEqual(['mod', 'resourcepack', 'shader']);
  });
});

describe('deriveManagedSource', () => {
  it('artifact あり = import (ローカル取り込み由来)', () => {
    const item = makeItem({ artifact: { sha1: 'abc', path: 'mods/a.jar', size: 10 } });
    expect(deriveManagedSource(item)).toBe('import');
  });

  it('artifact なし = dropmod (DropMod の検索から追加)', () => {
    expect(deriveManagedSource(makeItem())).toBe('dropmod');
  });
});

describe('expandProfileToManaged', () => {
  it('artifact を持つアイテムだけ台帳化する', () => {
    const profile = makeProfile({
      mods: [
        makeItem({
          projectId: 'with-artifact',
          artifact: { sha1: 'sha-a', path: 'mods/a.jar', size: 100 }
        }),
        makeItem({ projectId: 'no-artifact' })
      ]
    });
    const records = expandProfileToManaged(profile, NOW);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      id: 'p1::mods/a.jar',
      profileId: 'p1',
      category: 'mod',
      projectId: 'with-artifact',
      path: 'mods/a.jar',
      sha1: 'sha-a',
      size: 100,
      source: 'import',
      managedAt: NOW
    });
  });

  it('sha1 または path が欠けた artifact は台帳化しない (防御)', () => {
    const profile = makeProfile({
      mods: [
        makeItem({ projectId: 'x', artifact: { sha1: '', path: 'mods/x.jar', size: 1 } }),
        makeItem({ projectId: 'y', artifact: { sha1: 'sha', path: '', size: 1 } })
      ]
    });
    expect(expandProfileToManaged(profile, NOW)).toEqual([]);
  });

  it('3 カテゴリを横断して台帳化し、カテゴリを正しく割り当てる', () => {
    const profile = makeProfile({
      mods: [
        makeItem({
          projectId: 'm',
          type: 'mod',
          artifact: { sha1: 's-m', path: 'mods/m.jar', size: 1 }
        })
      ],
      resourcepacks: [
        makeItem({
          projectId: 'r',
          type: 'resourcepack',
          artifact: { sha1: 's-r', path: 'resourcepacks/r.zip', size: 2 }
        })
      ],
      shaderpacks: [
        makeItem({
          projectId: 's',
          type: 'shader',
          artifact: { sha1: 's-s', path: 'shaderpacks/s.zip', size: 3 }
        })
      ]
    });
    const records = expandProfileToManaged(profile, NOW);
    expect(records.map((r) => r.category)).toEqual(['mod', 'resourcepack', 'shader']);
  });

  it('path 昇順でソートされる (Diff / UI の決定論のため)', () => {
    const profile = makeProfile({
      mods: [
        makeItem({
          projectId: 'b',
          artifact: { sha1: 's2', path: 'mods/b.jar', size: 1 }
        }),
        makeItem({
          projectId: 'a',
          artifact: { sha1: 's1', path: 'mods/a.jar', size: 1 }
        })
      ]
    });
    expect(expandProfileToManaged(profile, NOW).map((r) => r.path)).toEqual([
      'mods/a.jar',
      'mods/b.jar'
    ]);
  });

  it('同一 path に複数アイテムが当たると projectId 昇順の 1 件だけ採用する', () => {
    const profile = makeProfile({
      mods: [
        makeItem({
          projectId: 'zzz',
          artifact: { sha1: 's-z', path: 'mods/dup.jar', size: 1 }
        }),
        makeItem({
          projectId: 'aaa',
          artifact: { sha1: 's-a', path: 'mods/dup.jar', size: 1 }
        })
      ]
    });
    const records = expandProfileToManaged(profile, NOW);
    expect(records).toHaveLength(1);
    expect(records[0]?.projectId).toBe('aaa');
  });

  it('now 省略時は Date.now() を使う', () => {
    const profile = makeProfile({
      mods: [
        makeItem({ artifact: { sha1: 's', path: 'mods/a.jar', size: 1 } })
      ]
    });
    const before = Date.now();
    const [record] = expandProfileToManaged(profile);
    expect(record?.managedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('mergeManagedRecords', () => {
  const candidate: ManagedFileRecord = {
    id: 'p1::mods/a.jar',
    profileId: 'p1',
    category: 'mod',
    projectId: 'proj-1',
    path: 'mods/a.jar',
    sha1: 'new-sha',
    size: 200,
    source: 'import',
    managedAt: NOW
  };

  it('既存レコードが無ければ候補をそのまま採用する', () => {
    expect(mergeManagedRecords([candidate], [])).toEqual([candidate]);
  });

  it('D-6: 既存 source を引き継ぐ (modpack 解除で import へ昇格した結果を守る)', () => {
    const existing: ManagedFileRecord = {
      ...candidate,
      source: 'import',
      sha1: 'old-sha',
      managedAt: NOW - 1000
    };
    const dropmodCandidate = { ...candidate, source: 'dropmod' as const };
    const [merged] = mergeManagedRecords([dropmodCandidate], [existing]);
    expect(merged?.source).toBe('import');
  });

  it('managedAt / syncedAt を既存から引き継ぐ', () => {
    const existing: ManagedFileRecord = {
      ...candidate,
      managedAt: NOW - 5000,
      syncedAt: NOW - 100
    };
    const [merged] = mergeManagedRecords([candidate], [existing]);
    expect(merged?.managedAt).toBe(NOW - 5000);
    expect(merged?.syncedAt).toBe(NOW - 100);
  });

  it('sha1 / size は候補 (Profile の artifact) を正とする', () => {
    const existing: ManagedFileRecord = { ...candidate, sha1: 'old-sha', size: 1 };
    const [merged] = mergeManagedRecords([candidate], [existing]);
    expect(merged?.sha1).toBe('new-sha');
    expect(merged?.size).toBe(200);
  });

  it('既存に syncedAt が無ければ候補にも付けない (undefined を作らない)', () => {
    const existing: ManagedFileRecord = { ...candidate, sha1: 'old-sha' };
    const [merged] = mergeManagedRecords([candidate], [existing]);
    expect(merged && 'syncedAt' in merged).toBe(false);
  });
});
