import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useToastStore } from '@/lib/store/toast';

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
