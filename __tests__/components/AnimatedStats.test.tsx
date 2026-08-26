/**
 * AnimatedStats component test (Phase 10.5-B)
 *
 * useCountUp を 3 枚のカードで使う (Phase 10.5-A の stub を再利用)。
 * - 初期値は 0+ / 0 / 0% の書式
 * - IO 発火 → animate ×3 → 最終値 100k+ / 4 / 100%
 * - reduced-motion は即座に最終値
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AnimatedStats } from '@/components/landing/AnimatedStats';
import {
  stubMatchMedia,
  stubIntersectionObserver,
  type IntersectionObserverStub,
  type MatchMediaStub
} from '../test-utils/browserApi';

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

describe('AnimatedStats', () => {
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

  it('3 枚の統計カードを表示する (初期値 0 の書式付き)', () => {
    render(<AnimatedStats />);

    expect(screen.getByText('0+')).toBeInTheDocument(); // 100000 (n<1000)
    expect(screen.getByText('0')).toBeInTheDocument(); // 4
    expect(screen.getByText('0%')).toBeInTheDocument(); // 100
    expect(screen.getByText('Modrinth Mod にアクセス')).toBeInTheDocument();
    expect(screen.getByText('Loader 対応')).toBeInTheDocument();
    expect(screen.getByText('オフライン対応 (IndexedDB)')).toBeInTheDocument();
  });

  it('IO 発火で各カードがカウントアップし最終値 (100k+ / 4 / 100%) になる', async () => {
    animateMock.mockImplementation((target, params) => {
      target.n = params.n;
      params.onUpdate?.();
    });

    render(<AnimatedStats />);
    // カード 3 枚 = IO 3 instance
    expect(io.instances).toHaveLength(3);

    // ※ 1 instance ずつ await を挟んで trigger すること:
    //   vitest 4 の mocker は同一モジュールからの並行 dynamic import で
    //   競合し、2 本目以降に実 anime.js を返す (mock が当たらない) ため。
    for (const instance of io.instances) {
      await act(async () => {
        instance.trigger(true);
      });
    }

    expect(animateMock).toHaveBeenCalledTimes(3);
    expect(screen.getByText('100k+')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('途中値も format される (1000 以上は k+ 表記)', async () => {
    animateMock.mockImplementation((target, params) => {
      target.n = Math.floor(params.n / 2); // 途中値
      params.onUpdate?.();
    });

    render(<AnimatedStats />);
    for (const instance of io.instances) {
      await act(async () => {
        instance.trigger(true);
      });
    }

    expect(screen.getByText('50k+')).toBeInTheDocument(); // 100000/2
    expect(screen.getByText('2')).toBeInTheDocument(); // 4/2
    expect(screen.getByText('50%')).toBeInTheDocument(); // 100/2
  });

  it('reduced-motion では即座に最終値を表示する', () => {
    mm.setReducedMotion(true);
    render(<AnimatedStats />);
    expect(screen.getByText('100k+')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(animateMock).not.toHaveBeenCalled();
  });
});
