/**
 * Sync の実行 + 台帳更新 (Phase 12-B) test — `lib/env/applySync.ts`
 *
 * `executeSync` は**実物**を使い、Backup だけをメモリ実装に差し替える。
 * つまり「Preview で承認した plan → 実行 → Journal → 台帳」までを通す統合テスト。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applySync, type ReadySyncOutcome } from '@/features/sync/applySync';
import type { SyncPlan, SyncPlanEntry } from '@/features/sync/diff';
import { _clearAllForTesting } from '@/lib/db/dexie';
import { getManagedFiles, syncManagedFiles } from '@/features/sync';
import type { ManagedFileRecord, Profile } from '@/types';
import { calculateSha1 } from '@/lib/utils/hash';
import { MemoryBackupStore, MemorySink } from '@/__tests__/test-utils/memoryEnv';

const sha1Of = async (s: string) => calculateSha1(new TextEncoder().encode(s).buffer);
const CONTENT = 'downloaded-jar';

function makePlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
    profileId: 'p1',
    generatedAt: 1,
    additions: [],
    updates: [],
    deletions: [],
    unchanged: [],
    unmanaged: [],
    conflicts: [],
    totals: {
      counts: { addition: 0, update: 0, deletion: 0, unchanged: 0, unmanaged: 0, conflict: 0 },
      writeBytes: 0,
      removeBytes: 0,
      backupBytes: 0
    },
    ...overrides
  };
}

function entry(overrides: Partial<SyncPlanEntry> = {}): SyncPlanEntry {
  return {
    kind: 'addition',
    category: 'mod',
    path: 'mods/a.jar',
    name: 'A',
    projectId: 'proj-1',
    size: CONTENT.length,
    ...overrides
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Pack',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    mods: [
      {
        projectId: 'proj-1',
        name: 'A',
        type: 'mod',
        fileUrl: 'https://cdn.example/a.jar',
        filename: 'a.jar'
      }
    ],
    linkedSource: {
      kind: 'filesystem',
      rootName: '.minecraft',
      handleId: 'dh-1',
      environment: { mcVersion: '1.20.1', loader: 'Fabric' },
      contentDirs: { mods: 'mods' },
      linkedAt: 1
    },
    ...overrides
  };
}

/** jsdom の Blob は arrayBuffer() 未実装のため互換オブジェクトを返す */
function okFetch(): typeof fetch {
  const data = new TextEncoder().encode(CONTENT);
  return vi.fn(async () =>
    ({
      ok: true,
      status: 200,
      blob: async () => ({ arrayBuffer: async () => data.slice().buffer })
    }) as unknown as Response
  );
}

function prepared(sink: MemorySink, plan: SyncPlan, writable = true): ReadySyncOutcome {
  return {
    status: 'ready',
    rootName: '.minecraft',
    check: { ok: true, mismatches: [], unverified: [] },
    plan,
    sink,
    writable,
    writableReason: writable ? null : 'denied',
    scanSkipped: [],
    localEntries: [],
    managed: []
  };
}

