import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useToastStore, readToastEnabledPref } from '@/components/feedback/toastStore';

describe('useToastStore', () => {
  beforeEach(() => {
    act(() => useToastStore.setState({ toasts: [] }));
  });

  it('showToast adds a toast with default type "info"', () => {
    act(() => useToastStore.getState().showToast('hello'));
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toBe('hello');
    expect(toasts[0]?.type).toBe('info');
    expect(toasts[0]?.id).toMatch(/^toast-/);
  });

  it('showToast respects explicit type', () => {
    act(() => {
      useToastStore.getState().showToast('warn!', 'warning');
      useToastStore.getState().showToast('err!', 'error');
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(2);
    expect(toasts[0]?.type).toBe('warning');
    expect(toasts[1]?.type).toBe('error');
  });

  it('caps toasts at MAX_VISIBLE_TOASTS = 5 (oldest evicted first)', () => {
    act(() => {
      for (let i = 0; i < 8; i++) {
        useToastStore.getState().showToast(`msg-${i}`);
      }
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(5);
    expect(toasts[0]?.message).toBe('msg-3');
    expect(toasts[4]?.message).toBe('msg-7');
  });

  it('dismissToast removes the toast by id', () => {
    act(() => useToastStore.getState().showToast('a'));
    const id = useToastStore.getState().toasts[0]?.id ?? '';
    act(() => useToastStore.getState().dismissToast(id));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('dismissToast with unknown id is a no-op', () => {
    act(() => useToastStore.getState().showToast('a'));
    act(() => useToastStore.getState().dismissToast('does-not-exist'));
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('clearAllToasts empties the list', () => {
    act(() => {
      useToastStore.getState().showToast('a');
      useToastStore.getState().showToast('b');
    });
    act(() => useToastStore.getState().clearAllToasts());
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe('useToastStore: 通知 ON/OFF 設定 (2026-08-27)', () => {
  beforeEach(() => {
    act(() => {
      useToastStore.getState().clearAllToasts();
      useToastStore.getState().setToastEnabled(true);
    });
    localStorage.removeItem('dropmod_toast_enabled');
  });

  it('enabled = false の間は showToast が通知を発火しない', () => {
    act(() => {
      useToastStore.getState().setToastEnabled(false);
    });
    act(() => {
      useToastStore.getState().showToast('非表示のはず', 'info');
    });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('再度 ON にすると通知が復活する', () => {
    act(() => {
      useToastStore.getState().setToastEnabled(false);
      useToastStore.getState().setToastEnabled(true);
      useToastStore.getState().showToast('復活', 'success');
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]?.message).toBe('復活');
  });

  it('OFF にした瞬間に表示中のトーストも消える', () => {
    act(() => {
      useToastStore.getState().showToast('残るべきでない', 'info');
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    act(() => {
      useToastStore.getState().setToastEnabled(false);
    });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('設定は localStorage に永続化される', () => {
    act(() => {
      useToastStore.getState().setToastEnabled(false);
    });
    expect(localStorage.getItem('dropmod_toast_enabled')).toBe('false');
    act(() => {
      useToastStore.getState().setToastEnabled(true);
    });
    expect(localStorage.getItem('dropmod_toast_enabled')).toBe('true');
  });

  it('readToastEnabledPref: 未設定は true、"false" は false、破損値は true', () => {
    localStorage.removeItem('dropmod_toast_enabled');
    expect(readToastEnabledPref()).toBe(true);
    localStorage.setItem('dropmod_toast_enabled', 'false');
    expect(readToastEnabledPref()).toBe(false);
    localStorage.setItem('dropmod_toast_enabled', 'garbage');
    expect(readToastEnabledPref()).toBe(true);
  });
});
