/**
 * BrowseBottomSheet component test (Phase 10.5-B)
 *
 * 「探す」シート。4 カテゴリが /discover/<複数形> へのリンクとして並ぶ。
 * BottomSheet を内包するため MenuBottomSheet と同じ mock 構成。
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowseBottomSheet } from '@/components/BrowseBottomSheet';
import { navigationMock } from '../test-utils/navigation';
import {
  stubMatchMedia,
  type MatchMediaStub
} from '../test-utils/browserApi';

vi.mock('next/navigation', async () => {
  const { nextNavigationModuleMock } = await import('../test-utils/navigation');
  return nextNavigationModuleMock();
});

const { animateMock } = vi.hoisted(() => ({
  animateMock: vi.fn<
    (targets: Element | object, params: Record<string, unknown>) => Promise<void>
  >(() => Promise.resolve())
}));

vi.mock('animejs', () => ({ animate: animateMock }));

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onCloseAnimationComplete: vi.fn(),
    ...overrides
  };
}

describe('BrowseBottomSheet', () => {
  let mm: MatchMediaStub;

  beforeEach(() => {
    animateMock.mockClear();
    navigationMock.reset();
    mm = stubMatchMedia(false);
  });
  // ※ MenuBottomSheet.test.tsx と同様に matchMedia stub は afterAll で復帰
  //   (テスト終了後のアニメ IIFE continuation 対策)
  afterAll(() => {
    mm.restore();
  });

  it('isOpen=false では何も描画しない', () => {
    render(<BrowseBottomSheet {...makeProps({ isOpen: false })} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('4 カテゴリを /discover/<複数形> へのリンクとして描画する', () => {
    render(<BrowseBottomSheet {...makeProps()} />);

    expect(screen.getByRole('dialog', { name: 'カテゴリを選択' })).toBeInTheDocument();

    const expected: Array<[string, string]> = [
      ['Mods', '/discover/mods'],
      ['Modpacks', '/discover/modpacks'],
      ['Resource Packs', '/discover/resourcepacks'],
      ['Shaders', '/discover/shaders']
    ];
    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });
});
