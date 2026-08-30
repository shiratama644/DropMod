/**
 * Sync Executor (Phase 12-B) test — PHASE12_PLAN.md §10.4
 *
 * 検証する 4 つの柱:
 *   1. Journal 変換 (buildJournalOperations) の順序と fingerprint
 *   2. 実行直前の fingerprint 再検証によるスキップ (§4 禁止事項)
 *   3. Backup 先行 + 失敗時の逆順 Rollback
 *   4. D-5 quota ゲート (直近 3 回保護 / 足りなければ中断)
 *
 * ブラウザ API は使わず `MemorySink` / `MemoryBackupStore` で回す。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildJournalOperations,
  executeSync,
  rollbackSync,
  type ResolveContent
} from '@/features/sync/executor';
import type { SyncPlan, SyncPlanEntry } from '@/features/sync/diff';
import { _clearAllForTesting, db } from '@/lib/db/dexie';
import { getSyncTransaction, findInterruptedSyncTransactions } from '@/features/sync';
import { MemorySink, MemoryBackupStore, sha1Of } from '@/__tests__/test-utils/memoryEnv';

const OLD_A = 'old-a-content';
const NEW_A = 'new-a-content';

function makePlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
    profileId: 'p1',
    generatedAt: 1_700_000_000_000,
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

function entry(overrides: Partial<SyncPlanEntry>): SyncPlanEntry {
  return {
    kind: 'addition',
    category: 'mod',
    path: 'mods/a.jar',
    name: 'a.jar',
    size: 10,
    ...overrides
  };
}

/** ダウンロード実体を返す resolveContent。path 未確定時に resolvedPath を返せる */
function resolver(map: Record<string, { data: string; path?: string }>): ResolveContent {
  return vi.fn(async (e: SyncPlanEntry) => {
    const hit = map[e.name] ?? map[e.path];
    if (!hit) throw new Error(`resolveContent: ${e.name} の実体がありません`);
    return { data: new TextEncoder().encode(hit.data), path: hit.path };
  });
}

/** どのファイルでも NEW_A を返す (内容に関心のないテスト用) */
const resolveAny: ResolveContent = async () => ({ data: new TextEncoder().encode(NEW_A) });
const BYE = 'bye';

describe('buildJournalOperations', () => {
  it('追加 → 更新 → 削除の順で並べ、expectedSha1 を正しく埋める', () => {
    const plan = makePlan({
      additions: [entry({ path: 'mods/add.jar', name: 'add.jar', targetSha1: 'sha-add' })],
      updates: [
        entry({
          kind: 'update',
          path: 'mods/upd.jar',
          name: 'upd.jar',
          targetSha1: 'sha-new',
          localSha1: 'sha-old'
        })
      ],
      deletions: [
        entry({
          kind: 'deletion',
          path: 'mods/del.jar',
          name: 'del.jar',
          localSha1: 'sha-del',
          managedSha1: 'sha-del'
        })
      ]
    });

    const ops = buildJournalOperations(plan).map((p) => p.op);
    expect(ops.map((o) => o.kind)).toEqual(['add', 'update', 'delete']);
    expect(ops[0]).toMatchObject({ path: 'mods/add.jar', sha1: 'sha-add', done: false });
    expect(ops[1]).toMatchObject({ sha1: 'sha-new', expectedSha1: 'sha-old' });
    // 削除は「消す実体」が対象なので sha1 / expectedSha1 とも localSha1
    expect(ops[2]).toMatchObject({ sha1: 'sha-del', expectedSha1: 'sha-del' });
  });

  it('空プランなら空配列', () => {
    expect(buildJournalOperations(makePlan())).toEqual([]);
  });
});

