import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/layout/BottomNav';
import { useUiState } from '@/lib/store/uiState';
import type { TabName, ThemeMode } from '@/types';

function baseProps() {
  return {
    activeTab: 'home' as TabName,
    onSwitchTab: vi.fn(),
    modCount: 3,
    hasDepWarning: false,
    theme: 'dark' as ThemeMode,
    onToggleTheme: vi.fn(),
    onDownloadZip: vi.fn(),
    onImportZip: vi.fn()
  };
}

function navEl(): HTMLElement | null {
  return document.getElementById('bottom-nav');
}

describe('components/BottomNav — モーダル表示中の非表示 (nav-modal-hidden)', () => {
  beforeEach(() => {
    useUiState.setState({ openModalCount: 0 });
  });

  it('モーダルなし (count=0) では nav-modal-hidden が付かない', () => {
    render(<BottomNav {...baseProps()} />);
    expect(navEl()).not.toBeNull();
    expect(navEl()?.classList.contains('nav-modal-hidden')).toBe(false);
  });

  it('モーダル open (count=1) で nav-modal-hidden が付く', () => {
    useUiState.setState({ openModalCount: 1 });
    render(<BottomNav {...baseProps()} />);
    expect(navEl()?.classList.contains('nav-modal-hidden')).toBe(true);
  });

  it('count が 0 に戻るとクラスが外れる (最後のモーダル close)', () => {
    const props = baseProps();
    const { rerender } = render(<BottomNav {...props} />);

    act(() => {
      useUiState.setState({ openModalCount: 2 });
    });
    rerender(<BottomNav {...props} />);
    expect(navEl()?.classList.contains('nav-modal-hidden')).toBe(true);

    act(() => {
      useUiState.setState({ openModalCount: 0 });
    });
    rerender(<BottomNav {...props} />);
    expect(navEl()?.classList.contains('nav-modal-hidden')).toBe(false);
  });

  it('重ねたモーダル (count=2) でも 1 枚残っている間は非表示のまま', () => {
    useUiState.setState({ openModalCount: 2 });
    render(<BottomNav {...baseProps()} />);
    expect(navEl()?.classList.contains('nav-modal-hidden')).toBe(true);
  });

  it('4 タブ (ホーム/探す/現在のMod/メニュー) が描画される', () => {
    render(<BottomNav {...baseProps()} />);
    const nav = navEl();
    expect(nav).not.toBeNull();
    const buttons = nav?.querySelectorAll('button');
    const links = nav?.querySelectorAll('a');
    // link 2 (ホーム・現在のMod) + sheet トリガー 2 (探す・メニュー)
    expect(links?.length).toBe(2);
    expect(buttons?.length).toBe(2);
  });
});
