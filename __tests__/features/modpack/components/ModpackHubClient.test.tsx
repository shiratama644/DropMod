/**
 * ModpackHubClient (Phase 12-C / §10.6) test
 *
 * Dexie は実物 (fake-indexeddb)。更新チェックの Provider はモック。
 *
 * 検証の中心は 2 つ:
 * 1. **Modpack は Profile の Source** — 由来が無い Profile では導入方法を出す
 * 2. **D-6 紐付け解除** — `modpack` → `import` に昇格し、ファイルは消えない
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModpackHubClient } from '@/features/modpack/components/ModpackHubClient';
import { checkModpackUpdates } from '@/features/modpack/modpackUpdate';
import type { ModpackUpdateReport } from '@/features/modpack/modpackUpdate';
import { useProfilesStore } from '@/features/profiles';
import { useConfirmStore } from '@/components/feedback/confirmStore';
import { useToastStore } from '@/components/feedback/toastStore';
import { _clearAllForTesting } from '@/lib/db/dexie';
import { getManagedFiles, syncManagedFiles } from '@/features/sync';
import type { ManagedFileRecord, Profile } from '@/types';
import type { ConfirmDialogOptions } from '@/components/feedback/ConfirmDialog';

// `checkModpackUpdates` だけ差し替える。**`updateIssueFromReport` は実物を使う**ので
// importOriginal で透過させる (モックに含め忘れると描画時に undefined 呼び出しで落ちる)。
vi.mock('@/features/modpack/modpackUpdate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/modpack/modpackUpdate')>();
  return { ...actual, checkModpackUpdates: vi.fn() };
});
const mockCheck = vi.mocked(checkModpackUpdates);

function managed(overrides: Partial<ManagedFileRecord> = {}): ManagedFileRecord {
  return {
    id: 'f1',
    profileId: 'p1',
    category: 'mod',
    path: 'mods/a.jar',
    sha1: 'a'.repeat(40),
    size: 3,
    source: 'modpack',
    projectId: 'proj-1',
    managedAt: 1_700_000_000_000,
    ...overrides
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'CF Pack (インポート)',
    mods: [],
    environment: { mcVersion: '1.21.1', loader: 'Fabric', loaderVersion: '0.16.0' },
    modpackSource: {
      provider: 'modrinth',
      name: 'CF Pack',
      versionId: 'v1',
      versionNumber: '1.0',
      importedAt: 1_700_000_000_000
    },
    ...overrides
  };
}

function report(overrides: Partial<ModpackUpdateReport> = {}): ModpackUpdateReport {
  return { entries: [], updatableCount: 0, checkedCount: 0, unresolvedCount: 0, ...overrides };
}

/** `currentProfileId` に `null` を渡すと「Profile 未選択」になる */
function setup(
  profiles: Profile[] = [profile()],
  currentProfileId: string | null = 'p1'
) {
  useProfilesStore.setState({
    profiles,
    currentProfileId: currentProfileId ?? undefined,
    hasHydrated: true
  });
  return render(<ModpackHubClient />);
}

describe('ModpackHubClient: 表示', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await _clearAllForTesting();
    useConfirmStore.setState({ confirm: vi.fn(async () => true) });
    useToastStore.setState({ toasts: [] });
    mockCheck.mockResolvedValue(report());
  });

  it('Profile 未選択なら「プロファイル未選択」', () => {
    setup([profile()], null);
    expect(screen.getByText('プロファイル未選択')).toBeInTheDocument();
  });

  it('**modpackSource が無ければ**導入方法と CurseForge 未対応を出す', () => {
    const p = profile();
    delete p.modpackSource;
    setup([p]);

    expect(screen.getByText('このプロファイルは Modpack 由来ではありません')).toBeInTheDocument();
    // .mrpack は説明文と導入方法の 2 箇所に出る
    expect(screen.getAllByText(/\.mrpack/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/CurseForge 形式/)).toBeInTheDocument();
    // 由来が無いのに「更新を確認」は出さない
    expect(screen.queryByRole('button', { name: /更新を確認/ })).toBeNull();
  });

  it('導入元の名前・Provider・導入日時を出す', () => {
    setup();
    expect(screen.getByText('CF Pack')).toBeInTheDocument();
    expect(screen.getByText(/Modrinth/)).toBeInTheDocument();
    expect(screen.getByText(/1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/導入/)).toBeInTheDocument();
  });

  it('更新を確認 / 紐付けを解除のボタンがある', () => {
    setup();
    expect(screen.getByRole('button', { name: /更新を確認/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /紐付けを解除/ })).toBeInTheDocument();
  });
});

