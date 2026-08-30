/**
 * SyncHistorySection (Phase 12-B / D-9) test
 *
 * Dexie は実物 (fake-indexeddb)。Undo の実行経路はフックごと差し替えて表示に絞る。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SyncHistorySection } from '@/features/sync/components/SyncHistorySection';
import { useSyncHistory } from '@/features/sync/hooks/useSyncHistory';
import { useProfilesStore } from '@/lib/store/profiles';
import { UNDO_KEEP_COUNT } from '@/features/sync/backup';
import type { SyncHistoryItem } from '@/features/sync/hooks/useSyncHistory';

vi.mock('@/features/sync/hooks/useSyncHistory', () => ({ useSyncHistory: vi.fn() }));
const mockUse = vi.mocked(useSyncHistory);

const undo = vi.fn(async () => undefined);

function item(overrides: Partial<SyncHistoryItem> = {}): SyncHistoryItem {
  return {
    id: 'tx-1',
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_005_000,
    status: 'completed',
    applied: 3,
    skipped: 0,
    total: 3,
    canUndo: true,
    ...overrides
  };
}

function setup(overrides: Partial<ReturnType<typeof useSyncHistory>> = {}) {
  mockUse.mockReturnValue({
    items: [],
    loading: false,
    error: null,
    undoingId: null,
    refresh: vi.fn(async () => undefined),
    undo,
    ...overrides
  });
  return render(<SyncHistorySection />);
}

describe('SyncHistorySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfilesStore.setState({ currentProfileId: 'p1', hasHydrated: true });
  });

  it('現在のプロファイル ID をフックに渡す', () => {
    setup();
    expect(mockUse).toHaveBeenCalledWith('p1');
  });

  it('見出しと「直近 N 件」を出す', () => {
    setup();
    expect(screen.getByRole('heading', { name: '同期履歴' })).toBeInTheDocument();
    expect(screen.getByText(`直近 ${UNDO_KEEP_COUNT} 件 / 取り消し可能`)).toBeInTheDocument();
  });

  it('履歴が無ければ案内を出す', () => {
    setup();
    expect(screen.getByText('まだ Sync の履歴はありません。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取り消す' })).not.toBeInTheDocument();
  });

  it('読み込み中はスピナー', () => {
    setup({ loading: true });
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('エラーは role=alert で出す', () => {
    setup({ error: '履歴を読み取れませんでした' });
    expect(screen.getByRole('alert')).toHaveTextContent('履歴を読み取れませんでした');
  });

  it('完了した履歴には取り消すボタンを出す', () => {
    setup({ items: [item()] });
    expect(screen.getByText('完了')).toBeInTheDocument();
    expect(screen.getByText('適用 3 件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取り消す' })).toBeInTheDocument();
  });

  it('スキップ件数も出す', () => {
    setup({ items: [item({ applied: 2, skipped: 1, total: 3 })] });
    expect(screen.getByText('適用 2 件 / スキップ 1 件')).toBeInTheDocument();
  });

  it('失敗理由を出す', () => {
    setup({
      items: [item({ status: 'failed', canUndo: false, error: '書き込みに失敗しました' })]
    });
    expect(screen.getByText('失敗')).toBeInTheDocument();
    expect(screen.getByText(/書き込みに失敗しました/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取り消す' })).not.toBeInTheDocument();
  });

  it('取り消し済み / 実行中も状態バッジを出す', () => {
    setup({
      items: [
        item({ id: 'a', status: 'rolled-back', canUndo: false }),
        item({ id: 'b', status: 'running', canUndo: false })
      ]
    });
    expect(screen.getByText('取り消し済み')).toBeInTheDocument();
    expect(screen.getByText('実行中')).toBeInTheDocument();
  });

  it('取り消すを押すと undo に txId を渡す', () => {
    setup({ items: [item()] });
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }));
    expect(undo).toHaveBeenCalledWith('tx-1');
  });

  it('実行中は「取り消し中...」になり押せない', () => {
    setup({ items: [item()], undoingId: 'tx-1' });
    const btn = screen.getByRole('button', { name: '取り消し中...' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(undo).not.toHaveBeenCalled();
  });

  it('1 件を取り消し中は他の行のボタンも無効化する', () => {
    setup({
      items: [item({ id: 'a' }), item({ id: 'b', startedAt: 1_700_000_100_000 })],
      undoingId: 'a'
    });
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled();
    }
  });

  it('日時は time 要素に出す', () => {
    setup({ items: [item()] });
    const time = screen.getByText(/2023/);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', '2023-11-14T22:13:20.000Z');
  });

  it('履歴があるときは Undo の注意書きを出す', async () => {
    setup({ items: [item()] });
    await waitFor(() => {
      expect(screen.getByText(/Sync の前に環境側で書き換わっていたファイルは戻せません/)).toBeInTheDocument();
    });
  });
});
