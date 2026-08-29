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
import { useSync } from '@/hooks/useSync';
import { useZipSync } from '@/hooks/useZipSync';
import { useAppActionsStore } from '@/lib/store/appActions';
import type { SyncPlan } from '@/lib/env/diff';
import type { EnvironmentSink } from '@/lib/env/sink';
import type { LinkedSource, Profile } from '@/types';

// link.ts は自前のテストを持つため、フックごと差し替えて表示分岐に絞る
vi.mock('@/hooks/useEnvironmentLink', () => ({
  useEnvironmentLink: vi.fn()
}));
const mockUseLink = vi.mocked(useEnvironmentLink);

// useSync も自前のテストを持つため、ここでは接続 (ボタン → Preview) に絞る
vi.mock('@/hooks/useSync', () => ({ useSync: vi.fn() }));
const mockUseSync = vi.mocked(useSync);

// useZipSync も自前のテストを持つため、ここでは導線の表示/接続に絞る
vi.mock('@/hooks/useZipSync', () => ({ useZipSync: vi.fn() }));
const mockUseZipSync = vi.mocked(useZipSync);
// 引数型を付けないと mock.calls が空タプルになり calls[0][0] を読めない
const exportSyncAsZip = vi.fn(async (_seed?: File) => undefined);

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

const prepareMock = vi.fn();
const applyMock = vi.fn(async () => undefined);
const resetMock = vi.fn();

const EMPTY_PLAN: SyncPlan = {
  profileId: 'p1',
  generatedAt: 1,
  additions: [],
  updates: [],
  deletions: [],
  unchanged: [],
  unmanaged: [],
  totals: {
    counts: { addition: 0, update: 0, deletion: 0, unchanged: 0, unmanaged: 0 },
    writeBytes: 0,
    removeBytes: 0,
    backupBytes: 0
  }
};

function readyOutcome(writable = true) {
  return {
    status: 'ready' as const,
    rootName: '.minecraft',
    check: { ok: true, mismatches: [], unverified: [] },
    plan: EMPTY_PLAN,
    sink: { kind: 'filesystem' } as unknown as EnvironmentSink,
    writable,
    writableReason: writable ? null : '書き込み権限がありません',
    scanSkipped: []
  };
}

describe('EnvironmentSyncSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseZipSync.mockReturnValue({
      running: false,
      error: null,
      result: null,
      exportSyncAsZip,
      dismissError: vi.fn()
    });
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
    mockUseSync.mockReturnValue({
      phase: 'idle',
      outcome: null,
      scanProgress: null,
      applyProgress: null,
      result: null,
      error: null,
      prepare: prepareMock,
      apply: applyMock,
      reset: resetMock
    });
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


// ============================================================================
// Phase 12-B: Sync ボタン → Preview モーダルの接続
// ============================================================================

    describe('EnvironmentSyncSection: Sync ボタン', () => {
    beforeEach(() => {
      useProfilesStore.setState({
        profiles: [makeProfile({ linkedSource: linkedSource() })],
        currentProfileId: 'p1',
        hasHydrated: true
      });
    });

    it('紐付け済みなら「差分を確認して同期」ボタンを出す', () => {
      render(<EnvironmentSyncSection />);
      expect(screen.getByRole('button', { name: '差分を確認して同期' })).toBeInTheDocument();
    });

    it('未紐付けでは Sync ボタンを出さない', () => {
      useProfilesStore.setState({ profiles: [makeProfile()], currentProfileId: 'p1' });
      render(<EnvironmentSyncSection />);
      expect(screen.queryByRole('button', { name: /差分を確認して同期/ })).not.toBeInTheDocument();
    });

    it('クリックで prepare を呼び、ready なら Preview を開く', async () => {
      prepareMock.mockResolvedValue(readyOutcome());
      render(<EnvironmentSyncSection />);

      fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: '同期プレビュー' })).toBeInTheDocument();
      });
      expect(prepareMock).toHaveBeenCalledTimes(1);
    });

    it('**D-1**: blocked-environment では Preview を開かない', async () => {
      prepareMock.mockResolvedValue({
        status: 'blocked-environment',
        rootName: '.minecraft',
        check: { ok: false, mismatches: [], unverified: [], message: '環境が一致しません' }
      });
      render(<EnvironmentSyncSection />);

      fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));

      await waitFor(() => expect(prepareMock).toHaveBeenCalled());
      expect(screen.queryByRole('dialog', { name: '同期プレビュー' })).not.toBeInTheDocument();
    });

    it('prepare が null (プロファイル無し) でも Preview を開かない', async () => {
      prepareMock.mockResolvedValue(null);
      render(<EnvironmentSyncSection />);

      fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));

      await waitFor(() => expect(prepareMock).toHaveBeenCalled());
      expect(screen.queryByRole('dialog', { name: '同期プレビュー' })).not.toBeInTheDocument();
    });

    it('Preview で「同期する」を押すと apply → 閉じる → reset', async () => {
      prepareMock.mockResolvedValue(readyOutcome());
      render(<EnvironmentSyncSection />);

      fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: '同期プレビュー' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /同期する/ }));

      await waitFor(() => {
        expect(applyMock).toHaveBeenCalledWith([]);
        expect(resetMock).toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: '同期プレビュー' })).not.toBeInTheDocument();
      });
    });

    it('Preview をキャンセルすると閉じて reset する', async () => {
      prepareMock.mockResolvedValue(readyOutcome());
      render(<EnvironmentSyncSection />);

      fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: '同期プレビュー' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

      await waitFor(() => {
        expect(resetMock).toHaveBeenCalled();
        expect(applyMock).not.toHaveBeenCalled();
      });
    });

    it('**D-10**: 書き込み権限が無いと ZIP 代替導線を出す', async () => {
    const handleDownloadZip = vi.fn();
    useAppActionsStore.setState({ actions: { handleDownloadZip } } as never);
    prepareMock.mockResolvedValue(readyOutcome(false));

    render(<EnvironmentSyncSection />);
    fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ZIP で書き出す' })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes('読み取り専用'))).toBe(
      true
    );

    fireEvent.click(screen.getByRole('button', { name: 'ZIP で書き出す' }));
    expect(handleDownloadZip).toHaveBeenCalledTimes(1);
  });

  it('**D-10**: 書き込みできる場合は ZIP 代替導線を出さない', async () => {
    prepareMock.mockResolvedValue(readyOutcome(true));
    render(<EnvironmentSyncSection />);
    fireEvent.click(screen.getByRole('button', { name: '差分を確認して同期' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '同期プレビュー' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'ZIP で書き出す' })).not.toBeInTheDocument();
  });

  it('実行中 (running) は Sync ボタンを押せない', () => {
      mockUseSync.mockReturnValue({
        phase: 'running',
        outcome: null,
        scanProgress: null,
        applyProgress: { done: 1, total: 2, path: 'mods/a.jar' },
        result: null,
        error: null,
        prepare: prepareMock,
        apply: applyMock,
        reset: resetMock
      });
      render(<EnvironmentSyncSection />);
      expect(screen.getByRole('button', { name: '差分を確認して同期' })).toBeDisabled();
    });
  });
});

