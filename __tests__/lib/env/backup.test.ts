/**
 * Backup ストア (Phase 12-B / PHASE12_PLAN.md §10.4) test
 *
 * - `selectEvictableTransactions` … D-5 の純粋関数 (直近 3 回保護 / 古い順 / 足りなければ中断)
 * - `parseBackupId`               … backupId の分解
 * - `OpfsBackupStore`             … Fake ファイルシステムを OPFS ルートとして注入して検証
 */

import { describe, it, expect } from 'vitest';
import {
  BACKUP_ROOT_DIR,
  OpfsBackupStore,
  UNDO_KEEP_COUNT,
  parseBackupId,
  selectEvictableTransactions,
  type BackupTransactionSummary,
  InMemoryBackupStore
} from '@/features/sync/backup';
import {
  asFakeDirectory,
  createFakeFileSystem,
  FakeFileHandle,
  readFakeFile
} from '../../test-utils/fakeFs';

function tx(txId: string, bytes: number, savedAt: number): BackupTransactionSummary {
  return { txId, bytes, savedAt };
}

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (u: Uint8Array | null) => (u ? new TextDecoder().decode(u) : null);

describe('selectEvictableTransactions — D-5', () => {
  const keep3 = new Set(['t3', 't4', 't5']);

  it('UNDO_KEEP_COUNT は 3 (§10.4 の Undo 保証)', () => {
    expect(UNDO_KEEP_COUNT).toBe(3);
  });

  it('空きが足りていれば何も消さない', () => {
    const result = selectEvictableTransactions(
      [tx('t1', 100, 1), tx('t2', 100, 2)],
      new Set<string>(),
      50,
      1_000
    );
    expect(result).toEqual({ evict: [], enough: true, freedBytes: 0 });
  });

  it('足りない分を古い順に追い出す', () => {
    const result = selectEvictableTransactions(
      [tx('t3', 100, 3), tx('t1', 100, 1), tx('t2', 100, 2)],
      new Set<string>(),
      250,
      0
    );
    expect(result.evict).toEqual(['t1', 't2', 't3']);
    expect(result).toMatchObject({ enough: true, freedBytes: 300 });
  });

  it('必要な分だけ追い出したら止まる (過剰削除しない)', () => {
    const result = selectEvictableTransactions(
      [tx('t1', 100, 1), tx('t2', 100, 2), tx('t3', 100, 3)],
      new Set<string>(),
      150,
      0
    );
    expect(result.evict).toEqual(['t1', 't2']);
    expect(result.enough).toBe(true);
  });

  it('直近 3 回は絶対に消さない — 足りなければ enough: false', () => {
    const result = selectEvictableTransactions(
      [tx('t1', 100, 1), tx('t2', 100, 2), tx('t3', 100, 3), tx('t4', 100, 4), tx('t5', 100, 5)],
      keep3,
      10_000,
      0
    );
    // 保護対象 t3/t4/t5 を除いた t1/t2 を全部消しても足りない
    expect(result.evict).toEqual(['t1', 't2']);
    expect(result.enough).toBe(false);
    expect(result.freedBytes).toBe(200);
  });

  it('保護対象だけしか無い場合は evict 空 + enough: false', () => {
    const result = selectEvictableTransactions(
      [tx('t3', 100, 3), tx('t4', 100, 4), tx('t5', 100, 5)],
      keep3,
      500,
      0
    );
    expect(result).toEqual({ evict: [], enough: false, freedBytes: 0 });
  });

  it('空リストでも破綻しない', () => {
    expect(selectEvictableTransactions([], new Set<string>(), 0, 0)).toEqual({
      evict: [],
      enough: true,
      freedBytes: 0
    });
  });
});

describe('parseBackupId', () => {
  it('txId と filename に分解する', () => {
    expect(parseBackupId('tx-1/mods__a.jar')).toEqual({
      txId: 'tx-1',
      filename: 'mods__a.jar'
    });
  });

  it('区切りが無ければ null (不正な backupId)', () => {
    expect(parseBackupId('no-slash')).toBeNull();
    expect(parseBackupId('/leading-slash')).toBeNull();
  });
});