describe('ModpackHubClient: 更新の確認', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await _clearAllForTesting();
    useConfirmStore.setState({ confirm: vi.fn(async () => true) });
    useToastStore.setState({ toasts: [] });
  });

  it('現在の Profile を渡して確認する', async () => {
    mockCheck.mockResolvedValue(report());
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(1));
    expect(mockCheck.mock.calls[0]?.[0]?.profile.id).toBe('p1');
  });

  it('更新が無ければ「更新はありません」', async () => {
    mockCheck.mockResolvedValue(report({ checkedCount: 3 }));
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() =>
      expect(screen.getByTestId('modpack-update-report')).toBeInTheDocument()
    );
    expect(screen.getByText(/更新可能な項目はありません/)).toBeInTheDocument();
  });

  it('確認対象が無ければ件数を 0 として出す', async () => {
    mockCheck.mockResolvedValue(report());
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() =>
      expect(screen.getByTestId('modpack-update-report')).toBeInTheDocument()
    );
    expect(screen.getByText(/0 件を確認/)).toBeInTheDocument();
  });

  it('**Analysis の概要行を出す** (§10.6「Analysis に追加」)', async () => {
    mockCheck.mockResolvedValue(
      report({
        updatableCount: 1,
        checkedCount: 1,
        entries: [
          {
            projectId: 'proj-1',
            name: 'Sodium',
            category: 'mod',
            currentVersionNumber: '0.5.0',
            latestVersionNumber: '0.6.0',
            hasUpdate: true
          }
        ]
      })
    );
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() =>
      expect(screen.getByTestId('modpack-update-summary')).toHaveTextContent(
        '1 件の更新があります'
      )
    );
  });

  it('**確認対象が 1 件も無ければ**「更新の対象がありません」', async () => {
    mockCheck.mockResolvedValue(report());
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() =>
      expect(screen.getByTestId('modpack-update-summary')).toHaveTextContent(
        '更新の対象がありません'
      )
    );
  });

  it('**確認でき全て最新なら**「すべて最新です」+ 確認件数', async () => {
    mockCheck.mockResolvedValue(
      report({
        checkedCount: 2,
        entries: [
          { projectId: 'proj-1', name: 'Sodium', category: 'mod', hasUpdate: false },
          { projectId: 'proj-2', name: 'Lithium', category: 'mod', hasUpdate: false }
        ]
      })
    );
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() =>
      expect(screen.getByTestId('modpack-update-summary')).toHaveTextContent('すべて最新です')
    );
    expect(screen.getByTestId('modpack-update-summary')).toHaveTextContent('2 件確認');
  });

  it('**確認できなかった件数も概要に出す**', async () => {
    mockCheck.mockResolvedValue(
      report({
        checkedCount: 1,
        unresolvedCount: 1,
        entries: [
          { projectId: 'proj-1', name: 'Sodium', category: 'mod', hasUpdate: false },
          { projectId: 'proj-9', name: 'X', category: 'mod', hasUpdate: false, unresolved: '404' }
        ]
      })
    );
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() =>
      expect(screen.getByTestId('modpack-update-summary')).toHaveTextContent('1 件は確認できず')
    );
  });

  it('**更新がある項目は 現在 → 最新 で並べる**', async () => {
    mockCheck.mockResolvedValue(
      report({
        updatableCount: 1,
        checkedCount: 2,
        entries: [
          {
            projectId: 'proj-1',
            name: 'Sodium',
            category: 'mod',
            currentVersionNumber: '0.5.0',
            latestVersionNumber: '0.6.0',
            hasUpdate: true
          },
          {
            projectId: 'proj-2',
            name: 'Lithium',
            category: 'mod',
            currentVersionNumber: '0.12.0',
            latestVersionNumber: '0.12.0',
            hasUpdate: false
          }
        ]
      })
    );
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() => expect(screen.getByText('Sodium')).toBeInTheDocument());
    expect(screen.getByText('0.5.0')).toBeInTheDocument();
    expect(screen.getByText('0.6.0')).toBeInTheDocument();
    // 最新のものは更新リストに出ない
    expect(screen.queryByText('Lithium')).toBeNull();
    expect(screen.getByText(/1 件は最新です/)).toBeInTheDocument();
  });

  it('**Modpack 本体を確認できない理由を出す** (黙って「最新」にしない)', async () => {
    mockCheck.mockResolvedValue(
      report({
        checkedCount: 1,
        entries: [{ projectId: 'proj-1', name: 'Sodium', category: 'mod', hasUpdate: false }],
        modpackUncheckedReason:
          'Modpack 本体は確認していません (.mrpack に Modrinth のプロジェクト ID が含まれていないため)'
      })
    );
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() =>
      expect(screen.getByText(/Modpack 本体は確認していません/)).toBeInTheDocument()
    );
  });

  it('**取得できなかった項目は警告として分けて出す**', async () => {
    mockCheck.mockResolvedValue(
      report({
        checkedCount: 1,
        unresolvedCount: 1,
        entries: [
          {
            projectId: 'proj-9',
            name: 'Unknown Mod',
            category: 'mod',
            hasUpdate: false,
            unresolved: 'rate limited'
          }
        ]
      })
    );
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() => expect(screen.getByText(/1 件は情報を取得できませんでした/)).toBeInTheDocument());
    expect(screen.getByText(/Unknown Mod/)).toBeInTheDocument();
  });

  it('**更新の適用は Sync から行う旨を案内する** (§4: 書き込みは Sync Preview 経由)', async () => {
    mockCheck.mockResolvedValue(
      report({
        updatableCount: 1,
        checkedCount: 1,
        entries: [
          { projectId: 'proj-1', name: 'Sodium', category: 'mod', hasUpdate: true }
        ]
      })
    );
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() => expect(screen.getByText(/Sync/)).toBeInTheDocument());
  });

  it('失敗しても画面は落ちず理由を出す', async () => {
    mockCheck.mockRejectedValue(new Error('network down'));
    setup();

    fireEvent.click(screen.getByRole('button', { name: /更新を確認/ }));

    await waitFor(() => expect(screen.getByText('network down')).toBeInTheDocument());
  });
});

