/**
 * HeroRotator component test (Phase 10.5-B)
 *
 * - reduced-motion / 単語 1 個 → ローテーションしない
 * - 通常時: intervalMs 経過 → fade out (opacity 0) → 300ms 後次単語 + fade in
 * - unmount で interval を破棄する
 *
 * fake timers で setInterval/setTimeout を制御する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { HeroRotator } from '@/features/landing/components/HeroRotator';
import {
  stubMatchMedia,
  type MatchMediaStub
} from '../test-utils/browserApi';

const WORDS = ['Mods', 'Modpacks', 'Resource Packs'] as const;

describe('HeroRotator', () => {
  let mm: MatchMediaStub;

  beforeEach(() => {
    vi.useFakeTimers();
    mm = stubMatchMedia(false);
  });
  afterEach(() => {
    mm.restore();
    vi.useRealTimers();
  });

  const getSpan = () => screen.getByText(/Mods|Modpacks|Resource Packs/);

  it('初期状態は最初の単語を表示する', () => {
    render(<HeroRotator words={WORDS} />);
    expect(screen.getByText('Mods')).toBeInTheDocument();
    expect(getSpan().style.opacity).toBe('1');
  });

  it('intervalMs 経過で fade out → 300ms 後に次の単語で fade in', () => {
    render(<HeroRotator words={WORDS} intervalMs={1000} />);

    // fade out
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Mods')).toBeInTheDocument();
    expect(getSpan().style.opacity).toBe('0');

    // fade in は 300ms 後 (単語も進む)
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Modpacks')).toBeInTheDocument();
    expect(getSpan().style.opacity).toBe('1');
  });

  it('最後の単語の次は最初に戻る (循環)', () => {
    render(<HeroRotator words={['Alpha', 'Beta']} intervalMs={1000} />);

    // 1 巡目: Alpha fade out → Beta fade in
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Alpha').style.opacity).toBe('0');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Beta').style.opacity).toBe('1');

    // 2 巻目: Beta fade out → Alpha fade in (循環)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Alpha').style.opacity).toBe('1');
  });

  it('reduced-motion では常に最初の単語のままローテーションしない', () => {
    mm.setReducedMotion(true);
    render(<HeroRotator words={WORDS} intervalMs={100} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('Mods')).toBeInTheDocument();
  });

  it('単語 1 個ではローテーションしない', () => {
    render(<HeroRotator words={['Mods']} intervalMs={100} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('Mods')).toBeInTheDocument();
  });

  it('unmount 後は interval が破棄される (timer が残っていない)', () => {
    const { unmount } = render(<HeroRotator words={WORDS} intervalMs={100} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
