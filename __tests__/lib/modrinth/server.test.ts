/**
 * lib/modrinth/server.ts integration tests (Sub-Phase 9-C.2)
 *
 * Node.js (Server Component) 側から Modrinth API を直接叩く経路をテストする。
 * proxy を使わず https://api.modrinth.com/v2/* のみを msw で mock する。
 */

import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  fetchModrinthSearch,
  fetchModrinthProject,
  fetchModrinthProjectVersions,
  fetchLatestMinecraftVersions,
  slimVersion,
  REVALIDATE
} from '@/lib/modrinth/server';
import type { ModrinthVersion } from '@/types';

describe('lib/modrinth/server', () => {
  describe('REVALIDATE 定数', () => {
    it('主要 TTL が定義されている', () => {
      expect(REVALIDATE.SEARCH).toBe(300);
      expect(REVALIDATE.PROJECT).toBe(3600);
      expect(REVALIDATE.VERSION).toBe(3600);
      expect(REVALIDATE.TAG).toBe(86400);
    });
  });

  describe('fetchModrinthSearch', () => {
    it('search endpoint に facets と index を付けて呼ぶ', async () => {
      let captured = '';
      server.use(
        http.get('https://api.modrinth.com/v2/search', ({ request }) => {
          captured = request.url;
          return HttpResponse.json({
            hits: [],
            total_hits: 0,
            offset: 0,
            limit: 24
          });
        })
      );
      await fetchModrinthSearch({
        query: 'sodium',
        mcVersion: '1.20.1',
        loader: 'Fabric',
        sortBy: 'popular'
      });
      const url = new URL(captured);
      expect(url.searchParams.get('query')).toBe('sodium');
      expect(url.searchParams.get('index')).toBe('downloads');
      const facets = JSON.parse(url.searchParams.get('facets') ?? '[]');
      expect(facets).toContainEqual(['project_type:mod']);
      expect(facets).toContainEqual(['versions:1.20.1']);
      expect(facets).toContainEqual(['categories:fabric']);
    });

    it('sortBy: relevance → index=relevance', async () => {
      let captured = '';
      server.use(
        http.get('https://api.modrinth.com/v2/search', ({ request }) => {
          captured = request.url;
          return HttpResponse.json({ hits: [], total_hits: 0, offset: 0, limit: 24 });
        })
      );
      await fetchModrinthSearch({ sortBy: 'relevance' });
      const url = new URL(captured);
      expect(url.searchParams.get('index')).toBe('relevance');
    });

    it('category が All なら facets に追加しない', async () => {
      let captured = '';
      server.use(
        http.get('https://api.modrinth.com/v2/search', ({ request }) => {
          captured = request.url;
          return HttpResponse.json({ hits: [], total_hits: 0, offset: 0, limit: 24 });
        })
      );
      await fetchModrinthSearch({ category: 'All' });
      const url = new URL(captured);
      const facets = JSON.parse(url.searchParams.get('facets') ?? '[]');
      expect(facets).toEqual([['project_type:mod']]);
    });

    it('デフォルトの limit=24, offset=0 で呼ばれる', async () => {
      let captured = '';
      server.use(
        http.get('https://api.modrinth.com/v2/search', ({ request }) => {
          captured = request.url;
          return HttpResponse.json({ hits: [], total_hits: 0, offset: 0, limit: 24 });
        })
      );
      await fetchModrinthSearch({});
      const url = new URL(captured);
      expect(url.searchParams.get('limit')).toBe('24');
      expect(url.searchParams.get('offset')).toBe('0');
    });
  });

  describe('fetchModrinthProject', () => {
    it('slug をパスに埋め込んで取得する', async () => {
      const project = await fetchModrinthProject('sodium');
      expect(project.slug).toBe('sodium');
    });

    it('slug を URL エンコードする (特殊文字)', async () => {
      let capturedPath = '';
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', ({ request }) => {
          capturedPath = new URL(request.url).pathname;
          return HttpResponse.json({ id: 'x', slug: 'x', title: 'x' });
        })
      );
      await fetchModrinthProject('foo/bar');
      expect(capturedPath).toBe('/v2/project/foo%2Fbar');
    });

    it('404 は Error を throw', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () =>
          new HttpResponse('not found', { status: 404 })
        )
      );
      await expect(fetchModrinthProject('nope')).rejects.toThrow(/HTTP 404/);
    });
  });

  describe('fetchModrinthProjectVersions', () => {
    it('loader / mcVersion を JSON.stringify で query に付ける', async () => {
      let captured = '';
      server.use(
        http.get(
          'https://api.modrinth.com/v2/project/:slug/version',
          ({ request }) => {
            captured = request.url;
            return HttpResponse.json([]);
          }
        )
      );
      await fetchModrinthProjectVersions('sodium', {
        loader: 'Fabric',
        mcVersion: '1.20.1'
      });
      const url = new URL(captured);
      expect(url.searchParams.get('loaders')).toBe('["fabric"]');
      expect(url.searchParams.get('game_versions')).toBe('["1.20.1"]');
    });

    it('filter 未指定なら query を付けない', async () => {
      let captured = '';
      server.use(
        http.get(
          'https://api.modrinth.com/v2/project/:slug/version',
          ({ request }) => {
            captured = request.url;
            return HttpResponse.json([]);
          }
        )
      );
      await fetchModrinthProjectVersions('sodium');
      const url = new URL(captured);
      expect(url.searchParams.get('loaders')).toBeNull();
      expect(url.searchParams.get('game_versions')).toBeNull();
    });

    it('レスポンス配列をそのまま返す', async () => {
      const versions = await fetchModrinthProjectVersions('sodium');
      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBeGreaterThan(0);
    });

    it('Phase 10-P2: 応答を slim 化する (changelog/dependencies/hashes を落として 2MB Data Cache 上限を回避)', async () => {
      // Modrinth のフル JSON (changelog 4MB / dependencies / hashes 込み) を返す
      server.use(
        http.get(
          'https://api.modrinth.com/v2/project/:slug/version',
          () =>
            HttpResponse.json([
              {
                id: 'v1',
                project_id: 'p1',
                author_id: 'AUTHOR-42',
                featured: true,
                name: 'JEI 15.0.0',
                version_number: '15.0.0',
                changelog: 'x'.repeat(4_000_000), // 4MB
                date_published: '2026-01-01T00:00:00.000Z',
                downloads: 999_999,
                version_type: 'release',
                files: [
                  {
                    hashes: { sha1: 'a1b2c3', sha512: 'd4e5f6' },
                    url: 'https://cdn.modrinth.com/jei.jar',
                    filename: 'jei-15.0.0.jar',
                    primary: true,
                    size: 5_000_000
                  }
                ],
                dependencies: [
                  { project_id: 'dep-1', version_id: 'v-dep-1', dependency_type: 'required' },
                  { project_id: 'dep-2', version_id: 'v-dep-2', dependency_type: 'optional' }
                ],
                game_versions: ['1.20.1', '1.20.4'],
                loaders: ['fabric', 'forge']
              }
            ])
        )
      );
      const versions = await fetchModrinthProjectVersions('jei');
      const v = versions[0];
      if (!v) throw new Error('expected 1 version');
      // 落とされるべきフィールド
      expect((v as ModrinthVersion & { changelog?: string }).changelog).toBeUndefined();
      expect(v.dependencies).toBeUndefined();
      expect(v.author_id).toBe(''); // slim ダミー
      expect(v.downloads).toBe(0); // slim ダミー (プロジェクト DL 数と紛らわしいため)
      expect(v.featured).toBe(false); // slim ダミー
      // 保持されるフィールド
      expect(v.id).toBe('v1');
      expect(v.version_number).toBe('15.0.0');
      expect(v.version_type).toBe('release');
      expect(v.game_versions).toEqual(['1.20.1', '1.20.4']);
      expect(v.loaders).toEqual(['fabric', 'forge']);
      // files は url/filename/primary/size のみ保持 (hashes は落とす)
      expect(v.files).toHaveLength(1);
      const f = v.files[0];
      if (!f) throw new Error('expected file');
      expect(f).toEqual({
        url: 'https://cdn.modrinth.com/jei.jar',
        filename: 'jei-15.0.0.jar',
        primary: true,
        size: 5_000_000
      });
      expect((f as unknown as Record<string, unknown>).hashes).toBeUndefined();
    });
  });

  describe('slimVersion (Phase 10-P2)', () => {
    it('必須フィールドのみを射影する', () => {
      const full: ModrinthVersion & { changelog?: string } = {
        id: 'x',
        project_id: 'p',
        author_id: 'a',
        featured: true,
        name: 'v',
        version_number: '1.0.0',
        changelog: 'big changelog',
        date_published: '2026-01-01T00:00:00.000Z',
        downloads: 100,
        version_type: 'release',
        files: [
          { url: 'u', filename: 'f.jar', primary: true, size: 10 }
        ],
        dependencies: [{ project_id: 'd', dependency_type: 'required' }],
        game_versions: ['1.20.1'],
        loaders: ['fabric']
      };
      const slim = slimVersion(full);
      expect(slim.changelog).toBeUndefined();
      expect(slim.dependencies).toBeUndefined();
      // 呼び出し順で参照安定性を確認 (キャッシュキーに使う)
      expect(Object.keys(slim).sort()).toEqual(
        [
          'author_id',
          'date_published',
          'downloads',
          'featured',
          'files',
          'game_versions',
          'id',
          'loaders',
          'name',
          'project_id',
          'version_number',
          'version_type'
        ].sort()
      );
    });

    it('game_versions / loaders / files が undefined でも空配列で返す', () => {
      const partial = {
        id: 'x',
        project_id: 'p',
        author_id: 'a',
        featured: false,
        name: 'v',
        version_number: '1.0.0',
        date_published: '2026-01-01T00:00:00.000Z',
        downloads: 0,
        version_type: 'release'
      } as unknown as ModrinthVersion;
      const slim = slimVersion(partial);
      expect(slim.files).toEqual([]);
      expect(slim.game_versions).toEqual([]);
      expect(slim.loaders).toEqual([]);
    });
  });

  describe('fetchLatestMinecraftVersions (server)', () => {
    it('release のみを抽出する', async () => {
      const versions = await fetchLatestMinecraftVersions();
      expect(versions).toContain('1.21.4');
      expect(versions).toContain('1.20.1');
      expect(versions).not.toContain('1.21.2');
    });

    it('取得失敗時は fallback list を返す', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/tag/game_version', () =>
          new HttpResponse('down', { status: 500 })
        )
      );
      const versions = await fetchLatestMinecraftVersions();
      expect(versions).toContain('1.12.2');
      expect(versions).toContain('1.20.1');
    });

    it('release が 0 件でも fallback list を返す', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/tag/game_version', () =>
          HttpResponse.json([
            { version: '25w01a', version_type: 'snapshot' }
          ])
        )
      );
      const versions = await fetchLatestMinecraftVersions();
      expect(versions).toContain('1.20.1');
    });
  });

  describe('429 リトライ (server)', () => {
    it('429 → Retry-After 後に 200 を返せる', async () => {
      let attempts = 0;
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () => {
          attempts++;
          if (attempts === 1) {
            return new HttpResponse('rate limited', {
              status: 429,
              headers: { 'Retry-After': '0' }
            });
          }
          return HttpResponse.json({ id: 'ok', slug: 'ok', title: 'RL OK' });
        })
      );
      const project = await fetchModrinthProject('ok');
      expect(attempts).toBe(2);
      expect(project.title).toBe('RL OK');
    });
  });
});
