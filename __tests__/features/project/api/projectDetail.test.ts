/**
 * features/project/api/projectDetail.ts test (COV-2)
 *
 * 詳細ページ/モーダル共通のサーバ側データ取得・メタデータ生成。
 * fetchModrinth* をモックし、各 fetch 失敗時のフォールバック分岐を網羅する。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDetailMetadata,
  DETAIL_REVALIDATE,
  fetchProjectDetailData,
  generateDetailStaticParams
} from '@/features/project/api/projectDetail';
import type { ModrinthProject, ModrinthVersion } from '@/types';

const serverMocks = vi.hoisted(() => ({
  fetchModrinthProject: vi.fn(),
  fetchModrinthProjectAuthor: vi.fn(),
  fetchModrinthProjectVersions: vi.fn(),
  fetchModrinthSearch: vi.fn()
}));

vi.mock('@/lib/modrinth/server', () => serverMocks);

const sodiumProject = {
  id: 'AABBCC',
  slug: 'sodium',
  project_type: 'mod',
  title: 'Sodium',
  description: 'Fast rendering engine for Minecraft',
  downloads: 1000,
  published: '2021-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z'
} as ModrinthProject;

const versions: ModrinthVersion[] = [
  {
    id: 'v1',
    project_id: 'AABBCC',
    author_id: 'author-1',
    featured: false,
    name: 'Sodium 0.6.0',
    version_number: '0.6.0',
    game_versions: ['1.21.1'],
    loaders: ['fabric'],
    files: [],
    downloads: 100,
    version_type: 'release',
    date_published: '2026-01-01T00:00:00Z'
  }
];

describe('features/project/api/projectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DETAIL_REVALIDATE', () => {
    it('1 時間 ISR が定義されている', () => {
      expect(DETAIL_REVALIDATE).toBe(3600);
    });
  });

  describe('fetchProjectDetailData', () => {
    it('project / versions / author を並列取得して返す', async () => {
      serverMocks.fetchModrinthProject.mockResolvedValue(sodiumProject);
      serverMocks.fetchModrinthProjectVersions.mockResolvedValue(versions);
      serverMocks.fetchModrinthProjectAuthor.mockResolvedValue('jellysquid3');
      const data = await fetchProjectDetailData('sodium');
      expect(data).toEqual({
        project: sodiumProject,
        versions,
        author: 'jellysquid3'
      });
    });

    it('project fetch 失敗時は null を返す (ページはフォールバック表示)', async () => {
      serverMocks.fetchModrinthProject.mockRejectedValue(new Error('ECONNRESET'));
      serverMocks.fetchModrinthProjectVersions.mockResolvedValue(versions);
      serverMocks.fetchModrinthProjectAuthor.mockResolvedValue('jellysquid3');
      const data = await fetchProjectDetailData('sodium');
      expect(data.project).toBeNull();
      expect(data.versions).toEqual(versions);
      expect(data.author).toBe('jellysquid3');
    });

    it('versions fetch 失敗時は空配列を返す', async () => {
      serverMocks.fetchModrinthProject.mockResolvedValue(sodiumProject);
      serverMocks.fetchModrinthProjectVersions.mockRejectedValue(new Error('ECONNRESET'));
      serverMocks.fetchModrinthProjectAuthor.mockResolvedValue('jellysquid3');
      const data = await fetchProjectDetailData('sodium');
      expect(data.versions).toEqual([]);
      expect(data.project).toEqual(sodiumProject);
    });

    it('author fetch 失敗時は null を返す', async () => {
      serverMocks.fetchModrinthProject.mockResolvedValue(sodiumProject);
      serverMocks.fetchModrinthProjectVersions.mockResolvedValue(versions);
      serverMocks.fetchModrinthProjectAuthor.mockRejectedValue(new Error('ECONNRESET'));
      const data = await fetchProjectDetailData('sodium');
      expect(data.author).toBeNull();
      expect(data.project).toEqual(sodiumProject);
    });
  });

  describe('generateDetailStaticParams', () => {
    it('hits の slug を params として返す (slug 優先)', async () => {
      serverMocks.fetchModrinthSearch.mockResolvedValue({
        hits: [
          { slug: 'sodium', project_id: 'AABBCC' },
          { slug: 'iris', project_id: 'DDEEFF' }
        ],
        total_hits: 2,
        offset: 0,
        limit: 15
      });
      const params = await generateDetailStaticParams('mod');
      expect(params).toEqual([{ slug: 'sodium' }, { slug: 'iris' }]);
      expect(serverMocks.fetchModrinthSearch).toHaveBeenCalledWith(
        expect.objectContaining({ projectType: 'mod', limit: 15 })
      );
    });

    it('slug が無い hit は project_id をフォールバックに使う', async () => {
      serverMocks.fetchModrinthSearch.mockResolvedValue({
        hits: [{ slug: '', project_id: 'AABBCC' }],
        total_hits: 1,
        offset: 0,
        limit: 15
      });
      const params = await generateDetailStaticParams('mod');
      expect(params).toEqual([{ slug: 'AABBCC' }]);
    });

    it('slug も project_id も無い hit は除外される', async () => {
      serverMocks.fetchModrinthSearch.mockResolvedValue({
        hits: [{ slug: '', project_id: '' }, { slug: 'sodium', project_id: 'AABBCC' }],
        total_hits: 2,
        offset: 0,
        limit: 15
      });
      const params = await generateDetailStaticParams('mod');
      expect(params).toEqual([{ slug: 'sodium' }]);
    });

    it('fetch 失敗時は空配列 (dynamicParams=true が実行時生成を担う)', async () => {
      serverMocks.fetchModrinthSearch.mockRejectedValue(new Error('ECONNRESET'));
      const params = await generateDetailStaticParams('mod');
      expect(params).toEqual([]);
    });
  });

  describe('buildDetailMetadata', () => {
    it('成功時は title / description / canonical / OG / Twitter を組み立てる', async () => {
      serverMocks.fetchModrinthProject.mockResolvedValue(sodiumProject);
      const meta = await buildDetailMetadata('mod', 'sodium');
      expect(meta.title).toBe('Sodium');
      expect(meta.description).toBe('Fast rendering engine for Minecraft');
      expect(meta.alternates).toEqual({ canonical: '/mod/sodium' });
      expect(meta.openGraph).toEqual({
        title: 'Sodium | DropMod',
        description: 'Fast rendering engine for Minecraft',
        type: 'article',
        url: '/mod/sodium'
      });
      expect(meta.twitter).toEqual({
        card: 'summary_large_image',
        title: 'Sodium | DropMod',
        description: 'Fast rendering engine for Minecraft'
      });
    });

    it('description が空なら定型フォールバック文を入れる', async () => {
      serverMocks.fetchModrinthProject.mockResolvedValue({
        ...sodiumProject,
        description: ''
      });
      const meta = await buildDetailMetadata('mod', 'sodium');
      expect(meta.description).toContain('Sodium の詳細情報');
      expect(meta.openGraph?.description).toContain('Sodium の詳細情報');
    });

    it('project fetch 失敗時は slug ベースのフォールバック metadata', async () => {
      serverMocks.fetchModrinthProject.mockRejectedValue(new Error('ECONNRESET'));
      const meta = await buildDetailMetadata('mod', 'sodium');
      expect(meta.title).toBe('sodium');
      expect(meta.description).toBe('Modrinth Mod 詳細');
      expect(meta.alternates).toEqual({ canonical: '/mod/sodium' });
    });
  });
});
