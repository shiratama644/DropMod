/**
 * MenuBottomSheet component test (Phase 10.5-B)
 *
 * BottomSheet (共通シート) を内包するため、その依存も mock する:
 *   - usePathname (test-utils/navigation.ts)
 *   - window.matchMedia (test-utils/browserApi.ts)
 *   - anime.js (close アニメが animate().then() を呼ぶため Promise を返す mock)
 *
 * - isOpen=false → 非表示 / true → メニュー 4 項目
 * - ZIP 保存 → onDownloadZip + onClose / ZIP 読込 → onImportZip + onClose
 * - テーマ切替 → onToggleTheme のみ (シートは閉じない)
 * - Escape キー / 背景クリック → onClose (BottomSheet 統合)
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuBottomSheet } from '@/components/layout/MenuBottomSheet';
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
  // BottomSheet の close アニメは animate(...).then() を呼ぶため Promise を返す
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
    theme: 'dark' as const,
    onToggleTheme: vi.fn(),
    onDownloadZip: vi.fn(),
    onImportZip: vi.fn(),
    ...overrides
  };
}

describe('MenuBottomSheet', () => {
  let mm: MatchMediaStub;

  beforeEach(() => {
    animateMock.mockClear();
    navigationMock.reset();
    mm = stubMatchMedia(false);
  });
  // ※ matchMedia stub は afterAll で復帰する:
  //   BottomSheet のアニメ IIFE は await import を挟むため、テスト終了後に
  //   continuation が走ることがある (vitest 4 の dynamic import は後続が
  //   実モジュールを返す競合あり)。stub を都度削除すると unhandled
  //   rejection になるため、ファイル全体で stub を維持する。
  afterAll(() => {
    mm.restore();
  });

  it('isOpen=false では何も描画しない', () => {
    render(<MenuBottomSheet {...makeProps({ isOpen: false })} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('isOpen=true でメニュー 4 項目を描画する', () => {
    render(<MenuBottomSheet {...makeProps()} />);

    expect(screen.getByRole('dialog', { name: 'メニュー' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ZIP 保存/ })).toBeInTheDocument();
    expect(screen.getByText('ZIP 読込')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: 'ライトモード' })).toBeInTheDocument();
  });

  it('theme light では「ダーク」モード切替ボタンになる', () => {
    render(<MenuBottomSheet {...makeProps({ theme: 'light' })} />);
    expect(screen.getByRole('button', { name: 'ダークモード' })).toBeInTheDocument();
  });

  it('ZIP 保存クリックで onDownloadZip → onClose の順に呼ぶ', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<MenuBottomSheet {...props} />);

    await user.click(screen.getByRole('button', { name: /ZIP 保存/ }));
    expect(props.onDownloadZip).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('ZIP 読込の file input 変更で onImportZip → onClose', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    const { container } = render(<MenuBottomSheet {...props} />);

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(['zip'], 'pack.mrpack', { type: 'application/zip' });
    await user.upload(input!, file);
    expect(props.onImportZip).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('テーマ切替は onToggleTheme のみ呼び、シートを閉じない', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<MenuBottomSheet {...props} />);

    await user.click(screen.getByRole('button', { name: 'ライトモード' }));
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('Escape キーで onClose が呼ばれる (BottomSheet 統合)', () => {
    const props = makeProps();
    render(<MenuBottomSheet {...props} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('背景クリックで onClose が呼ばれる (シート内クリックは伝播しない)', () => {
    const props = makeProps();
    render(<MenuBottomSheet {...props} />);

    // シート本体 (role=dialog) のクリックは背景に伝播しない
    const sheet = screen.getByRole('dialog', { name: 'メニュー' });
    fireEvent.click(sheet);
    expect(props.onClose).not.toHaveBeenCalled();

    // 背景 (dialog の親要素) を直接クリックすると close
    const backdrop = sheet.parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Phase 12-B / D-8: フォルダ紐付け済みプロファイルでは ZIP保存 → Sync に置き換える
// ============================================================================

import { useProfilesStore as useProfilesStoreForD8 } from '@/lib/store/profiles';
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

describe('MenuBottomSheet: D-8 ZIP保存 → Sync の置き換え', () => {
  it('未紐付けなら ZIP 保存', () => {
    setLinkedProfile();
    render(<MenuBottomSheet {...makeProps()} />);
    expect(screen.getByText('ZIP 保存')).toBeInTheDocument();
  });

  it('紐付け済みならフォルダへ同期に置き換わる', () => {
    setLinkedProfile(LINKED_D8);
    render(<MenuBottomSheet {...makeProps()} />);
    expect(screen.queryByText('ZIP 保存')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'フォルダへ同期' })).toBeInTheDocument();
  });
});
