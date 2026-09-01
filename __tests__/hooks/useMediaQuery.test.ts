/**
 * useMediaQuery — CSS media query 購読 hook のテスト (COV-5)
 *
 * - matchMedia が無い環境では false (SSR / jsdom ガード)
 * - matches 初期値の反映
 * - addEventListener に渡された listener を発火 → matches が更新される
 *   (coverage: hook 内の anonymous listener 関数)
 * - cleanup で removeEventListener が呼ばれる
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, useIsMobile } from '@/hooks/useMediaQuery';
import type { Mock } from 'vitest';

interface FakeMql {
  matches: boolean;
  media: string;
  onchange: null;
  addListener: Mock;
  removeListener: Mock;
  addEventListener: Mock;
  removeEventListener: Mock;
  dispatchEvent: Mock;
}

/** matchMedia を差し替え、生成した MQL と listener 呼び出しを記録する */
function stubMatchMediaForQuery(initialMatches: boolean): {
  fn: Mock;
  mqls: FakeMql[];
  restore: () => void;
} {
  const mqls: FakeMql[] = [];
  const fn = vi.fn((query: string): FakeMql => {
    const mql: FakeMql = {
      matches: initialMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false)
    };
    mqls.push(mql);
    return mql;
  });
  const original = window.matchMedia;
  window.matchMedia = fn as unknown as typeof window.matchMedia;
  return {
    fn,
    mqls,
    restore() {
      window.matchMedia = original;
    }
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    // テスト内で付け替えた matchMedia を元に戻す (stub 未使用のテスト用)
    vi.restoreAllMocks();
  });

  it('matchMedia が無い環境では常に false (クラッシュしない)', () => {
    const original = window.matchMedia;
    // SSR / 未対応ブラウザを再現するため matchMedia を undefined にする。
    // writable/configurable を立てないと後続の stub が代入できなくなる。
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      writable: true,
      configurable: true
    });
    try {
      const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
      expect(result.current).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it('matchMedia の matches 初期値を反映する', () => {
    const stub = stubMatchMediaForQuery(true);
    try {
      const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
      expect(result.current).toBe(true);
    } finally {
      stub.restore();
    }
  });

  it('change イベントで matches が更新される', async () => {
    const stub = stubMatchMediaForQuery(false);
    try {
      const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
      expect(result.current).toBe(false);

      // addEventListener に渡された listener を取得して発火する
      const mql = stub.mqls[0];
      expect(mql).toBeDefined();
      const listener = mql?.addEventListener.mock.calls[0]?.[1] as
        | ((e: { matches: boolean }) => void)
        | undefined;
      expect(typeof listener).toBe('function');

      await act(async () => {
        listener?.({ matches: true });
      });
      expect(result.current).toBe(true);
    } finally {
      stub.restore();
    }
  });

  it('cleanup で removeEventListener が呼ばれる', () => {
    const stub = stubMatchMediaForQuery(false);
    try {
      const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'));
      const mql = stub.mqls[0];
      expect(mql?.removeEventListener).not.toHaveBeenCalled();
      unmount();
      expect(mql?.removeEventListener).toHaveBeenCalledTimes(1);
    } finally {
      stub.restore();
    }
  });

  it('useIsMobile は max-width 767px の media query を使う', () => {
    const stub = stubMatchMediaForQuery(false);
    try {
      renderHook(() => useIsMobile());
      expect(stub.fn).toHaveBeenCalledWith('(max-width: 767px)');
    } finally {
      stub.restore();
    }
  });
});
