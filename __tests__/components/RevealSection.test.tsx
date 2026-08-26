/**
 * RevealSection component test (Phase 10.5-B)
 *
 * useScrollReveal (Phase 10.5-A stub 再利用) の thin wrapper。
 * - className 付きの div に children を render
 * - reduced-motion: 即座に最終状態 / 通常: 初期スタイル → IO 発火で animate
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { RevealSection } from '@/components/landing/RevealSection';
import {
  stubMatchMedia,
  stubIntersectionObserver,
  type IntersectionObserverStub,
  type MatchMediaStub
} from '../test-utils/browserApi';

const { animateMock, staggerMock } = vi.hoisted(() => ({
  animateMock: vi.fn<(targets: Element[], params: Record<string, unknown>) => unknown>(),
  staggerMock: vi.fn<(base: number) => number>((base) => base)
}));

vi.mock('animejs', () => ({
  animate: animateMock,
  stagger: staggerMock
}));

describe('RevealSection', () => {
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

  it('children を className 付きの div に render する', () => {
    const { container } = render(
      <RevealSection className="grid grid-cols-2">
        <div data-reveal-item>feature</div>
      </RevealSection>
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe('grid grid-cols-2');
    expect(wrapper.textContent).toBe('feature');
  });

  it('通常時は初期スタイル (opacity 0 / translateY 40px) を付けて observe する', () => {
    const { container } = render(
      <RevealSection>
        <div data-reveal-item>a</div>
      </RevealSection>
    );
    const item = container.querySelector<HTMLElement>('[data-reveal-item]');
    expect(item?.style.opacity).toBe('0');
    expect(item?.style.transform).toBe('translateY(40px)');
    expect(io.instances).toHaveLength(1);
    expect(io.instances[0]!.observe).toHaveBeenCalledWith(container.firstElementChild);
  });

  it('IO 発火で anime.js による reveal アニメを呼ぶ', async () => {
    const { container } = render(
      <RevealSection>
        <div data-reveal-item>a</div>
      </RevealSection>
    );
    await act(async () => {
      io.trigger(true);
    });
    expect(animateMock).toHaveBeenCalledTimes(1);
    const [targets] = animateMock.mock.calls[0]!;
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe(container.querySelector('[data-reveal-item]'));
  });

  it('reduced-motion では即座に最終状態 (opacity 1 / translateY 0)', () => {
    mm.setReducedMotion(true);
    const { container } = render(
      <RevealSection>
        <div data-reveal-item>a</div>
      </RevealSection>
    );
    const item = container.querySelector<HTMLElement>('[data-reveal-item]');
    expect(item?.style.opacity).toBe('1');
    expect(item?.style.transform).toBe('translateY(0)');
    expect(io.instances).toHaveLength(0);
    expect(animateMock).not.toHaveBeenCalled();
  });

  it('selector を上書きできる (data-reveal-item 以外の要素を対象に)', () => {
    const { container } = render(
      <RevealSection selector="[data-custom]">
        <div data-custom>x</div>
      </RevealSection>
    );
    const item = container.querySelector<HTMLElement>('[data-custom]');
    expect(item?.style.opacity).toBe('0');
  });
});