describe('executeSync — 正常系', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('追加・更新・削除を適用し、Journal と status=completed を記録する', async () => {
    const sink = new MemorySink({ files: { 'mods/upd.jar': OLD_A, 'mods/del.jar': 'bye' } });
    const backup = new MemoryBackupStore();
    const oldUpdSha = await sha1Of(OLD_A);
    const delSha = await sha1Of('bye');

    const plan = makePlan({
      additions: [entry({ path: 'mods/add.jar', name: 'add.jar', targetSha1: 'x' })],
      updates: [
        entry({
          kind: 'update',
          path: 'mods/upd.jar',
          name: 'upd.jar',
          targetSha1: 'y',
          localSha1: oldUpdSha
        })
      ],
      deletions: [
        entry({
          kind: 'deletion',
          path: 'mods/del.jar',
          name: 'del.jar',
          localSha1: delSha,
          managedSha1: delSha
        })
      ],
      totals: {
        counts: { addition: 1, update: 1, deletion: 1, unchanged: 0, unmanaged: 0, conflict: 0 },
        writeBytes: 20,
        removeBytes: 3,
        backupBytes: OLD_A.length + 3
      }
    });

    const onProgress = vi.fn();
    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup,
      resolveContent: resolver({
        'add.jar': { data: NEW_A },
        'upd.jar': { data: NEW_A }
      }),
      onProgress
    });

    expect(result.outcome).toBe('completed');
    expect(result.applied).toBe(3);
    expect(result.skipped).toEqual([]);
    expect(sink.snapshot()).toEqual({
      'mods/add.jar': NEW_A,
      'mods/upd.jar': NEW_A
    });

    // 上書き・削除の直前の中身が Backup に入っている
    expect(backup.keysOf(result.transactionId as string)).toEqual([
      'mods__del.jar',
      'mods__upd.jar'
    ]);

    const row = await getSyncTransaction(result.transactionId as string);
    expect(row?.status).toBe('completed');
    expect(row?.finishedAt).toBeTypeOf('number');
    expect(row?.operations.every((op) => op.done)).toBe(true);
    // add 以外には backupId が付いている
    expect(row?.operations.map((op) => op.backupId)).toEqual([
      undefined,
      expect.any(String),
      expect.any(String)
    ]);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith({ done: 3, total: 3, path: 'mods/del.jar' });
  });

  it('空プランはトランザクションを作らずに completed', async () => {
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan(),
      sink: new MemorySink(),
      backup: new MemoryBackupStore(),
      resolveContent: resolveAny
    });
    expect(result).toEqual({ outcome: 'completed', applied: 0, skipped: [] });
    expect(await db.syncTransactions.count()).toBe(0);
  });

  it('path 未確定の追加は resolveContent のパスで書き、appliedPath に記録する', async () => {
    const sink = new MemorySink();
    const backup = new MemoryBackupStore();
    const plan = makePlan({
      additions: [entry({ path: '', name: 'late.jar', needsDownload: true })]
    });

    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup,
      resolveContent: resolver({ 'late.jar': { data: NEW_A, path: 'mods/late.jar' } })
    });

    expect(result.outcome).toBe('completed');
    expect(sink.content('mods/late.jar')).toBe(NEW_A);

    const row = await getSyncTransaction(result.transactionId as string);
    expect(row?.operations[0]).toMatchObject({ path: '', appliedPath: 'mods/late.jar' });

    // appliedPath を見て Rollback が消せる
    await rollbackSync(result.transactionId as string, sink, backup);
    expect(sink.snapshot()).toEqual({});
  });

  it('resolveContent がパスを返さなければ unresolved-path でスキップする', async () => {
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({ additions: [entry({ path: '', name: 'nameless.jar' })] }),
      sink: new MemorySink(),
      backup: new MemoryBackupStore(),
      resolveContent: resolver({ 'nameless.jar': { data: NEW_A } })
    });
    expect(result.outcome).toBe('completed');
    expect(result.applied).toBe(0);
    expect(result.skipped).toEqual([{ path: '', reason: 'unresolved-path' }]);
  });
});

