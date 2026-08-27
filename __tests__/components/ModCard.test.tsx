/**
 * ModCard component test (Sub-Phase 9-C.4)
 *
 * next/image は Next の内部 loader を経由するので、__tests__ では
 * unoptimized=false でも jsdom 上で <img> にレンダーされる。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
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
    expect(screen.getByText('Performance')).toBeInTheDocument();
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
    expect(screen.getByText('Utility')).toBeInTheDocument();
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

  it('未追加なら「追加」(緑)、追加済なら「削除」(赤) のトグルボタン', () => {
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
          { projectId: 'proj-1', name: 'Sodium', type: 'mod', description: '' }
        ])}
        onToggleMod={vi.fn()}
      />
    );
    const removeButton = screen.getByRole('button', { name: /削除$/ });
    expect(removeButton).toBeInTheDocument();
    // 色も追加 (緑塗り) → 削除 (赤枠) に切り替わる
    expect(removeButton.className).toContain('bg-red-500/20');
    expect(removeButton.className).not.toContain('bg-emerald-600');
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

  it('削除ボタンクリックで削除トグルが発火する', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ModCard
        hit={baseHit}
        profile={makeProfile([
          { projectId: 'proj-1', name: 'Sodium', type: 'mod', description: '' }
        ])}
        onToggleMod={onToggle}
      />
    );
    await user.click(screen.getByRole('button', { name: /削除$/ }));
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

  it('最大レイアウトはヘッダー画像スロットを大きく表示する (h-44/sm:h-60)', () => {
    const { container } = render(
      <ModCard
        hit={{
          ...baseHit,
          featured_gallery: 'https://example.com/banner.png'
        }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
        layout="max"
      />
    );
    const banner = container.querySelector('a')?.firstElementChild;
    expect(banner?.className).toContain('h-44');
    expect(banner?.className).toContain('sm:h-60');
  });

  it('追加済みと未追加でボタン寸法が同一 (h-9 + min-w-[7rem])', () => {
    const { rerender } = render(
      <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={vi.fn()} />
    );
    const addButton = screen.getByRole('button', { name: /追加/ });
    expect(addButton.className).toContain('h-9');
    expect(addButton.className).toContain('min-w-[7rem]');

    rerender(
      <ModCard
        hit={baseHit}
        profile={makeProfile([
          { projectId: 'proj-1', name: 'Sodium', type: 'mod', description: '' }
        ])}
        onToggleMod={vi.fn()}
      />
    );
    const addedButton = screen.getByRole('button', { name: /削除$/ });
    expect(addedButton.className).toContain('h-9');
    expect(addedButton.className).toContain('min-w-[7rem]');
  });

  it('slug 一致でも追加済み判定される', () => {
    render(
      <ModCard
        hit={baseHit}
        profile={makeProfile([
          { projectId: 'other-id', slug: 'sodium', name: 'Sodium', type: 'mod', description: '' }
        ])}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /削除$/ })).toBeInTheDocument();
  });
});

describe('ModCard: モバイル 3 カラム compact カード (Phase 11 UI)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderMobile(layout: '3' | '2' = '3') {
    // max-width: 767px に一致する matchMedia を注入
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      }))
    );
    return render(
      <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={vi.fn()} layout={layout} />
    );
  }

  it('3 カラム + モバイルは compact カード (aspect-square アイコン + 小タイトル)', () => {
    const { container } = renderMobile('3');
    const card = container.querySelector('a');
    // compact カードのクラス (rounded-xl p-1.5)
    expect(card?.className).toContain('rounded-xl');
    expect(card?.className).toContain('p-1.5');
    expect(card?.className).not.toContain('justify-between');
    // アイコン領域は aspect-square
    expect(card?.querySelector('div')?.className).toContain('aspect-square');
    // 標準カードのフッター (カテゴリバッジ) は出さない
    expect(screen.queryByText('Optimization')).toBeNull();
  });

  it('2 カラム + モバイルは標準カードのまま', () => {
    const { container } = renderMobile('2');
    const card = container.querySelector('a');
    expect(card?.className).not.toContain('aspect-square');
    expect(card?.className).toContain('justify-between');
  });

  it('compact カードの 追加 ボタンは全幅・高さ h-7 でトグルが発火する', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      }))
    );
    render(
      <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={onToggle} layout="3" />
    );
    const addButton = screen.getByRole('button', { name: 'プロファイルに追加' });
    expect(addButton.className).toContain('w-full');
    expect(addButton.className).toContain('h-7');
    await user.click(addButton);
    expect(onToggle).toHaveBeenCalledWith('proj-1', expect.anything());
  });

  it('compact カードの追加済みは 削除 ボタン (赤・全幅 h-7) に切り替わる', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      }))
    );
    render(
      <ModCard
        hit={baseHit}
        profile={makeProfile([
          { projectId: 'proj-1', name: 'Sodium', type: 'mod', description: '' }
        ])}
        onToggleMod={vi.fn()}
        layout="3"
      />
    );
    const removeButton = screen.getByRole('button', { name: 'プロファイルから削除' });
    expect(removeButton.className).toContain('w-full');
    expect(removeButton.className).toContain('h-7');
    expect(removeButton.className).toContain('bg-red-500/20');
  });
});
