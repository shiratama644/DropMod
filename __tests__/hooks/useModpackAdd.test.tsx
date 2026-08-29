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
} from '@/hooks/useModpackAdd';
import { useProfilesStore } from '@/lib/store/profiles';
import { db } from '@/lib/db/dexie';
import type { ModrinthProject, ModrinthVersion, MrpackIndex } from '@/types';

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
});

import { useToastStore } from '@/lib/store/toast';

/** 直近の toast に info が含まれるか (導入済みメッセージ) */
function useToastStoreStateHasInfo(): boolean {
  return useToastStore.getState().toasts.some((t) => t.type === 'info');
}