describe('EnvironmentSyncSection: 非対応ブラウザの ZIP 導線 (§10.1 / D-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseZipSync.mockReturnValue({
      running: false,
      error: null,
      result: null,
      exportSyncAsZip,
      dismissError: vi.fn()
    });
    mockUseSync.mockReturnValue({
      state: { status: 'idle', error: null },
      prepare: prepareMock,
      apply: applyMock,
      reset: resetMock
    } as unknown as ReturnType<typeof useSync>);
    useConfirmStore.setState({ confirm: vi.fn(async () => true) });
    useAppActionsStore.setState({
      actions: { handleDownloadZip: vi.fn(async () => undefined) }
    } as never);
  });

  function renderUnsupported(profile: Profile | null = makeProfile()) {
    useProfilesStore.setState({
      profiles: profile ? [profile] : [],
      currentProfileId: profile?.id ?? undefined,
      hasHydrated: true
    });
    mockUseLink.mockReturnValue({
      supported: false,
      linking: false,
      unlinking: false,
      error: null,
      link,
      unlink,
      dismissError: vi.fn()
    });
    return render(<EnvironmentSyncSection />);
  }

  it('非対応ブラウザでは **ZIP に書き出す (Sync)** が出る', () => {
    renderUnsupported();
    expect(screen.getByRole('button', { name: /ZIP に書き出す/ })).toBeInTheDocument();
  });

  it('**対応ブラウザでは出さない** (D-2: 自動で ZipSink に切り替えない)', () => {
    useProfilesStore.setState({
      profiles: [makeProfile()],
      currentProfileId: 'p1',
      hasHydrated: true
    });
    mockUseLink.mockReturnValue({
      supported: true,
      linking: false,
      unlinking: false,
      error: null,
      link,
      unlink,
      dismissError: vi.fn()
    });
    render(<EnvironmentSyncSection />);
    expect(screen.queryByRole('button', { name: /ZIP に書き出す/ })).toBeNull();
  });

  it('ボタンで seed なしの書き出しを呼ぶ', () => {
    renderUnsupported();
    fireEvent.click(screen.getByRole('button', { name: /ZIP に書き出す/ }));
    expect(exportSyncAsZip).toHaveBeenCalledTimes(1);
    expect(exportSyncAsZip.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('既存の .minecraft ZIP を選ぶと **そのファイルを seed として渡す**', () => {
    renderUnsupported();
    const file = new File(['zip'], 'mc.zip', { type: 'application/zip' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(exportSyncAsZip).toHaveBeenCalledTimes(1);
    expect(exportSyncAsZip.mock.calls[0]?.[0]).toBe(file);
  });

  it('**Profile 未選択ならボタンは無効**', () => {
    renderUnsupported(null);
    expect(screen.getByRole('button', { name: /ZIP に書き出す/ })).toBeDisabled();
  });

  it('実行中はラベルが変わり無効になる', () => {
    renderUnsupported();
    mockUseZipSync.mockReturnValue({
      running: true,
      error: null,
      result: null,
      exportSyncAsZip,
      dismissError: vi.fn()
    });
    render(<EnvironmentSyncSection />);
    expect(screen.getByRole('button', { name: /書き出し中/ })).toBeDisabled();
  });

  it('失敗理由を表示する', () => {
    renderUnsupported();
    mockUseZipSync.mockReturnValue({
      running: false,
      error: '環境が一致しません',
      result: null,
      exportSyncAsZip,
      dismissError: vi.fn()
    });
    render(<EnvironmentSyncSection />);
    expect(screen.getByText('環境が一致しません')).toBeInTheDocument();
  });

  it('成功時はファイル名と件数を表示する', () => {
    renderUnsupported();
    mockUseZipSync.mockReturnValue({
      running: false,
      error: null,
      result: { fileName: 'minecraft-sync.zip', bytes: 2048, applied: 3, skipped: 0 },
      exportSyncAsZip,
      dismissError: vi.fn()
    });
    render(<EnvironmentSyncSection />);
    expect(screen.getByText(/minecraft-sync\.zip/)).toBeInTheDocument();
    expect(screen.getByText(/3 件/)).toBeInTheDocument();
  });
});
