/**
 * useProfiles integration test (Sub-Phase 9-C.3)
 *
 * - fake-indexeddb + msw で完全な integration
 * - Dexie hydration → profile CRUD → handleToggleMod (Modrinth mock) の一連を検証
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useProfiles } from '@/hooks/useProfiles';
import { useProfilesStore } from '@/lib/store/profiles';
import { clearApiCache } from '@/lib/modrinth/client';
import { createQueryWrapper } from '../test-utils/queryWrapper';
import { db, getDirHandle, getManagedFiles } from '@/lib/db/dexie';
import { createFakeFileSystem } from '../test-utils/fakeFs';
import { FileSystemSource } from '@/lib/env/source';
import type { ProjectItem, ThemeMode } from '@/types';
import type { ConfirmDialogOptions } from '@/components/ConfirmDialog';

// ------------------ Reset helpers ------------------

async function resetAll() {
  // Zustand store reset
  useProfilesStore.setState({
    profiles: [
      {
        id: 'default-profile',
        name: '1.20.1 Fabric 軽量化・ユーティリティ',
        environment: { mcVersion: '1.20.1', loader: 'Fabric' },
        description: 'Modrinthから直接Modを取得・ダウンロードする標準構成',
        mods: []
      }
    ],
    currentProfileId: 'default-profile',
    hasHydrated: false,
    theme: 'dark'
  });
  // Dexie reset (fake-indexeddb backed)
  try {
    await db.profiles.clear();
    await db.meta.clear();
    await db.apiCache.clear();
  } catch {
    // 初回など (テーブル未初期化) は無視
  }
  // Memory cache reset
  clearApiCache();
  // LocalStorage reset
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  // cookie reset (Phase 10-P5: テストセットアップのため直接操作)
  if (typeof document !== 'undefined') {
    // biome-ignore lint/suspicious/noDocumentCookie: テストセットアップの cookie クリア
    document.cookie = 'dropmod_active_profile=; path=/; max-age=0';
  }
}

// ------------------ Hook harness ------------------

// vitest 4 は vi.fn() を constructor 呼び出し可能な型で返すため、
// 特定シグネチャの引数へ渡す mock は明示的にジェネリクスで型付けする
// (vitest 3 時代の ReturnType<typeof vi.fn> は (x: T) => void 系と非互換)。
interface Harness {
  theme: ThemeMode;
  setThemeState: Mock<(theme: ThemeMode) => void>;
  showToast: Mock<
    (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  >;
  confirmDialog: Mock<
    (options: ConfirmDialogOptions) => Promise<boolean>
  >;
}

function makeHarness(confirmValue = true): Harness {
  return {
    theme: 'dark' as ThemeMode,
    setThemeState: vi.fn<(theme: ThemeMode) => void>(),
    showToast: vi.fn<
      (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
    >(),
    confirmDialog: vi
      .fn<(options: ConfirmDialogOptions) => Promise<boolean>>()
      .mockResolvedValue(confirmValue)
  };
}

describe('useProfiles', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('hydrate: LocalStorage が空 & Dexie が空なら DEFAULT_PROFILE を維持', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() =>
      expect(useProfilesStore.getState().hasHydrated).toBe(true)
    );
    expect(result.current.profiles).toHaveLength(1);
    expect(result.current.profiles[0]!.id).toBe('default-profile');
    expect(result.current.currentProfile?.id).toBe('default-profile');
  });

  it('handleCreateProfile: 新規プロファイル追加 + currentProfileId 切替', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.handleCreateProfile('MyPack', '1.21.1', 'NeoForge', 'desc');
    });
    expect(result.current.profiles).toHaveLength(2);
    const newP = result.current.profiles[1]!;
    expect(newP.name).toBe('MyPack');
    expect(newP.environment.mcVersion).toBe('1.21.1');
    expect(newP.environment.loader).toBe('NeoForge');
    expect(result.current.currentProfileId).toBe(newP.id);
    expect(h.showToast).toHaveBeenCalledWith(
      expect.stringContaining('作成しました'),
      'success'
    );
  });

  it('handleCreateProfile: mods 付き (initialMods) で作成できる', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    const initialMods = [
      { projectId: 'preset-a', name: 'Preset A', type: 'mod', description: '' },
      { projectId: 'preset-b', name: 'Preset B', type: 'mod', description: '' }
    ] satisfies ProjectItem[];
    await act(async () => {
      result.current.handleCreateProfile('WithMods', '1.20.1', 'Fabric', '', initialMods);
    });
    const created = result.current.profiles[1]!;
    expect(created.mods).toHaveLength(2);
    const successCall = h.showToast.mock.calls.find(([, t]) => t === 'success');
    expect(successCall?.[0]).toContain('2 個のMod入り');
  });

  it('handleCreateProfile: フォルダ選択 (P12-D1) なら linkedSource + dirHandles + 台帳 seed', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
    await db.dirHandles.clear();
    await db.managedFiles.clear();

    const handle = createFakeFileSystem(
      { 'mods/sodium.jar': 'sodium', 'versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json': '{}' },
      'MyInstance'
    );
    const mods: ProjectItem[] = [
      {
        projectId: 'proj-sodium',
        name: 'Sodium',
        type: 'mod',
        versionId: 'ver-1',
        filename: 'sodium.jar',
        artifact: { sha1: 'abc', path: 'mods/sodium.jar', size: 6 }
      }
    ];
    const link = {
      picked: { handle, source: new FileSystemSource(handle, 'MyInstance') },
      detected: {
        rootType: 'official' as const,
        mcVersion: '1.21.1',
        loader: 'Fabric' as const,
        loaderVersion: '0.16.0',
        contentDirs: { mods: 'mods' }
      }
    };

    await act(async () => {
      await result.current.handleCreateProfile('Linked', '1.21.1', 'Fabric', '', mods, undefined, undefined, link);
    });

    const created = useProfilesStore.getState().profiles.find((p) => p.name === 'Linked');
    expect(created?.linkedSource).toMatchObject({
      kind: 'filesystem',
      rootName: 'MyInstance',
      environment: { mcVersion: '1.21.1' }
    });
    const row = await getDirHandle(created?.linkedSource?.handleId as string);
    expect(row?.profileId).toBe(created?.id);
    // §10.5: artifact を持つ ProjectItem が初期 ManagedFileRecord になる (source: import)
    const records = await getManagedFiles(created?.id as string);
    expect(records).toEqual([
      expect.objectContaining({
        path: 'mods/sodium.jar',
        sha1: 'abc',
        source: 'import',
        projectId: 'proj-sodium'
      })
    ]);
  });

  it('handleSwitchProfile: currentProfileId が切り替わる', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // 2 つ目を追加
    await act(async () => {
      result.current.handleCreateProfile('B', '1.20.1', 'Fabric', '');
    });
    const bId = result.current.profiles[1]!.id;

    // default に戻す
    act(() => {
      result.current.handleSwitchProfile('default-profile');
    });
    expect(result.current.currentProfileId).toBe('default-profile');

    // B に切替
    act(() => {
      result.current.handleSwitchProfile(bId);
    });
    expect(result.current.currentProfileId).toBe(bId);
  });

  it('handleDuplicateProfile: 現在プロファイルの複製 + 名前に "(1)"', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.handleDuplicateProfile();
    });
    expect(result.current.profiles).toHaveLength(2);
    expect(result.current.profiles[1]!.name).toMatch(/\(1\)$/);
    expect(result.current.currentProfileId).toBe(result.current.profiles[1]!.id);
  });

  it('handleDeleteProfile: confirm=true → 削除、default は最後の 1 個を守る', async () => {
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // 最後の 1 個を削除しようとすると拒否
    await act(async () => {
      await result.current.handleDeleteProfile('default-profile');
    });
    expect(result.current.profiles).toHaveLength(1);
    expect(h.showToast).toHaveBeenCalledWith(
      expect.stringContaining('最低1つ'),
      'warning'
    );

    // 2 つに増やしてから削除
    await act(async () => {
      result.current.handleCreateProfile('B', '1.20.1', 'Fabric', '');
    });
    const bId = result.current.profiles[1]!.id;
    await act(async () => {
      await result.current.handleDeleteProfile(bId);
    });
    expect(result.current.profiles).toHaveLength(1);
  });

  it('handleDeleteProfile: confirm=false → キャンセルされ削除しない', async () => {
    const h = makeHarness(false);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.handleCreateProfile('B', '1.20.1', 'Fabric', '');
    });
    const bId = result.current.profiles[1]!.id;
    await act(async () => {
      await result.current.handleDeleteProfile(bId);
    });
    expect(result.current.profiles).toHaveLength(2);
  });

  it('handleSaveEditedProfile: 名前/MC/loader/description を更新', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.handleSaveEditedProfile('NewName', '1.21.1', 'NeoForge', 'new desc');
    });
    const updated = result.current.profiles[0]!;
    expect(updated.name).toBe('NewName');
    expect(updated.environment.mcVersion).toBe('1.21.1');
    expect(updated.environment.loader).toBe('NeoForge');
    expect(updated.description).toBe('new desc');
    expect(h.showToast).toHaveBeenCalledWith(
      expect.stringContaining('プロファイルを更新'),
      'success'
    );
  });

  it('handleToggleMod: 追加 → 削除 (デフォルト handler で mock)', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // 追加
    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(result.current.currentProfile?.mods.length).toBe(1);
    expect(result.current.currentProfile?.mods[0]?.slug).toBe('sodium');
    // success toast
    const successCall = h.showToast.mock.calls.find(([, t]) => t === 'success');
    expect(successCall?.[0]).toContain('追加');

    // 削除 (同じ projectId でトグル)
    // 追加時に id は 'id-sodium' が入る (mock handler の返り値より)
    const addedId = result.current.currentProfile!.mods[0]!.projectId;
    await act(async () => {
      await result.current.handleToggleMod(addedId);
    });
    expect(result.current.currentProfile?.mods.length).toBe(0);
    const infoCall = h.showToast.mock.calls.find(
      ([msg, t]) => t === 'info' && typeof msg === 'string' && msg.includes('削除')
    );
    expect(infoCall).toBeDefined();
  });

  it('handleUpdateModVersion: 選択中バージョンを差し替え', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // 追加
    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    const addedId = result.current.currentProfile!.mods[0]!.projectId;

    // version 差し替え (mock handler が version_number: '1.0.0' で返す)
    await act(async () => {
      await result.current.handleUpdateModVersion(addedId, 'ver-99');
    });
    const updated = result.current.currentProfile!.mods[0]!;
    expect(updated.versionId).toBe('ver-99');
    expect(updated.versionNumber).toBe('1.0.0');
  });

  it('handleRemoveAllMods: mods=0 なら何もしない、mods>0 なら confirm 後クリア', async () => {
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // 空プロファイル → 何もしない
    await act(async () => {
      await result.current.handleRemoveAllMods();
    });
    expect(h.confirmDialog).not.toHaveBeenCalled();

    // Mod を追加
    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(result.current.currentProfile?.mods.length).toBe(1);

    // 全削除
    await act(async () => {
      await result.current.handleRemoveAllMods();
    });
    expect(h.confirmDialog).toHaveBeenCalled();
    expect(result.current.currentProfile?.mods.length).toBe(0);
  });

  it('handleRemoveMods: 指定 id だけ削除する', async () => {
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    const addedId = result.current.currentProfile!.mods[0]!.projectId;
    await act(async () => {
      await result.current.handleRemoveMods([addedId]);
    });
    expect(h.confirmDialog).toHaveBeenCalled();
    expect(result.current.currentProfile?.mods.length).toBe(0);
  });

  it('handleUpdateModVersion: knownVersion があれば追加 fetch せず即反映', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    const addedId = result.current.currentProfile!.mods[0]!.projectId;
    await act(async () => {
      await result.current.handleUpdateModVersion(addedId, 'local-ver', {
        id: 'local-ver',
        project_id: addedId,
        author_id: 'a',
        featured: false,
        name: 'local',
        version_number: '9.9.9',
        date_published: '2026-01-01',
        downloads: 0,
        version_type: 'beta',
        files: [
          {
            url: 'https://example.com/local.jar',
            filename: 'local.jar',
            primary: true,
            size: 1
          }
        ],
        game_versions: ['1.20.1'],
        loaders: ['fabric']
      });
    });
    const updated = result.current.currentProfile!.mods[0]!;
    expect(updated.versionId).toBe('local-ver');
    expect(updated.versionNumber).toBe('9.9.9');
    expect(updated.fileUrl).toBe('https://example.com/local.jar');
  });

  it('handleToggleMod: fetch 失敗時は warning toast + mod 追加されない', async () => {
    server.use(
      http.get('/api/modrinth/project/:slug', () =>
        new HttpResponse('down', { status: 500 })
      ),
      http.get('https://api.modrinth.com/v2/project/:slug', () =>
        new HttpResponse('down', { status: 500 })
      )
    );

    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('deadmod');
    });
    expect(result.current.currentProfile?.mods.length).toBe(0);
    const warningCall = h.showToast.mock.calls.find(
      ([, t]) => t === 'warning'
    );
    expect(warningCall?.[0]).toContain('失敗');
  });

  // ------------------------------------------------------------------
  // B4 修正の回帰防止テスト (currentProfile 参照安定化)
  // ------------------------------------------------------------------
  it('B4: currentProfile は再 render で同一参照を返す (useMemo による安定化)', async () => {
    const h = makeHarness();
    const { result, rerender } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    const first = result.current.currentProfile;
    rerender();
    const second = result.current.currentProfile;
    expect(first).toBe(second); // 同一参照

    // profiles=[] + missing currentProfileId で fallback に落ちるケースでも同一参照
    await act(async () => {
      useProfilesStore.setState({ profiles: [], currentProfileId: 'missing' });
    });
    // hydration 完了後は recovery useEffect が発火して profiles が復旧するが、
    // その 1 tick 前の transient-fallback は module-level 定数なので同一参照
    // (実際には復旧後の profile が入ってくるので厳密比較は不要、id='transient-fallback' の
    //  参照安定性を確認するため独立 render で検証)
    const fallback = result.current.currentProfile;
    rerender();
    expect(result.current.currentProfile).toBe(fallback);
  });

  // ------------------------------------------------------------------
  // B24 修正の回帰防止テスト (幽霊 currentProfileId の防御)
  // ------------------------------------------------------------------
  it('B24: Dexie に幽霊 currentProfileId が保存されている場合、profiles[0].id にフォールバック', async () => {
    // Dexie に profiles として ['real-1'] を、meta currentProfileId として 'ghost-id' を保存
    await db.profiles.bulkPut([
      {
        id: 'real-1',
        name: 'Real Profile',
        environment: { mcVersion: '1.20.1', loader: 'Fabric' },
        description: '',
        mods: [],
        updatedAt: Date.now()
      }
    ]);
    await db.meta.put({ key: 'currentProfileId', value: 'ghost-id' });
    await db.meta.put({ key: 'migratedAt', value: String(Date.now()) });

    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // currentProfileId は 'ghost-id' ではなく 'real-1' にフォールバック
    expect(result.current.currentProfileId).toBe('real-1');
    expect(result.current.currentProfile?.id).toBe('real-1');
  });
});
