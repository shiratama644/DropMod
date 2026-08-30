/**
 * useScrollReveal の単体テスト (Phase 10.5-A)
 *
 * - reduced-motion: 即座に最終状態 (opacity 1 / translateY 0)、IO・anime.js 不使用
 * - 通常時: 初期スタイル (opacity 0 / translateY 40px) を設定してから observe
 *   - 20% (threshold default 0.2) 可視で animate を呼び、以降 disconnect
 *   - isIntersecting: false では発火しない
 * - selector に該当要素がない場合は IO を作らない
 * - unmount 後の dynamic import 解決は cancelled ガードで無視される
 *
 * browser API は __tests__/test-utils/browserApi.ts の stub を使用。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useScrollReveal } from '@/features/landing/hooks/useScrollReveal';
import {
  stubMatchMedia,
  stubIntersectionObserver,
  type IntersectionObserverStub,
  type MatchMediaStub
} from '@/__tests__/test-utils/browserApi';

const { animateMock, staggerMock } = vi.hoisted(() => ({
  animateMock: vi.fn<(targets: Element[], params: Record<string, unknown>) => unknown>(),
  staggerMock: vi.fn<(base: number) => number>((base) => base)
}));

vi.mock('animejs', () => ({
  animate: animateMock,
  stagger: staggerMock
}));

function Section() {
  const ref = useScrollReveal<HTMLDivElement>('[data-reveal-item]');
  return (
    <div ref={ref}>
      <p data-reveal-item>a</p>
      <p data-reveal-item>b</p>
    </div>
  );
}

function getItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-reveal-item]'));
}

describe('useScrollReveal', () => {
  let mm: MatchMediaStub;
  let io: IntersectionObserverStub;

  beforeEach(() => {
    animateMock.mockReset();
    staggerMock.mockClear();
    mm = stubMatchMedia(false);
    io = stubIntersectionObserver();
  });
  afterEach(() => {
    mm.restore();
    io.restore();
  });

  it('reduced-motion では即座に最終状態を表示する (IO / anime.js 不使用)', () => {
    mm.setReducedMotion(true);
    render(<Section />);
    const items = getItems();
    expect(items).toHaveLength(2);
    for (const el of items) {
      expect(el.style.opacity).toBe('1');
      expect(el.style.transform).toBe('translateY(0)');
    }
    expect(io.instances).toHaveLength(0);
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('通常時は初期スタイルを設定して container を observe する', () => {
    const { container } = render(<Section />);
    const items = getItems();
    for (const el of items) {
      expect(el.style.opacity).toBe('0');
      expect(el.style.transform).toBe('translateY(40px)');
      expect(el.style.willChange).toBe('opacity, transform');
    }
    expect(io.instances).toHaveLength(1);
    expect(io.instances[0]!.options).toEqual({ threshold: 0.2 });
    expect(io.instances[0]!.observe).toHaveBeenCalledWith(container.firstElementChild);
  });

  it('可視になったら anime.js で animate し、disconnect する', async () => {
    render(<Section />);
    await act(async () => {
      io.trigger(true);
    });

    expect(animateMock).toHaveBeenCalledTimes(1);
    const [targets, params] = animateMock.mock.calls[0]!;
    expect(targets).toHaveLength(2);
    // 対象は container 内の data-reveal-item 要素
    const items = getItems();
    expect(targets[0]).toBe(items[0]);
    expect(targets[1]).toBe(items[1]);
    expect(params).toMatchObject({
      duration: 800,
      ease: 'outCubic',
      opacity: [0, 1],
      translateY: ['40px', '0px']
    });
    expect(staggerMock).toHaveBeenCalledWith(100);
    expect(params.delay).toBe(100); // stagger(100) の戻り値
    expect(io.instances[0]!.disconnect).toHaveBeenCalledTimes(1);
  });

  it('isIntersecting: false では animate しない', async () => {
    render(<Section />);
    await act(async () => {
      io.trigger(false);
    });
    expect(animateMock).not.toHaveBeenCalled();
    expect(io.instances[0]!.disconnect).not.toHaveBeenCalled();
  });

  it('threshold option を IO に渡せる (default 0.2)', () => {
    function SectionWithThreshold() {
      const ref = useScrollReveal<HTMLDivElement>('[data-reveal-item]', {
        threshold: 0.5
      });
      return (
        <div ref={ref}>
          <p data-reveal-item>a</p>
        </div>
      );
    }
    render(<SectionWithThreshold />);
    expect(io.instances[0]!.options).toEqual({ threshold: 0.5 });
  });

  it('selector に該当要素がない場合は IO を作らない', () => {
    render(<Section />); // Section は必ず 2 要素持つため、空 selector で検証
    // 別の hook で該当なしのケースを直接 render する
    function EmptySection() {
      const ref = useScrollReveal<HTMLDivElement>('[data-reveal-item]');
      return <div ref={ref} />; // data-reveal-item が無い
    }
    render(<EmptySection />);
    // 2 つ目 (EmptySection) は IO を生成していない
    expect(io.instances).toHaveLength(1);
  });

  it('unmount 後に dynamic import が解決しても animate しない (cancelled ガード)', async () => {
    const { unmount } = render(<Section />);
    io.trigger(true);
    unmount();
    await act(async () => {});
    expect(animateMock).not.toHaveBeenCalled();
  });
});
