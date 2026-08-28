/**
 * lib/env/diff.ts test (Phase 12-A / PHASE12_PLAN.md §10.2)
 *
 * **P12-A の DoD 本体**: `computeSyncPlan()` が Diff 全 5 分類
 * (Additions / Updates / Deletions / Unchanged / Unmanaged) と
 * fingerprint unchanged 検証を cover することを検証する。
 *
 * pure function のため DB / ブラウザ API 不要。
 */

import { describe, it, expect } from 'vitest';
import {
  computeSyncPlan,
  excludeDeletions,
  selectDeletionsRequiringConfirm,
  selectExternallyModified,
  type LocalFileEntry
} from '@/lib/env/diff';
import type { SyncPlan, SyncPlanEntry } from '@/lib/env/diff';
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

function makeManaged(overrides: Partial<ManagedFileRecord> = {}): ManagedFileRecord {
  return {
    id: 'p1::mods/a.jar',
    profileId: 'p1',
    category: 'mod',
    projectId: 'proj-1',
    path: 'mods/a.jar',
    sha1: 'sha-managed',
    size: 100,
    source: 'import',
    managedAt: NOW - 1000,
    ...overrides
  };
}

function makeLocal(overrides: Partial<LocalFileEntry> = {}): LocalFileEntry {
  return {
    category: 'mod',
    path: 'mods/a.jar',
    sha1: 'sha-local',
    size: 100,
    ...overrides
  };
}

/** 指定カテゴリの path 一覧 (アサーションを読みやすくするため) */
function paths(entries: Array<{ path: string }>): string[] {
  return entries.map((e) => e.path).sort();
}

describe('computeSyncPlan: 🟢 Additions', () => {
  it('Profile に artifact があるが Local に実体が無い → addition (要ダウンロード)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [
          makeItem({
            artifact: { sha1: 'sha-target', path: 'mods/a.jar', size: 123 }
          })
        ]
      }),
      managed: [],
      local: [],
      now: NOW
    });

    expect(plan.additions).toHaveLength(1);
    expect(plan.additions[0]).toMatchObject({
      kind: 'addition',
      category: 'mod',
      path: 'mods/a.jar',
      projectId: 'proj-1',
      targetSha1: 'sha-target',
      size: 123,
      needsDownload: true
    });
    expect(plan.updates).toEqual([]);
    expect(plan.deletions).toEqual([]);
  });

  it('artifact 無し (DropMod から追加しただけ) → addition / source=dropmod', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ mods: [makeItem({ filename: 'sodium.jar' })] }),
      managed: [],
      local: [],
      contentDirs: { mods: 'mods' },
      now: NOW
    });

    expect(plan.additions[0]).toMatchObject({
      kind: 'addition',
      // contentDirs から書き込み先を確定する (環境ルート直下に書かない)
      path: 'mods/sodium.jar',
      source: 'dropmod',
      needsDownload: true,
      size: 0
    });
  });

  it('contentDirs が無ければ filename があっても path は空 (ダウンロード後に確定)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ mods: [makeItem({ filename: 'sodium.jar' })] }),
      managed: [],
      local: [],
      now: NOW
    });
    expect(plan.additions[0]?.path).toBe('');
  });

  it('カテゴリ別の contentDirs を使う (resourcepack は resourcepacks/ へ)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [makeItem({ filename: 'a.jar' })],
        resourcepacks: [makeItem({ filename: 'p.zip' })]
      }),
      managed: [],
      local: [],
      contentDirs: { mods: 'mods', resourcepacks: '.minecraft/resourcepacks' },
      now: NOW
    });
    expect(plan.additions.map((a) => a.path)).toEqual([
      'mods/a.jar',
      '.minecraft/resourcepacks/p.zip'
    ]);
  });

  it('artifact も filename も無ければ path は空 (ダウンロード後に確定)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ mods: [makeItem()] }),
      managed: [],
      local: [],
      now: NOW
    });
    expect(plan.additions[0]?.path).toBe('');
  });

  it('artifact 無しでも台帳+実体があれば unchanged とみなす (再追加しない)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ mods: [makeItem()] }),
      managed: [makeManaged({ sha1: 'sha-local' })],
      local: [makeLocal({ sha1: 'sha-local' })],
      now: NOW
    });

    expect(plan.additions).toEqual([]);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.unchanged[0]).toMatchObject({ path: 'mods/a.jar', source: 'import' });
  });
});

