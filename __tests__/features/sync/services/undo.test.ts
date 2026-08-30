/**
 * Sync の取り消し (Phase 12-B) test — `lib/env/undo.ts`
 *
 * `applySync` → `undoSync` の往復を**実物** (executeSync / rollbackSync / Dexie) で通す。
 * Backup だけをメモリ実装に差し替える。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applySync, type ReadySyncOutcome } from '@/features/sync/services/applySync';
import { undoSync } from '@/features/sync/services/undo';
import type { SyncPlan, SyncPlanEntry } from '@/features/sync/utils/diff';
import { _clearAllForTesting } from '@/lib/db/dexie';
import {
  createSyncTransaction,
  getManagedFiles,
  getSyncTransaction,
  syncManagedFiles
} from '@/features/sync';
import type { ManagedFileRecord, Profile } from '@/types';
import { MemoryBackupStore, MemorySink } from '@/__tests__/test-utils/memoryEnv';

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

function makeProfile(): Profile {
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
    }
  };
}

function prepared(sink: MemorySink, plan: SyncPlan): ReadySyncOutcome {
  return {
    status: 'ready',
    rootName: '.minecraft',
    check: { ok: true, mismatches: [], unverified: [] },
    plan,
    sink,
    writable: true,
    writableReason: null,
    scanSkipped: [],
    localEntries: [],
    managed: []
  };
}

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

/** Sync を 1 本実行して txId を返す */
async function runSync(sink: MemorySink, backup: MemoryBackupStore, plan: SyncPlan) {
  const { result } = await applySync({
    profile: makeProfile(),
    prepared: prepared(sink, plan),
    deps: {
      backup,
      estimateFreeBytes: async () => undefined,
      saveLedger: syncManagedFiles,
      getManaged: async () => [],
      fetchImpl: okFetch()
    }
  });
  return result.transactionId as string;
}

