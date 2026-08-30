/**
 * PopularMarquee component test (Phase 10.5-B)
 *
 * - hits 空 → null (何も描画しない)
 * - 同一リストを front/back の 2 回 render (無限ループの継ぎ目回避)
 * - reduced-motion では animation inline style を付けない
 * - 通常時は marquee-scroll アニメを durationSec 付きで指定
 *
 * usePrefersReducedMotion が window.matchMedia を呼ぶため
 * browserApi.ts の stubMatchMedia が必須。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PopularMarquee } from '@/features/landing/components/PopularMarquee';
import type { ModrinthHit } from '@/types';
import {
  stubMatchMedia,
  type MatchMediaStub
} from '../test-utils/browserApi';

const baseHit: ModrinthHit = {
  project_id: 'proj-1',
  slug: 'sodium',
  title: 'Sodium',
  description: 'Fast rendering',
  icon_url: null,
  author: 'JellySquid',
  categories: ['performance'],
  display_categories: ['performance'],
  versions: ['1.20.1'],
  downloads: 1_500_000,
  project_type: 'mod'
};

describe('PopularMarquee', () => {
  let mm: MatchMediaStub;

  beforeEach(() => {
    mm = stubMatchMedia(false);
  });
  afterEach(() => {
    mm.restore();
  });

  it('hits が空なら何も描画しない', () => {
    const { container } = render(<PopularMarquee hits={[]} />);
    expect(container.firstElementChild).toBeNull();
  });

  it('各ヒットを front/back の 2 回ずつ描画し、詳細ページへのリンクになる', () => {
    const { container } = render(
      <PopularMarquee hits={[baseHit, { ...baseHit, project_id: 'proj-2', slug: 'iris', title: 'Iris' }]} />
    );

    // Sodium と Iris がそれぞれ 2 回 (front + back)
    expect(screen.getAllByText('Sodium')).toHaveLength(2);
    expect(screen.getAllByText('Iris')).toHaveLength(2);

    // リンクは 4 本 (2 hits × 2 周)、いずれも詳細ページへ
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    const hrefs = links.map((a) => a.getAttribute('href'));
    expect(hrefs.filter((h) => h === '/mod/sodium')).toHaveLength(2);
    expect(hrefs.filter((h) => h === '/mod/iris')).toHaveLength(2);

    // track (アニメ対象) は 1 つ
    expect(container.querySelectorAll('.marquee-track')).toHaveLength(1);
    // aria-label の region
    expect(screen.getByRole('region', { name: '新着の Mod' })).toBeInTheDocument();
  });

  it('通常時は marquee アニメの inline style を指定する (durationSec 反映)', () => {
    const { container } = render(<PopularMarquee hits={[baseHit]} durationSec={25} />);
    const track = container.querySelector<HTMLElement>('.marquee-track');
    expect(track).not.toBeNull();
    expect(track?.style.animation).toBe('marquee-scroll 25s linear infinite');
  });

  it('reduced-motion では animation inline style を付けない', () => {
    mm.setReducedMotion(true);
    const { container } = render(<PopularMarquee hits={[baseHit]} />);
    const track = container.querySelector<HTMLElement>('.marquee-track');
    expect(track).not.toBeNull();
    expect(track?.style.animation).toBe('');
  });

  it('icon_url があれば各カードに <img> を描画する', () => {
    const { container } = render(
      <PopularMarquee
        hits={[{ ...baseHit, icon_url: 'https://cdn.modrinth.com/icons/sodium.png' }]}
      />
    );
    // front + back の 2 枚 (alt="" の img は role を持たないため querySelector で数える)
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });
});
