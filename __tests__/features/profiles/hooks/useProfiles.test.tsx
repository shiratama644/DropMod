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
import { server } from '@/__tests__/mocks/server';
import { useProfiles } from '@/features/profiles/hooks/useProfiles';
import { useProfilesStore } from '@/features/profiles';
import { clearApiCache } from '@/lib/modrinth/client';
import { createQueryWrapper } from '@/__tests__/test-utils/queryWrapper';
import { db } from '@/lib/db/dexie';
import { getDirHandle, getManagedFiles } from '@/features/sync';
import * as syncModule from '@/features/sync';
import * as dexieModule from '@/lib/db/dexie';
import { META_KEYS, LOCAL_STORAGE_KEYS } from '@/lib/db/migrate';
import { createFakeFileSystem } from '@/__tests__/test-utils/fakeFs';
import { FileSystemSource } from '@/lib/env/source';
import type {
  ProjectItem,
  ThemeMode,
  ProfileContentExtras,
  LinkedSource,
  Profile
} from '@/types';
import type { PickedDirectory, DetectedEnvironment } from '@/features/env-import';
import type { ConfirmDialogOptions } from '@/components/feedback/ConfirmDialog';

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

  it('handleToggleMod: e.stopPropagation が呼ばれる (カード内クリック用)', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    const event = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    await act(async () => {
      await result.current.handleToggleMod('sodium', event);
    });
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(result.current.currentProfile?.mods.length).toBe(1);
  });

  it('handleToggleMod: 同一 projectId の連打は in-flight ガードで 1 回だけ処理する', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // await せず同時に 2 回呼ぶ (連打相当)
    const p1 = result.current.handleToggleMod('sodium');
    const p2 = result.current.handleToggleMod('sodium');
    await act(async () => {
      await Promise.all([p1, p2]);
    });
    expect(result.current.currentProfile?.mods.length).toBe(1);
    // 追加 toast は 1 回だけ
    const successCalls = h.showToast.mock.calls.filter(([, t]) => t === 'success');
    expect(successCalls).toHaveLength(1);
  });

  it('handleToggleMod: silent=true では toast を出さない (削除)', async () => {
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
    h.showToast.mockClear();

    await act(async () => {
      await result.current.handleToggleMod(addedId, undefined, true);
    });
    expect(result.current.currentProfile?.mods.length).toBe(0);
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('handleToggleMod: resourcepack は skipLoader でバージョン取得される', async () => {
    server.use(
      http.get('/api/modrinth/project/rp', () =>
        HttpResponse.json({
          id: 'id-rp',
          slug: 'rp',
          title: 'Mock rp',
          description: 'desc',
          project_type: 'resourcepack',
          icon_url: null,
          published: '2020-01-01T00:00:00.000Z',
          updated: '2026-08-01T00:00:00.000Z',
          display_categories: ['texture'],
          categories: ['texture']
        })
      )
    );
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('rp');
    });
    const all = [
      ...(result.current.currentProfile?.mods ?? []),
      ...(result.current.currentProfile?.resourcepacks ?? [])
    ];
    expect(all.some((m) => m.slug === 'rp')).toBe(true);
    const successCall = h.showToast.mock.calls.find(([, t]) => t === 'success');
    expect(successCall?.[0]).toContain('rp');
  });

  it('handleToggleMod: バージョンの files が空なら warning toast + 追加しない', async () => {
    server.use(
      http.get('/api/modrinth/project/sodium/version', () =>
        HttpResponse.json([
          {
            id: 'ver-empty',
            project_id: 'id-sodium',
            version_number: '0.0.0',
            version_type: 'release',
            game_versions: ['1.20.1'],
            loaders: ['fabric'],
            files: [],
            dependencies: []
          }
        ])
      )
    );
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(result.current.currentProfile?.mods.length).toBe(0);
    const warningCall = h.showToast.mock.calls.find(([, t]) => t === 'warning');
    expect(warningCall?.[0]).toContain('利用可能なファイルが見つかりません');
  });

  it('handleUpdateModVersion: fetch 失敗時は warning toast で差し替えない', async () => {
    // fetchModrinth は proxy → direct の順に試すため両方 500 にする
    server.use(
      http.get('/api/modrinth/version/ver-fail', () =>
        HttpResponse.json({}, { status: 500 })
      ),
      http.get('https://api.modrinth.com/v2/version/ver-fail', () =>
        HttpResponse.json({}, { status: 500 })
      )
    );
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
      await result.current.handleUpdateModVersion(addedId, 'ver-fail');
    });
    const warningCall = h.showToast.mock.calls.find(([, t]) => t === 'warning');
    expect(warningCall?.[0]).toContain('バージョンの更新に失敗');
    expect(result.current.currentProfile?.mods[0]?.versionId).not.toBe('ver-fail');
  });

  it('handleUpdateModVersion: version の files が空なら何もしない', async () => {
    const emptyVersion = {
      id: 'ver-empty',
      project_id: 'id-sodium',
      author_id: 'a',
      featured: false,
      name: 'empty',
      version_number: '0.0.0',
      version_type: 'release',
      date_published: '2026-01-01',
      downloads: 0,
      files: [],
      game_versions: ['1.20.1'],
      loaders: ['fabric']
    };
    // proxy / direct 両方で files 空を返す (direct フォールバック対策)
    server.use(
      http.get('/api/modrinth/version/ver-empty', () =>
        HttpResponse.json(emptyVersion)
      ),
      http.get('https://api.modrinth.com/v2/version/ver-empty', () =>
        HttpResponse.json(emptyVersion)
      )
    );
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

    h.showToast.mockClear(); // 追加時の toast をクリア
    await act(async () => {
      await result.current.handleUpdateModVersion(addedId, 'ver-empty');
    });
    expect(result.current.currentProfile?.mods[0]?.versionId).not.toBe('ver-empty');
    expect(h.showToast).not.toHaveBeenCalled(); // 更新成功 toast なし
  });

  it('handleUpdateModVersion: プロファイルに無い projectId なら何もしない', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    h.showToast.mockClear();
    await act(async () => {
      await result.current.handleUpdateModVersion('does-not-exist', 'ver-1');
    });
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('handleToggleMod: version の primary ファイルが無ければ先頭ファイルを使う', async () => {
    server.use(
      http.get('/api/modrinth/project/sodium/version', () =>
        HttpResponse.json([
          {
            id: 'ver-noprimary',
            project_id: 'id-sodium',
            version_number: '0.0.1',
            version_type: 'release',
            game_versions: ['1.20.1'],
            loaders: ['fabric'],
            files: [
              {
                url: 'https://example.com/first.jar',
                filename: 'first.jar',
                primary: false,
                size: 1
              }
            ],
            dependencies: []
          }
        ])
      )
    );
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(result.current.currentProfile?.mods[0]?.fileUrl).toBe(
      'https://example.com/first.jar'
    );
  });

  it('handleRemoveAllMods: category=resourcepack は RP のみ削除し mod は残す', async () => {
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    // RP を resourcepacks 配列に直接 seed (mod と区別して削除されることを検証)
    act(() => {
      useProfilesStore.setState((prev) => ({
        profiles: prev.profiles.map((p) =>
          p.id === prev.currentProfileId
            ? {
                ...p,
                resourcepacks: [
                  {
                    projectId: 'id-rp',
                    slug: 'rp',
                    name: 'Mock rp',
                    description: 'desc',
                    author: 'author',
                    type: 'resourcepack',
                    category: 'texture',
                    versionId: 'ver-rp',
                    versionNumber: '1.0.0',
                    versionType: 'release',
                    fileUrl: 'https://example.com/rp.zip',
                    filename: 'rp.zip'
                  }
                ]
              }
            : p
        )
      }));
    });

    await act(async () => {
      await result.current.handleRemoveAllMods('resourcepack');
    });
    expect(result.current.currentProfile?.mods.length).toBe(1); // sodium 残る
    expect(result.current.currentProfile?.resourcepacks?.length).toBe(0);
    const infoCall = h.showToast.mock.calls.at(-1);
    expect(infoCall?.[0]).toContain('Resource Pack');
  });

  it('handleRemoveAllMods: confirm をキャンセルしたら削除しない', async () => {
    const h = makeHarness(false); // confirmDialog → false
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(result.current.currentProfile?.mods.length).toBe(1);

    await act(async () => {
      await result.current.handleRemoveAllMods();
    });
    expect(result.current.currentProfile?.mods.length).toBe(1);
    // 削除後の info toast が出ていない (最後の toast が「取得中...」のまま)
    const lastToast = h.showToast.mock.calls.at(-1);
    expect(lastToast?.[0]).not.toContain('削除しました');
  });

  it('handleRemoveMods: ids 空は何もしない', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleRemoveMods([]);
    });
    expect(h.confirmDialog).not.toHaveBeenCalled();
  });

  it('handleRemoveMods: 存在しない id は confirm せず何もしない', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleRemoveMods(['does-not-exist']);
    });
    expect(h.confirmDialog).not.toHaveBeenCalled();
  });

  it('handleRemoveMods: confirm をキャンセルしたら削除しない', async () => {
    const h = makeHarness(false);
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
    expect(result.current.currentProfile?.mods.length).toBe(1);
  });

  it('handleRemoveMods: slug 指定でも削除できる (id でなく)', async () => {
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    await act(async () => {
      await result.current.handleRemoveMods(['sodium']); // slug は 'sodium'
    });
    expect(result.current.currentProfile?.mods.length).toBe(0);
  });

  // ========================================================================
  // COV-2: 分岐カバレッジ補充 (hydrate / debounce / cookie / CRUD 分岐)
  // ========================================================================

  it('hydrate: 既に hasHydrated なら読み直さない (早期 return)', async () => {
    useProfilesStore.setState({ hasHydrated: true, currentProfileId: 'keep-me' });
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    // effect は早期 return するため store は書き換わらない
    expect(useProfilesStore.getState().hasHydrated).toBe(true);
    expect(useProfilesStore.getState().currentProfileId).toBe('keep-me');
    expect(result.current.profiles[0]!.id).toBe('default-profile');
  });

  it('hydrate: Dexie に保存された theme を復元する', async () => {
    await db.meta.put({ key: META_KEYS.THEME, value: 'light' });
    const h = makeHarness();
    renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
    expect(h.setThemeState).toHaveBeenCalledWith('light');
  });

  it('hydrate: Dexie 読み取り失敗時は LocalStorage にフォールバックする', async () => {
    const lsState = {
      theme: 'light',
      profiles: [
        {
          id: 'ls-p1',
          name: 'LS Profile',
          environment: { mcVersion: '1.21.1', loader: 'Forge' },
          description: '',
          mods: []
        }
      ],
      currentProfileId: 'ls-p1'
    };
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, JSON.stringify(lsState));
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      expect(h.setThemeState).toHaveBeenCalledWith('light');
      expect(useProfilesStore.getState().profiles[0]!.id).toBe('ls-p1');
      expect(useProfilesStore.getState().currentProfileId).toBe('ls-p1');
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('debounce: setProfiles の変更は 500ms 後に Dexie へ保存される', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.setProfiles((prev) => [
        ...prev,
        {
          id: 'extra-1',
          name: 'Extra',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          description: '',
          mods: []
        }
      ]);
    });
    // debounce 前はまだ保存されていない (即時保存は create のみ)
    const before = await db.profiles.toArray();
    expect(before.some((r) => r.id === 'extra-1')).toBe(false);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    const after = await db.profiles.toArray();
    expect(after.some((r) => r.id === 'extra-1')).toBe(true);
  });

  it('debounce: バックアップ期限内なら LocalStorage にも書き込む', async () => {
    await db.meta.put({
      key: META_KEYS.BACKUP_EXPIRES_AT,
      value: String(Date.now() + 3600_000)
    });
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.setProfiles((prev) => [
        ...prev,
        {
          id: 'extra-2',
          name: 'Extra2',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          description: '',
          mods: []
        }
      ]);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    const saved = localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT);
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved ?? '{}') as { profiles: Profile[] };
    expect(parsed.profiles.some((p) => p.id === 'extra-2')).toBe(true);
  });

  it('debounce: Dexie 保存失敗は console.warn に落ちる', async () => {
    const saveSpy = vi
      .spyOn(dexieModule, 'syncProfiles')
      .mockRejectedValue(new Error('save fail'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h = makeHarness();
      const { result } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      await act(async () => {
        result.current.setProfiles((prev) => [
          ...prev,
          {
            id: 'extra-3',
            name: 'Extra3',
            environment: { mcVersion: '1.20.1', loader: 'Fabric' },
            description: '',
            mods: []
          }
        ]);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 600));
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      saveSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('cookie 書き込みに失敗したら console.warn に落ちる', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // jsdom の document.cookie は自身ではなくプロトタイプに定義されている
    // 可能性があるため、prototype チェーンまで含めて元の descriptor を保存する。
    const desc =
      Object.getOwnPropertyDescriptor(document, 'cookie') ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(document), 'cookie');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => desc?.get?.call(document) ?? '',
      set: () => {
        throw new Error('cookie denied');
      }
    });
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      if (desc) {
        Object.defineProperty(document, 'cookie', desc);
      } else {
        delete (document as unknown as Record<string, unknown>).cookie;
      }
      warnSpy.mockRestore();
    }
  });

  it('handleCreateProfile: フォルダ紐付け失敗時は作成せず error toast', async () => {
    const spy = vi
      .spyOn(syncModule, 'linkPickedDirectory')
      .mockRejectedValue(new Error('permission denied'));
    try {
      const h = makeHarness();
      const { result } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

      await act(async () => {
        await result.current.handleCreateProfile(
          'Linked',
          '1.21.1',
          'Fabric',
          'd',
          [],
          undefined,
          undefined,
          { picked: {} as PickedDirectory, detected: {} as DetectedEnvironment }
        );
      });
      expect(h.showToast).toHaveBeenCalledWith(
        expect.stringContaining('フォルダの紐付けに失敗'),
        'error'
      );
      expect(result.current.profiles).toHaveLength(1); // 作成されない
    } finally {
      spy.mockRestore();
    }
  });

  it('handleCreateProfile: extras (resourcepacks/shaderpacks/unknownFiles) を反映する', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    const extras: ProfileContentExtras = {
      resourcepacks: [
        {
          projectId: 'rp-1',
          name: 'RP',
          type: 'resourcepack',
          versionId: 'v1',
          filename: 'a.zip',
          fileUrl: 'u'
        } as ProjectItem
      ],
      shaderpacks: [
        {
          projectId: 'sh-1',
          name: 'SH',
          type: 'shader',
          versionId: 'v2',
          filename: 'b.zip',
          fileUrl: 'u'
        } as ProjectItem
      ],
      unknownFiles: [
        {
          id: 'u1',
          location: 'mods',
          filename: 'x.jar',
          path: 'mods/x.jar',
          sha1: 's',
          size: 1,
          discoveredAt: 1
        }
      ]
    };
    await act(async () => {
      await result.current.handleCreateProfile('Ext', '1.21.1', 'Fabric', 'd', [], undefined, extras);
    });
    const created = result.current.profiles.find((p) => p.name === 'Ext')!;
    expect(created.resourcepacks).toHaveLength(1);
    expect(created.shaderpacks).toHaveLength(1);
    expect(created.unknownFiles).toHaveLength(1);
  });

  it('handleCreateProfile: link 付きで台帳 seed 失敗は warning のみ', async () => {
    const linkSpy = vi.spyOn(syncModule, 'linkPickedDirectory').mockResolvedValue({
      type: 'local',
      profileId: 'new-profile',
      path: '/tmp/env'
    } as unknown as LinkedSource);
    const managedSpy = vi
      .spyOn(syncModule, 'getManagedFiles')
      .mockRejectedValue(new Error('db fail'));
    try {
      const h = makeHarness();
      const { result } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

      await act(async () => {
        await result.current.handleCreateProfile(
          'Seed',
          '1.21.1',
          'Fabric',
          'd',
          [],
          undefined,
          undefined,
          { picked: {} as PickedDirectory, detected: {} as DetectedEnvironment }
        );
      });
      expect(h.showToast).toHaveBeenCalledWith(
        expect.stringContaining('台帳の初期化に失敗'),
        'warning'
      );
      expect(result.current.profiles.some((p) => p.name === 'Seed')).toBe(true);
    } finally {
      linkSpy.mockRestore();
      managedSpy.mockRestore();
    }
  });

  it('handleCreateProfile: 即時 Dexie 保存失敗は console.warn のみで作成は継続', async () => {
    const saveSpy = vi
      .spyOn(dexieModule, 'syncProfiles')
      .mockRejectedValueOnce(new Error('save fail'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h = makeHarness();
      const { result } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

      await act(async () => {
        await result.current.handleCreateProfile('Keep', '1.21.1', 'Fabric', 'd');
      });
      expect(result.current.profiles.some((p) => p.name === 'Keep')).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      saveSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('handleToggleMod: 他プロファイルには影響しない', async () => {
    const h = makeHarness();
    useProfilesStore.setState((s) => ({
      profiles: [
        ...s.profiles,
        {
          id: 'p2',
          name: 'P2',
          environment: { mcVersion: '1.21.1', loader: 'Forge' },
          description: '',
          mods: []
        }
      ]
    }));
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(result.current.currentProfile!.mods).toHaveLength(1);
    expect(
      useProfilesStore.getState().profiles.find((p) => p.id === 'p2')!.mods
    ).toHaveLength(0);
  });

  it('handleUpdateModVersion: primary が無いバージョンは先頭ファイルで更新', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    const added = result.current.currentProfile!.mods[0]!;

    const knownVersion = {
      id: 'ver-nonprimary',
      project_id: 'id-sodium',
      files: [
        {
          url: 'https://cdn.example/alt.jar',
          filename: 'alt.jar',
          primary: false,
          size: 5
        }
      ]
    } as unknown as import('@/types').ModrinthVersion;
    await act(async () => {
      await result.current.handleUpdateModVersion(
        added.projectId,
        'ver-nonprimary',
        knownVersion
      );
    });
    expect(result.current.currentProfile!.mods[0]!.versionId).toBe('ver-nonprimary');
    expect(result.current.currentProfile!.mods[0]!.fileUrl).toBe(
      'https://cdn.example/alt.jar'
    );
  });

  it('handleSaveEditedProfile: MC/ローダー変更 + mod ありで warning を出す', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    act(() => {
      result.current.handleSaveEditedProfile('Renamed', '1.21.1', 'NeoForge', 'desc');
    });
    expect(h.showToast).toHaveBeenCalledWith(
      expect.stringContaining('MC/ローダーを変更'),
      'warning'
    );
  });

  // ========================================================================
  // COV-2: 第 2 バッチ (hydrate 詳細 / debounce 境界 / CRUD 残り分岐)
  // ========================================================================

  it('hydrate: 保存済み currentProfileId を検証して復元する (有効)', async () => {
    await db.profiles.bulkPut([
      {
        id: 'p1',
        name: 'P1',
        environment: { mcVersion: '1.20.1', loader: 'Fabric' },
        mods: [],
        updatedAt: 1
      },
      {
        id: 'p2',
        name: 'P2',
        environment: { mcVersion: '1.21.1', loader: 'Forge' },
        mods: [],
        updatedAt: 1
      }
    ]);
    await db.meta.put({ key: META_KEYS.CURRENT_PROFILE_ID, value: 'p2' });
    const h = makeHarness();
    renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
    expect(useProfilesStore.getState().currentProfileId).toBe('p2');
  });

  it('hydrate: currentProfileId が存在しなければ先頭プロファイルへフォールバック', async () => {
    await db.profiles.bulkPut([
      {
        id: 'p1',
        name: 'P1',
        environment: { mcVersion: '1.20.1', loader: 'Fabric' },
        mods: [],
        updatedAt: 1
      }
    ]);
    await db.meta.put({ key: META_KEYS.CURRENT_PROFILE_ID, value: 'ghost' });
    const h = makeHarness();
    renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
    expect(useProfilesStore.getState().currentProfileId).toBe('p1');
  });

  it('hydrate: currentProfileId が存在しなければ何もセットしない (db 空)', async () => {
    await db.meta.put({ key: META_KEYS.CURRENT_PROFILE_ID, value: 'ghost' });
    const h = makeHarness();
    renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
    // dbProfiles も空 → フォールバック先なし → セットしない (既存のまま)
    expect(useProfilesStore.getState().currentProfileId).toBe('default-profile');
  });

  it('hydrate: unmount 後は結果を反映しない (cancelled)', async () => {
    let resolveToArray: (v: never[]) => void = () => {};
    let resolveMeta: (v: string | null) => void = () => {};
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockImplementation(
        () =>
          new Promise((r) => (resolveToArray = r)) as never
      );
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockImplementation(
        () =>
          new Promise((r) => (resolveMeta = r)) as never
      );
    try {
      const h = makeHarness();
      const { unmount } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      unmount();
      await act(async () => {
        resolveToArray([]);
        resolveMeta(null);
        await new Promise((r) => setTimeout(r, 10));
      });
      // cancelled のため hasHydrated は true にならない
      expect(useProfilesStore.getState().hasHydrated).toBe(false);
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
    }
  });

  it('hydrate: LocalStorage フォールバックは LEGACY キーからも読む', async () => {
    const legacy = {
      theme: 'dark',
      profiles: [
        {
          id: 'legacy-1',
          name: 'Legacy',
          environment: { mcVersion: '1.19.4', loader: 'Forge' },
          description: '',
          mods: []
        }
      ],
      currentProfileId: 'legacy-1'
    };
    localStorage.setItem(LOCAL_STORAGE_KEYS.LEGACY, JSON.stringify(legacy));
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      expect(useProfilesStore.getState().profiles[0]!.id).toBe('legacy-1');
      expect(useProfilesStore.getState().currentProfileId).toBe('legacy-1');
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
    }
  });

  it('hydrate: LocalStorage の値が不正なら無視する (sanitized falsy)', async () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, 'null');
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      // default-profile のまま
      expect(useProfilesStore.getState().profiles[0]!.id).toBe('default-profile');
      expect(h.setThemeState).not.toHaveBeenCalled();
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
    }
  });

  it('hydrate: LocalStorage の JSON が壊れていれば inner catch に落ちる', async () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, '{ broken json');
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('hydrate: LocalStorage の currentProfileId が不正なら先頭へフォールバック', async () => {
    const lsState = {
      theme: 'dark',
      profiles: [
        {
          id: 'ls-1',
          name: 'LS1',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          description: '',
          mods: []
        }
      ],
      currentProfileId: 'ghost'
    };
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, JSON.stringify(lsState));
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      expect(useProfilesStore.getState().currentProfileId).toBe('ls-1');
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
    }
  });

  it('debounce: バックアップ期限切れなら LocalStorage に書き込まない', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // migrateFromLocalStorage が期限を未来に設定するため、ここで過去へ書き換える
    await db.meta.put({
      key: META_KEYS.BACKUP_EXPIRES_AT,
      value: String(Date.now() - 1000)
    });
    await act(async () => {
      result.current.setProfiles((prev) => [
        ...prev,
        {
          id: 'extra-4',
          name: 'Extra4',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          description: '',
          mods: []
        }
      ]);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT)).toBeNull();
  });

  it('debounce: LocalStorage バックアップ書き込み失敗は console.warn に落ちる', async () => {
    await db.meta.put({
      key: META_KEYS.BACKUP_EXPIRES_AT,
      value: String(Date.now() + 3600_000)
    });
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h = makeHarness();
      const { result } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      await act(async () => {
        result.current.setProfiles((prev) => [
          ...prev,
          {
            id: 'extra-5',
            name: 'Extra5',
            environment: { mcVersion: '1.20.1', loader: 'Fabric' },
            description: '',
            mods: []
          }
        ]);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 600));
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('handleCreateProfile: link 失敗が非 Error throw でも String 化する', async () => {
    const spy = vi
      .spyOn(syncModule, 'linkPickedDirectory')
      .mockRejectedValue('plain-string-error');
    try {
      const h = makeHarness();
      const { result } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

      await act(async () => {
        await result.current.handleCreateProfile(
          'Linked',
          '1.21.1',
          'Fabric',
          'd',
          [],
          undefined,
          undefined,
          { picked: {} as PickedDirectory, detected: {} as DetectedEnvironment }
        );
      });
      expect(h.showToast).toHaveBeenCalledWith(
        expect.stringContaining('plain-string-error'),
        'error'
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('handleCreateProfile: link 付きで台帳レコードが 0 件なら seed しない', async () => {
    const linkSpy = vi.spyOn(syncModule, 'linkPickedDirectory').mockResolvedValue({
      type: 'local',
      profileId: 'new-profile',
      path: '/tmp/env'
    } as unknown as LinkedSource);
    const managedSpy = vi
      .spyOn(syncModule, 'getManagedFiles')
      .mockResolvedValue([]);
    try {
      const h = makeHarness();
      const { result } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

      await act(async () => {
        await result.current.handleCreateProfile(
          'Seed0',
          '1.21.1',
          'Fabric',
          'd',
          [], // mods なし → expandProfileToManaged も 0 件
          undefined,
          undefined,
          { picked: {} as PickedDirectory, detected: {} as DetectedEnvironment }
        );
      });
      // warning は出ない (seed 失敗ではなく 0 件スキップ)
      expect(h.showToast).not.toHaveBeenCalledWith(
        expect.stringContaining('台帳の初期化に失敗'),
        'warning'
      );
      expect(result.current.profiles.some((p) => p.name === 'Seed0')).toBe(true);
    } finally {
      linkSpy.mockRestore();
      managedSpy.mockRestore();
    }
  });

  it('handleSwitchProfile: 存在しない id では toast を出さない', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    act(() => {
      result.current.handleSwitchProfile('does-not-exist');
    });
    expect(h.showToast).not.toHaveBeenCalledWith(
      expect.stringContaining('切替'),
      'info'
    );
  });

  it('handleDuplicateProfile: extras (resourcepacks 等) も deep copy される', async () => {
    // renderHook 前に extras 付きプロファイルを store に設定 (ref 初期値に反映)
    useProfilesStore.setState((s) => ({
      profiles: s.profiles.map((p) => ({
        ...p,
        resourcepacks: [
          {
            projectId: 'rp-1',
            name: 'RP',
            type: 'resourcepack' as const,
            versionId: 'v1',
            filename: 'a.zip',
            fileUrl: 'u'
          }
        ],
        shaderpacks: [
          {
            projectId: 'sh-1',
            name: 'SH',
            type: 'shader' as const,
            versionId: 'v2',
            filename: 'b.zip',
            fileUrl: 'u'
          }
        ],
        unknownFiles: [
          {
            id: 'u1',
            location: 'mods' as const,
            filename: 'x.jar',
            path: 'mods/x.jar',
            sha1: 's',
            size: 1,
            discoveredAt: 1
          }
        ]
      }))
    }));
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    act(() => {
      result.current.handleDuplicateProfile();
    });
    const dup = result.current.profiles[1]!;
    expect(dup.resourcepacks).toHaveLength(1);
    expect(dup.shaderpacks).toHaveLength(1);
    expect(dup.unknownFiles).toHaveLength(1);
  });

  it('handleDuplicateProfile: currentProfileId が無効なら先頭を複製する', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    useProfilesStore.setState({ currentProfileId: 'ghost-id' });
    await waitFor(() =>
      expect(useProfilesStore.getState().currentProfileId).toBe('ghost-id')
    );
    act(() => {
      result.current.handleDuplicateProfile();
    });
    // profiles[0] (default-profile) が複製される
    expect(result.current.profiles[1]!.name).toContain('軽量化');
  });

  it('handleSaveEditedProfile: 他プロファイルには影響しない', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.handleCreateProfile('Other', '1.20.1', 'Fabric', '');
    });
    const otherId = result.current.profiles[1]!.id;
    // current を default-profile に戻してから編集
    act(() => {
      result.current.handleSwitchProfile('default-profile');
    });
    act(() => {
      result.current.handleSaveEditedProfile('Renamed', '1.21.1', 'Fabric', 'd');
    });
    const other = useProfilesStore.getState().profiles.find(
      (p) => p.id === otherId
    )!;
    expect(other.name).toBe('Other');
    expect(other.environment.mcVersion).toBe('1.20.1');
  });

  it('handleDeleteProfile: 他プロファイルを削除しても current は維持される', async () => {
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.handleCreateProfile('Del', '1.20.1', 'Fabric', '');
    });
    const delId = result.current.profiles[1]!.id;
    // current は 'Del' に切り替わっている → default に戻す
    act(() => {
      result.current.handleSwitchProfile('default-profile');
    });
    await act(async () => {
      await result.current.handleDeleteProfile(delId);
    });
    expect(useProfilesStore.getState().currentProfileId).toBe('default-profile');
    expect(result.current.profiles).toHaveLength(1);
  });

  it('handleDeleteProfile: 存在しない id でも confirm は呼ばれる (名称未設定)', async () => {
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      result.current.handleCreateProfile('D2', '1.20.1', 'Fabric', '');
    });
    await act(async () => {
      await result.current.handleDeleteProfile('ghost-id');
    });
    expect(h.confirmDialog).toHaveBeenCalled();
    // ghost は存在しないので何も消えない
    expect(result.current.profiles).toHaveLength(2);
  });

  // ========================================================================
  // COV-2: 第 3 バッチ (handleToggleMod / applyModVersion / removeAll / removeMods)
  // ========================================================================

  it('handleToggleMod: currentProfileId が無効でも先頭プロファイルでバージョン取得は行う', async () => {
    const h = makeHarness();
    useProfilesStore.setState({ currentProfileId: 'ghost-id' });
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // バージョン取得は latestProfile (profiles[0]) の環境で実行されるが、
    // 追加先判定は currentProfileIdRef を見るため ghost には追加されない (仕様)。
    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(
      useProfilesStore.getState().profiles.every((p) => p.mods.length === 0)
    ).toBe(true);
  });

  it('handleToggleMod: プロファイルが無ければ何もしない (latest ガード)', async () => {
    useProfilesStore.setState({ profiles: [], currentProfileId: '' });
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    // hydrate 完了前に呼ぶ (recovery が走る前に latest ガードが先に効く)
    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(useProfilesStore.getState().profiles).toHaveLength(0);
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('handleToggleMod: 削除時も他プロファイルには影響しない', async () => {
    const h = makeHarness();
    useProfilesStore.setState((s) => ({
      profiles: [
        ...s.profiles,
        {
          id: 'p2',
          name: 'P2',
          environment: { mcVersion: '1.21.1', loader: 'Forge' },
          description: '',
          mods: []
        }
      ]
    }));
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
      await result.current.handleToggleMod(addedId); // 削除
    });
    expect(result.current.currentProfile!.mods).toHaveLength(0);
    expect(
      useProfilesStore.getState().profiles.find((p) => p.id === 'p2')!.mods
    ).toHaveLength(0);
  });

  it('handleToggleMod: silent=true の追加は toast を出さない', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium', undefined, true);
    });
    expect(result.current.currentProfile!.mods).toHaveLength(1);
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('handleToggleMod: silent=true で files 空でも toast を出さない', async () => {
    const h = makeHarness();
    server.use(
      http.get('/api/modrinth/project/sodium/version', () =>
        HttpResponse.json([
          {
            id: 'ver-empty',
            project_id: 'id-sodium',
            version_number: '1.0.0',
            files: [],
            game_versions: ['1.20.1'],
            loaders: ['fabric']
          }
        ])
      ),
      http.get('https://api.modrinth.com/v2/project/sodium/version', () =>
        HttpResponse.json([
          {
            id: 'ver-empty',
            project_id: 'id-sodium',
            version_number: '1.0.0',
            files: [],
            game_versions: ['1.20.1'],
            loaders: ['fabric']
          }
        ])
      )
    );
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium', undefined, true);
    });
    expect(result.current.currentProfile!.mods).toHaveLength(0);
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('handleToggleMod: silent=true で fetch 失敗でも toast を出さない', async () => {
    const h = makeHarness();
    // fetchStableModVersion は version 取得失敗を内部で握りつぶすため、
    // catch 到達には project 取得を失敗させる必要がある (proxy → direct)
    server.use(
      http.get('/api/modrinth/project/sodium', () =>
        HttpResponse.json(null, { status: 500 })
      ),
      http.get('https://api.modrinth.com/v2/project/sodium', () =>
        HttpResponse.json(null, { status: 500 })
      )
    );
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium', undefined, true);
    });
    expect(result.current.currentProfile!.mods).toHaveLength(0);
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('cookie 書き込み: https 環境では Secure 属性が付く', async () => {
    // jsdom は http://localhost なので、一時的に location.protocol を https に偽装
    const locDesc = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'https:' }
    });
    const captured: string[] = [];
    const desc =
      Object.getOwnPropertyDescriptor(document, 'cookie') ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(document), 'cookie');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => desc?.get?.call(document) ?? '',
      set: (v: string) => {
        captured.push(v);
      }
    });
    try {
      const h = makeHarness();
      const { result } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      act(() => {
        result.current.handleSwitchProfile('default-profile');
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      // cookie の中身は SSR 検索用の mcVersion/loader JSON (encodeURIComponent 済み)
      const activeCookie = captured.find((c) =>
        c.startsWith('dropmod_active_profile=')
      );
      expect(activeCookie).toBeDefined();
      expect(activeCookie).toContain('Secure');
      expect(activeCookie).toContain(encodeURIComponent('1.20.1'));
    } finally {
      if (desc) {
        Object.defineProperty(document, 'cookie', desc);
      } else {
        // 元の descriptor が無い場合は自身に定義しなかったので削除して戻す
        // (jsdom は prototype 経由で解決する)
      }
      if (locDesc) Object.defineProperty(window, 'location', locDesc);
    }
  });

  it('debounce: 保留中の保存がある状態でアンマウントするとタイマーがクリアされる', async () => {
    const h = makeHarness();
    const { result, unmount } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
    // 初回 hydrate による保存が確定してから操作する
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });

    await act(async () => {
      result.current.setProfiles((prev) => [
        ...prev,
        {
          id: 'extra-9',
          name: 'Extra9',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          description: '',
          mods: []
        }
      ]);
    });
    // 500ms タイマー発火前にアンマウント → cleanup で clearTimeout
    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    const rows = await db.profiles.toArray();
    expect(rows.some((r) => r.id === 'extra-9')).toBe(false);
  });

  it('debounce: hydrate 完了前にアンマウントしても何も起きない', async () => {
    // hydrate を保留 Promise でブロック → hasHydrated=false のまま
    // cleanup が「タイマー未セット」分岐 (L311 path 1) を通る
    const pending = new Promise(() => {});
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockReturnValueOnce(pending as never);
    try {
      const h = makeHarness();
      const { unmount } = renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      unmount();
      expect(useProfilesStore.getState().hasHydrated).toBe(false);
    } finally {
      toArraySpy.mockRestore();
    }
  });

  it('handleUpdateModVersion: 対象外の mod は変更されない (applyModVersion の非一致)', async () => {
    const h = makeHarness();
    useProfilesStore.setState((s) => ({
      profiles: s.profiles.map((p) => ({
        ...p,
        mods: [
          {
            projectId: 'id-sodium',
            slug: 'sodium',
            name: 'Sodium',
            type: 'mod' as const,
            versionId: 'v1',
            filename: 'a.jar',
            fileUrl: 'u'
          },
          {
            projectId: 'id-lithium',
            slug: 'lithium',
            name: 'Lithium',
            type: 'mod' as const,
            versionId: 'v1',
            filename: 'b.jar',
            fileUrl: 'u'
          }
        ]
      }))
    }));
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleUpdateModVersion('sodium', 'ver-99');
    });
    const mods = result.current.currentProfile!.mods;
    expect(mods.find((m) => m.slug === 'sodium')!.versionId).toBe('ver-99');
    expect(mods.find((m) => m.slug === 'lithium')!.versionId).toBe('v1');
  });

  it('handleToggleMod: version_type が無いバージョンでも既定値 release で追加できる', async () => {
    const h = makeHarness();
    server.use(
      http.get('/api/modrinth/project/sodium/version', () =>
        HttpResponse.json([
          {
            id: 'ver-notype',
            project_id: 'id-sodium',
            version_number: '1.0.0',
            files: [
              {
                url: 'https://cdn.example/sodium.jar',
                filename: 'sodium.jar',
                primary: true,
                size: 10
              }
            ],
            game_versions: ['1.20.1'],
            loaders: ['fabric']
          }
        ])
      ),
      http.get('https://api.modrinth.com/v2/project/sodium/version', () =>
        HttpResponse.json([
          {
            id: 'ver-notype',
            project_id: 'id-sodium',
            version_number: '1.0.0',
            files: [
              {
                url: 'https://cdn.example/sodium.jar',
                filename: 'sodium.jar',
                primary: true,
                size: 10
              }
            ],
            game_versions: ['1.20.1'],
            loaders: ['fabric']
          }
        ])
      )
    );
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    expect(result.current.currentProfile!.mods[0]!.versionType).toBe('release');
  });

  it('handleToggleMod: API 応答前に追加済みなら二重追加しない (alreadyAdded)', async () => {
    const h = makeHarness();
    server.use(
      http.get('/api/modrinth/project/sodium/version', async () => {
        await new Promise((r) => setTimeout(r, 120));
        return HttpResponse.json([
          {
            id: 'ver-slow',
            project_id: 'id-sodium',
            version_number: '1.0.0',
            version_type: 'release',
            files: [
              {
                url: 'https://cdn.example/sodium.jar',
                filename: 'sodium.jar',
                primary: true,
                size: 10
              }
            ],
            game_versions: ['1.20.1'],
            loaders: ['fabric']
          }
        ]);
      }),
      http.get('https://api.modrinth.com/v2/project/sodium/version', async () => {
        await new Promise((r) => setTimeout(r, 120));
        return HttpResponse.json([
          {
            id: 'ver-slow',
            project_id: 'id-sodium',
            version_number: '1.0.0',
            version_type: 'release',
            files: [
              {
                url: 'https://cdn.example/sodium.jar',
                filename: 'sodium.jar',
                primary: true,
                size: 10
              }
            ],
            game_versions: ['1.20.1'],
            loaders: ['fabric']
          }
        ]);
      })
    );
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    const togglePromise = result.current.handleToggleMod('sodium');
    // 応答前に別経路で追加済みにする
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
      useProfilesStore.setState((s) => ({
        profiles: s.profiles.map((p) => ({
          ...p,
          mods: [
            ...p.mods,
            {
              projectId: 'id-sodium',
              slug: 'sodium',
              name: 'Manual Sodium',
              type: 'mod' as const,
              versionId: 'manual',
              filename: 'manual.jar',
              fileUrl: 'u'
            }
          ]
        }))
      }));
    });
    await act(async () => {
      await togglePromise;
    });
    // 二重追加されない (1 件のまま)
    expect(result.current.currentProfile!.mods).toHaveLength(1);
    expect(h.showToast).toHaveBeenCalledWith(
      expect.stringContaining('既に追加されています'),
      'info'
    );
  });

  it('handleUpdateModVersion: slug 指定でも更新できる', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    await act(async () => {
      await result.current.handleUpdateModVersion('sodium', 'ver-99');
    });
    expect(result.current.currentProfile!.mods[0]!.versionId).toBe('ver-99');
  });

  it('handleUpdateModVersion: files が空の knownVersion は fetch フォールバックする', async () => {
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
      await result.current.handleUpdateModVersion(addedId, 'ver-fallback', {
        id: 'ver-fallback',
        project_id: addedId,
        author_id: 'a',
        featured: false,
        name: 'empty',
        version_number: '0',
        date_published: '2026-01-01',
        downloads: 0,
        version_type: 'release',
        files: [],
        game_versions: ['1.20.1'],
        loaders: ['fabric']
      });
    });
    // knownVersion の files が空 → /version/ver-fallback を fetch → 反映される
    expect(result.current.currentProfile!.mods[0]!.versionId).toBe('ver-fallback');
  });

  it('handleUpdateModVersion: 他プロファイルには影響しない', async () => {
    const h = makeHarness();
    useProfilesStore.setState((s) => ({
      profiles: [
        ...s.profiles,
        {
          id: 'p2',
          name: 'P2',
          environment: { mcVersion: '1.21.1', loader: 'Forge' },
          description: '',
          mods: []
        }
      ]
    }));
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
      await result.current.handleUpdateModVersion(addedId, 'ver-99');
    });
    expect(result.current.currentProfile!.mods[0]!.versionId).toBe('ver-99');
    expect(
      useProfilesStore.getState().profiles.find((p) => p.id === 'p2')!.mods
    ).toHaveLength(0);
  });

  it('handleRemoveAllMods: category 指定でそのカテゴリだけ削除する', async () => {
    // renderHook 前に mods + resourcepacks を持つプロファイルを store に設定
    useProfilesStore.setState((s) => ({
      profiles: s.profiles.map((p) => ({
        ...p,
        mods: [
          {
            projectId: 'proj-sodium',
            slug: 'sodium',
            name: 'Sodium',
            type: 'mod' as const,
            versionId: 'v1',
            filename: 'sodium.jar',
            fileUrl: 'u'
          }
        ],
        resourcepacks: [
          {
            projectId: 'rp-1',
            name: 'RP',
            type: 'resourcepack' as const,
            versionId: 'v1',
            filename: 'a.zip',
            fileUrl: 'u'
          }
        ]
      }))
    }));
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleRemoveAllMods('resourcepack');
    });
    const profile = result.current.currentProfile!;
    expect(profile.mods).toHaveLength(1);
    expect(profile.resourcepacks).toHaveLength(0);
  });

  it('handleRemoveAllMods: プロファイルが無ければ何もしない', async () => {
    useProfilesStore.setState({ profiles: [], currentProfileId: '' });
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await act(async () => {
      await result.current.handleRemoveAllMods();
    });
    expect(h.confirmDialog).not.toHaveBeenCalled();
  });

  it('handleRemoveMods: プロファイルが無ければ何もしない', async () => {
    useProfilesStore.setState({ profiles: [], currentProfileId: '' });
    const h = makeHarness(true);
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await act(async () => {
      await result.current.handleRemoveMods(['x']);
    });
    expect(h.confirmDialog).not.toHaveBeenCalled();
  });

  it('handleRemoveMods: 他プロファイルには影響しない', async () => {
    const h = makeHarness(true);
    useProfilesStore.setState((s) => ({
      profiles: [
        ...s.profiles,
        {
          id: 'p2',
          name: 'P2',
          environment: { mcVersion: '1.21.1', loader: 'Forge' },
          description: '',
          mods: []
        }
      ]
    }));
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
    expect(result.current.currentProfile!.mods).toHaveLength(0);
    expect(
      useProfilesStore.getState().profiles.find((p) => p.id === 'p2')!.mods
    ).toHaveLength(0);
  });

  // ========================================================================
  // COV-2: 第 4 バッチ (LS フォールバック詳細 / duplicate 空 / silent 系)
  // ========================================================================

  it('hydrate: Dexie 失敗 + LocalStorage 空なら何も復元しない', async () => {
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      // フォールバック先がない → default-profile のまま
      expect(useProfilesStore.getState().profiles[0]!.id).toBe('default-profile');
      expect(h.setThemeState).not.toHaveBeenCalled();
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
    }
  });

  it('hydrate: LocalStorage に theme が無ければ setThemeState しない', async () => {
    const lsState = {
      profiles: [
        {
          id: 'ls-1',
          name: 'LS1',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          description: '',
          mods: []
        }
      ]
    };
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, JSON.stringify(lsState));
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      expect(h.setThemeState).not.toHaveBeenCalled();
      expect(useProfilesStore.getState().profiles[0]!.id).toBe('ls-1');
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
    }
  });

  it('hydrate: LocalStorage に profiles が無ければ復元しない', async () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEYS.CURRENT,
      JSON.stringify({ theme: 'dark' })
    );
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      expect(h.setThemeState).toHaveBeenCalledWith('dark');
      // profiles は復元されない (default-profile のまま)
      expect(useProfilesStore.getState().profiles[0]!.id).toBe('default-profile');
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
    }
  });

  it('hydrate: LocalStorage に currentProfileId が無ければセットしない', async () => {
    const lsState = {
      theme: 'dark',
      profiles: [
        {
          id: 'ls-1',
          name: 'LS1',
          environment: { mcVersion: '1.20.1', loader: 'Fabric' },
          description: '',
          mods: []
        }
      ]
    };
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT, JSON.stringify(lsState));
    const toArraySpy = vi
      .spyOn(db.profiles, 'toArray')
      .mockRejectedValue(new Error('dexie down'));
    const metaGetSpy = vi
      .spyOn(db.meta, 'get')
      .mockRejectedValue(new Error('meta down'));
    try {
      const h = makeHarness();
      renderHook(
        () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));
      expect(useProfilesStore.getState().currentProfileId).toBe('default-profile');
    } finally {
      toArraySpy.mockRestore();
      metaGetSpy.mockRestore();
    }
  });

  it('handleDuplicateProfile: プロファイルが無ければ何もしない', async () => {
    useProfilesStore.setState({ profiles: [], currentProfileId: '' });
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await act(async () => {
      result.current.handleDuplicateProfile();
    });
    expect(useProfilesStore.getState().profiles).toHaveLength(0);
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('handleSaveEditedProfile: mod があっても環境変更が無ければ warning を出さない', async () => {
    const h = makeHarness();
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    act(() => {
      // 環境は変えない (1.20.1 / Fabric のまま)
      result.current.handleSaveEditedProfile('Renamed', '1.20.1', 'Fabric', 'd');
    });
    expect(h.showToast).not.toHaveBeenCalledWith(
      expect.stringContaining('MC/ローダーを変更'),
      'warning'
    );
  });

  it('handleToggleMod: name が無い mod の削除は「Mod」として toast を出す', async () => {
    const h = makeHarness();
    useProfilesStore.setState((s) => ({
      profiles: s.profiles.map((p) => ({
        ...p,
        mods: [
          {
            projectId: 'proj-x',
            slug: 'x',
            name: '',
            type: 'mod' as const,
            versionId: 'v1',
            filename: 'x.jar',
            fileUrl: 'u'
          }
        ]
      }))
    }));
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('proj-x');
    });
    expect(result.current.currentProfile!.mods).toHaveLength(0);
    expect(h.showToast).toHaveBeenCalledWith(
      expect.stringContaining('「Mod」を削除しました'),
      'info'
    );
  });

  it('handleToggleMod: silent=true で fetch 失敗でも toast を出さない', async () => {
    const h = makeHarness();
    server.use(
      http.get('/api/modrinth/project/sodium/version', () =>
        HttpResponse.json(null, { status: 500 })
      ),
      http.get('https://api.modrinth.com/v2/project/sodium/version', () =>
        HttpResponse.json(null, { status: 500 })
      )
    );
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium', undefined, true);
    });
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('handleUpdateModVersion: 他プロファイルの同名 mod には影響しない', async () => {
    const h = makeHarness();
    useProfilesStore.setState((s) => ({
      profiles: [
        ...s.profiles,
        {
          id: 'p2',
          name: 'P2',
          environment: { mcVersion: '1.21.1', loader: 'Forge' },
          description: '',
          mods: [
            {
              projectId: 'id-sodium',
              slug: 'sodium',
              name: 'Sodium p2',
              type: 'mod' as const,
              versionId: 'p2-v1',
              filename: 'p2.jar',
              fileUrl: 'u'
            }
          ]
        }
      ]
    }));
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
      await result.current.handleUpdateModVersion(addedId, 'ver-99');
    });
    expect(result.current.currentProfile!.mods[0]!.versionId).toBe('ver-99');
    expect(
      useProfilesStore.getState().profiles.find((p) => p.id === 'p2')!.mods[0]!
        .versionId
    ).toBe('p2-v1');
  });

  it('handleUpdateModVersion: currentProfileId が無効なら mod 無しで return', async () => {
    const h = makeHarness();
    useProfilesStore.setState({ currentProfileId: 'ghost-id' });
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    // default-profile には mod が無い → 何もしない
    await act(async () => {
      await result.current.handleUpdateModVersion('sodium', 'ver-1');
    });
    expect(useProfilesStore.getState().profiles[0]!.mods).toHaveLength(0);
  });

  it('handleRemoveAllMods: shader 指定で Shader ラベルが使われる', async () => {
    const h = makeHarness(true);
    useProfilesStore.setState((s) => ({
      profiles: s.profiles.map((p) => ({
        ...p,
        shaderpacks: [
          {
            projectId: 'sh-1',
            name: 'SH',
            type: 'shader' as const,
            versionId: 'v1',
            filename: 'a.zip',
            fileUrl: 'u'
          }
        ]
      }))
    }));
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleRemoveAllMods('shader');
    });
    expect(h.confirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Shaderをすべて削除しますか？' })
    );
    expect(result.current.currentProfile!.shaderpacks).toHaveLength(0);
  });

  it('handleRemoveAllMods: 他プロファイルには影響しない', async () => {
    const h = makeHarness(true);
    useProfilesStore.setState((s) => ({
      profiles: [
        ...s.profiles,
        {
          id: 'p2',
          name: 'P2',
          environment: { mcVersion: '1.21.1', loader: 'Forge' },
          description: '',
          mods: []
        }
      ]
    }));
    const { result } = renderHook(
      () => useProfiles(h.theme, h.setThemeState, h.showToast, h.confirmDialog),
      { wrapper: createQueryWrapper() }
    );
    await waitFor(() => expect(useProfilesStore.getState().hasHydrated).toBe(true));

    await act(async () => {
      await result.current.handleToggleMod('sodium');
    });
    await act(async () => {
      await result.current.handleRemoveAllMods();
    });
    expect(result.current.currentProfile!.mods).toHaveLength(0);
    expect(
      useProfilesStore.getState().profiles.find((p) => p.id === 'p2')!.mods
    ).toHaveLength(0);
  });
});