describe('applySync', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('完了したら実体を書き、Journal から台帳を更新する', async () => {
    const sink = new MemorySink();
    const backup = new MemoryBackupStore();
    const saveLedger = vi.fn(syncManagedFiles);

    const result = await applySync({
      profile: makeProfile(),
      prepared: prepared(sink, makePlan({ additions: [entry()] })),
      deps: {
        backup,
        estimateFreeBytes: async () => undefined,
        saveLedger,
        getManaged: async () => [],
        fetchImpl: okFetch()
      }
    });

    expect(result.result.outcome).toBe('completed');
    expect(result.result.applied).toBe(1);
    expect(result.ledgerUpdated).toBe(true);
    expect(sink.content('mods/a.jar')).toBe(CONTENT);

    // 台帳には「実際に書いた実体」の fingerprint / size が入る
    const records: ManagedFileRecord[] = await getManagedFiles('p1');
    expect(records).toEqual([
      expect.objectContaining({
        id: 'p1::mods/a.jar',
        path: 'mods/a.jar',
        projectId: 'proj-1',
        sha1: await sha1Of(CONTENT),
        size: CONTENT.length,
        source: 'dropmod'
      })
    ]);
    expect(saveLedger).toHaveBeenCalledWith('p1', records);
  });

  it('既存台帳の source は引き継ぐ (import 由来を dropmod に戻さない)', async () => {
    const existing: ManagedFileRecord[] = [
      {
        id: 'p1::mods/a.jar',
        profileId: 'p1',
        category: 'mod',
        projectId: 'proj-1',
        path: 'mods/a.jar',
        sha1: 'old',
        size: 1,
        source: 'import',
        managedAt: 5
      }
    ];
    const sink = new MemorySink({ files: { 'mods/a.jar': 'old-content' } });

    await applySync({
      profile: makeProfile(),
      prepared: prepared(
        sink,
        makePlan({
          updates: [
            entry({ kind: 'update', targetSha1: 'x', localSha1: await sha1Of('old-content') })
          ]
        })
      ),
      deps: {
        backup: new MemoryBackupStore(),
        estimateFreeBytes: async () => undefined,
        getManaged: async () => existing,
        saveLedger: syncManagedFiles,
        fetchImpl: okFetch()
      }
    });

    const records = await getManagedFiles('p1');
    expect(records[0]).toMatchObject({ source: 'import', managedAt: 5, syncedAt: expect.any(Number) });
  });

  it('**rolled-back では台帳を更新しない** (環境が元に戻っているため)', async () => {
    const sink = new MemorySink({ failOnWrite: ['mods/a.jar'] });
    const saveLedger = vi.fn(syncManagedFiles);

    const result = await applySync({
      profile: makeProfile(),
      prepared: prepared(sink, makePlan({ additions: [entry()] })),
      deps: {
        backup: new MemoryBackupStore(),
        estimateFreeBytes: async () => undefined,
        saveLedger,
        getManaged: async () => [],
        fetchImpl: okFetch()
      }
    });

    expect(result.result.outcome).toBe('rolled-back');
    expect(result.ledgerUpdated).toBe(false);
    expect(saveLedger).not.toHaveBeenCalled();
    expect(await getManagedFiles('p1')).toEqual([]);
  });

  it('**aborted-quota (D-5) では環境も台帳も触らない**', async () => {
    const sink = new MemorySink({ files: { 'mods/keep.jar': 'keep' } });
    const saveLedger = vi.fn(syncManagedFiles);

    const result = await applySync({
      profile: makeProfile(),
      prepared: prepared(
        sink,
        makePlan({
          additions: [entry()],
          totals: {
            counts: { addition: 1, update: 0, deletion: 0, unchanged: 0, unmanaged: 0, conflict: 0 },
            writeBytes: 10,
            removeBytes: 0,
            backupBytes: 10_000
          }
        })
      ),
      deps: {
        backup: new MemoryBackupStore(),
        // 空き 0 かつ必要 10000 → 追い出せるものが無いので中断
        estimateFreeBytes: async () => 0,
        saveLedger,
        getManaged: async () => [],
        fetchImpl: okFetch()
      }
    });

    expect(result.result.outcome).toBe('aborted-quota');
    expect(result.ledgerUpdated).toBe(false);
    expect(sink.snapshot()).toEqual({ 'mods/keep.jar': 'keep' });
    expect(saveLedger).not.toHaveBeenCalled();
  });

  it('ダウンロードに失敗したら rolled-back になり台帳は変わらない', async () => {
    const sink = new MemorySink();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response);

    const result = await applySync({
      profile: makeProfile(),
      prepared: prepared(sink, makePlan({ additions: [entry()] })),
      deps: {
        backup: new MemoryBackupStore(),
        estimateFreeBytes: async () => undefined,
        saveLedger: syncManagedFiles,
        getManaged: async () => [],
        fetchImpl
      }
    });

    expect(result.result.outcome).toBe('rolled-back');
    expect(result.ledgerUpdated).toBe(false);
    expect(sink.snapshot()).toEqual({});
  });

  it('estimateFreeBytes の値を executeSync の freeBytes として渡す', async () => {
    const sink = new MemorySink();
    const execute = vi.fn(async () => ({
      outcome: 'failed' as const,
      applied: 0,
      skipped: []
    }));

    await applySync({
      profile: makeProfile(),
      prepared: prepared(sink, makePlan({ additions: [entry()] })),
      deps: {
        backup: new MemoryBackupStore(),
        estimateFreeBytes: async () => 4242,
        execute,
        fetchImpl: okFetch()
      }
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ freeBytes: 4242 }));
  });

  it('進捗コールバックを透過する', async () => {
    const sink = new MemorySink();
    const seen: Array<{ done: number; total: number; path: string }> = [];

    await applySync({
      profile: makeProfile(),
      prepared: prepared(sink, makePlan({ additions: [entry()] })),
      onProgress: (p) => seen.push(p),
      deps: {
        backup: new MemoryBackupStore(),
        estimateFreeBytes: async () => undefined,
        saveLedger: syncManagedFiles,
        getManaged: async () => [],
        fetchImpl: okFetch()
      }
    });

    expect(seen).toEqual([{ done: 1, total: 1, path: 'mods/a.jar' }]);
  });

  it('excludedDeletionPaths の削除は実行しない (§10.3)', async () => {
    const sink = new MemorySink({ files: { 'mods/keep.jar': 'keep', 'mods/gone.jar': 'gone' } });
    const existing: ManagedFileRecord[] = [
      {
        id: 'p1::mods/keep.jar',
        profileId: 'p1',
        category: 'mod',
        projectId: 'k',
        path: 'mods/keep.jar',
        sha1: await sha1Of('keep'),
        size: 4,
        source: 'import',
        managedAt: 1
      },
      {
        id: 'p1::mods/gone.jar',
        profileId: 'p1',
        category: 'mod',
        projectId: 'g',
        path: 'mods/gone.jar',
        sha1: await sha1Of('gone'),
        size: 4,
        source: 'import',
        managedAt: 1
      }
    ];
    const saveLedger = vi.fn(syncManagedFiles);

    await applySync({
      profile: makeProfile(),
      prepared: prepared(
        sink,
        makePlan({
          deletions: [
            entry({ kind: 'delete' as never, path: 'mods/keep.jar', name: 'keep', source: 'import' }),
            entry({ kind: 'delete' as never, path: 'mods/gone.jar', name: 'gone', source: 'import' })
          ]
        })
      ),
      excludedDeletionPaths: ['mods/keep.jar'],
      deps: {
        backup: new MemoryBackupStore(),
        estimateFreeBytes: async () => undefined,
        saveLedger,
        getManaged: async () => existing,
        fetchImpl: okFetch()
      }
    });

    // 「保持」を選んだ方は残り、選ばなかった方は消える
    expect(sink.snapshot()).toEqual({ 'mods/keep.jar': 'keep' });
    const records = await getManagedFiles('p1');
    expect(records.map((r) => r.path)).toEqual(['mods/keep.jar']);
  });

  it('空プランは completed だが台帳は更新しない (トランザクションが無いため)', async () => {
    const saveLedger = vi.fn(syncManagedFiles);
    const result = await applySync({
      profile: makeProfile(),
      prepared: prepared(new MemorySink(), makePlan()),
      deps: {
        backup: new MemoryBackupStore(),
        estimateFreeBytes: async () => undefined,
        saveLedger,
        getManaged: async () => [],
        fetchImpl: okFetch()
      }
    });
    expect(result.result.outcome).toBe('completed');
    expect(result.ledgerUpdated).toBe(false);
    expect(saveLedger).not.toHaveBeenCalled();
  });
});
