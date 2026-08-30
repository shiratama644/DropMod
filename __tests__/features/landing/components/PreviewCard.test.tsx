/**
 * PreviewCard component test (Phase 10.5-B)
 *
 * LP 用の読み取り専用 Mod カード。formatDownloads の 4 分岐
 * (0 / 1M+ / 1K+ / そのまま) と icon なしプレースホルダを検証。
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewCard } from '@/features/landing/components/PreviewCard';
import type { ModrinthHit } from '@/types';

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

describe('PreviewCard', () => {
  it('タイトル・作者・説明を表示し、詳細ページ (/mod/slug) へのリンクになる', () => {
    render(<PreviewCard hit={baseHit} />);
    const link = screen.getByRole('link', { name: /Sodium/ });
    expect(link).toHaveAttribute('href', '/mod/sodium');
    expect(screen.getByText('Sodium')).toBeInTheDocument();
    expect(screen.getByText('by JellySquid')).toBeInTheDocument();
    expect(screen.getByText('Fast rendering')).toBeInTheDocument();
    expect(screen.getByText('詳細 →')).toBeInTheDocument();
  });

  it('DL 数を M / K 単位でフォーマットする', () => {
    const { rerender } = render(<PreviewCard hit={{ ...baseHit, downloads: 1_500_000 }} />);
    expect(screen.getByText('1.5M')).toBeInTheDocument();

    rerender(<PreviewCard hit={{ ...baseHit, downloads: 12_300 }} />);
    expect(screen.getByText('12.3K')).toBeInTheDocument();

    rerender(<PreviewCard hit={{ ...baseHit, downloads: 42 }} />);
    expect(screen.getByText('42')).toBeInTheDocument();

    rerender(<PreviewCard hit={{ ...baseHit, downloads: 0 }} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('icon_url があれば <img> を描画する', () => {
    const { container } = render(
      <PreviewCard hit={{ ...baseHit, icon_url: 'https://cdn.modrinth.com/icons/sodium.png' }} />
    );
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('.fa-cube')).toBeNull();
  });

  it('icon_url なしなら fa-cube プレースホルダー', () => {
    const { container } = render(<PreviewCard hit={baseHit} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.fa-cube')).not.toBeNull();
  });

  it('説明が空なら <p> を描画しない', () => {
    const { container } = render(<PreviewCard hit={{ ...baseHit, description: '' }} />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('slug が空なら project_id を詳細 URL に使う / project_type は resourcepack にも対応', () => {
    render(
      <PreviewCard hit={{ ...baseHit, slug: '', project_type: 'resourcepack' }} />
    );
    expect(screen.getByRole('link', { name: /Sodium/ })).toHaveAttribute(
      'href',
      '/resourcepack/proj-1'
    );
  });

  it('タイトル・作者が空ならフォールバック表示', () => {
    render(
      <PreviewCard hit={{ ...baseHit, title: '', author: '' }} />
    );
    expect(screen.getByText('(名称未設定)')).toBeInTheDocument();
    expect(screen.getByText('by Modrinth')).toBeInTheDocument();
  });
});
