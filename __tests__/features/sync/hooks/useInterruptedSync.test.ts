/**
 * useInterruptedSync (Phase 12-B / D-4) test
 *
 * 検出は Dexie 実物、復旧経路 (openLinkedFolder / recoverInterruptedSync) は差し替えて
 * フックの分岐とトーストに絞る。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInterruptedSync } from '@/features/sync/hooks/useInterruptedSync';
import { openLinkedFolder } from '@/features/sync/link';
import { recoverInterruptedSync } from '@/features/sync/recovery';
import { _clearAllForTesting, createSyncTransaction, markOperationDone } from '@/lib/db/dexie';
import { useProfilesStore } from '@/lib/store/profiles';
import { useToastStore } from '@/lib/store/toast';
import type { EnvironmentSink } from '@/features/sync/sink';
import type { LinkedSource, Profile } from '@/types';

vi.mock('@/features/sync/link', () => ({ openLinkedFolder: vi.fn() }));
vi.mock('@/features/sync/recovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/sync/recovery')>();
  return { ...actual, recoverInterruptedSync: vi.fn() };
});

const mockOpen = vi.mocked(openLinkedFolder);
const mockRecover = vi.mocked(recoverInterruptedSync);

const SINK = { kind: 'filesystem', ensureWritable: vi.fn(async () => true) } as unknown as
  EnvironmentSink & { ensureWritable: ReturnType<typeof vi.fn> };

function linked(rootName: string): LinkedSource {
  return {
    kind: 'filesystem',
    rootName,
    handleId: `dh-${rootName}`,
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    contentDirs: { mods: 'mods' },
    linkedAt: 1
  };
}

function profile(id: string, linkedSource?: LinkedSource): Profile {
  return {
    id,
    name: id,
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    mods: [],
    ...(linkedSource ? { linkedSource } : {})
  };
}

/** 中断 Journal を 1 件作る (op 1 件は適用済み) */
async function makeInterrupted(profileId: string, status: 'pending' | 'running') {
  const id = await createSyncTransaction(profileId, [
    { kind: 'add', category: 'mod', path: 'mods/a.jar', size: 10, done: false }
  ]);
  await markOperationDone(id, 0);
  if (status === 'running') {
    const { updateSyncTransactionStatus } = await import('@/lib/db/dexie');
    await updateSyncTransactionStatus(id, 'running');
  }
  return id;
}

describe('useInterruptedSync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await _clearAllForTesting();
    mockOpen.mockResolvedValue({
      handle: {} as FileSystemDirectoryHandle,
      source: {} as never,
      sink: SINK,
      rootName: '.minecraft'
    });
    mockRecover.mockResolvedValue({
      ok: true,
      choice: 'rollback',
      restored: 0,
      removed: 1,
      errors: []
    });
    useProfilesStore.setState({
      profiles: [profile('p1', linked('.minecraft')), profile('p2', linked('prism'))],
      currentProfileId: 'p1',
      hasHydrated: true
    });
    useToastStore.setState({ toasts: [], enabled: true });
  });

  it('何も無ければ items 空で checking が終わる', async () => {
    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('**D-4**: 起動時に pending と running の両方を検出する', async () => {
    const pending = await makeInterrupted('p1', 'pending');
    const running = await makeInterrupted('p2', 'running');

    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    expect(result.current.items.map((i) => i.transactionId).sort()).toEqual(
      [pending, running].sort()
    );
    expect(result.current.items[0]).toMatchObject({ applied: 1, total: 1 });
  });

  it('resolve(rollback): フォルダを開き ensureWritable してから復旧する', async () => {
    const txId = await makeInterrupted('p1', 'running');
    // モックでも DB を更新する (復旧後に取り直した一覧が消えることを検証するため)
    const { updateSyncTransactionStatus } = await import('@/lib/db/dexie');
    mockRecover.mockImplementation(async (input) => {
      await updateSyncTransactionStatus(input.transactionId, 'rolled-back', { rolledBackAt: 1 });
      return { ok: true, choice: input.choice, restored: 0, removed: 1, errors: [] };
    });

    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.resolve('rollback');
    });

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(SINK.ensureWritable).toHaveBeenCalled();
    expect(mockRecover).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: txId, choice: 'rollback', sink: SINK })
    );
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success' });
    // 復旧済みなので一覧から消える
    expect(result.current.items).toEqual([]);
  });

  it('resolve(keep): **フォルダを開かずに**復旧する', async () => {
    await makeInterrupted('p1', 'running');
    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.resolve('keep');
    });

    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockRecover).toHaveBeenCalledWith(expect.objectContaining({ choice: 'keep' }));
    // sink は渡さない (keep に書き込み先は不要)
    expect(mockRecover.mock.calls[0]?.[0]).not.toHaveProperty('sink');
    expect(useToastStore.getState().toasts[0]?.message).toContain('中断したままにしました');
  });

  it('未紐付けプロファイルは sink 無しで復旧を試みる', async () => {
    useProfilesStore.setState({
      profiles: [profile('p1')],
      currentProfileId: 'p1',
      hasHydrated: true
    });
    await makeInterrupted('p1', 'running');
    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.resolve('rollback');
    });

    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockRecover.mock.calls[0]?.[0]).not.toHaveProperty('sink');
  });

  it('書き込み権限が取れなければ sink 無しで呼ぶ (D-2)', async () => {
    SINK.ensureWritable.mockResolvedValueOnce(false);
    await makeInterrupted('p1', 'running');
    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.resolve('rollback');
    });

    expect(mockRecover.mock.calls[0]?.[0]).not.toHaveProperty('sink');
  });

  it('**プロファイルごとに 1 回だけ**フォルダを開く', async () => {
    await makeInterrupted('p1', 'running');
    await makeInterrupted('p1', 'running');
    await makeInterrupted('p2', 'running');

    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    await act(async () => {
      await result.current.resolve('rollback');
    });

    expect(mockOpen).toHaveBeenCalledTimes(2);
    expect(mockRecover).toHaveBeenCalledTimes(3);
  });

  it('復旧に失敗したら理由をトーストに出し、残りは表示し続ける', async () => {
    await makeInterrupted('p1', 'running');
    mockRecover.mockResolvedValue({
      ok: false,
      choice: 'rollback',
      restored: 0,
      removed: 0,
      errors: [],
      message: 'フォルダを開けないため巻き戻せませんでした。'
    });

    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.resolve('rollback');
    });

    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
    expect(useToastStore.getState().toasts[0]?.message).toContain('フォルダを開けない');
    // 状態を変えていないので次回も確認できる
    expect(result.current.items).toHaveLength(1);
  });

  it('items が空の resolve は何もしない', async () => {
    const { result } = renderHook(() => useInterruptedSync());
    await waitFor(() => expect(result.current.checking).toBe(false));

    await act(async () => {
      await result.current.resolve('rollback');
    });

    expect(mockRecover).not.toHaveBeenCalled();
  });
});
