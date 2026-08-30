/**
 * Dexie schema v4 — `syncTransactions` テーブル (Phase 12-B) test
 *
 * Transaction Journal / Sync History / D-4 (中断検出) の基盤ヘルパを検証する。
 *
 * ※ fake-indexeddb はテストファイルごとに独立した module instance になるため、
 *   このファイル内で DB を作り直しても他ファイルに影響しない。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { _clearAllForTesting, db } from '@/lib/db/dexie';
import {
  createSyncTransaction,
  deleteSyncTransaction,
  findInterruptedSyncTransactions,
  getSyncTransaction,
  listSyncTransactions,
  markOperationDone,
  updateSyncTransactionStatus,
  type SyncOperationJournalEntry
} from '@/features/sync';

function op(overrides: Partial<SyncOperationJournalEntry> = {}): SyncOperationJournalEntry {
  return {
    kind: 'add',
    category: 'mod',
    path: 'mods/a.jar',
    size: 10,
    done: false,
    ...overrides
  };
}

/** startedAt を直接書き換えて並び順を確定させる */
async function setStartedAt(id: string, startedAt: number): Promise<void> {
  await db.syncTransactions.update(id, { startedAt });
}

describe('syncTransactions — v4', () => {
  beforeEach(async () => {
    await _clearAllForTesting();
  });

  it('createSyncTransaction は pending で作成し、操作を強制的に done:false にする', async () => {
    const id = await createSyncTransaction('p1', [
      op({ done: true }), // 呼び出し側が true を渡しても信用しない
      op({ kind: 'delete', path: 'mods/b.jar' })
    ]);

    const row = await getSyncTransaction(id);
    expect(row).toMatchObject({ id, profileId: 'p1', status: 'pending' });
    expect(row?.finishedAt).toBeUndefined();
    expect(row?.startedAt).toBeTypeOf('number');
    expect(row?.operations).toHaveLength(2);
    expect(row?.operations.every((o) => o.done === false)).toBe(true);
  });

  it('未知の ID は null (例外にしない)', async () => {
    expect(await getSyncTransaction('tx-nope')).toBeNull();
  });

  it('listSyncTransactions は profileId で絞り、startedAt の新しい順', async () => {
    const a = await createSyncTransaction('p1', [op()]);
    const b = await createSyncTransaction('p1', [op()]);
    const other = await createSyncTransaction('p2', [op()]);
    await setStartedAt(a, 100);
    await setStartedAt(b, 300);
    await setStartedAt(other, 200);

    const rows = await listSyncTransactions('p1');
    expect(rows.map((r) => r.id)).toEqual([b, a]);
    expect(await listSyncTransactions('p3')).toEqual([]);
  });

  it('updateSyncTransactionStatus は中間状態では finishedAt を付けない', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await updateSyncTransactionStatus(id, 'running');
    const row = await getSyncTransaction(id);
    expect(row?.status).toBe('running');
    expect(row?.finishedAt).toBeUndefined();
  });

  it('完了・失敗・巻き戻しでは finishedAt を自動で刻む', async () => {
    for (const status of ['completed', 'failed', 'rolled-back'] as const) {
      const id = await createSyncTransaction('p1', [op()]);
      await updateSyncTransactionStatus(id, status);
      const row = await getSyncTransaction(id);
      expect(row?.status).toBe(status);
      expect(row?.finishedAt).toBeTypeOf('number');
    }
  });

  it('error / rolledBackAt も同時に記録できる', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await updateSyncTransactionStatus(id, 'rolled-back', {
      error: '書き込み失敗',
      rolledBackAt: 5_000
    });
    const row = await getSyncTransaction(id);
    expect(row).toMatchObject({ status: 'rolled-back', error: '書き込み失敗', rolledBackAt: 5_000 });
  });

  it('存在しない ID の状態更新は黙って無視する', async () => {
    await expect(updateSyncTransactionStatus('tx-nope', 'completed')).resolves.toBeUndefined();
  });

  it('markOperationDone は指定 index だけ更新する', async () => {
    const id = await createSyncTransaction('p1', [
      op({ path: 'mods/a.jar' }),
      op({ kind: 'update', path: 'mods/b.jar' })
    ]);
    await markOperationDone(id, 1, { backupId: 'tx-1/mods__b.jar', appliedPath: 'mods/b.jar' });

    const row = await getSyncTransaction(id);
    expect(row?.operations[0]).toMatchObject({ done: false, path: 'mods/a.jar' });
    expect(row?.operations[1]).toMatchObject({
      done: true,
      backupId: 'tx-1/mods__b.jar',
      appliedPath: 'mods/b.jar'
    });
  });

  it('markOperationDone は done:false のまま skippedReason だけ記録できる (外部変更検知)', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await markOperationDone(id, 0, { done: false, skippedReason: 'externally-modified' });

    const row = await getSyncTransaction(id);
    expect(row?.operations[0]).toMatchObject({ done: false, skippedReason: 'externally-modified' });
  });

  it('patch なしの markOperationDone は done:true だけを立てる', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await markOperationDone(id, 0);
    expect((await getSyncTransaction(id))?.operations[0]).toMatchObject({ done: true });
  });

  it('存在しない ID の markOperationDone は黙って無視する', async () => {
    await expect(markOperationDone('tx-nope', 0)).resolves.toBeUndefined();
  });

  it('findInterruptedSyncTransactions は running を古い順で返す (D-4)', async () => {
    const old = await createSyncTransaction('p1', [op()]);
    const newer = await createSyncTransaction('p2', [op()]);
    const done = await createSyncTransaction('p1', [op()]);
    await setStartedAt(old, 100);
    await setStartedAt(newer, 300);
    await setStartedAt(done, 200);
    await updateSyncTransactionStatus(old, 'running');
    await updateSyncTransactionStatus(newer, 'running');
    await updateSyncTransactionStatus(done, 'completed');

    expect((await findInterruptedSyncTransactions()).map((r) => r.id)).toEqual([old, newer]);

    // 復旧済みになれば検出されなくなる
    await updateSyncTransactionStatus(newer, 'rolled-back', { rolledBackAt: 999 });
    expect((await findInterruptedSyncTransactions()).map((r) => r.id)).toEqual([old]);
  });

  it('**pending も検出する** (createSyncTransaction と running 更新の間で閉じた場合)', async () => {
    // createSyncTransaction は pending で作る。running になる前にタブを閉じられると
    // pending のまま残る — running だけ見ると二度と拾えず行が永久に溜まる
    const pending = await createSyncTransaction('p1', [op()]);
    await setStartedAt(pending, 100);
    const running = await createSyncTransaction('p1', [op()]);
    await setStartedAt(running, 200);
    await updateSyncTransactionStatus(running, 'running');

    const found = await findInterruptedSyncTransactions();
    expect(found.map((r) => r.id)).toEqual([pending, running]);
    expect(found.map((r) => r.status)).toEqual(['pending', 'running']);
  });

  it('deleteSyncTransaction で履歴を消せる (Sync History の prune)', async () => {
    const id = await createSyncTransaction('p1', [op()]);
    await deleteSyncTransaction(id);
    expect(await getSyncTransaction(id)).toBeNull();
    // 無いものを消しても例外にしない
    await expect(deleteSyncTransaction(id)).resolves.toBeUndefined();
  });
});
