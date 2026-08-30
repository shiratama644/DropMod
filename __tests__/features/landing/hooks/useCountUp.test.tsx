/**
 * useCountUp の単体テスト (Phase 10.5-A)
 *
 * - reduced-motion: mount 時に即座に最終値 (IntersectionObserver / anime.js 不使用)
 * - 通常時: IntersectionObserver が threshold 到達 → anime.js animate で
 *   proxy オブジェクトを更新しつつ onUpdate → value に反映
 * - isIntersecting: false では発火しない / 発火後に disconnect
 * - unmount 後の dynamic import 解決は cancelled ガードで無視される
 *
 * browser API は __tests__/test-utils/browserApi.ts の stub を使用。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useCountUp } from '@/features/landing/hooks/useCountUp';
import {
  stubMatchMedia,
  stubIntersectionObserver,
  type IntersectionObserverStub,
  type MatchMediaStub
} from '@/__tests__/test-utils/browserApi';

// anime.js は dynamic import されるため vi.mock で差し替える
// (vi.mock は dynamic import も intercept する)。
// hoisted 変数に持たせることで、実装側の複雑な型と切り離して扱う。
const { animateMock } = vi.hoisted(() => ({
  animateMock: vi.fn<
    (
      target: { n: number },
      params: {
        n: number;
        duration: number;
        ease: string;
        onUpdate?: () => void;
      }
    ) => unknown
  >()
}));

vi.mock('animejs', () => ({
  animate: animateMock,
  stagger: vi.fn<(base: number) => number>((base) => base)
}));

function Counter({
  end,
  duration,
  threshold
}: {
  end: number;
  duration?: number;
  threshold?: number;
}) {
  const { ref, value } = useCountUp({ end, duration, threshold });
  return <div ref={ref}>{value}</div>;
}

describe('useCountUp', () => {
  let mm: MatchMediaStub;
  let io: IntersectionObserverStub;

  beforeEach(() => {
    animateMock.mockReset();
    mm = stubMatchMedia(false);
    io = stubIntersectionObserver();
  });
  afterEach(() => {
    mm.restore();
    io.restore();
  });

  it('初期値は 0', () => {
    render(<Counter end={500} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('reduced-motion では即座に最終値を表示する (anime.js / IO 不使用)', () => {
    mm.setReducedMotion(true);
    render(<Counter end={1234} />);
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(animateMock).not.toHaveBeenCalled();
    expect(io.instances).toHaveLength(0);
  });

  it('IO が threshold 到達したら animate を呼び、onUpdate で値が更新される', async () => {
    // アニメ完了を即時シミュレート: proxy.n を終値にして onUpdate を発火
    animateMock.mockImplementation((target, params) => {
      target.n = params.n;
      params.onUpdate?.();
    });

    render(<Counter end={500} duration={1500} />);
    expect(screen.getByText('0')).toBeInTheDocument();

    await act(async () => {
      io.trigger(true);
    });

    expect(animateMock).toHaveBeenCalledTimes(1);
    const [, params] = animateMock.mock.calls[0]!;
    expect(params.n).toBe(500);
    expect(params.duration).toBe(1500);
    expect(params.ease).toBe('outCubic');
    expect(screen.getByText('500')).toBeInTheDocument();
    // 一度発火したら disconnect (再発火しない)
    expect(io.instances[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('animate の途中値 (Math.round) が value に反映される', async () => {
    animateMock.mockImplementation((target, params) => {
      target.n = 249.6; // Math.round(249.6) = 250
      params.onUpdate?.();
    });

    render(<Counter end={500} />);
    await act(async () => {
      io.trigger(true);
    });

    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('isIntersecting: false では animate しない', async () => {
    render(<Counter end={500} />);
    await act(async () => {
      io.trigger(false);
    });
    expect(animateMock).not.toHaveBeenCalled();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('threshold option が IntersectionObserver に渡される (default 0.4)', () => {
    render(<Counter end={10} threshold={0.9} />);
    expect(io.instances[0]!.options).toEqual({ threshold: 0.9 });

    render(<Counter end={10} />);
    expect(io.instances[1]!.options).toEqual({ threshold: 0.4 });
  });

  it('対象要素を observe する', () => {
    const { container } = render(<Counter end={10} />);
    const counterEl = container.firstElementChild;
    expect(io.instances[0]!.observe).toHaveBeenCalledWith(counterEl);
  });

  it('unmount 後に dynamic import が解決しても animate しない (cancelled ガード)', async () => {
    const { unmount } = render(<Counter end={100} />);
    // trigger → dynamic import 開始 (まだ解決前) → unmount で cancelled = true
    io.trigger(true);
    unmount();
    await act(async () => {});
    expect(animateMock).not.toHaveBeenCalled();
  });
});
