/**
 * lib/modrinth/client.ts integration tests (Sub-Phase 9-C.2)
 *
 * msw で /api/modrinth/* (proxy) と https://api.modrinth.com/v2/* (direct)
 * の両方をモックし、client の各高レベル関数をテスト。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/mocks/server';
import {
  fetchModrinth,
  fetchModrinthBatch,
  fetchModrinthVersionFilesBatch,
  fetchStableModVersion,
  fetchLatestMinecraftVersions,
  clearApiCache
} from '@/lib/modrinth/client';

describe('lib/modrinth/client', () => {
  beforeEach(() => {
    clearApiCache();
  });

  describe('fetchModrinth', () => {
    it('proxy 経由で /project/:slug を取得できる', async () => {
      const data = await fetchModrinth<{ slug: string; title: string }>(
        '/project/sodium'
      );
      expect(data.slug).toBe('sodium');
      expect(data.title).toBe('Mock sodium');
    });

    it('2 回目の呼び出しはメモリキャッシュから返す', async () => {
      let hits = 0;
      server.use(
        http.get('/api/modrinth/project/cachetest', () => {
          hits++;
          return HttpResponse.json({ slug: 'cachetest', title: 'X' });
        })
      );
      await fetchModrinth('/project/cachetest');
      await fetchModrinth('/project/cachetest');
      expect(hits).toBe(1);
    });

    it('noCache: true を渡すとキャッシュを使わない', async () => {
      let hits = 0;
      server.use(
        http.get('/api/modrinth/project/nocache', () => {
          hits++;
          return HttpResponse.json({ slug: 'nocache' });
        })
      );
      await fetchModrinth('/project/nocache', {}, { noCache: true });
      await fetchModrinth('/project/nocache', {}, { noCache: true });
      expect(hits).toBe(2);
    });

    it('proxy が 500 を返したら direct にフォールバックする', async () => {
      let proxyHits = 0;
      let directHits = 0;
      server.use(
        http.get('/api/modrinth/project/fallback', () => {
          proxyHits++;
          return new HttpResponse('boom', { status: 500 });
        }),
        http.get('https://api.modrinth.com/v2/project/fallback', () => {
          directHits++;
          return HttpResponse.json({ slug: 'fallback', title: 'Direct OK' });
        })
      );
      const data = await fetchModrinth<{ title: string }>('/project/fallback');
      expect(proxyHits).toBe(1);
      expect(directHits).toBe(1);
      expect(data.title).toBe('Direct OK');
    });

    it('proxy/direct 両方失敗したら throw する', async () => {
      server.use(
        http.get('/api/modrinth/project/dead', () =>
          new HttpResponse('nope', { status: 500 })
        ),
        http.get('https://api.modrinth.com/v2/project/dead', () =>
          new HttpResponse('nope', { status: 500 })
        )
      );
      await expect(fetchModrinth('/project/dead')).rejects.toThrow(
        /Failed to fetch from Modrinth/
      );
    });

    it('AbortSignal で abort されたら AbortError を投げる', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        fetchModrinth('/project/aborted', {}, { signal: controller.signal })
      ).rejects.toThrow();
    });

    it('params は searchParams として付与される', async () => {
      let capturedUrl = '';
      server.use(
        http.get('/api/modrinth/search', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ hits: [], total_hits: 0, offset: 0, limit: 24 });
        })
      );
      await fetchModrinth('/search', { query: 'sodium', limit: 24 });
      expect(capturedUrl).toContain('query=sodium');
      expect(capturedUrl).toContain('limit=24');
    });

    it('params の undefined/null/空文字は除外される', async () => {
      let capturedUrl = '';
      server.use(
        http.get('/api/modrinth/search', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ hits: [] });
        })
      );
      await fetchModrinth('/search', {
        query: 'sodium',
        empty: '',
        nul: null,
        undef: undefined
      });
      expect(capturedUrl).toContain('query=sodium');
      expect(capturedUrl).not.toContain('empty=');
      expect(capturedUrl).not.toContain('nul=');
      expect(capturedUrl).not.toContain('undef=');
    });

    it('object 型 param は JSON.stringify されて渡る', async () => {
      let capturedUrl = '';
      server.use(
        http.get('/api/modrinth/search', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ hits: [] });
        })
      );
      await fetchModrinth('/search', { facets: [['project_type:mod']] });
      const url = new URL(capturedUrl);
      expect(url.searchParams.get('facets')).toBe('[["project_type:mod"]]');
    });

    it('429 → 200 のリトライ挙動 (Retry-After 尊重)', async () => {
      // proxy が 429 を返すと client は direct にフォールバックするため、
      // 429 リトライ経路を明示的にテストするには proxy を落として direct のみで
      // 429 → 200 のサイクルを検証する。
      let attempts = 0;
      server.use(
        http.get('/api/modrinth/project/ratelimit', () =>
          new HttpResponse('no proxy', { status: 500 })
        ),
        http.get('https://api.modrinth.com/v2/project/ratelimit', () => {
          attempts++;
          if (attempts === 1) {
            return new HttpResponse('rate limited', {
              status: 429,
              headers: { 'Retry-After': '0' }
            });
          }
          return HttpResponse.json({ slug: 'ratelimit', title: 'RL OK' });
        })
      );
      const data = await fetchModrinth<{ title: string }>('/project/ratelimit');
      expect(attempts).toBe(2);
      expect(data.title).toBe('RL OK');
    });
  });

  describe('fetchStableModVersion', () => {
    it('絞り込みで release 版を優先して返す', async () => {
      const result = await fetchStableModVersion('sodium', {
        loader: 'Fabric',
        mcVersion: '1.20.1'
      });
      expect(result).not.toBeNull();
      expect(result?.targetVersion.version_type).toBe('release');
      expect(result?.allVersions.length).toBeGreaterThan(0);
    });

    it('絞り込みが空配列なら全バージョンで再試行する', async () => {
      let firstCall = true;
      server.use(
        http.get(
          '/api/modrinth/project/:slug/version',
          () => {
            if (firstCall) {
              firstCall = false;
              return HttpResponse.json([]);
            }
            return HttpResponse.json([
              {
                id: 'ver-only',
                version_number: '1.0.0',
                version_type: 'release',
                files: [],
                dependencies: []
              }
            ]);
          }
        )
      );
      const result = await fetchStableModVersion('sodium', {
        loader: 'Fabric',
        mcVersion: '1.99.99'
      });
      expect(result).not.toBeNull();
      expect(result?.targetVersion.id).toBe('ver-only');
    });

    it('全パターンで 0 件なら null を返す', async () => {
      server.use(
        http.get('/api/modrinth/project/:slug/version', () =>
          HttpResponse.json([])
        )
      );
      const result = await fetchStableModVersion('empty', {
        loader: 'Fabric',
        mcVersion: '1.20.1'
      });
      expect(result).toBeNull();
    });

    it('release 版がなければ 1 番目を返す', async () => {
      server.use(
        http.get('/api/modrinth/project/:slug/version', () =>
          HttpResponse.json([
            {
              id: 'beta-1',
              version_number: '2.0.0-beta.1',
              version_type: 'beta',
              files: [],
              dependencies: []
            }
          ])
        )
      );
      const result = await fetchStableModVersion('beta-only', {
        loader: 'Fabric',
        mcVersion: '1.20.1'
      });
      expect(result?.targetVersion.id).toBe('beta-1');
    });
  });

  describe('fetchLatestMinecraftVersions (client)', () => {
    it('release タイプのみを返す', async () => {
      const versions = await fetchLatestMinecraftVersions();
      expect(versions).toContain('1.21.4');
      expect(versions).toContain('1.20.1');
      // snapshot は含まれない
      expect(versions).not.toContain('1.21.2');
    });

    it('取得失敗時は fallback list を返す', async () => {
      server.use(
        http.get('/api/modrinth/tag/game_version', () =>
          new HttpResponse('down', { status: 500 })
        ),
        http.get('https://api.modrinth.com/v2/tag/game_version', () =>
          new HttpResponse('down', { status: 500 })
        )
      );
      const versions = await fetchLatestMinecraftVersions();
      expect(versions).toContain('1.20.1');
      expect(versions).toContain('1.12.2');
    });
  });

  describe('fetchModrinthBatch', () => {
    it('空配列を渡したら [] を返す (fetch しない)', async () => {
      const spy = vi.spyOn(globalThis, 'fetch');
      const result = await fetchModrinthBatch('/projects', []);
      expect(result).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('100 個以下の ID は 1 回のリクエストで済む', async () => {
      let calls = 0;
      server.use(
        http.get('/api/modrinth/projects', () => {
          calls++;
          return HttpResponse.json([{ id: 'a' }, { id: 'b' }]);
        })
      );
      const result = await fetchModrinthBatch('/projects', ['a', 'b']);
      expect(calls).toBe(1);
      expect(result).toHaveLength(2);
    });

    it('100 個超は自動で分割リクエストする', async () => {
      let calls = 0;
      const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
      server.use(
        http.get('/api/modrinth/projects', ({ request }) => {
          calls++;
          const idsParam = new URL(request.url).searchParams.get('ids') ?? '[]';
          const parsed = JSON.parse(idsParam) as string[];
          return HttpResponse.json(parsed.map((id) => ({ id })));
        })
      );
      const result = await fetchModrinthBatch('/projects', ids);
      expect(calls).toBe(3); // 100 + 100 + 50
      expect(result).toHaveLength(250);
    });
  });

  describe('fetchModrinthVersionFilesBatch', () => {
    it('空配列を渡したら {} を返す', async () => {
      const result = await fetchModrinthVersionFilesBatch([]);
      expect(result).toEqual({});
    });

    it('SHA1 hash を key に持つ Record を返す', async () => {
      const result = await fetchModrinthVersionFilesBatch(['abc123', 'def456']);
      expect(Object.keys(result)).toEqual(
        expect.arrayContaining(['abc123', 'def456'])
      );
    });

    it('100 個超は自動分割される', async () => {
      let calls = 0;
      server.use(
        http.post('/api/modrinth/version_files', async ({ request }) => {
          calls++;
          const body = (await request.json()) as { hashes: string[] };
          const result: Record<string, unknown> = {};
          for (const h of body.hashes) result[h] = { id: `v-${h}` };
          return HttpResponse.json(result);
        })
      );
      const hashes = Array.from({ length: 150 }, (_, i) => `h${i}`);
      const result = await fetchModrinthVersionFilesBatch(hashes);
      expect(calls).toBe(2); // 100 + 50
      expect(Object.keys(result)).toHaveLength(150);
    });
  });
});
