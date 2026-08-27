/**
 * useScrollDirection の単体テスト (Phase 10.5-A)
 *
 * - 上スクロール or topArea (<= 80px) → 'up' / 下スクロール → 'down'
 * - jitter (delta < 8px) は前回値を維持
 * - rAF throttle: 1 frame 内の複数 scroll event で update は 1 回のみ
 *
 * window.scrollY は getter のため defineProperty で差し替え
 * (__tests__/test-utils/browserApi.ts の stubScrollY / stubRequestAnimationFrame)。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import {
  stubScrollY,
  stubRequestAnimationFrame,
  type RafStub,
  type ScrollYStub
} from '../test-utils/browserApi';

describe('useScrollDirection', () => {
  let scroll: ScrollYStub;
  let raf: RafStub;

  beforeEach(() => {
    scroll = stubScrollY(0);
    // sync モード: rAF callback が scroll event dispatch 中に即座実行される
    raf = stubRequestAnimationFrame('sync');
  });
  afterEach(() => {
    scroll.restore();
    raf.restore();
  });

  /** scrollY を設定して scroll event を 1 回発火 */
  const scrollBy = (y: number) => {
    scroll.set(y);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
  };

  it('初期値は up', () => {
    const { result } = renderHook(() => useScrollDirection());
    expect(result.current).toBe('up');
  });

  it('topArea 内 (<= 80px) は強制 up', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollBy(50);
    expect(result.current).toBe('up');
  });

  it('topArea を超えて下スクロール → down', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollBy(300);
    expect(result.current).toBe('down');
  });

  it('上スクロール → up に戻る', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollBy(300);
    expect(result.current).toBe('down');
    scrollBy(100); // delta -200
    expect(result.current).toBe('up');
  });

  it('下に戻った後 topArea 内に戻れば強制 up', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollBy(300);
    expect(result.current).toBe('down');
    scrollBy(70); // delta -230 & topArea 内
    expect(result.current).toBe('up');
  });

  it('jitter (delta < 8px) は前回値を維持する', () => {
    const { result } = renderHook(() => useScrollDirection());
    scrollBy(300);
    expect(result.current).toBe('down');
    scrollBy(305); // delta +5 < 8
    expect(result.current).toBe('down');
    scrollBy(301); // delta -4 < 8 (topArea 外)
    expect(result.current).toBe('down');
  });

  it('options (topAreaHeight / threshold) を反映する', () => {
    const { result } = renderHook(() =>
      useScrollDirection({ topAreaHeight: 200, threshold: 20 })
    );

    scrollBy(150); // <= 200 → 強制 up
    expect(result.current).toBe('up');

    scrollBy(500); // delta +350 > 20 → down
    expect(result.current).toBe('down');

    scrollBy(510); // delta +10 < 20 → 維持
    expect(result.current).toBe('down');

    scrollBy(460); // delta -50 > 20 → up
    expect(result.current).toBe('up');
  });
});

describe('useScrollDirection (rAF throttle)', () => {
  it('1 frame 内の複数 scroll event では rAF を 1 回しか要求せず、最新位置で評価する', () => {
    const scroll = stubScrollY(0);
    const raf = stubRequestAnimationFrame('queued');
    try {
      const { result } = renderHook(() => useScrollDirection());

      // round 1: 下スクロールを確定 (lastY = 300)
      scroll.set(300);
      window.dispatchEvent(new Event('scroll'));
      act(() => {
        raf.flush();
      });
      expect(result.current).toBe('down');

      // round 2: 同一 frame 内に 2 回 scroll しても rAF 要求は 1 回だけ
      scroll.set(100);
      window.dispatchEvent(new Event('scroll'));
      scroll.set(90);
      window.dispatchEvent(new Event('scroll'));
      expect(raf.mock).toHaveBeenCalledTimes(2); // round 1 + round 2 の 1 回

      // flush すると 1 回の update が「最新の scrollY (90)」で評価される:
      // delta = 90 - 300 = -210 → up
      act(() => {
        raf.flush();
      });
      expect(result.current).toBe('up');
    } finally {
      scroll.restore();
      raf.restore();
    }
  });
});