describe('OpfsBackupStore', () => {
  /** Fake ルートを OPFS ルートとして注入する */
  function makeStore(
    files: Record<string, string | Uint8Array> = {}
  ): { store: OpfsBackupStore; root: FileSystemDirectoryHandle } {
    const root = createFakeFileSystem(files);
    return { store: new OpfsBackupStore(async () => root), root };
  }

  it('save → load が往復する。キーは "__" で平坦化する', async () => {
    const { store, root } = makeStore();
    const backupId = await store.save('tx-1', 'mods/a.jar', encode('hello'));

    expect(backupId).toBe('tx-1/mods__a.jar');
    expect(decode(await store.load(backupId))).toBe('hello');
    // 格納レイアウト: <root>/dropmod-backup/<txId>/<sanitized>
    expect(readFakeFile(root, `${BACKUP_ROOT_DIR}/tx-1/mods__a.jar`)).not.toBeNull();
  });

  it('同じ txId へ複数ファイルを追加できる', async () => {
    const { store } = makeStore();
    await store.save('tx-1', 'mods/a.jar', encode('a'));
    await store.save('tx-1', 'mods/b.jar', encode('b'));
    expect(decode(await store.load('tx-1/mods__b.jar'))).toBe('b');
    expect(await store.estimateUsage()).toBe(2);
  });

  it('同じキーへの二度目の save は上書きする', async () => {
    const { store } = makeStore();
    await store.save('tx-1', 'mods/a.jar', encode('old'));
    await store.save('tx-1', 'mods/a.jar', encode('new-value'));
    expect(decode(await store.load('tx-1/mods__a.jar'))).toBe('new-value');
  });

  it('存在しない backupId は null (例外にしない)', async () => {
    const { store } = makeStore();
    expect(await store.load('tx-nope/mods__a.jar')).toBeNull();
    expect(await store.load('not-an-id')).toBeNull();
  });

  it('ルートが未作成でも listTransactions は空配列', async () => {
    const { store } = makeStore();
    expect(await store.listTransactions()).toEqual([]);
    expect(await store.estimateUsage()).toBe(0);
  });

  it('listTransactions は tx 単位のバイト数と最古 lastModified を古い順に返す', async () => {
    // lastModified を制御するため Fake ツリーを直接組み立てる
    const root = createFakeFileSystem({});
    const backupRoot = asFakeDirectory(root).directory(BACKUP_ROOT_DIR);
    backupRoot
      .directory('tx-new')
      .add(new FakeFileHandle('mods__a.jar', encode('aaa'), 900));
    backupRoot
      .directory('tx-old')
      .add(new FakeFileHandle('mods__b.jar', encode('bb'), 500))
      .add(new FakeFileHandle('mods__c.jar', encode('c'), 200));

    const store = new OpfsBackupStore(async () => root);
    expect(await store.listTransactions()).toEqual([
      // savedAt は「最も古いファイルの lastModified」。古い順
      { txId: 'tx-old', bytes: 3, savedAt: 200 },
      { txId: 'tx-new', bytes: 3, savedAt: 900 }
    ]);
    expect(await store.estimateUsage()).toBe(6);
  });

  it('tx ディレクトリが空なら savedAt は 0 (Infinity を漏らさない)', async () => {
    const root = createFakeFileSystem({});
    asFakeDirectory(root).directory(BACKUP_ROOT_DIR).directory('tx-empty');
    const store = new OpfsBackupStore(async () => root);
    expect(await store.listTransactions()).toEqual([
      { txId: 'tx-empty', bytes: 0, savedAt: 0 }
    ]);
  });

  it('removeTransaction は Sync 1 件分をまとめて消す。二度呼んでも冪等', async () => {
    const { store, root } = makeStore();
    await store.save('tx-1', 'mods/a.jar', encode('aaa'));
    await store.save('tx-1', 'mods/b.jar', encode('b'));
    await store.save('tx-2', 'mods/c.jar', encode('cc'));

    await store.removeTransaction('tx-1');
    expect(await store.load('tx-1/mods__a.jar')).toBeNull();
    expect(decode(await store.load('tx-2/mods__c.jar'))).toBe('cc');

    // 冪等: 既に無くても成功
    await expect(store.removeTransaction('tx-1')).resolves.toBeUndefined();
    await expect(store.removeTransaction('tx-nope')).resolves.toBeUndefined();
    expect(readFakeFile(root, `${BACKUP_ROOT_DIR}/tx-2/mods__c.jar`)).not.toBeNull();
  });

  it('getRoot が OPFS 非対応で失敗したら、その例外をそのまま投げる', async () => {
    const store = new OpfsBackupStore(async () => {
      throw new Error('このブラウザは OPFS (Origin Private File System) に対応していません。');
    });
    await expect(store.save('tx-1', 'mods/a.jar', encode('x'))).rejects.toThrow('OPFS');
  });
});