describe('undoSync', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('追加の Sync を取り消すと実体と台帳が元に戻る', async () => {
    const sink = new MemorySink();
    const backup = new MemoryBackupStore();
    const txId = await runSync(sink, backup, makePlan({ additions: [entry()] }));

    // Sync 後: 実体と台帳ができている
    expect(sink.content('mods/a.jar')).toBe(CONTENT);
    expect(await getManagedFiles('p1')).toHaveLength(1);

    const result = await undoSync({ transactionId: txId, sink, deps: { backup } });

    expect(result).toMatchObject({ ok: true, removed: 1, restored: 0, ledgerUpdated: true });
    expect(sink.snapshot()).toEqual({});
    expect(await getManagedFiles('p1')).toEqual([]);

    const row = await getSyncTransaction(txId);
    expect(row?.status).toBe('rolled-back');
    expect(row?.rolledBackAt).toEqual(expect.any(Number));
    // バックアップは解放される (D-5 の OPFS 節約)
    expect(await backup.listTransactions()).toEqual([]);
  });

  it('更新の Sync を取り消すと元の実体が復元される', async () => {
    const sink = new MemorySink({ files: { 'mods/a.jar': 'old-content' } });
    const backup = new MemoryBackupStore();
    const txId = await runSync(
      sink,
      backup,
      makePlan({ updates: [entry({ kind: 'update' })] })
    );
    expect(sink.content('mods/a.jar')).toBe(CONTENT);

    const result = await undoSync({ transactionId: txId, sink, deps: { backup } });

    expect(result).toMatchObject({ ok: true, restored: 1 });
    expect(sink.content('mods/a.jar')).toBe('old-content');
  });

  it('削除の Sync を取り消すとファイルが戻る', async () => {
    const sink = new MemorySink({ files: { 'mods/a.jar': 'keep-me' } });
    const backup = new MemoryBackupStore();
    const txId = await runSync(
      sink,
      backup,
      makePlan({ deletions: [entry({ kind: 'deletion', targetSha1: undefined })] })
    );
    expect(sink.snapshot()).toEqual({});

    const result = await undoSync({ transactionId: txId, sink, deps: { backup } });

    expect(result).toMatchObject({ ok: true, restored: 1 });
    expect(sink.content('mods/a.jar')).toBe('keep-me');
  });

  it('存在しない txId は何もせず理由を返す', async () => {
    const sink = new MemorySink();
    const result = await undoSync({
      transactionId: 'nope',
      sink,
      deps: { backup: new MemoryBackupStore() }
    });
    expect(result).toMatchObject({ ok: false, ledgerUpdated: false });
    expect(result.message).toContain('なくなっています');
    expect(sink.snapshot()).toEqual({});
  });

  it('completed 以外 (running) は取り消せない', async () => {
    const txId = await createSyncTransaction('p1', []);
    const sink = new MemorySink();
    const result = await undoSync({
      transactionId: txId,
      sink,
      deps: { backup: new MemoryBackupStore() }
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe('完了した Sync だけを取り消せます。');
  });

  it('**2 回目の Undo は拒否する** (取り消し済み)', async () => {
    const sink = new MemorySink();
    const backup = new MemoryBackupStore();
    const txId = await runSync(sink, backup, makePlan({ additions: [entry()] }));

    await undoSync({ transactionId: txId, sink, deps: { backup } });
    const second = await undoSync({ transactionId: txId, sink, deps: { backup } });

    expect(second.ok).toBe(false);
    expect(second.message).toBe('完了した Sync だけを取り消せます。');
  });

  it('復元に失敗したら failed にし、台帳とバックアップを保持する', async () => {
    // update を使う: 追加だけだとバックアップが発生しないので「消さない」を検証できない
    const sink = new MemorySink({ files: { 'mods/a.jar': 'old-content' } });
    const backup = new MemoryBackupStore();
    const txId = await runSync(sink, backup, makePlan({ updates: [entry({ kind: 'update' })] }));
    expect((await backup.listTransactions()).map((t) => t.txId)).toEqual([txId]);

    const result = await undoSync({
      transactionId: txId,
      sink,
      deps: {
        backup,
        rollback: async () => ({ restored: 0, removed: 0, errors: ['mods/a.jar: 書き込み失敗'] })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['mods/a.jar: 書き込み失敗']);
    expect(result.message).toContain('もう一度お試しください');
    // 環境が半端 = 台帳を書き戻さない・バックアップを消さない (再試行できる)
    expect(await getManagedFiles('p1')).toHaveLength(1);
    expect((await backup.listTransactions()).map((t) => t.txId)).toEqual([txId]);
    const row = await getSyncTransaction(txId);
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('mods/a.jar: 書き込み失敗');
  });

  it('ledgerBefore が無い古い行では台帳に触らない', async () => {
    // createSyncTransaction 直後の行には ledgerBefore が無い
    const txId = await createSyncTransaction('p1', [
      {
        kind: 'add',
        category: 'mod',
        path: 'mods/x.jar',
        projectId: 'proj-1',
        size: 1,
        done: true,
        appliedPath: 'mods/x.jar'
      }
    ]);
    const { updateSyncTransactionStatus } = await import('@/features/sync');
    await updateSyncTransactionStatus(txId, 'completed');

    const sink = new MemorySink({ files: { 'mods/x.jar': 'x' } });
    const result = await undoSync({
      transactionId: txId,
      sink,
      deps: { backup: new MemoryBackupStore() }
    });

    expect(result).toMatchObject({ ok: true, ledgerUpdated: false });
    expect(await getManagedFiles('p1')).toEqual([]);
  });

  it('既存台帳のレコードごと Sync 前の状態に戻す', async () => {
    const existing: ManagedFileRecord[] = [
      {
        id: 'p1::mods/other.jar',
        profileId: 'p1',
        category: 'mod',
        projectId: 'other',
        path: 'mods/other.jar',
        sha1: 'sha-other',
        size: 5,
        source: 'import',
        managedAt: 1
      }
    ];
    const sink = new MemorySink();
    const backup = new MemoryBackupStore();

    const { result } = await applySync({
      profile: makeProfile(),
      prepared: prepared(sink, makePlan({ additions: [entry()] })),
      deps: {
        backup,
        estimateFreeBytes: async () => undefined,
        saveLedger: syncManagedFiles,
        getManaged: async () => existing,
        fetchImpl: okFetch()
      }
    });

    // Sync 後は 2 件
    expect(await getManagedFiles('p1')).toHaveLength(2);

    await undoSync({
      transactionId: result.transactionId as string,
      sink,
      deps: { backup }
    });

    // Undo 後は Sync 前の 1 件だけ
    const records = await getManagedFiles('p1');
    expect(records.map((r) => r.path)).toEqual(['mods/other.jar']);
  });
});
