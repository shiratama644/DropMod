/**
 * useSync (Phase 12-B) test
 *
 * 編成 / 実行の実体は `lib/env/syncPrep.ts` / `lib/env/applySync.ts` 側でテスト済み。
 * ここでは**状態遷移とトースト通知**、および D-1 / D-2 で Sync を実行させないことを検証する。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSync } from '@/hooks/useSync';
import { prepareSync } from '@/lib/env/syncPrep';
import { applySync } from '@/lib/env/applySync';
import { useProfilesStore } from '@/lib/store/profiles';
import { useToastStore } from '@/lib/store/toast';
import type { SyncPlan } from '@/lib/env/diff';
import type { EnvironmentSink } from '@/lib/env/sink';
import type { ExecuteSyncResult } from '@/lib/env/executor';
import type { Profile } from '@/types';

vi.mock('@/lib/env/syncPrep', () => ({ prepareSync: vi.fn() }));
vi.mock('@/lib/env/applySync', () => ({ applySync: vi.fn() }));

const mockPrepare = vi.mocked(prepareSync);
const mockApply = vi.mocked(applySync);

const EMPTY_PLAN: SyncPlan = {
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
  }
};

const SINK = { kind: 'filesystem' } as unknown as EnvironmentSink;

function readyOutcome(writable = true) {
  return {
    status: 'ready' as const,
    rootName: '.minecraft',
    check: { ok: true, mismatches: [], unverified: [] },
    plan: EMPTY_PLAN,
    sink: SINK,
    writable,
    writableReason: writable ? null : '書き込み権限がありません',
    scanSkipped: []
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Pack',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    mods: [],
    ...overrides
  };
}

function execResult(overrides: Partial<ExecuteSyncResult> = {}): ExecuteSyncResult {
  return { transactionId: 'tx-1', outcome: 'completed', applied: 3, skipped: [], ...overrides };
}

describe('useSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfilesStore.setState({
      profiles: [makeProfile()],
      currentProfileId: 'p1',
      hasHydrated: true
    });
    useToastStore.setState({ toasts: [], enabled: true });
    mockApply.mockResolvedValue({ result: execResult(), ledgerUpdated: true });
  });

  it('初期状態は idle', () => {
    const { result } = renderHook(() => useSync());
    expect(result.current.phase).toBe('idle');
    expect(result.current.outcome).toBeNull();
  });

  it('prepare: ready になれば phase=ready で outcome を持つ', async () => {
    mockPrepare.mockResolvedValue(readyOutcome());
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.phase).toBe('ready');
    expect(result.current.outcome?.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('**D-1**: 環境不一致なら phase は idle のままで理由を error に出す', async () => {
    mockPrepare.mockResolvedValue({
      status: 'blocked-environment',
      rootName: '.minecraft',
      check: {
        ok: false,
        mismatches: [],
        unverified: [],
        message: '環境が一致しないため Sync できません (理由)。'
      }
    });
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBe('環境が一致しないため Sync できません (理由)。');
  });

  it('prepare: 例外はトースト + error にする', async () => {
    mockPrepare.mockRejectedValue(new Error('フォルダを開けません'));
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
    });

    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBe('フォルダを開けません');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
  });

  it('prepare: プロファイルが無ければ何もせず error', async () => {
    useProfilesStore.setState({ profiles: [], currentProfileId: 'missing' });
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
    });

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(result.current.error).toBe('プロファイルが選択されていません。');
  });

  it('apply: prepare 前は何もしない', async () => {
    const { result } = renderHook(() => useSync());
    await act(async () => {
      await result.current.apply();
    });
    expect(mockApply).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });

  it('**D-2**: writable=false では apply しても実行しない', async () => {
    mockPrepare.mockResolvedValue(readyOutcome(false));
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      await result.current.apply();
    });

    expect(mockApply).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('ready');
  });

  it('apply: 完了したら finished + 成功トースト', async () => {
    mockPrepare.mockResolvedValue(readyOutcome());
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
    });
    await act(async () => {
      await result.current.apply();
    });

    expect(result.current.phase).toBe('finished');
    expect(result.current.result?.applied).toBe(3);
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      message: 'Sync が完了しました (3 件を適用)',
      type: 'success'
    });
  });

  it('apply: スキップがあれば件数に出す', async () => {
    mockPrepare.mockResolvedValue(readyOutcome());
    mockApply.mockResolvedValue({
      result: execResult({ applied: 1, skipped: [{ path: 'mods/x.jar', reason: 'missing' }] }),
      ledgerUpdated: true
    });
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
      await result.current.apply();
    });

    expect(useToastStore.getState().toasts[0]?.message).toContain('1 件をスキップ');
  });

  it('apply: rolled-back はエラー扱い', async () => {
    mockPrepare.mockResolvedValue(readyOutcome());
    mockApply.mockResolvedValue({
      result: execResult({ outcome: 'rolled-back', applied: 0, error: '書き込み失敗' }),
      ledgerUpdated: false
    });
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
      await result.current.apply();
    });

    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
    expect(useToastStore.getState().toasts[0]?.message).toContain('書き込み失敗');
  });

  it('apply: aborted-quota (D-5) は warning', async () => {
    mockPrepare.mockResolvedValue(readyOutcome());
    mockApply.mockResolvedValue({
      result: execResult({ outcome: 'aborted-quota', applied: 0, error: '空き容量が不足' }),
      ledgerUpdated: false
    });
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
      await result.current.apply();
    });

    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'warning' });
  });

  it('apply: completed でも台帳更新に失敗したら警告する', async () => {
    mockPrepare.mockResolvedValue(readyOutcome());
    mockApply.mockResolvedValue({ result: execResult(), ledgerUpdated: false });
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
      await result.current.apply();
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.map((t) => t.type)).toEqual(['success', 'warning']);
    expect(toasts[1]?.message).toContain('台帳の更新に失敗');
  });

  it('apply: 例外は finished + エラートースト', async () => {
    mockPrepare.mockResolvedValue(readyOutcome());
    mockApply.mockRejectedValue(new Error('OPFS が使えません'));
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
      await result.current.apply();
    });

    expect(result.current.phase).toBe('finished');
    expect(result.current.error).toBe('OPFS が使えません');
  });

  it('reset で初期状態に戻る', async () => {
    mockPrepare.mockResolvedValue(readyOutcome());
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.prepare();
      await result.current.apply();
    });
    expect(result.current.phase).toBe('finished');

    act(() => result.current.reset());
    expect(result.current).toMatchObject({
      phase: 'idle',
      outcome: null,
      result: null,
      error: null,
      scanProgress: null,
      applyProgress: null
    });
  });
});
