import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useModalRegistration } from '@/hooks/useModalUi';
import { useUiState } from '@/lib/store/uiState';

/** useModalRegistration を呼ぶだけのプローブ (引数は isOpen) */
function Probe({ isOpen }: { isOpen: boolean }) {
  useModalRegistration(isOpen);
  return null;
}

describe('hooks/useModalUi — useModalRegistration', () => {
  beforeEach(() => {
    useUiState.setState({ openModalCount: 0 });
  });

  it('isOpen=false ではカウントに影響しない', () => {
    render(<Probe isOpen={false} />);
    expect(useUiState.getState().openModalCount).toBe(0);
  });

  it('isOpen=true で +1、false で -1 (トグル)', () => {
    const { rerender } = render(<Probe isOpen={false} />);
    expect(useUiState.getState().openModalCount).toBe(0);

    rerender(<Probe isOpen={true} />);
    expect(useUiState.getState().openModalCount).toBe(1);

    rerender(<Probe isOpen={false} />);
    expect(useUiState.getState().openModalCount).toBe(0);
  });

  it('isOpen=true のまま unmount しても -1 される (close 前の route 離脱対策)', () => {
    const { unmount } = render(<Probe isOpen={true} />);
    expect(useUiState.getState().openModalCount).toBe(1);
    unmount();
    expect(useUiState.getState().openModalCount).toBe(0);
  });

  it('複数モーダル (詳細 + ギャラリー等) が重なってもカウントが合う', () => {
    const { unmount: unmountA } = render(<Probe isOpen={true} />);
    const { unmount: unmountB } = render(<Probe isOpen={true} />);
    expect(useUiState.getState().openModalCount).toBe(2);

    unmountA();
    expect(useUiState.getState().openModalCount).toBe(1);

    unmountB();
    expect(useUiState.getState().openModalCount).toBe(0);
  });
});