// ============================================================================
// InMemoryBackupStore (Phase 12-C / §10.1)
//
// ZIP 経路の既定 Backup。**OPFS が無い環境でも Sync を止めない**ための実装。
// テスト用ダブル (`test-utils/memoryEnv.ts` の `MemoryBackupStore`) とは別物。
// ============================================================================

describe('InMemoryBackupStore', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it('save → load の往復', async () => {
    const store = new InMemoryBackupStore();
    const id = await store.save('tx-1', 'mods/a.jar', bytes('old'));
    // `sanitizeKey()` は '/' を '__' に置換する
    expect(id).toBe('tx-1/mods__a.jar');
    const loaded = await store.load(id);
    expect(loaded ? new TextDecoder().decode(loaded) : null).toBe('old');
  });

  it('**存在しない backupId は null** (throw しない)', async () => {
    const store = new InMemoryBackupStore();
    expect(await store.load('tx-x/none')).toBeNull();
  });

  it('removeTransaction はその tx の分だけ消す', async () => {
    const store = new InMemoryBackupStore();
    const id1 = await store.save('tx-1', 'mods/a.jar', bytes('a'));
    const id2 = await store.save('tx-2', 'mods/b.jar', bytes('b'));

    await store.removeTransaction('tx-1');

    expect(await store.load(id1)).toBeNull();
    expect(await store.load(id2)).not.toBeNull();
  });

  it('**removeTransaction は冪等** (Rollback の再実行に必要)', async () => {
    const store = new InMemoryBackupStore();
    await store.save('tx-1', 'mods/a.jar', bytes('a'));
    await store.removeTransaction('tx-1');
    await expect(store.removeTransaction('tx-1')).resolves.toBeUndefined();
  });

  it('listTransactions は tx 単位でバイト数を合計する', async () => {
    const store = new InMemoryBackupStore();
    await store.save('tx-1', 'mods/a.jar', bytes('aaa'));
    await store.save('tx-1', 'mods/b.jar', bytes('bb'));
    await store.save('tx-2', 'mods/c.jar', bytes('c'));

    const list = await store.listTransactions();
    expect(list).toHaveLength(2);
    expect(list.find((t) => t.txId === 'tx-1')?.bytes).toBe(5);
    expect(list.find((t) => t.txId === 'tx-2')?.bytes).toBe(1);
  });

  it('**savedAt は最も古いファイルの時刻** (D-5 の古い順追い出しと同じ基準)', async () => {
    const store = new InMemoryBackupStore();
    const now = Date.now();
    await store.save('tx-1', 'mods/a.jar', bytes('a'));
    await store.save('tx-1', 'mods/b.jar', bytes('b'));

    const list = await store.listTransactions();
    const savedAt = list.find((t) => t.txId === 'tx-1')?.savedAt ?? 0;
    expect(savedAt).toBeGreaterThanOrEqual(now - 1000);
    expect(savedAt).toBeLessThanOrEqual(Date.now());
  });

  it('removeTransaction 後は listTransactions にも出ない', async () => {
    const store = new InMemoryBackupStore();
    await store.save('tx-1', 'mods/a.jar', bytes('a'));
    await store.removeTransaction('tx-1');
    expect(await store.listTransactions()).toEqual([]);
  });

  it('estimateUsage は合計バイト数', async () => {
    const store = new InMemoryBackupStore();
    await store.save('tx-1', 'mods/a.jar', bytes('aaa'));
    await store.save('tx-1', 'mods/b.jar', bytes('bb'));
    expect(await store.estimateUsage()).toBe(5);
  });

  it('**同じキーを二度 save しても二重計上しない**', async () => {
    const store = new InMemoryBackupStore();
    await store.save('tx-1', 'mods/a.jar', bytes('aaa'));
    await store.save('tx-1', 'mods/a.jar', bytes('bbbbb'));
    expect(await store.estimateUsage()).toBe(5);
    const list = await store.listTransactions();
    expect(list).toHaveLength(1);
  });

  it('**OPFS が無くても使える** (ZIP 経路の既定である理由)', async () => {
    // jsdom に OPFS は無い。それでも全操作が通ることを確認する。
    expect((globalThis as { navigator?: { storage?: unknown } }).navigator?.storage).toBeUndefined();
    const store = new InMemoryBackupStore();
    const id = await store.save('tx-1', 'mods/a.jar', bytes('x'));
    expect(await store.load(id)).not.toBeNull();
  });
});
