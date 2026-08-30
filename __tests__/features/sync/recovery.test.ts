/**
 * 中断された Sync の検出と復旧 (Phase 12-B / D-4) test — `lib/env/recovery.ts`
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  findInterruptedSyncs,
  recoverInterruptedSync
} from '@/features/sync/recovery';
import { _clearAllForTesting, db } from '@/lib/db/dexie';
import {
  createSyncTransaction,
  getSyncTransaction,
  markOperationDone,
  updateSyncTransactionStatus,
  type SyncOperationJournalEntry
} from '@/features/sync';
import { MemoryBackupStore, MemorySink } from '@/__tests__/test-utils/memoryEnv';

function op(overrides: Partial<SyncOperationJournalEntry> = {}): SyncOperationJournalEntry {
  return {
    kind: 'add',
    category: 'mod',
    path: 'mods/a.jar',
    size: 10,
    done: true,
    ...overrides
  };
}

async function setStartedAt(id: string, startedAt: number) {
  const row = await db.syncTransactions.get(id);
  if (row) await db.syncTransactions.put({ ...row, startedAt });
}

/**
 * `createSyncTransaction` は**全操作を done: false で作る** (Journal は実行結果を
 * 後から埋める設計)。適用済みにしたい操作はここで done にする。
 */
async function markDone(id: string, ...indices: number[]) {
  for (const index of indices) {
    await markOperationDone(id, index);
  }
}

describe('findInterruptedSyncs', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('何も無ければ空', async () => {
    expect(await findInterruptedSyncs()).toEqual([]);
  });

  it('**pending と running の両方**を古い順で返す', async () => {
    const pending = await createSyncTransaction('p1', [op()]);
    await markDone(pending, 0);
    await setStartedAt(pending, 100);
    const running = await createSyncTransaction('p2', [op(), op()]);
    await markDone(running, 0);
    await setStartedAt(running, 200);
    await updateSyncTransactionStatus(running, 'running');
    const done = await createSyncTransaction('p1', [op()]);
    await updateSyncTransactionStatus(done, 'completed');

    const found = await findInterruptedSyncs();
    expect(found).toEqual([
      {
        transactionId: pending,
        profileId: 'p1',
        startedAt: 100,
        applied: 1,
        total: 1,
        status: 'pending'
      },
      {
        transactionId: running,
        profileId: 'p2',
        startedAt: 200,
        applied: 1,
        total: 2,
        status: 'running'
      }
    ]);
  });

  it('skippedReason のある操作は applied に数えない', async () => {
    const id = await createSyncTransaction('p1', [
      op(),
      op({ path: 'mods/b.jar' })
    ]);
    await markDone(id, 0);
    await markOperationDone(id, 1, { skippedReason: 'externally-modified' });
    await updateSyncTransactionStatus(id, 'running');

    const [info] = await findInterruptedSyncs();
    expect(info).toMatchObject({ applied: 1, total: 2 });
  });
});

describe('recoverInterruptedSync', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('**rollback (既定)**: 実体を戻し、rolled-back にしてバックアップを解放する', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await markDone(id, 0);
    await updateSyncTransactionStatus(id, 'running');
    const backup = new MemoryBackupStore();
    const sink = new MemorySink({ files: { 'mods/a.jar': 'written' } });

    const result = await recoverInterruptedSync({
      transactionId: id,
      choice: 'rollback',
      sink,
      deps: { backup }
    });

    expect(result).toMatchObject({ ok: true, choice: 'rollback', removed: 1, errors: [] });
    const row = await getSyncTransaction(id);
    expect(row?.status).toBe('rolled-back');
    expect(row?.rolledBackAt).toEqual(expect.any(Number));
    // 復旧後はもう検出されない
    expect(await findInterruptedSyncs()).toEqual([]);
  });

  it('**keep**: 環境に触れず failed にする (二度確認しないため)。バックアップは残す', async () => {
    const id = await createSyncTransaction('p1', [op(), op({ path: 'mods/b.jar' })]);
    await markDone(id, 0, 1);
    await updateSyncTransactionStatus(id, 'running');
    const backup = new MemoryBackupStore();
    await backup.save(id, 'mods/b.jar', new TextEncoder().encode('old'));
    const sink = new MemorySink({ files: { 'mods/a.jar': 'written' } });

    const result = await recoverInterruptedSync({
      transactionId: id,
      choice: 'keep',
      sink,
      deps: { backup }
    });

    expect(result).toMatchObject({ ok: true, choice: 'keep' });
    expect(result.message).toContain('環境は変更していません');
    // 実体に触れていない
    expect(sink.snapshot()).toEqual({ 'mods/a.jar': 'written' });
    const row = await getSyncTransaction(id);
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('2 件適用済み');
    // **データを失わない**: バックアップを残す
    expect((await backup.listTransactions()).map((t) => t.txId)).toEqual([id]);
    expect(await findInterruptedSyncs()).toEqual([]);
  });

  it('keep に sink は不要', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await updateSyncTransactionStatus(id, 'running');
    const result = await recoverInterruptedSync({
      transactionId: id,
      choice: 'keep',
      deps: { backup: new MemoryBackupStore() }
    });
    expect(result.ok).toBe(true);
  });

  it('rollback に sink が無ければ失敗理由を返す', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await updateSyncTransactionStatus(id, 'running');

    const result = await recoverInterruptedSync({
      transactionId: id,
      choice: 'rollback',
      deps: { backup: new MemoryBackupStore() }
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('フォルダを開けない');
    // 状態を変えないので次回また確認できる
    expect((await getSyncTransaction(id))?.status).toBe('running');
  });

  it('巻き戻しに失敗したら failed にし、バックアップを残す', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await markDone(id, 0);
    await updateSyncTransactionStatus(id, 'running');
    const backup = new MemoryBackupStore();
    await backup.save(id, 'mods/a.jar', new TextEncoder().encode('x'));

    const result = await recoverInterruptedSync({
      transactionId: id,
      choice: 'rollback',
      sink: new MemorySink(),
      deps: {
        backup,
        rollback: async () => ({ restored: 0, removed: 0, errors: ['mods/a.jar: 失敗'] })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['mods/a.jar: 失敗']);
    expect((await getSyncTransaction(id))?.status).toBe('failed');
    // 再試行できるようにバックアップを消さない
    expect((await backup.listTransactions()).map((t) => t.txId)).toEqual([id]);
  });

  it('既に復旧済みの行には何もしない', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await updateSyncTransactionStatus(id, 'rolled-back', { rolledBackAt: 1 });
    const rollback = vi.fn();

    const result = await recoverInterruptedSync({
      transactionId: id,
      choice: 'rollback',
      sink: new MemorySink(),
      deps: { backup: new MemoryBackupStore(), rollback }
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('この Sync は既に復旧済みです。');
    expect(rollback).not.toHaveBeenCalled();
  });

  it('存在しない txId は理由を返す', async () => {
    const result = await recoverInterruptedSync({
      transactionId: 'nope',
      choice: 'rollback',
      sink: new MemorySink(),
      deps: { backup: new MemoryBackupStore() }
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('なくなっています');
  });

  it('pending の行も rollback できる', async () => {
    // createSyncTransaction 直後 = pending のまま (操作はまだ 1 件も未適用)
    const id = await createSyncTransaction('p1', [op()]);
    const result = await recoverInterruptedSync({
      transactionId: id,
      choice: 'rollback',
      sink: new MemorySink(),
      deps: { backup: new MemoryBackupStore() }
    });
    expect(result.ok).toBe(true);
    expect((await getSyncTransaction(id))?.status).toBe('rolled-back');
  });
});