describe('executeSync — fingerprint 再検証 (§10.4 / §4)', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('実行直前に外部変更を検知したらスキップし、現ファイルを守る', async () => {
    const sink = new MemorySink({ files: { 'mods/upd.jar': 'touched-by-user' } });
    const backup = new MemoryBackupStore();
    const plan = makePlan({
      updates: [
        entry({
          kind: 'update',
          path: 'mods/upd.jar',
          name: 'upd.jar',
          targetSha1: 'y',
          localSha1: await sha1Of(OLD_A) // Preview 時点の値。実体はもう別物
        })
      ]
    });

    const resolve = resolver({ 'upd.jar': { data: NEW_A } });
    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup,
      resolveContent: resolve
    });

    expect(result.outcome).toBe('completed');
    expect(result.applied).toBe(0);
    expect(result.skipped).toEqual([{ path: 'mods/upd.jar', reason: 'externally-modified' }]);
    // 上書きも Backup も行わない
    expect(sink.content('mods/upd.jar')).toBe('touched-by-user');
    expect(resolve).not.toHaveBeenCalled();
    expect(await backup.estimateUsage()).toBe(0);

    const row = await getSyncTransaction(result.transactionId as string);
    expect(row?.operations[0]).toMatchObject({
      done: false,
      skippedReason: 'externally-modified'
    });
  });

  it('削除対象が外部変更されていたら削除しない', async () => {
    const sink = new MemorySink({ files: { 'mods/del.jar': 'replaced-by-user' } });
    const plan = makePlan({
      deletions: [
        entry({
          kind: 'deletion',
          path: 'mods/del.jar',
          name: 'del.jar',
          localSha1: await sha1Of('bye'),
          managedSha1: await sha1Of('bye')
        })
      ]
    });

    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup: new MemoryBackupStore(),
      resolveContent: resolveAny
    });
    expect(result.skipped).toEqual([{ path: 'mods/del.jar', reason: 'externally-modified' }]);
    expect(sink.content('mods/del.jar')).toBe('replaced-by-user');
  });

  it('追加先に既存ファイルがあれば上書きせず unexpected-existing でスキップ', async () => {
    const sink = new MemorySink({ files: { 'mods/add.jar': 'user-file' } });
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({ additions: [entry({ path: 'mods/add.jar', name: 'add.jar' })] }),
      sink,
      backup: new MemoryBackupStore(),
      resolveContent: resolveAny
    });
    expect(result.skipped).toEqual([{ path: 'mods/add.jar', reason: 'unexpected-existing' }]);
    expect(sink.content('mods/add.jar')).toBe('user-file');
  });

  it('更新対象が既に消えていたら missing でスキップ (例外にしない)', async () => {
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({
        updates: [
          entry({
            kind: 'update',
            path: 'mods/gone.jar',
            name: 'gone.jar',
            targetSha1: 'y',
            localSha1: 'any'
          })
        ]
      }),
      sink: new MemorySink(),
      backup: new MemoryBackupStore(),
      resolveContent: resolveAny
    });
    expect(result.outcome).toBe('completed');
    expect(result.skipped).toEqual([{ path: 'mods/gone.jar', reason: 'missing' }]);
  });
});