describe('computeSyncPlan: 🟡 Updates', () => {
  it('同一 project で sha1 が Profile と Local で異なる → update', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [
          makeItem({
            artifact: { sha1: 'sha-new', path: 'mods/a.jar', size: 300 }
          })
        ]
      }),
      managed: [makeManaged({ sha1: 'sha-old' })],
      local: [makeLocal({ sha1: 'sha-old', size: 200 })],
      now: NOW
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({
      kind: 'update',
      path: 'mods/a.jar',
      targetSha1: 'sha-new',
      localSha1: 'sha-old',
      managedSha1: 'sha-old',
      size: 300
    });
    expect(plan.additions).toEqual([]);
    expect(plan.deletions).toEqual([]);
  });
});

describe('computeSyncPlan: 🔴 Deletions と fingerprint unchanged 検証 (§10.2 の 3 条件)', () => {
  it('3 条件を全て満たす → deletion', () => {
    const plan = computeSyncPlan({
      // 条件 3: Profile は該当 project を持たない
      profile: makeProfile({ mods: [] }),
      // 条件 1: 台帳に存在する
      managed: [makeManaged({ sha1: 'sha-same' })],
      // 条件 2: Local fingerprint == 台帳 sha1
      local: [makeLocal({ sha1: 'sha-same', size: 555 })],
      now: NOW
    });

    expect(plan.deletions).toHaveLength(1);
    expect(plan.deletions[0]).toMatchObject({
      kind: 'deletion',
      path: 'mods/a.jar',
      projectId: 'proj-1',
      source: 'import',
      localSha1: 'sha-same',
      managedSha1: 'sha-same',
      size: 555
    });
  });

  it('**条件 2 不足**: fingerprint が変わっていたら削除せず unchanged + externallyModified', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ mods: [] }),
      managed: [makeManaged({ sha1: 'sha-managed' })],
      local: [makeLocal({ sha1: 'sha-EXTERNALLY-CHANGED' })],
      now: NOW
    });

    // 削除してはいけない
    expect(plan.deletions).toEqual([]);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.unchanged[0]).toMatchObject({
      kind: 'unchanged',
      path: 'mods/a.jar',
      externallyModified: true,
      localSha1: 'sha-EXTERNALLY-CHANGED',
      managedSha1: 'sha-managed'
    });
    expect(selectExternallyModified(plan)).toHaveLength(1);
  });

  it('**条件 1 不足**: 台帳に無いファイルは Profile が要求しなくても削除しない (unmanaged)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ mods: [] }),
      managed: [],
      local: [makeLocal({ path: 'mods/user-custom.jar' })],
      now: NOW
    });

    expect(plan.deletions).toEqual([]);
    expect(plan.unmanaged).toHaveLength(1);
    expect(plan.unmanaged[0]).toMatchObject({
      kind: 'unmanaged',
      path: 'mods/user-custom.jar',
      name: 'user-custom.jar'
    });
    // unmanaged に source バッジは付けない (§10.3)
    expect(plan.unmanaged[0]?.source).toBeUndefined();
  });

  it('**条件 3 不足**: Profile が同じ project を同じパスで要求していれば削除しない', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [makeItem({ artifact: { sha1: 'sha-same', path: 'mods/a.jar', size: 100 } })]
      }),
      managed: [makeManaged({ sha1: 'sha-same' })],
      local: [makeLocal({ sha1: 'sha-same' })],
      now: NOW
    });

    expect(plan.deletions).toEqual([]);
    expect(plan.unchanged).toHaveLength(1);
  });

  it('パス移動: Profile が別パスを要求 → 旧パスは deletion (fingerprint 一致時)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [
          makeItem({
            projectId: 'proj-1',
            artifact: { sha1: 'sha-same', path: 'mods/renamed.jar', size: 100 }
          })
        ]
      }),
      managed: [makeManaged({ path: 'mods/a.jar', sha1: 'sha-same' })],
      local: [
        makeLocal({ path: 'mods/a.jar', sha1: 'sha-same' }),
        makeLocal({ path: 'mods/renamed.jar', sha1: 'sha-same' })
      ],
      now: NOW
    });

    expect(paths(plan.deletions)).toEqual(['mods/a.jar']);
    expect(paths(plan.unchanged)).toEqual(['mods/renamed.jar']);
  });

  it('パス移動 + 外部変更 → 旧パスは保持 (externallyModified)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [
          makeItem({
            projectId: 'proj-1',
            artifact: { sha1: 'sha-same', path: 'mods/renamed.jar', size: 100 }
          })
        ]
      }),
      managed: [makeManaged({ path: 'mods/a.jar', sha1: 'sha-managed' })],
      local: [makeLocal({ path: 'mods/a.jar', sha1: 'sha-different' })],
      now: NOW
    });

    expect(plan.deletions).toEqual([]);
    expect(selectExternallyModified(plan).map((e) => e.path)).toEqual(['mods/a.jar']);
  });

  it('selectDeletionsRequiringConfirm: dropmod 由来以外の削除のみ抽出 (§10.3)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ mods: [] }),
      managed: [
        makeManaged({ id: 'p1::mods/a.jar', path: 'mods/a.jar', projectId: 'p-a', source: 'import' }),
        makeManaged({ id: 'p1::mods/b.jar', path: 'mods/b.jar', projectId: 'p-b', source: 'dropmod' })
      ],
      // 条件 2 を満たすため local の sha1 は台帳の既定値 ('sha-managed') に揃える
      local: [
        makeLocal({ path: 'mods/a.jar', sha1: 'sha-managed' }),
        makeLocal({ path: 'mods/b.jar', sha1: 'sha-managed' })
      ],
      now: NOW
    });

    expect(plan.deletions).toHaveLength(2);
    expect(selectDeletionsRequiringConfirm(plan).map((e) => e.path)).toEqual(['mods/a.jar']);
  });
});

