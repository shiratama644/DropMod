/**
 * ModCard component test (Sub-Phase 9-C.4)
 *
 * next/image は Next の内部 loader を経由するので、__tests__ では
 * unoptimized=false でも jsdom 上で <img> にレンダーされる。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModCard } from '@/features/catalog/components/ModCard';
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

/** container 内の n 番目の <img> を取得 */
function containerImg(container: HTMLElement, i = 0): HTMLElement {
  const img = container.querySelectorAll('img')[i];
  if (!img) throw new Error(`img[${i}] がありません`);
  return img as HTMLElement;
}

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

  describe('モバイル 2 カラムの作者名省略 (2026-08-27)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const mobileMatchMedia = () =>
      vi.fn((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      }));

    it('モバイル 2 カラムは作者名を省略し DL 数のみ表示', () => {
      vi.stubGlobal('matchMedia', mobileMatchMedia());
      render(
        <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={vi.fn()} layout="2" />
      );
      expect(screen.queryByText('JellySquid')).toBeNull();
      expect(screen.getByText('1.5M')).toBeInTheDocument();
    });

    it('PC (非モバイル) の 2 カラムは作者名も表示', () => {
      render(
        <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={vi.fn()} layout="2" />
      );
      expect(screen.getByText('JellySquid')).toBeInTheDocument();
      expect(screen.getByText('1.5M')).toBeInTheDocument();
    });
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

  it('DL 数が 0 なら「0」を表示', () => {
    render(
      <ModCard
        hit={{ ...baseHit, downloads: 0 }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('DL 数が 1000 以上なら K 表記', () => {
    render(
      <ModCard
        hit={{ ...baseHit, downloads: 2500 }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByText(/2\.5K/)).toBeInTheDocument();
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

  it('icon 読み込み失敗 (onError) で fa-cube にフォールバック', () => {
    const { container } = render(
      <ModCard
        hit={{ ...baseHit, icon_url: 'https://example.com/icon.png' }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    fireEvent.error(screen.getByAltText('Sodium'));
    expect(container.querySelector('.fa-cube')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('author が空なら「Modrinth」を表示', () => {
    render(
      <ModCard
        hit={{ ...baseHit, author: '' }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByText('Modrinth')).toBeInTheDocument();
  });

  it('description が空なら「説明はありません。」を表示', () => {
    render(
      <ModCard
        hit={{ ...baseHit, description: '' }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
      />
    );
    expect(screen.getByText('説明はありません。')).toBeInTheDocument();
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

  it('max レイアウトは banner 読み込み失敗でアイコン表示にフォールバック', () => {
    const { container } = render(
      <ModCard
        hit={{
          ...baseHit,
          featured_gallery: 'https://example.com/banner.png',
          icon_url: 'https://example.com/icon.png'
        }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
        layout="max"
      />
    );
    // 最初の <img> はバナー (alt="")
    fireEvent.error(containerImg(container, 0));
    // フォールバックでアイコン (alt=Sodium) が出る
    expect(screen.getByAltText('Sodium')).toBeInTheDocument();
  });

  it('max レイアウトは featured_gallery が無ければアイコンを大きく表示', () => {
    render(
      <ModCard
        hit={{ ...baseHit, icon_url: 'https://example.com/icon.png' }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
        layout="max"
      />
    );
    expect(screen.getByAltText('Sodium')).toBeInTheDocument();
  });

  it('max レイアウトは banner も icon も無ければ fa-image プレースホルダー', () => {
    const { container } = render(
      <ModCard hit={baseHit} profile={makeProfile()} onToggleMod={vi.fn()} layout="max" />
    );
    expect(container.querySelector('.fa-image')).not.toBeNull();
  });

  it('max レイアウトは banner と icon の両方が失敗したら fa-image', () => {
    const { container } = render(
      <ModCard
        hit={{
          ...baseHit,
          featured_gallery: 'https://example.com/banner.png',
          icon_url: 'https://example.com/icon.png'
        }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
        layout="max"
      />
    );
    fireEvent.error(containerImg(container, 0)); // banner 失敗 → アイコン表示
    fireEvent.error(container.querySelector('img') as HTMLElement); // アイコンも失敗
    expect(container.querySelector('.fa-image')).not.toBeNull();
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

  it('compact カードは icon_url なしなら fa-cube プレースホルダー', () => {
    const { container } = renderMobile('3');
    expect(container.querySelector('.fa-cube')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('compact カードは icon 読み込み失敗で fa-cube にフォールバック', () => {
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
    const { container } = render(
      <ModCard
        hit={{ ...baseHit, icon_url: 'https://example.com/icon.png' }}
        profile={makeProfile()}
        onToggleMod={vi.fn()}
        layout="3"
      />
    );
    fireEvent.error(containerImg(container, 0));
    expect(container.querySelector('.fa-cube')).not.toBeNull();
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