describe('executeSync — Journal への実体記録 (Sync 後の台帳更新が依存)', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('追加は書き込んだ実体の sha1 / size / appliedPath を記録する', async () => {
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({ additions: [entry({ path: '', name: 'late.jar' })] }),
      sink: new MemorySink(),
      backup: new MemoryBackupStore(),
      resolveContent: resolver({ 'late.jar': { data: NEW_A, path: 'mods/late.jar' } })
    });

    const row = await getSyncTransaction(result.transactionId as string);
    // Plan 時点で sha1 / size は未確定。実体から確定させた値が入る
    expect(row?.operations[0]).toMatchObject({
      done: true,
      appliedPath: 'mods/late.jar',
      sha1: await sha1Of(NEW_A),
      size: NEW_A.length
    });
  });

  it('更新も書き込んだ実体の sha1 / size を記録する', async () => {
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({
        updates: [
          entry({
            kind: 'update',
            path: 'mods/upd.jar',
            name: 'upd.jar',
            targetSha1: 'plan-time-sha',
            localSha1: await sha1Of(OLD_A)
          })
        ]
      }),
      sink: new MemorySink({ files: { 'mods/upd.jar': OLD_A } }),
      backup: new MemoryBackupStore(),
      resolveContent: resolveAny
    });

    const row = await getSyncTransaction(result.transactionId as string);
    expect(row?.operations[0]).toMatchObject({
      sha1: await sha1Of(NEW_A),
      size: NEW_A.length,
      backupId: expect.any(String)
    });
  });

  it('スキップした操作は sha1 を記録しない (台帳に実体の無い行を作らない)', async () => {
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({ additions: [entry({ path: 'mods/add.jar', name: 'add.jar' })] }),
      sink: new MemorySink({ files: { 'mods/add.jar': 'user-file' } }),
      backup: new MemoryBackupStore(),
      resolveContent: resolveAny
    });
    expect(result.skipped).toHaveLength(1);
    const row = await getSyncTransaction(result.transactionId as string);
    expect(row?.operations[0]).toMatchObject({ done: false, sha1: undefined });
  });
});

describe('executeSync — Rollback (§10.4)', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('途中で失敗したら適用済み操作を逆順に巻き戻し rolled-back になる', async () => {
    // add → update の順で実行され、update の書き込みで失敗させる
    const sink = new MemorySink({
      files: { 'mods/upd.jar': OLD_A },
      failOnWrite: ['mods/upd.jar']
    });
    const backup = new MemoryBackupStore();
    const plan = makePlan({
      additions: [entry({ path: 'mods/add.jar', name: 'add.jar', targetSha1: 'x' })],
      updates: [
        entry({
          kind: 'update',
          path: 'mods/upd.jar',
          name: 'upd.jar',
          targetSha1: 'y',
          localSha1: await sha1Of(OLD_A)
        })
      ]
    });

    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup,
      resolveContent: resolver({ 'add.jar': { data: NEW_A }, 'upd.jar': { data: NEW_A } })
    });

    expect(result.outcome).toBe('rolled-back');
    expect(result.error).toContain('mods/upd.jar');
    // 追加したファイルは消え、更新対象は Backup から元に戻る
    expect(sink.snapshot()).toEqual({ 'mods/upd.jar': OLD_A });

    const row = await getSyncTransaction(result.transactionId as string);
    expect(row?.status).toBe('rolled-back');
    expect(row?.finishedAt).toBeTypeOf('number');
    expect(row?.error).toContain('mods/upd.jar');
  });

  it('削除に失敗したら削除済みファイルを Backup から復元する', async () => {
    const sink = new MemorySink({
      files: { 'mods/del.jar': 'bye' },
      failOnRemove: ['mods/del.jar']
    });
    const backup = new MemoryBackupStore();
    const delSha = await sha1Of('bye');
    const plan = makePlan({
      additions: [entry({ path: 'mods/add.jar', name: 'add.jar', targetSha1: 'x' })],
      deletions: [
        entry({
          kind: 'deletion',
          path: 'mods/del.jar',
          name: 'del.jar',
          localSha1: delSha,
          managedSha1: delSha
        })
      ]
    });

    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup,
      resolveContent: resolveAny
    });

    expect(result.outcome).toBe('rolled-back');
    expect(result.error).toContain('mods/del.jar');
    // 削除は失敗したので現ファイルは残り、直前に追加したファイルは巻き戻される
    expect(sink.snapshot()).toEqual({ 'mods/del.jar': BYE });
  });

  it('復旧そのものが失敗しても例外を投げず、失敗内容を error に記録する', async () => {
    // 削除も巻き戻しも失敗する最悪ケース
    const sink = new MemorySink({
      files: { 'mods/del.jar': BYE },
      failOnRemove: ['mods/del.jar', 'mods/add.jar']
    });
    const delSha = await sha1Of(BYE);
    const result = await executeSync({
      profileId: 'p1',
      plan: makePlan({
        additions: [entry({ path: 'mods/add.jar', name: 'add.jar', targetSha1: 'x' })],
        deletions: [
          entry({
            kind: 'deletion',
            path: 'mods/del.jar',
            name: 'del.jar',
            localSha1: delSha,
            managedSha1: delSha
          })
        ]
      }),
      sink,
      backup: new MemoryBackupStore(),
      resolveContent: resolveAny
    });

    expect(result.outcome).toBe('rolled-back');
    expect(result.error).toContain('復旧時の失敗');
    expect(result.error).toContain('mods/add.jar');
  });

  it('rollbackSync は冪等: 二度実行しても壊れない', async () => {
    const sink = new MemorySink({ files: { 'mods/upd.jar': OLD_A } });
    const backup = new MemoryBackupStore();
    const plan = makePlan({
      updates: [
        entry({
          kind: 'update',
          path: 'mods/upd.jar',
          name: 'upd.jar',
          targetSha1: 'y',
          localSha1: await sha1Of(OLD_A)
        })
      ]
    });

    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup,
      resolveContent: resolveAny
    });
    expect(result.outcome).toBe('completed');

    const first = await rollbackSync(result.transactionId as string, sink, backup);
    expect(first).toEqual({ restored: 1, removed: 0, errors: [] });
    expect(sink.content('mods/upd.jar')).toBe(OLD_A);

    const second = await rollbackSync(result.transactionId as string, sink, backup);
    expect(second).toEqual({ restored: 1, removed: 0, errors: [] });
    expect(sink.content('mods/upd.jar')).toBe(OLD_A);
  });

  it('未知のトランザクション ID でも例外を投げない', async () => {
    const result = await rollbackSync('tx-nope', new MemorySink(), new MemoryBackupStore());
    expect(result).toEqual({ restored: 0, removed: 0, errors: [] });
  });

  it('Backup が失われた update は「元々無かった」とみなして削除で戻す', async () => {
    const sink = new MemorySink({ files: { 'mods/upd.jar': OLD_A } });
    const backup = new MemoryBackupStore();
    const plan = makePlan({
      updates: [
        entry({
          kind: 'update',
          path: 'mods/upd.jar',
          name: 'upd.jar',
          targetSha1: 'y',
          localSha1: await sha1Of(OLD_A)
        })
      ]
    });

    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup,
      resolveContent: resolveAny
    });
    await backup.removeTransaction(result.transactionId as string);

    const rollback = await rollbackSync(result.transactionId as string, sink, backup);
    expect(rollback).toEqual({ restored: 0, removed: 1, errors: [] });
    expect(sink.snapshot()).toEqual({});
  });
});

