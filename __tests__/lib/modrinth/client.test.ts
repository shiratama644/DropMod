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

    it('非 object 応答は無視して {} を返す', async () => {
      server.use(
        http.post('/api/modrinth/version_files', () => HttpResponse.json('not-object'))
      );
      const result = await fetchModrinthVersionFilesBatch(['hash1']);
      expect(result).toEqual({});
    });
  });

  describe('fetchModrinth (キャッシュ詳細)', () => {
    it('キャッシュが TTL を過ぎたら再取得する', async () => {
      let hits = 0;
      server.use(
        http.get('/api/modrinth/project/expiry', () => {
          hits++;
          return HttpResponse.json({ slug: 'expiry', title: `hit-${hits}` });
        })
      );
      const now = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
      try {
        await fetchModrinth('/project/expiry');
        await fetchModrinth('/project/expiry');
        expect(hits).toBe(1); // 2 回目はキャッシュ

        nowSpy.mockReturnValue(now + 6 * 60 * 1000); // TTL (5 分) 超過
        const data = await fetchModrinth<{ title: string }>('/project/expiry');
        expect(data.title).toBe('hit-2');
        expect(hits).toBe(2);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('POST は body を JSON 文字列で送り Content-Type を付ける', async () => {
      let capturedBody = '';
      let capturedType = '';
      server.use(
        http.post('/api/modrinth/check', async ({ request }) => {
          capturedBody = await request.text();
          capturedType = request.headers.get('content-type') ?? '';
          return HttpResponse.json({ ok: true });
        })
      );
      await fetchModrinth(
        '/check',
        {},
        { method: 'POST', body: { hashes: ['a'] }, noCache: true }
      );
      expect(capturedType).toContain('application/json');
      expect(JSON.parse(capturedBody)).toEqual({ hashes: ['a'] });
    });

    it('body が string の場合はそのまま送る', async () => {
      let capturedBody = '';
      server.use(
        http.post('/api/modrinth/raw', async ({ request }) => {
          capturedBody = await request.text();
          return HttpResponse.json({ ok: true });
        })
      );
      await fetchModrinth('/raw', {}, { method: 'POST', body: 'raw-string', noCache: true });
      expect(capturedBody).toBe('raw-string');
    });
  });

  describe('fetchModrinthBatch (非配列応答)', () => {
    it('非配列応答は無視して [] を返す', async () => {
      server.use(
        http.get('/api/modrinth/projects', () => HttpResponse.json({ not: 'array' }))
      );
      const result = await fetchModrinthBatch('/projects', ['a', 'b']);
      expect(result).toEqual([]);
    });
  });

  describe('fetchStableModVersion (追加分岐)', () => {
    it('skipLoader を渡すと loaders パラメータを付けずに取得する', async () => {
      let capturedUrl = '';
      server.use(
        http.get('/api/modrinth/project/skipmod/version', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json([
            {
              id: 'v-skip',
              project_id: 'proj-skip',
              version_number: '1.0.0',
              version_type: 'release',
              files: [
                { url: 'u', filename: 'f.jar', primary: true, size: 1 }
              ],
              game_versions: ['1.21.1'],
              loaders: ['fabric'],
              dependencies: []
            }
          ]);
        })
      );
      const result = await fetchStableModVersion(
        'skipmod',
        { loader: 'Fabric', mcVersion: '1.21.1' },
        { skipLoader: true }
      );
      expect(capturedUrl).not.toContain('loaders');
      expect(result?.targetVersion.id).toBe('v-skip');
    });

    it('両リクエストとも失敗したら null を返す', async () => {
      server.use(
        http.get('/api/modrinth/project/downver/version', () =>
          new HttpResponse('down', { status: 500 })
        ),
        http.get('https://api.modrinth.com/v2/project/downver/version', () =>
          new HttpResponse('down', { status: 500 })
        )
      );
      const result = await fetchStableModVersion('downver', {
        loader: 'Fabric',
        mcVersion: '1.21.1'
      });
      expect(result).toBeNull();
    });
  });

  describe('fetchLatestMinecraftVersions (追加分岐)', () => {
    it('非配列応答なら fallback list を返す', async () => {
      server.use(
        http.get('/api/modrinth/tag/game_version', () => HttpResponse.json({ not: 'array' }))
      );
      const versions = await fetchLatestMinecraftVersions();
      expect(versions).toContain('1.20.1');
    });

    it('release が 1 件も無ければ fallback list を返す', async () => {
      server.use(
        http.get('/api/modrinth/tag/game_version', () =>
          HttpResponse.json([{ version: '1.21.2', version_type: 'snapshot' }])
        )
      );
      const versions = await fetchLatestMinecraftVersions();
      expect(versions).toContain('1.20.1');
      expect(versions).not.toContain('1.21.2');
    });
  });

  describe('fetchModrinth (ネットワークエラー・429 詳細)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('proxy がネットワークエラーなら direct で取得する', async () => {
      let directHits = 0;
      server.use(
        http.get('/api/modrinth/proj/neterr', () => HttpResponse.error()),
        http.get('https://api.modrinth.com/v2/proj/neterr', () => {
          directHits++;
          return HttpResponse.json({ slug: 'neterr', title: 'Direct OK' });
        })
      );
      const data = await fetchModrinth<{ slug: string }>('/proj/neterr');
      expect(directHits).toBe(1);
      expect(data.slug).toBe('neterr');
    });

    it('proxy/direct 両方がネットワークエラーなら throw する', async () => {
      server.use(
        http.get('/api/modrinth/proj/dead', () => HttpResponse.error()),
        http.get('https://api.modrinth.com/v2/proj/dead', () => HttpResponse.error())
      );
      await expect(fetchModrinth('/proj/dead')).rejects.toThrow(
        'Failed to fetch from Modrinth'
      );
    });

    it('direct fetch が abort されたら AbortError を投げる', async () => {
      const controller = new AbortController();
      let directStarted = false;
      server.use(
        http.get('/api/modrinth/proj/abortd', () => new HttpResponse('down', { status: 500 })),
        http.get('https://api.modrinth.com/v2/proj/abortd', ({ request }) => {
          directStarted = true;
          return new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          });
        })
      );
      const p = fetchModrinth('/proj/abortd', {}, { signal: controller.signal });
      await vi.waitFor(() => expect(directStarted).toBe(true));
      controller.abort();
      await expect(p).rejects.toThrow('aborted');
    });

    it('proxy が JSON でない 200 を返したら direct にフォールバックする', async () => {
      server.use(
        http.get('/api/modrinth/proj/plain', () =>
          new HttpResponse('not json', {
            headers: { 'Content-Type': 'text/plain' }
          })
        ),
        http.get('https://api.modrinth.com/v2/proj/plain', () =>
          HttpResponse.json({ slug: 'plain', title: 'Plain OK' })
        )
      );
      const data = await fetchModrinth<{ title: string }>('/proj/plain');
      expect(data.title).toBe('Plain OK');
    });

    it('proxy 500 → direct 500 のときエラーメッセージに (direct) が付く', async () => {
      server.use(
        http.get('/api/modrinth/proj/d500', () => new HttpResponse('x', { status: 500 })),
        http.get('https://api.modrinth.com/v2/proj/d500', () =>
          new HttpResponse('x', { status: 500 })
        )
      );
      await expect(fetchModrinth('/proj/d500')).rejects.toThrow('(direct)');
    });

    it('429 で Retry-After が無ければ指数バックオフで再試行し最終的に失敗する', async () => {
      vi.useFakeTimers();
      server.use(
        http.get('/api/modrinth/proj/rl-none', () => new HttpResponse('rl', { status: 429 })),
        http.get('https://api.modrinth.com/v2/proj/rl-none', () =>
          new HttpResponse('rl', { status: 429 })
        )
      );
      const p = fetchModrinth('/proj/rl-none').then(
        () => 'ok',
        () => 'err'
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(p).resolves.toBe('err');
    });

    it('429 の Retry-After が無効値なら指数バックオフにフォールバックする', async () => {
      vi.useFakeTimers();
      server.use(
        http.get('/api/modrinth/proj/rl-bad', () =>
          new HttpResponse('rl', { status: 429, headers: { 'Retry-After': 'abc' } })
        ),
        http.get('https://api.modrinth.com/v2/proj/rl-bad', () =>
          new HttpResponse('rl', { status: 429, headers: { 'Retry-After': 'abc' } })
        )
      );
      const p = fetchModrinth('/proj/rl-bad').then(
        () => 'ok',
        () => 'err'
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(p).resolves.toBe('err');
    });

    it('429 の Retry-After が未来の HTTP-date ならその時刻まで待つ', async () => {
      vi.useFakeTimers();
      const future = new Date(Date.now() + 60_000).toUTCString();
      server.use(
        http.get('/api/modrinth/proj/rl-future', () =>
          new HttpResponse('rl', { status: 429, headers: { 'Retry-After': future } })
        ),
        http.get('https://api.modrinth.com/v2/proj/rl-future', () =>
          new HttpResponse('rl', { status: 429, headers: { 'Retry-After': future } })
        )
      );
      const p = fetchModrinth('/proj/rl-future').then(
        () => 'ok',
        () => 'err'
      );
      await vi.advanceTimersByTimeAsync(180_000);
      await expect(p).resolves.toBe('err');
    });

    it('429 の Retry-After が過去の HTTP-date なら指数バックオフにフォールバックする', async () => {
      vi.useFakeTimers();
      const past = new Date(Date.now() - 60_000).toUTCString();
      server.use(
        http.get('/api/modrinth/proj/rl-past', () =>
          new HttpResponse('rl', { status: 429, headers: { 'Retry-After': past } })
        ),
        http.get('https://api.modrinth.com/v2/proj/rl-past', () =>
          new HttpResponse('rl', { status: 429, headers: { 'Retry-After': past } })
        )
      );
      const p = fetchModrinth('/proj/rl-past').then(
        () => 'ok',
        () => 'err'
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(p).resolves.toBe('err');
    });

    it('キャッシュ上限を超えると最古エントリが削除される', async () => {
      let oldestHits = 0;
      let newestHits = 0;
      server.use(
        http.get('/api/modrinth/proj/cap', ({ request }) => {
          const i = new URL(request.url).searchParams.get('i');
          if (i === '0') oldestHits++;
          if (i === '209') newestHits++;
          return HttpResponse.json({ slug: 'cap' });
        })
      );
      // 200 を超えるユニークキーをキャッシュ → 上限超過で最古が削除される
      for (let i = 0; i < 210; i++) {
        await fetchModrinth('/proj/cap', { i });
      }
      // 最古 (i=0) はキャッシュから消えているので再 fetch される
      await fetchModrinth('/proj/cap', { i: 0 });
      // 最新 (i=209) はキャッシュに残っているので再 fetch されない
      await fetchModrinth('/proj/cap', { i: 209 });
      expect(oldestHits).toBe(2);
      expect(newestHits).toBe(1);
    });
  });
});
