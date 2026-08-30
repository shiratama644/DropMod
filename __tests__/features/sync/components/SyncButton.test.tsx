/**
 * SyncButton (Phase 12-B / D-8) test
 *
 * 「ZIP保存」を置き換える共通部品の表示分岐を検証する。
 * 編成 (prepareSync) と Preview の中身はそれぞれ自前のテストで担保済み。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SyncButton } from '@/features/sync/components/SyncButton';
import { useSync } from '@/features/sync/hooks/useSync';
import type { SyncPlan } from '@/features/sync/utils/diff';
import type { EnvironmentSink } from '@/features/sync/services/sink';

vi.mock('@/features/sync/hooks/useSync', () => ({ useSync: vi.fn() }));
const mockUseSync = vi.mocked(useSync);

const prepareMock = vi.fn();
const applyMock = vi.fn(async () => undefined);
const resetMock = vi.fn();

const EMPTY_PLAN: SyncPlan = {
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
  }
};

function readyOutcome(writable = true) {
  return {
    status: 'ready' as const,
    rootName: '.minecraft',
    check: { ok: true, mismatches: [], unverified: [] },
    plan: EMPTY_PLAN,
    sink: { kind: 'filesystem' } as unknown as EnvironmentSink,
    writable,
    writableReason: writable ? null : '書き込み権限がありません',
    scanSkipped: []
  };
}

describe('SyncButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSync.mockReturnValue({
      phase: 'idle',
      outcome: null,
      scanProgress: null,
      applyProgress: null,
      result: null,
      error: null,
      prepare: prepareMock,
      apply: applyMock,
      reset: resetMock
    });
  });

  it('既定はラベル付きボタン', () => {
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: '差分を確認して同期' })).toBeInTheDocument();
  });

  it('**D-8**: icon variant はアイコンのみ + aria-label', () => {
    render(<SyncButton variant="icon" />);
    const btn = screen.getByRole('button', { name: '差分を確認して同期' });
    expect(btn.textContent).toBe(''); // テキストラベルは出さない
    expect(btn.getAttribute('aria-label')).toBe('差分を確認して同期');
  });

  it('ラベルを差し替えられる', () => {
    render(<SyncButton label="同期" />);
    expect(screen.getByRole('button', { name: '同期' })).toBeInTheDocument();
  });

  it('prepare 中は押せない', () => {
    mockUseSync.mockReturnValue({
      phase: 'preparing',
      outcome: null,
      scanProgress: null,
      applyProgress: null,
      result: null,
      error: null,
      prepare: prepareMock,
      apply: applyMock,
      reset: resetMock
    });
    render(<SyncButton />);
    const btn = screen.getByRole('button', { name: /差分を確認中/ });
    expect(btn).toBeDisabled();
  });

  it('親の disabled でも押せない', () => {
    render(<SyncButton disabled />);
    expect(screen.getByRole('button', { name: '差分を確認して同期' })).toBeDisabled();
  });

  it('クリックで prepare を呼び onPrepared に結果を渡す', async () => {
    const onPrepared = vi.fn();
    const outcome = readyOutcome();
    prepareMock.mockResolvedValue(outcome);
    render(<SyncButton onPrepared={onPrepared} />);

    fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));

    await waitFor(() => expect(onPrepared).toHaveBeenCalledWith(outcome));
  });

  it('**D-2**: writable=false でも Preview は開くが「同期する」は押せない', async () => {
    prepareMock.mockResolvedValue(readyOutcome(false));
    render(<SyncButton />);

    fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '同期プレビュー' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /同期する/ })).toBeDisabled();
  });

  it('**D-1**: blocked-environment では Preview を開かず onPrepared だけ呼ぶ', async () => {
    const onPrepared = vi.fn();
    const blocked = {
      status: 'blocked-environment' as const,
      rootName: '.minecraft',
      check: { ok: false, mismatches: [], unverified: [], message: '環境が一致しません' }
    };
    prepareMock.mockResolvedValue(blocked);
    render(<SyncButton onPrepared={onPrepared} />);

    fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));

    await waitFor(() => expect(onPrepared).toHaveBeenCalledWith(blocked));
    expect(screen.queryByRole('dialog', { name: '同期プレビュー' })).not.toBeInTheDocument();
  });

  it('適用すると閉じて reset する', async () => {
    prepareMock.mockResolvedValue(readyOutcome());
    render(<SyncButton />);

    fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '同期プレビュー' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /同期する/ }));

    await waitFor(() => {
      expect(applyMock).toHaveBeenCalledWith([], new Map());
      expect(resetMock).toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: '同期プレビュー' })).not.toBeInTheDocument();
    });
  });

  it('実行中は閉じられない', async () => {
    prepareMock.mockResolvedValue(readyOutcome());
    const { rerender } = render(<SyncButton />);

    fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '同期プレビュー' })).toBeInTheDocument();
    });

    mockUseSync.mockReturnValue({
      phase: 'running',
      outcome: null,
      scanProgress: null,
      applyProgress: { done: 1, total: 2, path: 'mods/a.jar' },
      result: null,
      error: null,
      prepare: prepareMock,
      apply: applyMock,
      reset: resetMock
    });
    rerender(<SyncButton />);

    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled();
  });
});