describe('ModpackHubClient: D-6 紐付け解除', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await _clearAllForTesting();
    useToastStore.setState({ toasts: [] });
    mockCheck.mockResolvedValue(report());
  });

  it('**modpack → import に昇格し、ファイルは残る**', async () => {
    useConfirmStore.setState({ confirm: vi.fn(async () => true) });
    await syncManagedFiles('p1', [
      managed({ id: 'f1', path: 'mods/a.jar' }),
      managed({ id: 'f2', path: 'mods/b.jar', source: 'import', projectId: 'proj-2' })
    ]);
    setup();

    fireEvent.click(screen.getByRole('button', { name: /紐付けを解除/ }));

    await waitFor(async () => {
      const records = await getManagedFiles('p1');
      expect(records.filter((r) => r.source === 'modpack')).toHaveLength(0);
      expect(records).toHaveLength(2); // 消えていない
      expect(records.find((r) => r.id === 'f1')?.source).toBe('import');
      expect(records.find((r) => r.id === 'f2')?.source).toBe('import');
    });
  });

  it('**Profile から modpackSource も外れる**', async () => {
    useConfirmStore.setState({ confirm: vi.fn(async () => true) });
    await syncManagedFiles('p1', [managed()]);
    setup();

    fireEvent.click(screen.getByRole('button', { name: /紐付けを解除/ }));

    await waitFor(() => {
      const state = useProfilesStore.getState();
      expect(state.profiles[0]?.modpackSource).toBeUndefined();
    });
    // 由来が無くなったので導入方法の表示に切り替わる
    await waitFor(() =>
      expect(screen.getByText('このプロファイルは Modpack 由来ではありません')).toBeInTheDocument()
    );
  });

  it('**キャンセルしたら何も変わらない**', async () => {
    useConfirmStore.setState({ confirm: vi.fn(async () => false) });
    await syncManagedFiles('p1', [managed()]);
    setup();

    fireEvent.click(screen.getByRole('button', { name: /紐付けを解除/ }));

    await waitFor(() => expect(useConfirmStore.getState().confirm).toHaveBeenCalled());
    const records = await getManagedFiles('p1');
    expect(records[0]?.source).toBe('modpack');
    expect(useProfilesStore.getState().profiles[0]?.modpackSource).toBeDefined();
  });

  it('解除の確認ダイアログに件数と「削除されない」ことを書く', async () => {
    const confirm = vi.fn(async (_options: ConfirmDialogOptions) => true);
    useConfirmStore.setState({ confirm });
    await syncManagedFiles('p1', [managed(), managed({ id: 'f2', path: 'mods/b.jar' })]);
    setup();

    fireEvent.click(screen.getByRole('button', { name: /紐付けを解除/ }));

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    const options = confirm.mock.calls[0]?.[0];
    expect(options?.message).toContain('2 個');
    expect(options?.message).toContain('削除されません');
    expect(options?.confirmLabel).toBe('解除する');
  });

  it('Modpack 由来のファイルが無ければ解除せず案内する', async () => {
    const confirm = vi.fn(async (_options: ConfirmDialogOptions) => true);
    useConfirmStore.setState({ confirm });
    await syncManagedFiles('p1', [managed({ source: 'import' })]);
    setup();

    fireEvent.click(screen.getByRole('button', { name: /紐付けを解除/ }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]?.message).toContain('Modpack 由来のファイルはありません')
    );
    expect(confirm).not.toHaveBeenCalled();
  });
});