describe('executeSync — D-5 quota ゲート', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  /** 古い順に tx1..txN を並べた Backup ストアを作る */
  async function seededBackup(count: number, bytesEach = 50): Promise<MemoryBackupStore> {
    const backup = new MemoryBackupStore();
    for (let i = 1; i <= count; i++) {
      await backup.save(`tx-old-${i}`, 'mods/x.jar', new Uint8Array(bytesEach));
      backup.setSavedAt(`tx-old-${i}`, 1_000 + i);
    }
    return backup;
  }

  const planNeeding = (backupBytes: number, localSha1: string) =>
    makePlan({
      deletions: [
        entry({
          kind: 'deletion',
          path: 'mods/del.jar',
          name: 'del.jar',
          localSha1,
          managedSha1: localSha1,
          size: backupBytes
        })
      ],
      totals: {
        counts: { addition: 0, update: 0, deletion: 1, unchanged: 0, unmanaged: 0, conflict: 0 },
        writeBytes: 0,
        removeBytes: backupBytes,
        backupBytes
      }
    });

  it('空きが足り、かつ直近 3 件を守れるなら古い順に追い出してから実行する', async () => {
    const sink = new MemorySink({ files: { 'mods/del.jar': BYE } });
    const backup = await seededBackup(5, 50);
    const keep = new Set(['tx-old-5', 'tx-old-4', 'tx-old-3']);

    const result = await executeSync({
      profileId: 'p1',
      // 現ファイル 50 bytes に対して空き 0 → 50 bytes 分を追い出す必要がある
      plan: planNeeding(50, await sha1Of(BYE)),
      sink,
      backup,
      resolveContent: resolveAny,
      freeBytes: 0,
      keepTxIds: keep
    });

    expect(result.outcome).toBe('completed');
    // 古い tx-old-1 が追い出され、保護対象は無傷。今回の Sync の Backup も増える
    const ids = backup.txIds();
    expect(ids).not.toContain('tx-old-1');
    expect(ids).toEqual(
      expect.arrayContaining(['tx-old-2', 'tx-old-3', 'tx-old-4', 'tx-old-5'])
    );
    expect(ids).toContain(result.transactionId);
    expect(sink.snapshot()).toEqual({});
  });

  it('直近 3 件だけしか無いのに容量が足りなければ、何も触らず aborted-quota', async () => {
    const sink = new MemorySink({ files: { 'mods/del.jar': BYE } });
    const backup = await seededBackup(3, 50);
    const before = sink.snapshot();

    const result = await executeSync({
      profileId: 'p1',
      plan: planNeeding(10_000, await sha1Of(BYE)),
      sink,
      backup,
      resolveContent: resolveAny,
      freeBytes: 0
    });

    expect(result.outcome).toBe('aborted-quota');
    expect(result.transactionId).toBeUndefined();
    expect(result.applied).toBe(0);
    expect(result.error).toContain('空き容量が不足');
    // 環境も Backup も Journal も一切変更しない
    expect(sink.snapshot()).toEqual(before);
    expect(backup.txIds()).toEqual(['tx-old-1', 'tx-old-2', 'tx-old-3']);
    expect(await db.syncTransactions.count()).toBe(0);
  });

  it('freeBytes を省略すれば容量チェックを行わない (テスト用経路)', async () => {
    const sink = new MemorySink({ files: { 'mods/del.jar': BYE } });
    const result = await executeSync({
      profileId: 'p1',
      plan: planNeeding(10_000, await sha1Of(BYE)),
      sink,
      backup: new MemoryBackupStore(),
      resolveContent: resolveAny
    });
    expect(result.outcome).toBe('completed');
  });
});