describe('computeSyncPlan: 🔵 Unchanged', () => {
  it('Profile / Local / 台帳の sha1 が一致 → unchanged', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [makeItem({ artifact: { sha1: 'sha-1', path: 'mods/a.jar', size: 100 } })]
      }),
      managed: [makeManaged({ sha1: 'sha-1' })],
      local: [makeLocal({ sha1: 'sha-1' })],
      now: NOW
    });

    expect(plan.unchanged).toHaveLength(1);
    expect(plan.unchanged[0]).toMatchObject({
      kind: 'unchanged',
      localSha1: 'sha-1',
      managedSha1: 'sha-1'
    });
    expect(plan.unchanged[0]?.externallyModified).toBeUndefined();
    expect(selectExternallyModified(plan)).toEqual([]);
  });
});

describe('computeSyncPlan: ⚪ Unmanaged', () => {
  it('台帳に無い Local ファイルは unmanaged として表示のみ', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ mods: [] }),
      managed: [],
      local: [
        makeLocal({ path: 'mods/optifine.jar', sha1: 'x', size: 42 }),
        makeLocal({ path: 'mods/config-pack.zip', sha1: 'y', size: 7 })
      ],
      now: NOW
    });

    expect(plan.unmanaged).toHaveLength(2);
    expect(paths(plan.unmanaged)).toEqual(['mods/config-pack.zip', 'mods/optifine.jar']);
    const zip = plan.unmanaged.find((e) => e.path === 'mods/config-pack.zip');
    expect(zip?.localSha1).toBe('y');
    expect(zip?.size).toBe(7);
    expect(plan.totals.removeBytes).toBe(0);
  });
});

