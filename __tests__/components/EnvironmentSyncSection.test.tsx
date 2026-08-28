/**
 * EnvironmentSyncSection (Phase 12-B / D-9) test
 *
 * 設定ページ「環境との同期」セクションの表示分岐を検証する。
 * 特に **D-1**: Profile の環境とフォルダから検出した環境が不一致のとき、
 * 「Sync できません」を理由付きで出すこと。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnvironmentSyncSection } from '@/components/EnvironmentSyncSection';
import { useProfilesStore } from '@/lib/store/profiles';
import { useConfirmStore } from '@/lib/store/confirm';
import { useEnvironmentLink } from '@/hooks/useEnvironmentLink';
import type { LinkedSource, Profile } from '@/types';

// link.ts は自前のテストを持つため、フックごと差し替えて表示分岐に絞る
vi.mock('@/hooks/useEnvironmentLink', () => ({
  useEnvironmentLink: vi.fn()
}));
const mockUseLink = vi.mocked(useEnvironmentLink);

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'My Pack',
    environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
    mods: [],
    ...overrides
  };
}

function linkedSource(overrides: Partial<LinkedSource> = {}): LinkedSource {
  return {
    kind: 'filesystem',
    rootName: '.minecraft',
    handleId: 'dh-1',
    environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
    contentDirs: { mods: 'mods', resourcepacks: 'resourcepacks' },
    linkedAt: 1_700_000_000_000,
    ...overrides
  };
}

const link = vi.fn(async () => true);
const unlink = vi.fn(async () => true);

describe('EnvironmentSyncSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLink.mockReturnValue({
      supported: true,
      linking: false,
      unlinking: false,
      error: null,
      link,
      unlink,
      dismissError: vi.fn()
    });
    useConfirmStore.setState({ confirm: vi.fn(async () => true) });
    useProfilesStore.setState({
      profiles: [makeProfile()],
      currentProfileId: 'p1',
      hasHydrated: true
    });
  });

  it('非対応ブラウザではフォルダ選択を出さず、理由を案内する', () => {
    mockUseLink.mockReturnValue({
      supported: false,
      linking: false,
      unlinking: false,
      error: null,
      link,
      unlink,
      dismissError: vi.fn()
    });
    render(<EnvironmentSyncSection />);

    expect(screen.getByText(/File System Access API/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /フォルダを選択して紐付ける/ })).toBeNull();
  });

  it('未紐付けなら「フォルダを選択して紐付ける」を表示', () => {
    render(<EnvironmentSyncSection />);

    const button = screen.getByRole('button', { name: /フォルダを選択して紐付ける/ });
    fireEvent.click(button);
    expect(link).toHaveBeenCalledTimes(1);
  });

  it('紐付け済みなら検出した環境とフォルダを表示する', () => {
    useProfilesStore.setState({
      profiles: [makeProfile({ linkedSource: linkedSource() })]
    });
    render(<EnvironmentSyncSection />);

    expect(screen.getByText('紐付け中: .minecraft')).toBeInTheDocument();
    expect(screen.getByText('1.20.1 / Fabric / 0.14.21')).toBeInTheDocument();
    expect(screen.getByText('mods, resourcepacks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /フォルダを選び直す/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /紐付けを解除/ })).toBeInTheDocument();
  });

  it('D-1: 環境が不一致なら role=alert で「Sync できません」と理由を出す', () => {
    useProfilesStore.setState({
      profiles: [
        makeProfile({
          linkedSource: linkedSource({
            environment: { mcVersion: '1.21.4', loader: 'Fabric', loaderVersion: '0.16.0' }
          })
        })
      ]
    });
    render(<EnvironmentSyncSection />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('環境が一致しないため Sync できません');
    expect(alert).toHaveTextContent('Profile「1.20.1」/ 検出「1.21.4」');
    expect(alert).toHaveTextContent('Profile「0.14.21」/ 検出「0.16.0」');
  });

  it('D-1: loader だけ不一致でもブロック表示する', () => {
    useProfilesStore.setState({
      profiles: [
        makeProfile({
          linkedSource: linkedSource({
            environment: { mcVersion: '1.20.1', loader: 'Forge', loaderVersion: '0.14.21' }
          })
        })
      ]
    });
    render(<EnvironmentSyncSection />);
    expect(screen.getByRole('alert')).toHaveTextContent('Profile「Fabric」/ 検出「Forge」');
  });

  it('検出できなかった項目はブロックせず注記する (Generic フォルダ等)', () => {
    useProfilesStore.setState({
      profiles: [makeProfile({ linkedSource: linkedSource({ environment: {} }) })]
    });
    render(<EnvironmentSyncSection />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/はフォルダから検出できなかったため、確認できていません/))
      .toBeInTheDocument();
  });

  it('検出値が完全に一致していれば警告も注記も出さない', () => {
    useProfilesStore.setState({
      profiles: [makeProfile({ linkedSource: linkedSource() })]
    });
    render(<EnvironmentSyncSection />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/確認できていません/)).toBeNull();
  });

  it('解除は確認ダイアログを経てから実行する', async () => {
    useProfilesStore.setState({
      profiles: [makeProfile({ linkedSource: linkedSource() })]
    });
    const confirm = vi.fn(async () => true);
    useConfirmStore.setState({ confirm });
    render(<EnvironmentSyncSection />);

    fireEvent.click(screen.getByRole('button', { name: /紐付けを解除/ }));

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'フォルダの紐付けを解除しますか？', danger: true })
    );
    await waitFor(() => expect(unlink).toHaveBeenCalledTimes(1));
  });

  it('確認ダイアログでキャンセルしたら解除しない', () => {
    useProfilesStore.setState({
      profiles: [makeProfile({ linkedSource: linkedSource() })]
    });
    useConfirmStore.setState({ confirm: vi.fn(async () => false) });
    render(<EnvironmentSyncSection />);

    fireEvent.click(screen.getByRole('button', { name: /紐付けを解除/ }));
    expect(unlink).not.toHaveBeenCalled();
  });

  it('エラーがあれば表示する', () => {
    mockUseLink.mockReturnValue({
      supported: true,
      linking: false,
      unlinking: false,
      error: 'フォルダ選択 API を呼び出せませんでした。',
      link,
      unlink,
      dismissError: vi.fn()
    });
    render(<EnvironmentSyncSection />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('フォルダ選択 API を呼び出せませんでした。');
  });

  it('処理中はボタンを無効化してラベルを変える', () => {
    mockUseLink.mockReturnValue({
      supported: true,
      linking: true,
      unlinking: false,
      error: null,
      link,
      unlink,
      dismissError: vi.fn()
    });
    render(<EnvironmentSyncSection />);

    const button = screen.getByRole('button', { name: /フォルダを選択中/ });
    expect(button).toBeDisabled();
  });
});
