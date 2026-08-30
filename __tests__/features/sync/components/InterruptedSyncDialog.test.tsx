/**
 * InterruptedSyncDialog (Phase 12-B / D-4) test
 *
 * 検出と復旧はフック側で検証済み。ここでは表示と**既定が「巻き戻す」**であること。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InterruptedSyncDialog } from '@/features/sync/components/InterruptedSyncDialog';
import { useInterruptedSync } from '@/features/sync/hooks/useInterruptedSync';
import type { InterruptedSyncInfo } from '@/features/sync/services/recovery';

vi.mock('@/features/sync/hooks/useInterruptedSync', () => ({ useInterruptedSync: vi.fn() }));
const mockUse = vi.mocked(useInterruptedSync);

const resolve = vi.fn(async () => undefined);

function info(overrides: Partial<InterruptedSyncInfo> = {}): InterruptedSyncInfo {
  return {
    transactionId: 'tx-1',
    profileId: 'p1',
    startedAt: 1_700_000_000_000,
    applied: 2,
    total: 5,
    status: 'running',
    ...overrides
  };
}

function setup(overrides: Partial<ReturnType<typeof useInterruptedSync>> = {}) {
  mockUse.mockReturnValue({
    items: [],
    checking: false,
    recovering: false,
    error: null,
    resolve,
    ...overrides
  });
  return render(<InterruptedSyncDialog />);
}

describe('InterruptedSyncDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('中断が無ければ何も描画しない', () => {
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it('検出中でも描画しない', () => {
    const { container } = setup({ items: [info()], checking: true });
    expect(container.firstChild).toBeNull();
  });

  it('**D-4**: 勝手に復旧せず、選ばせる (alertdialog)', () => {
    setup({ items: [info()] });
    expect(screen.getByRole('alertdialog')).toHaveTextContent('前回の同期が完了していません');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('停止時の適用件数と中断タイミングを出す', () => {
    setup({ items: [info({ status: 'running' }), info({ transactionId: 'tx-2', status: 'pending' })] });
    // 2 件とも同じ内容なので getAll で数える
    expect(screen.getAllByText('2 / 5 件を適用した状態で停止')).toHaveLength(2);
    expect(screen.getByText('実行中に中断')).toBeInTheDocument();
    expect(screen.getByText('開始前に中断')).toBeInTheDocument();
  });

  it('「巻き戻す (推奨)」で rollback を選ぶ', () => {
    setup({ items: [info()] });
    fireEvent.click(screen.getByRole('button', { name: '巻き戻す (推奨)' }));
    expect(resolve).toHaveBeenCalledWith('rollback');
  });

  it('「このままにする」で keep を選ぶ', () => {
    setup({ items: [info()] });
    fireEvent.click(screen.getByRole('button', { name: 'このままにする' }));
    expect(resolve).toHaveBeenCalledWith('keep');
  });

  it('実行中は両ボタンを押せない', () => {
    setup({ items: [info()], recovering: true });
    expect(screen.getByRole('button', { name: /巻き戻し中/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'このままにする' })).toBeDisabled();
  });

  it('背景クリックでは閉じない (選択を必須にする)', () => {
    const { container } = setup({ items: [info()] });
    fireEvent.click(container.querySelector('.modal-overlay') as Element);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
