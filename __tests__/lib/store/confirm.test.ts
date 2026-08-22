import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useConfirmStore } from '@/lib/store/confirm';

describe('useConfirmStore', () => {
  beforeEach(() => {
    act(() => useConfirmStore.getState().cleanup());
  });

  it('initial state: isOpen=false', () => {
    expect(useConfirmStore.getState().state.isOpen).toBe(false);
  });

  it('confirm() opens the dialog and resolves true on handleConfirm', async () => {
    let resultPromise: Promise<boolean>;
    act(() => {
      resultPromise = useConfirmStore.getState().confirm({
        title: 't', message: 'm'
      });
    });
    expect(useConfirmStore.getState().state.isOpen).toBe(true);
    expect(useConfirmStore.getState().state.title).toBe('t');
    act(() => useConfirmStore.getState().handleConfirm());
    await expect(resultPromise!).resolves.toBe(true);
    expect(useConfirmStore.getState().state.isOpen).toBe(false);
  });

  it('handleCancel resolves false', async () => {
    let resultPromise: Promise<boolean>;
    act(() => {
      resultPromise = useConfirmStore.getState().confirm({ title: 't', message: 'm' });
    });
    act(() => useConfirmStore.getState().handleCancel());
    await expect(resultPromise!).resolves.toBe(false);
  });

  it('second confirm() while first is pending resolves the first to false', async () => {
    let first: Promise<boolean>;
    let second: Promise<boolean>;
    act(() => {
      first = useConfirmStore.getState().confirm({ title: '1', message: '1' });
    });
    act(() => {
      second = useConfirmStore.getState().confirm({ title: '2', message: '2' });
    });
    // 1 個目は false で resolve される
    await expect(first!).resolves.toBe(false);
    // 2 個目はまだ pending
    act(() => useConfirmStore.getState().handleConfirm());
    await expect(second!).resolves.toBe(true);
  });

  it('cleanup resolves pending promise to false', async () => {
    let p: Promise<boolean>;
    act(() => {
      p = useConfirmStore.getState().confirm({ title: 't', message: 'm' });
    });
    act(() => useConfirmStore.getState().cleanup());
    await expect(p!).resolves.toBe(false);
    expect(useConfirmStore.getState().state.isOpen).toBe(false);
  });
});