describe('D-4 — 中断トランザクションの検出', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('Backup 保存中に落ちた状態を検出し、rollbackSync で復旧できる', async () => {
    // 「update を 1 件適用した直後にブラウザが閉じた」状態を再現
    const sink = new MemorySink({ files: { 'mods/upd.jar': OLD_A } });
    const backup = new MemoryBackupStore();
    const plan = makePlan({
      updates: [
        entry({
          kind: 'update',
          path: 'mods/upd.jar',
          name: 'upd.jar',
          targetSha1: 'y',
          localSha1: await sha1Of(OLD_A)
        })
      ]
    });
    const result = await executeSync({
      profileId: 'p1',
      plan,
      sink,
      backup,
      resolveContent: resolveAny
    });
    // 完了フラグを running に戻して「落ちた」状態を作る
    await db.syncTransactions.update(result.transactionId as string, { status: 'running' });
    expect(sink.content('mods/upd.jar')).toBe(NEW_A);

    const interrupted = await findInterruptedSyncTransactions();
    expect(interrupted.map((t) => t.id)).toEqual([result.transactionId]);

    // D-4: ユーザー確認のうえ Rollback (既定)
    const rollback = await rollbackSync(result.transactionId as string, sink, backup);
    expect(rollback).toEqual({ restored: 1, removed: 0, errors: [] });
    expect(sink.content('mods/upd.jar')).toBe(OLD_A);

    await db.syncTransactions.update(result.transactionId as string, {
      status: 'rolled-back',
      rolledBackAt: Date.now()
    });
    expect(await findInterruptedSyncTransactions()).toEqual([]);
  });
});
