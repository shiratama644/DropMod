/**
 * インポート時 Modpack 追加フロー (Phase 12-D2 / bug 3) test
 * — `hooks/useModpackAdd.ts`
 *
 * - .mrpack ダウンロード → modrinth.index.json 解析 → files[] 展開
 * - 競合なし: 即適用 (modpackSource + lockedVersions + overrides 台帳)
 * - 競合あり: plan を返す → confirm で replace 反映
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import {
  useModpackAdd
} from '@/features/modpack/hooks/useModpackAdd';
import { useProfilesStore } from '@/features/profiles';
import { db } from '@/lib/db/dexie';
import * as modpackAddUtils from '@/features/modpack/utils/modpackAdd';
import type { ModrinthProject, ModrinthVersion, MrpackIndex, Profile } from '@/types';

vi.mock('@/lib/modrinth/client', () => ({
  fetchStableModVersion: vi.fn(),
  fetchModrinthVersionFilesBatch: vi.fn(),
  fetchModrinthBatch: vi.fn()
}));

vi.mock('@/lib/utils/downloadFile', () => ({
  downloadFileWithRetry: vi.fn()
}));

import {
  fetchStableModVersion,
  fetchModrinthVersionFilesBatch,
  fetchModrinthBatch
} from '@/lib/modrinth/client';
import { downloadFileWithRetry } from '@/lib/utils/downloadFile';

const PROJECT: ModrinthProject = {
  id: 'pack-1',
  slug: 'test-pack',
  title: 'Test Pack',
  description: 'desc',
  project_type: 'modpack',
  downloads: 1,
  icon_url: undefined,
  categories: ['fabric'],
  display_categories: ['fabric'],
  published: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
  source_url: null,
  issues_url: null,
  wiki_url: null,
  discord_url: null,
  license: { id: 'MIT', name: 'MIT', url: null },
  client_side: 'required',
  server_side: 'required',
  loaders: ['fabric'],
  game_versions: ['1.21.1']
};

const VERSION: ModrinthVersion = {
  id: 'pack-ver-1',
  project_id: 'pack-1',
  author_id: 'author',
  featured: true,
  name: 'Test Pack 1.0.0',
  version_number: '1.0.0',
  date_published: '2026-01-01T00:00:00Z',
  downloads: 1,
  version_type: 'release',
  files: [
    {
      url: 'https://cdn.example/pack-1/pack-ver-1.mrpack',
      filename: 'test-pack-1.0.0.mrpack',
      primary: true,
      size: 100
    }
  ],
  game_versions: ['1.21.1'],
  loaders: ['fabric'],
  dependencies: []
};

const INDEX: MrpackIndex = {
  formatVersion: 1,
  game: 'minecraft',
  name: 'Test Pack',
  versionId: '1.0.0',
  dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.0' },
  files: [
    {
      path: 'mods/sodium.jar',
      hashes: { sha1: 'sha-sodium' },
      env: { client: 'required', server: 'required' },
      downloads: ['https://cdn.example/dl/test-pack-1.0.0.mrpack'],
      fileSize: 10
    }
  ]
};

async function buildMrpackBlob(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('modrinth.index.json', JSON.stringify(INDEX));
  zip.file('overrides/mods/extra.jar', 'extra-bytes');
  return zip.generateAsync({ type: 'blob' });
}

function seedProfile(mods: Array<{ projectId: string; versionId: string }>) {
  useProfilesStore.setState({
    profiles: [
      {
        id: 'p1',
        name: 'Fabric 1.21.1',
        environment: { mcVersion: '1.21.1', loader: 'Fabric' },
        description: '',
        mods: mods.map((m) => ({
          projectId: m.projectId,
          versionId: m.versionId,
          versionNumber: `v-${m.versionId}`,
          name: m.projectId,
          type: 'mod' as const,
          filename: `${m.projectId}.jar`,
          fileUrl: 'https://cdn.example/x.jar'
        }))
      }
    ],
    currentProfileId: 'p1',
    hasHydrated: true,
    theme: 'dark'
  });
}

describe('useModpackAdd', () => {
  beforeEach(async () => {
    vi.mocked(fetchStableModVersion).mockResolvedValue({
      targetVersion: VERSION,
      allVersions: [VERSION]
    });
    vi.mocked(fetchModrinthVersionFilesBatch).mockResolvedValue({
      'sha-sodium': {
        id: 'ver-sodium',
        project_id: 'proj-sodium',
        author_id: 'a',
        featured: true,
        name: 'Sodium',
        version_number: '0.6.0',
        date_published: '2026-01-01T00:00:00Z',
        downloads: 1,
        version_type: 'release',
        files: [
          {
            url: 'https://cdn.example/proj-sodium/sodium.jar',
            filename: 'sodium.jar',
            primary: true,
            size: 10
          }
        ],
        game_versions: ['1.21.1'],
        loaders: ['fabric'],
        dependencies: []
      } satisfies ModrinthVersion
    });
    vi.mocked(fetchModrinthBatch).mockResolvedValue([
      {
        id: 'proj-sodium',
        slug: 'sodium',
        title: 'Sodium',
        description: '',
        project_type: 'mod'
      }
    ]);
    vi.mocked(downloadFileWithRetry).mockResolvedValue(await buildMrpackBlob());
    try {
      await db.managedFiles.clear();
      await db.dirHandles.clear();
    } catch {
      // setup 前の空 DB は無視
    }
    // テスト間の toast 蓄積を防ぐ (検証は直近の toast のみ)
    useToastStore.setState({ toasts: [] });
  });

  it('競合なし: 中身を展開して mods に追加し、modpackSource + lockedVersions を設定する', async () => {
    seedProfile([]);
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });

    const profile = useProfilesStore.getState().profiles[0]!;
    expect(profile.mods.map((m) => m.projectId)).toEqual(['proj-sodium']);
    expect(profile.mods[0]).toMatchObject({
      versionId: 'ver-sodium',
      name: 'Sodium',
      type: 'mod'
    });
    expect(profile.modpackSource).toMatchObject({
      provider: 'modrinth',
      projectId: 'pack-1',
      versionId: 'pack-ver-1',
      versionNumber: '1.0.0'
    });
    expect(profile.modpackSource?.lockedVersions).toEqual({
      'proj-sodium': {
        versionId: 'ver-sodium',
        versionNumber: '0.6.0',
        fileUrl: 'https://cdn.example/dl/test-pack-1.0.0.mrpack',
        filename: 'sodium.jar',
        sha1: 'sha-sodium',
        size: 10,
        path: 'mods/sodium.jar'
      }
    });

    // overrides は source:'modpack' で台帳化される
    const records = await db.managedFiles.where('profileId').equals('p1').toArray();
    expect(records).toEqual([
      expect.objectContaining({ path: 'mods/extra.jar', source: 'modpack' })
    ]);
  });

  it('競合あり: plan を返し (既定 keep)、confirm(replace) で Modpack 版に置き換わる', async () => {
    seedProfile([{ projectId: 'proj-sodium', versionId: 'ver-user' }]);
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.plan?.conflicts).toHaveLength(1);
    expect(result.current.plan?.conflicts[0]?.profileItem.versionId).toBe('ver-user');
    // まだ Profile は変わっていない
    expect(useProfilesStore.getState().profiles[0]!.mods[0]!.versionId).toBe('ver-user');

    await act(async () => {
      await result.current.confirm(new Map([['proj-sodium', 'replace']]));
    });
    const profile = useProfilesStore.getState().profiles[0]!;
    expect(profile.mods[0]!.versionId).toBe('ver-sodium');
    expect(profile.modpackSource?.lockedVersions?.['proj-sodium']?.versionId).toBe('ver-sodium');
  });

  it('導入済み (modpackSource 一致) の場合は追加しない', async () => {
    seedProfile([]);
    useProfilesStore.setState((s) => ({
      profiles: s.profiles.map((p) => ({
        ...p,
        modpackSource: {
          provider: 'modrinth',
          projectId: 'pack-1',
          name: 'Test Pack',
          importedAt: 1
        }
      }))
    }));
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    const profile = useProfilesStore.getState().profiles[0]!;
    // 追加されない (mods は元のまま)
    await waitFor(() => {
      expect(useToastStoreStateHasInfo()).toBe(true);
    });
    expect(profile.mods).toHaveLength(0);
  });

  it('別の Modpack が導入済みならブロックする (warning)', async () => {
    seedProfile([]);
    useProfilesStore.setState((s) => ({
      profiles: s.profiles.map((p) => ({
        ...p,
        modpackSource: {
          provider: 'modrinth',
          projectId: 'other-pack',
          name: 'Other',
          importedAt: 1
        }
      }))
    }));
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      const opened = await result.current.addModpack(PROJECT);
      expect(opened).toBe(false);
    });
    await waitFor(() => {
      expect(latestToastMessage()).toContain('別の Modpack');
    });
    expect(useProfilesStore.getState().profiles[0]!.mods).toHaveLength(0);
  });

  it('プロファイルが選択されていなければ warning を出して何もしない', async () => {
    useProfilesStore.setState({ profiles: [], currentProfileId: '', hasHydrated: true });
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      const opened = await result.current.addModpack(PROJECT);
      expect(opened).toBe(false);
    });
    expect(latestToastMessage()).toContain('プロファイルが選択されていません');
  });

  it('バージョンに files が無ければ warning を出して中断する', async () => {
    seedProfile([]);
    vi.mocked(fetchStableModVersion).mockResolvedValue({
      targetVersion: { ...VERSION, files: [] },
      allVersions: [VERSION]
    });
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(latestToastMessage()).toContain('利用可能な Modpack ファイルが見つかりません');
    expect(useProfilesStore.getState().profiles[0]!.mods).toHaveLength(0);
  });

  it('primary ファイルが無い場合は先頭ファイルで続行する', async () => {
    seedProfile([]);
    vi.mocked(fetchStableModVersion).mockResolvedValue({
      targetVersion: {
        ...VERSION,
        files: [
          {
            url: 'https://cdn.example/pack-1/no-primary.mrpack',
            filename: 'no-primary.mrpack',
            primary: false,
            size: 100
          }
        ]
      },
      allVersions: [VERSION]
    });
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    // 先頭ファイルがダウンロードに使われる (downloadFileWithRetry の引数検証は他テストで実施)
    expect(downloadFileWithRetry).toHaveBeenCalledWith(
      'https://cdn.example/pack-1/no-primary.mrpack',
      expect.any(AbortSignal)
    );
  });

  it('.mrpack ダウンロード失敗 (null) は error toast', async () => {
    seedProfile([]);
    vi.mocked(downloadFileWithRetry).mockResolvedValue(null);
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(latestToastMessage()).toContain('ダウンロードに失敗');
  });

  it('modrinth.index.json が無い zip は error toast', async () => {
    seedProfile([]);
    vi.mocked(downloadFileWithRetry).mockResolvedValue(await buildMrpackBlobWithoutIndex());
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(latestToastMessage()).toContain('modrinth.index.json');
  });

  it('modrinth.index.json が破損なら warning toast', async () => {
    seedProfile([]);
    vi.mocked(downloadFileWithRetry).mockResolvedValue(await buildBrokenIndexBlob());
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(latestToastMessage()).toContain('破損');
  });

  it('展開後に files が 0 件なら warning toast', async () => {
    seedProfile([]);
    vi.mocked(downloadFileWithRetry).mockResolvedValue(await buildEmptyFilesBlob());
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(latestToastMessage()).toContain('ファイルが見つかりません');
  });

  it('バージョン取得が throw したら error state と error toast を出す', async () => {
    seedProfile([]);
    vi.mocked(fetchStableModVersion).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.error).toBe('network down');
    expect(latestToastMessage()).toContain('network down');
  });

  it('バージョン取得結果が null なら warning を出して中断する', async () => {
    seedProfile([]);
    vi.mocked(fetchStableModVersion).mockResolvedValue(null);
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(latestToastMessage()).toContain('利用可能な Modpack ファイルが見つかりません');
    expect(useProfilesStore.getState().profiles[0]!.mods).toHaveLength(0);
  });

  it('slug の無いプロジェクトでも追加できる', async () => {
    seedProfile([]);
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack({ ...PROJECT, slug: '' });
    });
    const profile = useProfilesStore.getState().profiles[0]!;
    expect(profile.mods).toHaveLength(1);
    expect(profile.modpackSource?.projectId).toBe('pack-1');
  });

  it('overrides が無い mrpack でも追加できる (台帳 early return)', async () => {
    seedProfile([]);
    vi.mocked(downloadFileWithRetry).mockResolvedValue(await buildNoOverridesBlob());
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    const profile = useProfilesStore.getState().profiles[0]!;
    expect(profile.mods).toHaveLength(1);
    // overrides 台帳は空のまま
    const records = await db.managedFiles.where('profileId').equals('p1').toArray();
    expect(records).toHaveLength(0);
  });

  it('環境情報 (loader/mcVersion) が無くても動作する', async () => {
    useProfilesStore.setState({
      profiles: [
        {
          id: 'p1',
          name: 'No Env',
          environment: {} as Profile['environment'],
          description: '',
          mods: []
        }
      ],
      currentProfileId: 'p1',
      hasHydrated: true
    });
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(useProfilesStore.getState().profiles[0]!.mods).toHaveLength(1);
  });

  it('他プロファイルには影響しない (即適用時)', async () => {
    seedProfile([]);
    const p1 = useProfilesStore.getState().profiles[0]!;
    useProfilesStore.setState((s) => ({
      profiles: [
        ...s.profiles,
        { ...p1, id: 'p2', name: 'Profile 2', mods: [] }
      ]
    }));
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    const state = useProfilesStore.getState();
    expect(state.profiles.find((p) => p.id === 'p1')!.mods).toHaveLength(1);
    expect(state.profiles.find((p) => p.id === 'p2')!.mods).toHaveLength(0);
  });

  it('他プロファイルには影響しない (confirm 時)', async () => {
    seedProfile([{ projectId: 'proj-sodium', versionId: 'ver-user' }]);
    const p1 = useProfilesStore.getState().profiles[0]!;
    useProfilesStore.setState((s) => ({
      profiles: [
        ...s.profiles,
        { ...p1, id: 'p2', name: 'Profile 2', mods: [] }
      ]
    }));
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.plan?.conflicts).toHaveLength(1);

    await act(async () => {
      await result.current.confirm(new Map([['proj-sodium', 'replace']]));
    });
    const state = useProfilesStore.getState();
    expect(state.profiles.find((p) => p.id === 'p1')!.mods[0]!.versionId).toBe('ver-sodium');
    expect(state.profiles.find((p) => p.id === 'p2')!.mods).toHaveLength(0);
  });

  it('非 Error の throw は String 化して error に保存する', async () => {
    seedProfile([]);
    vi.mocked(fetchStableModVersion).mockRejectedValue('plain-string-error');
    const { result } = renderHook(() => useModpackAdd());

    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.error).toBe('plain-string-error');
  });

  it('連打 (inFlight) 中は 2 回目の addModpack を無視する', async () => {
    seedProfile([]);
    const { result } = renderHook(() => useModpackAdd());

    // fetchStableModVersion を保留にして同時に 2 回呼ぶ
    vi.mocked(fetchStableModVersion).mockImplementation(
      () => new Promise<never>(() => {})
    );
    const p1 = result.current.addModpack(PROJECT); // in-flight に突入 (fetch 保留)
    const p2 = await result.current.addModpack(PROJECT);
    expect(p2).toBe(false); // in-flight ガードで 2 回目は即 false
    void p1; // 保留のままテスト終了 (後続テストへ影響させない)
  });

  it('confirm: pending が無ければ何もしない', async () => {
    const { result } = renderHook(() => useModpackAdd());
    await act(async () => {
      await result.current.confirm(new Map());
    });
    expect(useProfilesStore.getState().profiles).toHaveLength(1); // 変更なし
  });

  it('confirm: プロファイルが消えていたら warning', async () => {
    seedProfile([{ projectId: 'proj-sodium', versionId: 'ver-user' }]);
    const { result } = renderHook(() => useModpackAdd());
    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.plan?.conflicts).toHaveLength(1);

    useProfilesStore.setState({ profiles: [], currentProfileId: '' });
    await act(async () => {
      await result.current.confirm(new Map([['proj-sodium', 'replace']]));
    });
    expect(latestToastMessage()).toContain('プロファイルが選択されていません');
  });

  it('confirm: keep 選択時はユーザー版を残し replaced 0 件の toast が出る', async () => {
    seedProfile([{ projectId: 'proj-sodium', versionId: 'ver-user' }]);
    const { result } = renderHook(() => useModpackAdd());
    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.plan?.conflicts).toHaveLength(1);

    await act(async () => {
      await result.current.confirm(new Map([['proj-sodium', 'keep']]));
    });
    // ユーザー版 (ver-user) が残る + plan はクリアされる
    expect(useProfilesStore.getState().profiles[0]!.mods[0]!.versionId).toBe('ver-user');
    expect(result.current.plan).toBeNull();
    expect(latestToastMessage()).toContain('置換');
  });

  it('confirm: 適用が throw したら error state + error toast', async () => {
    seedProfile([{ projectId: 'proj-sodium', versionId: 'ver-user' }]);
    const { result } = renderHook(() => useModpackAdd());
    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.plan?.conflicts).toHaveLength(1);

    const applySpy = vi
      .spyOn(modpackAddUtils, 'applyModpackAddPlan')
      .mockImplementation(() => {
        throw new Error('save fail');
      });
    try {
      await act(async () => {
        await result.current.confirm(new Map([['proj-sodium', 'replace']]));
      });
    } finally {
      applySpy.mockRestore();
    }
    expect(result.current.error).toBe('save fail');
    expect(latestToastMessage()).toContain('Modpack の追加に失敗しました');
    // plan は破棄される
    expect(result.current.plan).toBeNull();
  });

  it('cancel は plan と pending を破棄する', async () => {
    seedProfile([{ projectId: 'proj-sodium', versionId: 'ver-user' }]);
    const { result } = renderHook(() => useModpackAdd());
    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.plan?.conflicts).toHaveLength(1);

    act(() => {
      result.current.cancel();
    });
    expect(result.current.plan).toBeNull();

    // cancel 後は confirm しても何も起きない (pending 破棄)
    await act(async () => {
      await result.current.confirm(new Map([['proj-sodium', 'replace']]));
    });
    expect(useProfilesStore.getState().profiles[0]!.mods[0]!.versionId).toBe('ver-user');
  });

  it('dismissError は error state をクリアする', async () => {
    seedProfile([]);
    vi.mocked(fetchStableModVersion).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useModpackAdd());
    await act(async () => {
      await result.current.addModpack(PROJECT);
    });
    expect(result.current.error).toBe('boom');

    act(() => {
      result.current.dismissError();
    });
    expect(result.current.error).toBeNull();
  });
});

import { useToastStore } from '@/components/feedback/toastStore';

/** 直近の toast に info が含まれるか (導入済みメッセージ) */
function useToastStoreStateHasInfo(): boolean {
  return useToastStore.getState().toasts.some((t) => t.type === 'info');
}

/** 直近の toast メッセージ (追加分) */
function latestToastMessage(): string | undefined {
  return useToastStore.getState().toasts.at(-1)?.message;
}

/** modrinth.index.json を含まない zip */
async function buildMrpackBlobWithoutIndex(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('overrides/mods/extra.jar', 'extra-bytes');
  return zip.generateAsync({ type: 'blob' });
}

/** modrinth.index.json が壊れた zip */
async function buildBrokenIndexBlob(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('modrinth.index.json', '{ broken json');
  return zip.generateAsync({ type: 'blob' });
}

/** files[] が空の mrpack */
async function buildEmptyFilesBlob(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'modrinth.index.json',
    JSON.stringify({ ...INDEX, files: [] })
  );
  return zip.generateAsync({ type: 'blob' });
}

/** overrides を含まない mrpack (saveOverrides の early return 用) */
async function buildNoOverridesBlob(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('modrinth.index.json', JSON.stringify(INDEX));
  return zip.generateAsync({ type: 'blob' });
}