describe('computeSyncPlan: カテゴリ分離・集計', () => {
  it('3 カテゴリを独立に判定する (mods の台帳が resourcepacks に影響しない)', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [
          makeItem({
            projectId: 'm1',
            type: 'mod',
            artifact: { sha1: 's-m', path: 'mods/m.jar', size: 10 }
          })
        ],
        resourcepacks: [
          makeItem({
            projectId: 'r1',
            type: 'resourcepack',
            artifact: { sha1: 's-r', path: 'resourcepacks/r.zip', size: 20 }
          })
        ]
      }),
      managed: [],
      // 同じファイル名でもカテゴリが違えば別物として扱う
      local: [makeLocal({ category: 'resourcepack', path: 'mods/m.jar', sha1: 'other' })],
      now: NOW
    });

    expect(plan.additions.map((e) => `${e.category}:${e.path}`).sort()).toEqual([
      'mod:mods/m.jar',
      'resourcepack:resourcepacks/r.zip'
    ]);
    // resourcepack カテゴリに mods/m.jar の実体はあるが、Profile の resourcepack
    // アーティファクト (resourcepacks/r.zip) とは別パスなので unmanaged になる
    expect(paths(plan.unmanaged)).toEqual(['mods/m.jar']);
  });

  it('totals: writeBytes / removeBytes / backupBytes を正しく集計する', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({
        mods: [
          // addition (size 100)
          makeItem({
            projectId: 'add',
            artifact: { sha1: 's-add', path: 'mods/add.jar', size: 100 }
          }),
          // update (target size 300 / local size 200)
          makeItem({
            projectId: 'upd',
            artifact: { sha1: 's-upd-new', path: 'mods/upd.jar', size: 300 }
          })
        ]
      }),
      managed: [
        makeManaged({ id: 'p1::mods/upd.jar', projectId: 'upd', path: 'mods/upd.jar', sha1: 's-upd-old' }),
        makeManaged({ id: 'p1::mods/del.jar', projectId: 'del', path: 'mods/del.jar', sha1: 's-del' })
      ],
      local: [
        makeLocal({ path: 'mods/upd.jar', sha1: 's-upd-old', size: 200 }),
        makeLocal({ path: 'mods/del.jar', sha1: 's-del', size: 50 })
      ],
      now: NOW
    });

    expect(plan.totals.counts).toEqual({
      addition: 1,
      update: 1,
      deletion: 1,
      unchanged: 0,
      unmanaged: 0
    });
    expect(plan.totals.writeBytes).toBe(400); // 100 (add) + 300 (update の書き込み先)
    expect(plan.totals.removeBytes).toBe(50); // deletion の実体
    expect(plan.totals.backupBytes).toBe(250); // 200 (update 前の現ファイル) + 50 (deletion)
  });

  it('profileId と generatedAt を引き継ぐ', () => {
    const plan = computeSyncPlan({
      profile: makeProfile({ id: 'px' }),
      managed: [],
      local: [],
      now: NOW
    });
    expect(plan.profileId).toBe('px');
    expect(plan.generatedAt).toBe(NOW);
  });

  it('入力が全て空なら空の plan を返す', () => {
    const plan = computeSyncPlan({
      profile: makeProfile(),
      managed: [],
      local: [],
      now: NOW
    });
    expect(plan.additions).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletions).toEqual([]);
    expect(plan.unchanged).toEqual([]);
    expect(plan.unmanaged).toEqual([]);
    expect(plan.totals.counts).toEqual({
      addition: 0,
      update: 0,
      deletion: 0,
      unchanged: 0,
      unmanaged: 0
    });
  });
});


// ============================================================================
// Phase 12-B: ユーザーが「保持」を選んだ削除を Plan から外す
// ============================================================================

describe('excludeDeletions (§10.3 のユーザー選択)', () => {
  function makePlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
    return {
      profileId: 'p1',
      generatedAt: 1,
      additions: [],
      updates: [],
      deletions: [],
      unchanged: [],
      unmanaged: [],
      totals: {
        counts: { addition: 0, update: 0, deletion: 0, unchanged: 0, unmanaged: 0 },
        writeBytes: 0,
        removeBytes: 0,
        backupBytes: 0
      },
      ...overrides
    };
  }

  function entry(overrides: Partial<SyncPlanEntry> = {}): SyncPlanEntry {
    return {
      kind: 'deletion',
      category: 'mod',
      path: 'mods/a.jar',
      name: 'A',
      size: 0,
      ...overrides
    };
  }

  const plan = makePlan({
    deletions: [
      entry({ path: 'mods/dm.jar', source: 'dropmod', size: 100 }),
      entry({ path: 'mods/im.jar', source: 'import', size: 200 })
    ],
    totals: {
      counts: { addition: 0, update: 0, deletion: 2, unchanged: 0, unmanaged: 0 },
      writeBytes: 0,
      removeBytes: 300,
      backupBytes: 300
    }
  });

  it('空配列なら同一オブジェクトを返す', () => {
    expect(excludeDeletions(plan, [])).toBe(plan);
  });

  it('該当が無ければ同一オブジェクトを返す', () => {
    expect(excludeDeletions(plan, ['mods/other.jar'])).toBe(plan);
  });

  it('除外した削除を落とし、容量の合計も減らす', () => {
    const next = excludeDeletions(plan, ['mods/im.jar']);
    expect(next.deletions.map((d) => d.path)).toEqual(['mods/dm.jar']);
    expect(next.totals.counts.deletion).toBe(1);
    expect(next.totals.removeBytes).toBe(100);
    expect(next.totals.backupBytes).toBe(100);
  });

  it('元 Plan は変更しない', () => {
    excludeDeletions(plan, ['mods/im.jar']);
    expect(plan.deletions).toHaveLength(2);
    expect(plan.totals.removeBytes).toBe(300);
  });

  it('全部除外すると deletion 0 になる', () => {
    const next = excludeDeletions(plan, ['mods/dm.jar', 'mods/im.jar']);
    expect(next.deletions).toEqual([]);
    expect(next.totals).toMatchObject({
      counts: expect.objectContaining({ deletion: 0 }),
      removeBytes: 0,
      backupBytes: 0
    });
  });
});
