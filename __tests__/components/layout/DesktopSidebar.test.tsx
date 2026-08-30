/**
 * DesktopSidebar component test (Phase 10.5-B)
 *
 * - ロゴ + 4 ナビ項目 (href / aria-current / onSwitchTab)
 * - 'mods' の active 判定は pathname ベース (/discover/* と /<型>/<slug>) +
 *   activeTab フォールバック
 * - Mod 数 badge (0 → 非表示 / 999+ クランプ / NaN ガード)
 * - プロファイル切替 dropdown (名称未設定フォールバック含む) と各アクション
 *
 * usePathname は test-utils/navigation.ts の mock を使用。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import type { Profile, TabName, ThemeMode } from '@/types';
import { navigationMock } from '@/__tests__/test-utils/navigation';

vi.mock('next/navigation', async () => {
  const { nextNavigationModuleMock } = await import('@/__tests__/test-utils/navigation');
  return nextNavigationModuleMock();
});

const profileA: Profile = {
  id: 'p1',
  name: '1.20.1 Fabric 軽量化',
  environment: { mcVersion: '1.20.1', loader: 'Fabric' },
  description: '',
  mods: []
};
const profileB: Profile = { ...profileA, id: 'p2', name: '1.21 NeoForge' };

function makeProps(overrides: Partial<Parameters<typeof DesktopSidebar>[0]> = {}) {
  return {
    activeTab: 'home' as TabName,
    onSwitchTab: vi.fn(),
    modCount: 0,
    hasDepWarning: false,
    theme: 'dark' as ThemeMode,
    onToggleTheme: vi.fn(),
    profiles: [profileA, profileB],
    currentProfileId: 'p1',
    onSwitchProfile: vi.fn(),
    onOpenNewProfileModal: vi.fn(),
    onRunDependencyCheck: vi.fn(),
    onDownloadZip: vi.fn(),
    onImportZip: vi.fn(),
    ...overrides
  };
}

/** href でナビリンクを取得 (ロゴとの重複を避けるため name は使わない) */
function navLinkByHref(href: string): HTMLElement {
  const all = screen.getAllByRole('link');
  const match = all.filter((a) => a.getAttribute('href') === href);
  expect(match.length).toBeGreaterThanOrEqual(1);
  return match[0]!;
}

