/**
 * useSyncHistory (Phase 12-B) test
 *
 * Dexie は**実物** (fake-indexeddb)。Undo の実行経路は openLinkedFolder /
 * undoSync を差し替えて、フックの分岐とトーストに絞る。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSyncHistory } from '@/features/sync/hooks/useSyncHistory';
import { db, _clearAllForTesting } from '@/lib/db/dexie';
import { openLinkedFolder } from '@/features/sync/link';
import { undoSync } from '@/features/sync/undo';
import { UNDO_KEEP_COUNT } from '@/features/sync/backup';
import { useProfilesStore } from '@/features/profiles';
import { useToastStore } from '@/components/feedback/toastStore';
import type { SyncTransactionRow } from '@/lib/db/dexie';
import type { EnvironmentSink } from '@/features/sync/sink';
import type { LinkedSource, Profile } from '@/types';

vi.mock('@/features/sync/link', () => ({ openLinkedFolder: vi.fn() }));
vi.mock('@/features/sync/undo', () => ({ undoSync: vi.fn() }));

const mockOpen = vi.mocked(openLinkedFolder);
const mockUndo = vi.mocked(undoSync);

const SINK = { kind: 'filesystem', ensureWritable: vi.fn(async () => true) } as unknown as
  EnvironmentSink & { ensureWritable: ReturnType<typeof vi.fn> };

function linkedSource(): LinkedSource {
  return {
    kind: 'filesystem',
    rootName: '.minecraft',
    handleId: 'dh-1',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    contentDirs: { mods: 'mods' },
    linkedAt: 1
  };
}

function row(overrides: Partial<SyncTransactionRow> = {}): SyncTransactionRow {
  return {
    id: 'tx-1',
    profileId: 'p1',
    status: 'completed',
    startedAt: 1_000,
    operations: [
      { kind: 'add', category: 'mod', path: 'mods/a.jar', size: 1, done: true }
    ],
    ...overrides
  };
}

describe('useSyncHistory', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await _clearAllForTesting();
    mockOpen.mockResolvedValue({
      handle: {} as FileSystemDirectoryHandle,
      source: {} as never,
      sink: SINK,
      rootName: '.minecraft'
    });
    mockUndo.mockResolvedValue({
      ok: true,
      restored: 1,
      removed: 0,
      errors: [],
      ledgerUpdated: true
    });
    useProfilesStore.setState({
      profiles: [
        {
          id: 'p1',
          name: 'P1',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          mods: [],
          linkedSource: linkedSource()
        } satisfies Profile
      ],
      currentProfileId: 'p1',
      hasHydrated: true
    });
    useToastStore.setState({ toasts: [], enabled: true });
  });

  it('profileId が無ければ空', async () => {
    const { result } = renderHook(() => useSyncHistory(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('**D-5 と同じ UNDO_KEEP_COUNT 件だけ**を新しい順に出す', async () => {
    // 保護される件数 + 1 行を作る
    const rows = Array.from({ length: UNDO_KEEP_COUNT + 1 }, (_, i) =>
      row({ id: `tx-${i}`, startedAt: 1_000 + i })
    );
    await db.syncTransactions.bulkPut(rows);

    const { result } = renderHook(() => useSyncHistory('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items.map((i) => i.id)).toEqual([
      `tx-${UNDO_KEEP_COUNT}`,
      `tx-${UNDO_KEEP_COUNT - 1}`,
      `tx-${UNDO_KEEP_COUNT - 2}`
    ]);
    expect(result.current.items).toHaveLength(UNDO_KEEP_COUNT);
  });

  it('他のプロファイルの履歴は出さない', async () => {
    await db.syncTransactions.bulkPut([row({ id: 'mine' }), row({ id: 'other', profileId: 'p2' })]);
    const { result } = renderHook(() => useSyncHistory('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((i) => i.id)).toEqual(['mine']);
  });

  it('Journal から applied / skipped / total を数える', async () => {
    await db.syncTransactions.put(
      row({
        operations: [
          { kind: 'add', category: 'mod', path: 'mods/a.jar', size: 1, done: true },
          { kind: 'update', category: 'mod', path: 'mods/b.jar', size: 1, done: true },
          {
            kind: 'delete',
            category: 'mod',
            path: 'mods/c.jar',
            size: 1,
            done: false,
            skippedReason: 'externally-modified'
          },
          { kind: 'delete', category: 'mod', path: 'mods/d.jar', size: 1, done: false }
        ]
      })
    );

    const { result } = renderHook(() => useSyncHistory('p1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    // done && !skippedReason = 適用 / skippedReason あり = スキップ / 全部 = total
    expect(result.current.items[0]).toMatchObject({ applied: 2, skipped: 1, total: 4 });
  });

  it('canUndo は completed のときだけ true', async () => {
    await db.syncTransactions.bulkPut([
      row({ id: 'ok', status: 'completed', startedAt: 4 }),
      row({ id: 'rb', status: 'rolled-back', startedAt: 3 }),
      row({ id: 'failed', status: 'failed', startedAt: 2 })
    ]);

    const { result } = renderHook(() => useSyncHistory('p1'));
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(result.current.items.map((i) => [i.id, i.canUndo])).toEqual([
      ['ok', true],
      ['rb', false],
      ['failed', false]
    ]);
  });

  it('error も items に載る', async () => {
    await db.syncTransactions.put(row({ status: 'failed', error: '書き込み失敗' }));
    const { result } = renderHook(() => useSyncHistory('p1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]?.error).toBe('書き込み失敗');
  });

  it('undo: 未紐付けなら実行せずエラーを出す', async () => {
    useProfilesStore.setState({
      profiles: [
        {
          id: 'p1',
          name: 'P1',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          mods: []
        } satisfies Profile
      ],
      currentProfileId: 'p1',
      hasHydrated: true
    });

    const { result } = renderHook(() => useSyncHistory('p1'));
    await act(async () => {
      await result.current.undo('tx-1');
    });

    expect(mockUndo).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
  });

  it('undo: フォルダを開けなければエラー', async () => {
    mockOpen.mockResolvedValue(null);
    const { result } = renderHook(() => useSyncHistory('p1'));

    await act(async () => {
      await result.current.undo('tx-1');
    });

    expect(mockUndo).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]?.message).toContain('フォルダを開けませんでした');
  });

  it('**D-2**: 書き込み権限が取れなければ Undo しない', async () => {
    SINK.ensureWritable.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useSyncHistory('p1'));

    await act(async () => {
      await result.current.undo('tx-1');
    });

    // D-7: Undo も昇格を試みる
    expect(SINK.ensureWritable).toHaveBeenCalled();
    expect(mockUndo).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]?.message).toContain('書き込み権限');
  });

  it('undo 成功: undoSync を呼び成功トーストを出す', async () => {
    await db.syncTransactions.put(row());
    const { result } = renderHook(() => useSyncHistory('p1'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.undo('tx-1');
    });

    expect(mockUndo).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx-1', sink: SINK })
    );
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success' });
    expect(useToastStore.getState().toasts[0]?.message).toContain('復元 1 件');
    expect(result.current.undoingId).toBeNull();
  });

  it('undo 失敗: undoSync の理由をトーストに出す', async () => {
    mockUndo.mockResolvedValue({
      ok: false,
      restored: 0,
      removed: 0,
      errors: ['mods/a.jar: 失敗'],
      ledgerUpdated: false,
      message: '一部のファイルを復元できませんでした。'
    });
    const { result } = renderHook(() => useSyncHistory('p1'));

    await act(async () => {
      await result.current.undo('tx-1');
    });

    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
    expect(useToastStore.getState().toasts[0]?.message).toContain('一部のファイルを復元');
  });

  it('undo が例外を投げてもエラー扱いにして再取得する', async () => {
    mockUndo.mockRejectedValue(new Error('OPFS が使えません'));
    const { result } = renderHook(() => useSyncHistory('p1'));

    await act(async () => {
      await result.current.undo('tx-1');
    });

    expect(useToastStore.getState().toasts[0]?.message).toContain('OPFS が使えません');
    expect(result.current.undoingId).toBeNull();
  });

  it('refresh で一覧を取り直す', async () => {
    const { result } = renderHook(() => useSyncHistory('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);

    await db.syncTransactions.put(row());
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.items.map((i) => i.id)).toEqual(['tx-1']);
  });

  it('profileId が変わると自動で取り直す', async () => {
    await db.syncTransactions.bulkPut([
      row({ id: 'a', profileId: 'p1' }),
      row({ id: 'b', profileId: 'p2' })
    ]);

    const { result, rerender } = renderHook(({ id }: { id: string }) => useSyncHistory(id), {
      initialProps: { id: 'p1' }
    });
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['a']));

    rerender({ id: 'p2' });
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['b']));
  });
});
