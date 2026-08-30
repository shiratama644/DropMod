/**
 * useEnvironmentLink (Phase 12-B / D-9) test
 *
 * `lib/env/link.ts` は自前のテストを持つため、ここでは **Profile (SSOT) への反映と
 * トースト通知**を検証する。link.ts 自体は vi.mock で差し替える。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEnvironmentLink } from '@/features/sync/hooks/useEnvironmentLink';
import { db } from '@/lib/db/dexie';
import { syncManagedFiles } from '@/features/sync/db';
import { createFolderLink, releaseFolderLink } from '@/features/sync/link';
import { useProfilesStore } from '@/features/profiles';
import { useToastStore } from '@/components/feedback/toastStore';
import type { LinkedSource, Profile, ProjectItem } from '@/types';

vi.mock('@/features/sync/link', () => ({
  createFolderLink: vi.fn(),
  releaseFolderLink: vi.fn()
}));

// P12-D1B: seed 失敗ケースを再現するため台帳ヘルパをモックでラップする
vi.mock('@/features/sync/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/sync/db')>();
  return {
    ...actual,
    getManagedFiles: vi.fn(actual.getManagedFiles),
    syncManagedFiles: vi.fn(actual.syncManagedFiles)
  };
});

const mockCreate = vi.mocked(createFolderLink);
const mockRelease = vi.mocked(releaseFolderLink);

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'My Pack',
    environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
    mods: [],
    ...overrides
  };
}

const LINKED: LinkedSource = {
  kind: 'filesystem',
  rootName: '.minecraft',
  handleId: 'dh-1',
  environment: { mcVersion: '1.20.1', loader: 'Fabric', loaderVersion: '0.14.21' },
  contentDirs: { mods: 'mods' },
  linkedAt: 1_700_000_000_000
};

function modItem(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return {
    projectId: 'sodium',
    name: 'Sodium',
    type: 'mod',
    versionId: 'v1',
    ...overrides
  };
}

describe('useEnvironmentLink', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRelease.mockResolvedValue(undefined);
    useProfilesStore.setState({
      profiles: [makeProfile()],
      currentProfileId: 'p1',
      hasHydrated: true
    });
    useToastStore.setState({ toasts: [], enabled: true });
    try {
      await db.managedFiles.clear();
    } catch {
      // 空 DB は無視
    }
  });

  it('supported は File System Access API の有無を反映する', () => {
    // jsdom には showDirectoryPicker が無い
    const { result } = renderHook(() => useEnvironmentLink());
    expect(result.current.supported).toBe(false);
  });

  it('link: フォルダを選択すると Profile.linkedSource に反映される', async () => {
    mockCreate.mockResolvedValue(LINKED);
    const { result } = renderHook(() => useEnvironmentLink());

    let ok = false;
    await act(async () => {
      ok = await result.current.link();
    });

    expect(ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith('p1');
    expect(useProfilesStore.getState().profiles[0]?.linkedSource).toEqual(LINKED);
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      message: 'フォルダ「.minecraft」を紐付けました',
      type: 'success'
    });
  });

  it('link: **検出した環境を Profile.environment に書き込まない** (D-1 のチェックを残す)', async () => {
    // フォルダからは別バージョンが検出された、という状況
    mockCreate.mockResolvedValue({
      ...LINKED,
      environment: { mcVersion: '1.21.4', loader: 'Fabric', loaderVersion: '0.16.0' }
    });
    const { result } = renderHook(() => useEnvironmentLink());

    await act(async () => {
      await result.current.link();
    });

    const profile = useProfilesStore.getState().profiles[0];
    expect(profile?.environment).toEqual({
      mcVersion: '1.20.1',
      loader: 'Fabric',
      loaderVersion: '0.14.21'
    });
    expect(profile?.linkedSource?.environment.mcVersion).toBe('1.21.4');
  });

  it('link: 既存の紐付けがあれば先に旧ハンドルを解除する', async () => {
    useProfilesStore.setState({ profiles: [makeProfile({ linkedSource: LINKED })] });
    mockCreate.mockResolvedValue({ ...LINKED, handleId: 'dh-2', rootName: 'Other' });
    const { result } = renderHook(() => useEnvironmentLink());

    await act(async () => {
      await result.current.link();
    });

    expect(mockRelease).toHaveBeenCalledWith('dh-1');
    expect(useProfilesStore.getState().profiles[0]?.linkedSource?.handleId).toBe('dh-2');
  });

  it('link: ユーザーがキャンセルしたら false・変更なし・エラー表示なし', async () => {
    mockCreate.mockResolvedValue(null);
    const { result } = renderHook(() => useEnvironmentLink());

    let ok = true;
    await act(async () => {
      ok = await result.current.link();
    });

    expect(ok).toBe(false);
    expect(useProfilesStore.getState().profiles[0]?.linkedSource).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('link: 失敗したら error を立ててトーストを出す', async () => {
    mockCreate.mockRejectedValue(new Error('フォルダ選択 API を呼び出せませんでした。'));
    const { result } = renderHook(() => useEnvironmentLink());

    let ok = true;
    await act(async () => {
      ok = await result.current.link();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('フォルダ選択 API を呼び出せませんでした。');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
  });

  it('link: プロファイルが選択されていなければ何もしない', async () => {
    useProfilesStore.setState({ profiles: [], currentProfileId: 'missing' });
    const { result } = renderHook(() => useEnvironmentLink());

    let ok = true;
    await act(async () => {
      ok = await result.current.link();
    });

    expect(ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.current.error).toBe('プロファイルが選択されていません。');
  });

  it('unlink: linkedSource をキーごと落とし、Profile の中身は残す', async () => {
    useProfilesStore.setState({
      profiles: [makeProfile({ linkedSource: LINKED, mods: [] })]
    });
    const { result } = renderHook(() => useEnvironmentLink());

    let ok = false;
    await act(async () => {
      ok = await result.current.unlink();
    });

    expect(ok).toBe(true);
    expect(mockRelease).toHaveBeenCalledWith('dh-1');
    const profile = useProfilesStore.getState().profiles[0];
    expect(profile && 'linkedSource' in profile).toBe(false);
    expect(profile?.name).toBe('My Pack');
    expect(profile?.environment.mcVersion).toBe('1.20.1');
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      message: 'フォルダ「.minecraft」の紐付けを解除しました',
      type: 'success'
    });
  });

  it('unlink: 未紐付けなら何もしない', async () => {
    const { result } = renderHook(() => useEnvironmentLink());

    let ok = true;
    await act(async () => {
      ok = await result.current.unlink();
    });

    expect(ok).toBe(false);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('unlink: 失敗したら error を立てる', async () => {
    useProfilesStore.setState({ profiles: [makeProfile({ linkedSource: LINKED })] });
    mockRelease.mockRejectedValue(new Error('IndexedDB が使えません'));
    const { result } = renderHook(() => useEnvironmentLink());

    let ok = true;
    await act(async () => {
      ok = await result.current.unlink();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('IndexedDB が使えません');
    // 失敗したので紐付けは残る
    expect(useProfilesStore.getState().profiles[0]?.linkedSource).toEqual(LINKED);
  });

  // ====================================================================
  // P12-D1B (§10.5): 紐付け成功時の台帳 seed
  // ====================================================================
  it('**P12-D1B**: link 成功時に artifact を持つ Profile を台帳 seed する', async () => {
    useProfilesStore.setState({
      profiles: [
        makeProfile({
          mods: [
            modItem({
              artifact: { sha1: 'sha-1', path: 'mods/sodium.jar', size: 123 }
            })
          ]
        })
      ]
    });
    mockCreate.mockResolvedValue(LINKED);
    const { result } = renderHook(() => useEnvironmentLink());

    await act(async () => {
      await result.current.link();
    });

    const records = await db.managedFiles.where('profileId').equals('p1').toArray();
    expect(records).toEqual([
      expect.objectContaining({
        profileId: 'p1',
        projectId: 'sodium',
        path: 'mods/sodium.jar',
        sha1: 'sha-1',
        size: 123,
        source: expect.any(String),
        managedAt: expect.any(Number)
      })
    ]);
    // 紐付けは成功のまま (seed 失敗と混同しない)
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success' });
  });

  it('**P12-D1B**: artifact 無しの場合は台帳を空のまま (seed しない)', async () => {
    mockCreate.mockResolvedValue(LINKED);
    const { result } = renderHook(() => useEnvironmentLink());

    await act(async () => {
      await result.current.link();
    });

    expect(await db.managedFiles.where('profileId').equals('p1').count()).toBe(0);
  });

  it('**P12-D1B**: seed 失敗は warning のみで紐付けは成功扱い', async () => {
    useProfilesStore.setState({
      profiles: [makeProfile({ mods: [modItem({ artifact: { sha1: 'sha-1', path: 'mods/sodium.jar', size: 123 } })] })]
    });
    mockCreate.mockResolvedValue(LINKED);
    vi.mocked(syncManagedFiles).mockRejectedValueOnce(new Error('IndexedDB が使えません'));
    const { result } = renderHook(() => useEnvironmentLink());

    await act(async () => {
      await result.current.link();
    });

    expect(useProfilesStore.getState().profiles[0]?.linkedSource).toEqual(LINKED);
    expect(result.current.error).toBeNull(); // 紐付け自体は成功
    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ type: 'success' }),
      expect.objectContaining({ type: 'warning' })
    ]);
  });

  it('dismissError で error をクリアできる', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEnvironmentLink());

    await act(async () => {
      await result.current.link();
    });
    expect(result.current.error).toBe('boom');

    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
  });

  it('処理中は linking / unlinking が立つ', async () => {
    let resolveCreate: (v: LinkedSource | null) => void = () => {};
    mockCreate.mockReturnValue(
      new Promise<LinkedSource | null>((resolve) => {
        resolveCreate = resolve;
      })
    );
    const { result } = renderHook(() => useEnvironmentLink());

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.link();
    });
    expect(result.current.linking).toBe(true);

    await act(async () => {
      resolveCreate(LINKED);
      await pending;
    });
    expect(result.current.linking).toBe(false);
  });
});