describe('DesktopSidebar', () => {
  beforeEach(() => {
    navigationMock.reset();
  });
  afterEach(() => {
    navigationMock.reset();
  });

  it('ロゴと 4 つのナビ項目を表示する', () => {
    render(<DesktopSidebar {...makeProps()} />);

    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveAttribute('href', '/');
    expect(navLinkByHref('/discover/mods').textContent).toContain('探す');
    expect(navLinkByHref('/profile').textContent).toContain('現在のMod');
    expect(navLinkByHref('/settings').textContent).toContain('設定');
    expect(screen.getByRole('complementary', { name: 'サイドナビゲーション' })).toBeInTheDocument();
  });

  it('activeTab に一致する項目だけ aria-current="page" を持つ', () => {
    render(<DesktopSidebar {...makeProps({ activeTab: 'settings' })} />);
    expect(navLinkByHref('/settings')).toHaveAttribute('aria-current', 'page');
    expect(navLinkByHref('/profile')).not.toHaveAttribute('aria-current');
    expect(navLinkByHref('/discover/mods')).not.toHaveAttribute('aria-current');
  });

  it('pathname が /discover/* のとき「探す」が active (activeTab に関係なく)', () => {
    navigationMock.setPathname('/discover/mods');
    render(<DesktopSidebar {...makeProps({ activeTab: 'home' })} />);
    expect(navLinkByHref('/discover/mods')).toHaveAttribute('aria-current', 'page');
    expect(navLinkByHref('/')).not.toHaveAttribute('aria-current');
  });

  it('pathname が詳細ページ (/<型>/<slug>) のときも「探す」が active', () => {
    navigationMock.setPathname('/mod/sodium');
    const { rerender } = render(<DesktopSidebar {...makeProps({ activeTab: 'home' })} />);
    expect(navLinkByHref('/discover/mods')).toHaveAttribute('aria-current', 'page');

    rerender(<DesktopSidebar {...makeProps({ activeTab: 'home' })} />);
    navigationMock.setPathname('/shader/complementary-reimagined');
    rerender(<DesktopSidebar {...makeProps({ activeTab: 'home' })} />);
    expect(navLinkByHref('/discover/mods')).toHaveAttribute('aria-current', 'page');
  });

  it('pathname が無関係なら activeTab="mods" のフォールバックで「探す」が active', () => {
    navigationMock.setPathname('/');
    render(<DesktopSidebar {...makeProps({ activeTab: 'mods' })} />);
    expect(navLinkByHref('/discover/mods')).toHaveAttribute('aria-current', 'page');
  });

  it('Mod 数 badge: 0 → 非表示 / 5 → 表示 / 1500 → 999+ / NaN → 0 扱い', () => {
    const { rerender } = render(<DesktopSidebar {...makeProps({ modCount: 0 })} />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<DesktopSidebar {...makeProps({ modCount: 5 })} />);
    expect(screen.getByRole('status')).toHaveTextContent('5');
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '5個のMod選択中');

    rerender(<DesktopSidebar {...makeProps({ modCount: 1500 })} />);
    expect(screen.getByRole('status')).toHaveTextContent('999+');

    rerender(<DesktopSidebar {...makeProps({ modCount: Number.NaN })} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hasDepWarning で「現在のMod」と「依存チェック」に警告 badge を出す', () => {
    render(<DesktopSidebar {...makeProps({ modCount: 3, hasDepWarning: true })} />);
    expect(screen.getAllByLabelText('警告あり')).toHaveLength(2);
  });

  it('プロファイル切替 dropdown: 選択中プロファイル名を表示し、切替で onSwitchProfile', async () => {
    const user = userEvent.setup();
    const onSwitchProfile = vi.fn();
    render(<DesktopSidebar {...makeProps({ onSwitchProfile })} />);

    const trigger = screen.getByRole('combobox', { name: 'プロファイル切り替え' });
    expect(trigger).toHaveTextContent('1.20.1 Fabric 軽量化');

    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: '1.21 NeoForge' }));
    expect(onSwitchProfile).toHaveBeenCalledWith('p2');
  });

  it('プロファイル名が空のものは「名称未設定」/ 非 array は空リストとして扱う', () => {
    const { rerender } = render(
      <DesktopSidebar
        {...makeProps({
          profiles: [{ ...profileA, name: '' }],
          currentProfileId: 'p1'
        })}
      />
    );
    expect(screen.getByRole('combobox', { name: 'プロファイル切り替え' })).toHaveTextContent(
      '名称未設定'
    );

    // profiles が null の場合 (型外だが実行時ガード) は空リスト扱いで落ちない
    rerender(
      <DesktopSidebar
        {...makeProps({ profiles: null as unknown as Profile[], currentProfileId: 'p1' })}
      />
    );
    expect(screen.getByRole('combobox', { name: 'プロファイル切り替え' })).toBeInTheDocument();
  });

  it('ナビリンククリックで onSwitchTab が呼ばれる', async () => {
    const user = userEvent.setup();
    const onSwitchTab = vi.fn();
    render(<DesktopSidebar {...makeProps({ onSwitchTab })} />);

    await user.click(navLinkByHref('/discover/mods'));
    expect(onSwitchTab).toHaveBeenCalledWith('mods');

    await user.click(screen.getByRole('link', { name: 'ホームへ' }));
    expect(onSwitchTab).toHaveBeenCalledWith('home');
  });

  it('各アクションボタンが対応する callback を呼ぶ', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<DesktopSidebar {...props} />);

    await user.click(screen.getByRole('button', { name: 'ZIP 保存 (全.jar)' }));
    expect(props.onDownloadZip).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '依存・競合チェック' }));
    expect(props.onRunDependencyCheck).toHaveBeenCalledTimes(1);

    // theme dark → 「ライトモード」ラベルのボタン
    await user.click(screen.getByRole('button', { name: 'ライトモード' }));
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '新規プロファイル作成' }));
    expect(props.onOpenNewProfileModal).toHaveBeenCalledTimes(1);
  });

  it('theme light では「ダークモード」切替ボタンになる', () => {
    render(<DesktopSidebar {...makeProps({ theme: 'light' })} />);
    expect(screen.getByRole('button', { name: 'ダークモード' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ライトモード' })).toBeNull();
  });

  it('ZIP 読込の file input 変更で onImportZip が呼ばれる', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    const { container } = render(<DesktopSidebar {...props} />);

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('accept', '.zip,.mrpack,application/zip');

    const file = new File(['zip'], 'pack.zip', { type: 'application/zip' });
    await user.upload(input!, file);
    expect(props.onImportZip).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Phase 12-B / D-8: フォルダ紐付け済みプロファイルでは ZIP保存 → Sync に置き換える
// ============================================================================

import { useProfilesStore as useProfilesStoreForD8 } from '@/features/profiles';
import type { LinkedSource as LinkedSourceD8 } from '@/types';

const LINKED_D8: LinkedSourceD8 = {
  kind: 'filesystem',
  rootName: '.minecraft',
  handleId: 'dh-1',
  environment: { mcVersion: '1.20.1', loader: 'Fabric' },
  contentDirs: { mods: 'mods' },
  linkedAt: 1
};

function setLinkedProfile(linkedSource?: LinkedSourceD8) {
  useProfilesStoreForD8.setState({
    profiles: [
      {
        id: 'p1',
        name: 'P1',
        environment: { mcVersion: '1.20.1', loader: 'Fabric' },
        mods: [],
        ...(linkedSource ? { linkedSource } : {})
      }
    ],
    currentProfileId: 'p1',
    hasHydrated: true
  });
}

describe('DesktopSidebar: D-8 ZIP保存 → Sync の置き換え', () => {
  it('未紐付けなら ZIP 保存', () => {
    setLinkedProfile();
    render(<DesktopSidebar {...makeProps()} />);
    expect(screen.getByText('ZIP 保存 (全.jar)')).toBeInTheDocument();
  });

  it('紐付け済みならフォルダへ同期に置き換わる', () => {
    setLinkedProfile(LINKED_D8);
    render(<DesktopSidebar {...makeProps()} />);
    expect(screen.queryByText('ZIP 保存 (全.jar)')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'フォルダへ同期 (全.jar)' })
    ).toBeInTheDocument();
  });
});
