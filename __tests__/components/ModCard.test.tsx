/**
 * ModCard component test (Sub-Phase 9-C.4)
 *
 * next/image は Next の内部 loader を経由するので、__tests__ では
 * unoptimized=false でも jsdom 上で <img> にレンダーされる。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModCard } from '@/components/ModCard';
import type { ModrinthHit, Profile } from '@/types';

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

function makeProfile(mods: Profile['mods'] = []): Profile {
  return {
    id: 'p1',
    name: 'Test',
    mcVersion: '1.20.1',
    loader: 'Fabric',
    description: '',
    mods
  };
}

describe('ModCard', () => {
  it('タイトル・作者・カテゴリを表示する', () => {
    render(
      <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={vi.fn()} />
    );
    expect(screen.getByText('Sodium')).toBeInTheDocument();
    expect(screen.getByText('JellySquid')).toBeInTheDocument();
    expect(screen.getByText('軽量化')).toBeInTheDocument();
  });

  it('追加ボタン左はローダーではなくカテゴリーを出す', () => {
    render(
      <ModCard
        hit={{
          ...baseHit,
          categories: ['fabric', 'utility'],
          display_categories: ['fabric']
        }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByText('ユーティリティ')).toBeInTheDocument();
    expect(screen.queryByText('fabric')).not.toBeInTheDocument();
  });

  it('DL 数を K/M 単位でフォーマットする', () => {
    render(
      <ModCard
        hit={{ ...baseHit, downloads: 1_500_000 }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByText(/1\.5M/)).toBeInTheDocument();
  });

  it('DL 数が 1000 未満はそのまま数字', () => {
    render(
      <ModCard
        hit={{ ...baseHit, downloads: 42 }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('icon_url なしなら fa-cube プレースホルダーを表示', () => {
    const { container } = render(
      <ModCard
        hit={{ ...baseHit, icon_url: null }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    expect(container.querySelector('.fa-cube')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('icon_url あれば next/image で <img> が描画される', () => {
    render(
      <ModCard
        hit={{ ...baseHit, icon_url: 'https://example.com/icon.png' }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    const img = screen.getByAltText('Sodium');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });

  it('未追加なら「追加」ボタン、追加済なら「追加済み」ボタン', () => {
    // 未追加
    const { rerender } = render(
      <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /追加$/ })).toBeInTheDocument();

    // 追加済
    rerender(
      <ModCard
        hit={baseHit}
        profile={makeProfile([
          { id: 'proj-1', title: 'Sodium', description: '' }
        ])}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /追加済み/ })).toBeInTheDocument();
  });

  it('追加ボタンクリックで onToggleMod(project_id) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={onToggle} />
    );
    await user.click(screen.getByRole('button', { name: /追加$/ }));
    expect(onToggle).toHaveBeenCalledWith('proj-1', expect.anything());
  });

  it('追加済みボタンクリックで削除トグルが発火する', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ModCard
        hit={baseHit}
        profile={makeProfile([
          { id: 'proj-1', title: 'Sodium', description: '' }
        ])}
        onToggleMod={onToggle}
      />
    );
    await user.click(screen.getByRole('button', { name: /追加済み/ }));
    expect(onToggle).toHaveBeenCalledWith('proj-1', expect.anything());
  });

  it('Link href はモーダル URL /discover/mods/{slug} (ルーティング再設計)', () => {
    render(
      <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={vi.fn()} />
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/discover/mods/sodium');
  });

  it('slug 無しなら /discover/mods/{project_id} で fallback', () => {
    render(
      <ModCard
        hit={{ ...baseHit, slug: '' as unknown as string }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/discover/mods/proj-1');
  });

  it('自動レイアウトで横長バナーは sm:col-span-2 を付ける', () => {
    const { container } = render(
      <ModCard
        hit={{
          ...baseHit,
          description: 'x'.repeat(200),
          featured_gallery: 'https://example.com/banner.png'
        }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
        layout="auto"
      />
    );
    expect(container.querySelector('a')?.className).toContain('sm:col-span-2');
  });

  it('slug 一致でも追加済み判定される', () => {
    render(
      <ModCard
        hit={baseHit}
        profile={makeProfile([
          { id: 'other-id', slug: 'sodium', title: 'Sodium', description: '' }
        ])}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /追加済み/ })).toBeInTheDocument();
  });
});
