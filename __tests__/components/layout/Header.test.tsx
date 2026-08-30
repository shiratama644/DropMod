/**
 * Header component test (Sub-Phase 9-C.4)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/layout/Header';
import type { Profile, ThemeMode } from '@/types';

const profiles: Profile[] = [
  {
    id: 'p1',
    name: 'Fabric 1.20',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    description: '',
    mods: []
  },
  {
    id: 'p2',
    name: 'Forge 1.21',
    environment: { mcVersion: '1.21.1', loader: 'Forge' },
    description: '',
    mods: []
  }
];

function renderHeader(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  const props: React.ComponentProps<typeof Header> = {
    theme: 'dark' as ThemeMode,
    onToggleTheme: vi.fn(),
    profiles,
    currentProfileId: 'p1',
    onSwitchProfile: vi.fn(),
    onOpenNewProfileModal: vi.fn(),
    onRunDependencyCheck: vi.fn(),
    onDownloadZip: vi.fn(),
    onImportZip: vi.fn(),
    onSwitchTab: vi.fn(),
    hasDepWarning: false,
    ...overrides
  };
  return { ...render(<Header {...props} />), props };
}

describe('Header', () => {
  it('ロゴ「DropMod」を表示', () => {
    renderHeader();
    expect(screen.getByText('DropMod')).toBeInTheDocument();
  });

  it('テーマトグル: id=header-theme-toggle でクリック可能', async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();
    const btn = document.getElementById('header-theme-toggle');
    expect(btn).not.toBeNull();
    await user.click(btn!);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('theme=dark なら fa-moon、light なら fa-sun', () => {
    const { rerender, container } = render(
      <Header
        theme="dark"
        onToggleTheme={vi.fn()}
        profiles={profiles}
        currentProfileId="p1"
        onSwitchProfile={vi.fn()}
        onOpenNewProfileModal={vi.fn()}
        onRunDependencyCheck={vi.fn()}
        onDownloadZip={vi.fn()}
        onImportZip={vi.fn()}
        onSwitchTab={vi.fn()}
        hasDepWarning={false}
      />
    );
    expect(container.querySelector('#header-theme-icon.fa-moon')).not.toBeNull();
    rerender(
      <Header
        theme="light"
        onToggleTheme={vi.fn()}
        profiles={profiles}
        currentProfileId="p1"
        onSwitchProfile={vi.fn()}
        onOpenNewProfileModal={vi.fn()}
        onRunDependencyCheck={vi.fn()}
        onDownloadZip={vi.fn()}
        onImportZip={vi.fn()}
        onSwitchTab={vi.fn()}
        hasDepWarning={false}
      />
    );
    expect(container.querySelector('#header-theme-icon.fa-sun')).not.toBeNull();
  });

  it('プロファイル dropdown で切替 → onSwitchProfile', async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();
    await user.click(screen.getByRole('combobox', { name: 'プロファイル切り替え' }));
    await user.click(screen.getByRole('option', { name: 'Forge 1.21' }));
    expect(props.onSwitchProfile).toHaveBeenCalledWith('p2');
  });

  it('「新規プロファイル作成」ボタンで onOpenNewProfileModal', async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();
    await user.click(screen.getByRole('button', { name: '新規プロファイル作成' }));
    expect(props.onOpenNewProfileModal).toHaveBeenCalledTimes(1);
  });

  it('「依存・競合チェック」ボタン (Mobile/Desktop 両方) で onRunDependencyCheck', async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();
    // Mobile: aria-label=依存・競合チェック, Desktop: <span>依存・競合チェック</span>
    // → 両方が role=button で「依存・競合チェック」を accessibleName に持つ
    const btns = screen.getAllByRole('button', { name: /依存・競合チェック/ });
    expect(btns.length).toBe(2);
    await user.click(btns[0]!);
    expect(props.onRunDependencyCheck).toHaveBeenCalledTimes(1);
    await user.click(btns[1]!);
    expect(props.onRunDependencyCheck).toHaveBeenCalledTimes(2);
  });

  it('「ZIP保存 (全.jar)」ボタンで onDownloadZip', async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();
    // 「ZIP保存 (全.jar)」で 1 意特定 (mobile は aria-label='ZIP保存')
    await user.click(screen.getByRole('button', { name: 'ZIP保存 (全.jar)' }));
    expect(props.onDownloadZip).toHaveBeenCalledTimes(1);
  });

  it('hasDepWarning=true なら警告バッジ (赤丸) が現れる', () => {
    const { container } = renderHeader({ hasDepWarning: true });
    // ring-2 ring-white で装飾された赤丸
    const badges = container.querySelectorAll('.bg-red-500.rounded-full');
    // Mobile と Desktop の 2 箇所に表示
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('hasDepWarning=false なら赤バッジは無い', () => {
    const { container } = renderHeader({ hasDepWarning: false });
    const badges = container.querySelectorAll('.bg-red-500.rounded-full');
    expect(badges.length).toBe(0);
  });

  it('ロゴクリックで onSwitchTab("home") + Link 遷移', async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();
    await user.click(screen.getByRole('link', { name: /ホーム画面へ移動/ }));
    expect(props.onSwitchTab).toHaveBeenCalledWith('home');
  });

  it('ZIP 読込 <input type="file"> の change で onImportZip', async () => {
    const { props, container } = renderHeader();
    const fileInputs = container.querySelectorAll('input[type="file"]');
    // Mobile と Desktop 版で 2 つある
    expect(fileInputs.length).toBeGreaterThanOrEqual(1);
    const input = fileInputs[0] as HTMLInputElement;
    const file = new File(['x'], 'test.zip', { type: 'application/zip' });
    const user = userEvent.setup();
    await user.upload(input, file);
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

describe('Header: D-8 ZIP保存 → Sync の置き換え', () => {
  it('未紐付けなら ZIP保存 (モバイル / デスクトップ)', () => {
    setLinkedProfile();
    renderHeader();
    expect(screen.getByRole('button', { name: 'ZIP保存' })).toBeInTheDocument();
    expect(screen.getByText('ZIP保存 (全.jar)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'フォルダへ同期' })).not.toBeInTheDocument();
  });

  it('紐付け済みなら Sync に置き換わる (プロファイルごと)', () => {
    setLinkedProfile(LINKED_D8);
    renderHeader();
    expect(screen.getByRole('button', { name: 'フォルダへ同期' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'フォルダへ同期 (全.jar)' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ZIP保存' })).not.toBeInTheDocument();
    expect(screen.queryByText('ZIP保存 (全.jar)')).not.toBeInTheDocument();
  });
});
