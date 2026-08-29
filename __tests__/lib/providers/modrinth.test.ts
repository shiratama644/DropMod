/**
 * ContentProvider 抽象 + ModrinthProvider (Phase 12-C) test
 *
 * HTTP 層 (`lib/modrinth/client.ts`) は mock し、**変換ロジックと更新検知の判定**を検証する。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModrinthProvider } from '@/lib/providers/modrinth';
import { availableProviders, DEFAULT_PROVIDER_ID, getProvider } from '@/lib/providers';
import { fetchModrinth, fetchStableModVersion } from '@/lib/modrinth/client';
import type { ModrinthVersion } from '@/types';

vi.mock('@/lib/modrinth/client', () => ({
  fetchModrinth: vi.fn(),
  fetchStableModVersion: vi.fn()
}));

const mockFetch = vi.mocked(fetchModrinth);
const mockStable = vi.mocked(fetchStableModVersion);

function version(overrides: Partial<ModrinthVersion> = {}): ModrinthVersion {
  return {
    id: 'v1',
    project_id: 'proj-1',
    author_id: 'a',
    featured: false,
    name: 'v1',
    version_number: '1.0.0',
    date_published: '2026-01-01T00:00:00Z',
    downloads: 0,
    version_type: 'release',
    files: [{ url: 'https://cdn/a.jar', filename: 'a.jar', primary: true, size: 100 }],
    game_versions: ['1.20.1'],
    loaders: ['fabric'],
    ...overrides
  };
}

describe('ModrinthProvider: getProject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Modrinth の project を Provider 形に変換する', async () => {
    mockFetch.mockResolvedValue({
      id: 'proj-1',
      slug: 'sodium',
      project_type: 'mod',
      title: 'Sodium',
      description: 'A fast renderer',
      categories: ['optimization'],
      downloads: 1234,
      icon_url: 'https://cdn/icon.webp'
    });

    const provider = new ModrinthProvider();
    const project = await provider.getProject('sodium');

    expect(mockFetch).toHaveBeenCalledWith('/project/sodium');
    expect(project).toEqual({
      id: 'proj-1',
      slug: 'sodium',
      title: 'Sodium',
      description: 'A fast renderer',
      categories: ['optimization'],
      projectType: 'mod',
      downloads: 1234,
      iconUrl: 'https://cdn/icon.webp'
    });
  });

  it('categories が欠落していても空配列にする (Modrinth は稀に欠落させる)', async () => {
    mockFetch.mockResolvedValue({
      id: 'p',
      slug: 's',
      project_type: 'resourcepack',
      title: 'T',
      description: 'D',
      downloads: 0
    });
    const project = await new ModrinthProvider().getProject('s');
    expect(project?.categories).toEqual([]);
    expect(project?.projectType).toBe('resourcepack');
  });

  it('icon_url が無ければ iconUrl を付けない', async () => {
    mockFetch.mockResolvedValue({
      id: 'p',
      slug: 's',
      project_type: 'mod',
      title: 'T',
      description: 'D',
      downloads: 0
    });
    const project = await new ModrinthProvider().getProject('s');
    expect(project).not.toHaveProperty('iconUrl');
  });

  it('空 id は fetch せず null', async () => {
    expect(await new ModrinthProvider().getProject('')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('404 / ネットワーク失敗は null (throw しない)', async () => {
    mockFetch.mockRejectedValue(new Error('Not Found'));
    expect(await new ModrinthProvider().getProject('nope')).toBeNull();
  });
});

describe('ModrinthProvider: searchProjects', () => {
  beforeEach(() => vi.clearAllMocks());

  it('search hit を Provider 形に変換する (project_id → id)', async () => {
    mockFetch.mockResolvedValue({
      hits: [
        {
          project_id: 'proj-1',
          slug: 'sodium',
          title: 'Sodium',
          description: 'fast',
          project_type: 'mod',
          categories: ['optimization'],
          downloads: 99,
          icon_url: 'https://cdn/i.webp'
        }
      ],
      total_hits: 1
    });

    const result = await new ModrinthProvider().searchProjects({ query: 'sodium' });

    expect(result.totalHits).toBe(1);
    expect(result.hits[0]).toMatchObject({ id: 'proj-1', projectType: 'mod', downloads: 99 });
  });

  it('loader / mcVersion / projectType を facets にする', async () => {
    mockFetch.mockResolvedValue({ hits: [], total_hits: 0 });

    await new ModrinthProvider().searchProjects({
      query: 'x',
      projectType: 'mod',
      loader: 'Fabric',
      mcVersion: '1.20.1'
    });

    const params = mockFetch.mock.calls[0]?.[1] as Record<string, unknown>;
    const facets = JSON.parse(String(params.facets));
    expect(facets).toEqual([
      ['project_type:mod'],
      ['categories:fabric'],
      ['versions:1.20.1']
    ]);
  });

  it('categories は OR 条件 (同一配列に並べる)', async () => {
    mockFetch.mockResolvedValue({ hits: [], total_hits: 0 });
    await new ModrinthProvider().searchProjects({ categories: ['technology', 'magic'] });
    const call = mockFetch.mock.calls[0];
    const facets = JSON.parse(String((call?.[1] as Record<string, unknown> | undefined)?.facets));
    expect(facets).toEqual([['categories:technology', 'categories:magic']]);
  });

  it('絞り込みが無ければ facets を送らない', async () => {
    mockFetch.mockResolvedValue({ hits: [], total_hits: 0 });
    await new ModrinthProvider().searchProjects({ query: 'a' });
    const params = mockFetch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(params.facets).toBeUndefined();
  });

  it('失敗したら空結果 (throw しない)', async () => {
    mockFetch.mockRejectedValue(new Error('rate limited'));
    expect(await new ModrinthProvider().searchProjects({ query: 'a' })).toEqual({
      hits: [],
      totalHits: 0
    });
  });
});

describe('ModrinthProvider: listVersions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('環境で絞り込んだ一覧を**新しい順**に並べ替える', async () => {
    mockStable.mockResolvedValue({
      targetVersion: version(),
      allVersions: [
        version({ id: 'old', date_published: '2026-01-01T00:00:00Z' }),
        version({ id: 'new', date_published: '2026-06-01T00:00:00Z' }),
        version({ id: 'mid', date_published: '2026-03-01T00:00:00Z' })
      ]
    });

    const versions = await new ModrinthProvider().listVersions('proj-1', {
      loader: 'Fabric',
      mcVersion: '1.20.1'
    });

    expect(versions.map((v) => v.id)).toEqual(['new', 'mid', 'old']);
    expect(mockStable).toHaveBeenCalledWith(
      'proj-1',
      { loader: 'Fabric', mcVersion: '1.20.1' },
      { skipLoader: false }
    );
  });

  it('loader 未指定なら facet を付けない (Resource Pack / Shader 対策)', async () => {
    mockStable.mockResolvedValue({ targetVersion: version(), allVersions: [version()] });
    await new ModrinthProvider().listVersions('proj-1', { mcVersion: '1.20.1' });
    expect(mockStable).toHaveBeenCalledWith(
      'proj-1',
      { loader: '', mcVersion: '1.20.1' },
      { skipLoader: true }
    );
  });

  it('空 id は空配列', async () => {
    expect(await new ModrinthProvider().listVersions('')).toEqual([]);
    expect(mockStable).not.toHaveBeenCalled();
  });

  it('version が 1 件も無ければ空配列', async () => {
    mockStable.mockResolvedValue(null);
    expect(await new ModrinthProvider().listVersions('proj-1')).toEqual([]);
  });
});

describe('ModrinthProvider: checkForUpdate (§10.6 更新検知)', () => {
  beforeEach(() => vi.clearAllMocks());

  function versions3() {
    return {
      targetVersion: version(),
      allVersions: [
        version({ id: 'v-new', version_number: '2.0.0', date_published: '2026-06-01T00:00:00Z' }),
        version({ id: 'v-cur', version_number: '1.0.0', date_published: '2026-01-01T00:00:00Z' })
      ]
    };
  }

  it('新しい release があれば hasUpdate: true', async () => {
    mockStable.mockResolvedValue(versions3());
    const info = await new ModrinthProvider().checkForUpdate('proj-1', 'v-cur');
    expect(info.hasUpdate).toBe(true);
    expect(info.current?.id).toBe('v-cur');
    expect(info.latest?.id).toBe('v-new');
  });

  it('既に最新なら hasUpdate: false', async () => {
    mockStable.mockResolvedValue(versions3());
    const info = await new ModrinthProvider().checkForUpdate('proj-1', 'v-new');
    expect(info.hasUpdate).toBe(false);
    expect(info.latest?.id).toBe('v-new');
  });

  it('**バージョン番号ではなく公開日で比較する** (0.10.0 > 0.9.0 を正しく判定)', async () => {
    mockStable.mockResolvedValue({
      targetVersion: version(),
      allVersions: [
        // 文字列比較なら '0.9.0' > '0.10.0' になるが、公開日は 0.10.0 のほうが新しい
        version({ id: 'v-010', version_number: '0.10.0', date_published: '2026-06-01T00:00:00Z' }),
        version({ id: 'v-090', version_number: '0.9.0', date_published: '2026-01-01T00:00:00Z' })
      ]
    });
    const info = await new ModrinthProvider().checkForUpdate('proj-1', 'v-090');
    expect(info.hasUpdate).toBe(true);
    expect(info.latest?.versionNumber).toBe('0.10.0');
  });

  it('beta / alpha を「更新あり」とは言わない (release 優先)', async () => {
    mockStable.mockResolvedValue({
      targetVersion: version(),
      allVersions: [
        version({
          id: 'v-beta',
          version_type: 'beta',
          date_published: '2026-09-01T00:00:00Z'
        }),
        version({ id: 'v-cur', date_published: '2026-01-01T00:00:00Z' })
      ]
    });
    const info = await new ModrinthProvider().checkForUpdate('proj-1', 'v-cur');
    expect(info.hasUpdate).toBe(false);
    expect(info.latest?.id).toBe('v-cur');
  });

  it('currentVersionId が未知なら hasUpdate: false (latest は返す)', async () => {
    mockStable.mockResolvedValue(versions3());
    const info = await new ModrinthProvider().checkForUpdate('proj-1', 'v-unknown');
    expect(info.hasUpdate).toBe(false);
    expect(info.current).toBeNull();
    expect(info.latest?.id).toBe('v-new');
  });

  it('currentVersionId が未指定でも latest は返す', async () => {
    mockStable.mockResolvedValue(versions3());
    const info = await new ModrinthProvider().checkForUpdate('proj-1', undefined);
    expect(info).toMatchObject({ hasUpdate: false, current: null });
    expect(info.latest?.id).toBe('v-new');
  });

  it('version が無ければ全て null', async () => {
    mockStable.mockResolvedValue(null);
    expect(await new ModrinthProvider().checkForUpdate('proj-1', 'v-cur')).toEqual({
      hasUpdate: false,
      current: null,
      latest: null
    });
  });

  it('date_published が不正でも落ちない (比較不能なら更新なし)', async () => {
    mockStable.mockResolvedValue({
      targetVersion: version(),
      allVersions: [
        version({ id: 'v-new', date_published: 'not-a-date' }),
        version({ id: 'v-cur', date_published: '2026-01-01T00:00:00Z' })
      ]
    });
    const info = await new ModrinthProvider().checkForUpdate('proj-1', 'v-cur');
    expect(info.hasUpdate).toBe(false);
  });
});

describe('Provider レジストリ', () => {
  it('既定は Modrinth', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('modrinth');
    expect(getProvider()?.id).toBe('modrinth');
    expect(getProvider('modrinth')?.label).toBe('Modrinth');
  });

  it('**CurseForge は Phase 13** なので null (呼べるのに動かない状態を作らない)', () => {
    expect(getProvider('curseforge')).toBeNull();
  });

  it('availableProviders は Modrinth のみ', () => {
    expect(availableProviders().map((p) => p.id)).toEqual(['modrinth']);
  });
});
