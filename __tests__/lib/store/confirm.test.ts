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

  it('second confirm() queues until the first resolves (B18)', async () => {
    let first: Promise<boolean>;
    let second: Promise<boolean>;
    act(() => {
      first = useConfirmStore.getState().confirm({ title: '1', message: '1' });
    });
    act(() => {
      second = useConfirmStore.getState().confirm({ title: '2', message: '2' });
    });
    expect(useConfirmStore.getState().state.title).toBe('1');
    act(() => useConfirmStore.getState().handleConfirm());
    await expect(first!).resolves.toBe(true);
    expect(useConfirmStore.getState().state.title).toBe('2');
    act(() => useConfirmStore.getState().handleConfirm());
    await expect(second!).resolves.toBe(true);
  });

  it('cleanup with matching owner resolves pending promise to false', async () => {
    // L7-2 修正後: cleanup は owner ID が必要 (自 hook が開いた dialog のみ対象)
    const owner = Symbol('test');
    let p: Promise<boolean>;
    act(() => {
      p = useConfirmStore.getState().confirm({ title: 't', message: 'm' }, owner);
    });
    act(() => useConfirmStore.getState().cleanup(owner));
    await expect(p!).resolves.toBe(false);
    expect(useConfirmStore.getState().state.isOpen).toBe(false);
  });

  it('cleanup with different owner does NOT resolve the pending promise (L7-2)', async () => {
    const owner1 = Symbol('hook-1');
    const owner2 = Symbol('hook-2');
    let p: Promise<boolean>;
    act(() => {
      p = useConfirmStore.getState().confirm({ title: 't', message: 'm' }, owner1);
    });
    // 別 owner の cleanup は他 hook の dialog を触らない
    act(() => useConfirmStore.getState().cleanup(owner2));
    expect(useConfirmStore.getState().state.isOpen).toBe(true);
    // 明示的に owner1 で cleanup すると解消
    act(() => useConfirmStore.getState().cleanup(owner1));
    await expect(p!).resolves.toBe(false);
    expect(useConfirmStore.getState().state.isOpen).toBe(false);
  });

  it('cleanup without owner is a no-op', () => {
    const owner = Symbol('hook-1');
    act(() => {
      void useConfirmStore.getState().confirm({ title: 't', message: 'm' }, owner);
    });
    // owner なしの cleanup は何もしない
    act(() => useConfirmStore.getState().cleanup());
    expect(useConfirmStore.getState().state.isOpen).toBe(true);
    // 後始末
    act(() => useConfirmStore.getState().handleCancel());
  });
});
