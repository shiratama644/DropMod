/**
 * useZipSync (Phase 12-C / §10.1・DoD) test
 *
 * `prepareZipSync` / `applyZipSync` は自前のテストを持つので、ここでは
 * **フックの接続**を検証する: Profile の受け渡し・ダウンロード・状態遷移・
 * 失敗時に ZIP を渡さないこと。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useZipSync } from '@/features/sync/hooks/useZipSync';
import { prepareZipSync, applyZipSync } from '@/features/sync/zipSync';
import type { PrepareZipSyncOutcome } from '@/features/sync/zipSync';
import { useProfilesStore } from '@/features/profiles';
import { useToastStore } from '@/components/feedback/toastStore';
import type { Profile } from '@/types';
import type { ExecuteSyncResult } from '@/features/sync/executor';

vi.mock('@/features/sync/zipSync', () => ({
  prepareZipSync: vi.fn(),
  applyZipSync: vi.fn()
}));
const mockPrepare = vi.mocked(prepareZipSync);
const mockApply = vi.mocked(applyZipSync);

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'My Pack',
    environment: { mcVersion: '1.21.1', loader: 'Fabric', loaderVersion: '0.16.0' },
    mods: [],
    ...overrides
  };
}

function readyOutcome(): PrepareZipSyncOutcome {
  return {
    status: 'ready',
    rootName: 'minecraft-sync.zip',
    sink: { kind: 'zip', toBlob: async () => new Blob(['z']) } as never,
    prepared: {
      status: 'ready',
      rootName: 'minecraft-sync.zip',
      check: { ok: true, mismatches: [], unverified: [] },
      plan: {
        profileId: 'p1',
        generatedAt: 1,
        additions: [],
        updates: [],
        deletions: [],
        unchanged: [],
        unmanaged: [],
        conflicts: [],
        totals: {
          counts: { addition: 2, update: 0, deletion: 0, unchanged: 0, unmanaged: 0, conflict: 0 },
          writeBytes: 0,
          removeBytes: 0,
          backupBytes: 0
        }
      },
      sink: { kind: 'zip' } as never,
      writable: true,
      writableReason: null,
      scanSkipped: []
    }
  } as unknown as PrepareZipSyncOutcome;
}

function execResult(overrides: Partial<ExecuteSyncResult> = {}): ExecuteSyncResult {
  return {
    transactionId: 'tx-1',
    outcome: 'completed',
    applied: 2,
    skipped: [],
    ...overrides
  };
}

/** jsdom には無いので createObjectURL / revokeObjectURL を用意する */
const revokeObjectURL = vi.fn();
let clickSpy: ReturnType<typeof vi.spyOn> | undefined;

function setup(profile: Profile | null = makeProfile()) {
  useProfilesStore.setState({
    profiles: profile ? [profile] : [],
    currentProfileId: profile?.id ?? undefined,
    hasHydrated: true
  });
  return renderHook(() => useZipSync());
}

describe('useZipSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clickSpy?.mockRestore();
    useToastStore.setState({ toasts: [] });
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    // jsdom は a.click() を「navigation」として未実装エラーにする。
    // ダウンロードの発火自体は createObjectURL の呼び出しで確認できるので click は抑止する。
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    mockPrepare.mockResolvedValue(readyOutcome());
    mockApply.mockResolvedValue({
      result: execResult(),
      ledgerUpdated: true,
      blob: new Blob(['zipdata']),
      bytes: 7
    });
  });

  it('現在の Profile を prepare に渡す', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.exportSyncAsZip();
    });

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockPrepare.mock.calls[0]?.[0]?.profile.id).toBe('p1');
  });

  it('**Profile 未選択なら何もしない**', async () => {
    const { result } = setup(null);
    await act(async () => {
      await result.current.exportSyncAsZip();
    });

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]?.message).toContain('プロファイルが選択されていません');
  });

  it('seed ファイルを渡すと rootName がファイル名になる', async () => {
    const { result } = setup();
    const file = new File(['z'], 'my-pack.zip', { type: 'application/zip' });

    await act(async () => {
      await result.current.exportSyncAsZip(file);
    });

    expect(mockPrepare.mock.calls[0]?.[0]?.seedBlob).toBe(file);
    expect(mockPrepare.mock.calls[0]?.[0]?.rootName).toBe('my-pack');
  });

  it('**seed なしの既定 rootName は minecraft-sync**', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.exportSyncAsZip();
    });
    expect(mockPrepare.mock.calls[0]?.[0]?.rootName).toBe('minecraft-sync');
  });

  it('成功時はダウンロードさせ、結果を state に出す', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.exportSyncAsZip();
    });

    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(result.current.result).toMatchObject({
      fileName: 'minecraft-sync.zip',
      bytes: 7,
      applied: 2,
      skipped: 0
    });
    expect(result.current.running).toBe(false);
  });

  it('**revokeObjectURL は遅延して呼ぶ** (Safari で即 revoke すると失敗するため)', async () => {
    vi.useFakeTimers();
    try {
      const { result } = setup();
      await act(async () => {
        await result.current.exportSyncAsZip();
      });

      expect(revokeObjectURL).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    } finally {
      vi.useRealTimers();
    }
  });

  it('**D-1 でブロックされたら apply しない**', async () => {
    mockPrepare.mockResolvedValue({
      status: 'blocked-environment',
      rootName: 'mc.zip',
      check: { ok: false, mismatches: [], unverified: [], message: 'Mod Loader が一致しません' }
    });
    const { result } = setup();

    await act(async () => {
      await result.current.exportSyncAsZip();
    });

    expect(mockApply).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Mod Loader が一致しません');
    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('**変更が 0 件なら apply せず案内する**', async () => {
    const outcome = readyOutcome();
    const prepared = outcome as unknown as {
      prepared: { plan: { totals: { counts: Record<string, number> } } };
    };
    prepared.prepared.plan.totals.counts.addition = 0;
    mockPrepare.mockResolvedValue(outcome);

    const { result } = setup();
    await act(async () => {
      await result.current.exportSyncAsZip();
    });

    expect(mockApply).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]?.message).toContain('書き出す変更がありません');
  });

  it('**適用が完了しなかったら ZIP をダウンロードさせない**', async () => {
    mockApply.mockResolvedValue({
      result: execResult({ outcome: 'rolled-back', applied: 0, error: 'disk full' }),
      ledgerUpdated: false,
      blob: null,
      bytes: 0
    });
    const { result } = setup();

    await act(async () => {
      await result.current.exportSyncAsZip();
    });

    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
    expect(result.current.error).toBe('disk full');
    expect(result.current.result).toBeNull();
  });

  it('例外でも state が running のまま固まらない', async () => {
    mockPrepare.mockRejectedValue(new Error('boom'));
    const { result } = setup();

    await act(async () => {
      await result.current.exportSyncAsZip();
    });

    expect(result.current.running).toBe(false);
    expect(result.current.error).toBe('boom');
  });

  it('dismissError で error を消せる', async () => {
    mockPrepare.mockRejectedValue(new Error('boom'));
    const { result } = setup();

    await act(async () => {
      await result.current.exportSyncAsZip();
    });
    expect(result.current.error).toBe('boom');

    act(() => {
      result.current.dismissError();
    });
    expect(result.current.error).toBeNull();
  });

  it('**実行中の 2 回目は弾く** (二重書き出し防止)', async () => {
    // 1 回目を解決させない
    let release: (() => void) | undefined;
    mockPrepare.mockImplementation(
      () =>
        new Promise<PrepareZipSyncOutcome>((resolve) => {
          release = () => resolve(readyOutcome());
        })
    );

    const { result } = setup();
    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.exportSyncAsZip();
    });

    await act(async () => {
      await result.current.exportSyncAsZip();
    });

    expect(useToastStore.getState().toasts[0]?.message).toContain('書き出し中です');

    act(() => {
      release?.();
    });
    await act(async () => {
      await first;
    });
    // 1 回目だけが prepare されている
    expect(mockPrepare).toHaveBeenCalledTimes(1);
  });
});
