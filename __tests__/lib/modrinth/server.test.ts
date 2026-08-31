/**
 * lib/modrinth/server.ts integration tests (Sub-Phase 9-C.2)
 *
 * Node.js (Server Component) 側から Modrinth API を直接叩く経路をテストする。
 * proxy を使わず https://api.modrinth.com/v2/* のみを msw で mock する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/mocks/server';
import {
  fetchModrinthSearch,
  fetchModrinthProject,
  fetchModrinthProjectAuthor,
  fetchModrinthProjectVersions,
  fetchLatestMinecraftVersions,
  slimVersion,
  REVALIDATE,
  _resetRateLimitStateForTesting
} from '@/lib/modrinth/server';
import type { ModrinthVersion } from '@/types';

// 本番パス (unstable_cache 経由) のテストで使う。テスト時は raw fetch を直接呼ぶ。
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn
}));

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

    it('projectType: shader なら facets が project_type:shader になり loader は付けない', async () => {
      let captured = '';
      server.use(
        http.get('https://api.modrinth.com/v2/search', ({ request }) => {
          captured = request.url;
          return HttpResponse.json({ hits: [], total_hits: 0, offset: 0, limit: 24 });
        })
      );
      await fetchModrinthSearch({
        projectType: 'shader',
        loader: 'Fabric',
        mcVersion: '1.20.1'
      });
      const url = new URL(captured);
      const facets = JSON.parse(url.searchParams.get('facets') ?? '[]');
      expect(facets).toContainEqual(['project_type:shader']);
      expect(facets).toContainEqual(['versions:1.20.1']);
      expect(facets).not.toContainEqual(['categories:fabric']);
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

    it('sortBy: updated → index=updated', async () => {
      let captured = '';
      server.use(
        http.get('https://api.modrinth.com/v2/search', ({ request }) => {
          captured = request.url;
          return HttpResponse.json({ hits: [], total_hits: 0, offset: 0, limit: 24 });
        })
      );
      await fetchModrinthSearch({ sortBy: 'updated' });
      expect(new URL(captured).searchParams.get('index')).toBe('updated');
    });

    it('sortBy: newest → index=newest', async () => {
      let captured = '';
      server.use(
        http.get('https://api.modrinth.com/v2/search', ({ request }) => {
          captured = request.url;
          return HttpResponse.json({ hits: [], total_hits: 0, offset: 0, limit: 24 });
        })
      );
      await fetchModrinthSearch({ sortBy: 'newest' });
      expect(new URL(captured).searchParams.get('index')).toBe('newest');
    });

    it('category を指定すると facets に categories:xxx を追加する', async () => {
      let captured = '';
      server.use(
        http.get('https://api.modrinth.com/v2/search', ({ request }) => {
          captured = request.url;
          return HttpResponse.json({ hits: [], total_hits: 0, offset: 0, limit: 24 });
        })
      );
      await fetchModrinthSearch({ query: 'x', category: 'shader' });
      const facets = JSON.parse(new URL(captured).searchParams.get('facets') ?? '[]');
      expect(facets).toContainEqual(['categories:shader']);
    });

    it('外部 AbortSignal で abort されたら throw する', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/search', () => {
          return new HttpResponse('never resolves', { status: 500 });
        })
      );
      const controller = new AbortController();
      const promise = fetchModrinthSearch({ query: 'x' }, controller.signal);
      controller.abort();
      await expect(promise).rejects.toThrow();
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

  describe('fetchModrinthProjectAuthor', () => {
    it('members から Owner 名を返す', async () => {
      const author = await fetchModrinthProjectAuthor('sodium');
      expect(author).toBe('Author sodium');
    });

    it('members 失敗時は null', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug/members', () =>
          new HttpResponse('down', { status: 500 })
        )
      );
      await expect(fetchModrinthProjectAuthor('sodium')).resolves.toBeNull();
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
    beforeEach(() => {
      _resetRateLimitStateForTesting();
      // 待ち時間の最小値を 1ms にしてテストを高速化 (実運用は既定 1000ms)
      vi.stubEnv('MODRINTH_429_MIN_WAIT_MS', '1');
    });
    afterEach(() => {
      _resetRateLimitStateForTesting();
      vi.unstubAllEnvs();
    });

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

    it('429 が継続しても backoff で再試行し、計 3 試行 (初回 + 再試行 2) 後に throw', async () => {
      let attempts = 0;
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () => {
          attempts++;
          return new HttpResponse('rate limited', {
            status: 429,
            headers: { 'Retry-After': '0' }
          });
        })
      );
      await expect(fetchModrinthProject('always-limited')).rejects.toThrow('429');
      expect(attempts).toBe(3);
    });

    it('Retry-After ヘッダなしの場合は既定 backoff が最小ウェイトに clamp されて再試行', async () => {
      let attempts = 0;
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () => {
          attempts++;
          if (attempts <= 2) {
            return new HttpResponse('rate limited', { status: 429 });
          }
          return HttpResponse.json({ id: 'ok3', slug: 'ok3', title: 'RL3 OK' });
        })
      );
      const project = await fetchModrinthProject('ok3');
      expect(attempts).toBe(3);
      expect(project.title).toBe('RL3 OK');
    });
  });

  describe('429 サーキットブレーカー (2026-08-26)', () => {
    beforeEach(() => {
      _resetRateLimitStateForTesting();
      vi.stubEnv('MODRINTH_429_MIN_WAIT_MS', '1');
    });
    afterEach(() => {
      _resetRateLimitStateForTesting();
      vi.unstubAllEnvs();
    });

    /** 常に 429 を返す handler。calls に呼び出し回数を記録 */
    const alwaysLimited = (calls: { count: number }) =>
      http.get('https://api.modrinth.com/v2/project/:slug', () => {
        calls.count++;
        return new HttpResponse('rate limited', {
          status: 429,
          headers: { 'Retry-After': '0' }
        });
      });

    it('連続 3 リクエスト最終失敗で breaker が開き、以降は fetch せず即 throw', async () => {
      const calls = { count: 0 };
      server.use(alwaysLimited(calls));

      // 3 リクエスト連続最終失敗 (各 3 試行 = 計 9 fetch) で breaker が開く
      for (let i = 0; i < 3; i++) {
        await expect(fetchModrinthProject(`p${i}`)).rejects.toThrow('429');
      }
      expect(calls.count).toBe(9);

      // 4 本目以降は fetch せず fail-fast
      await expect(fetchModrinthProject('p3')).rejects.toThrow('circuit breaker');
      expect(calls.count).toBe(9); // 増えていない
    });

    it('成功すると連続失敗カウントはリセットされる', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', ({ params }) => {
          const slug = String(params.slug);
          if (slug.startsWith('fail')) {
            return new HttpResponse('rate limited', {
              status: 429,
              headers: { 'Retry-After': '0' }
            });
          }
          return HttpResponse.json({ id: slug, slug, title: 'OK' });
        })
      );

      // fail ×2 (strikes=2) → ok (reset) → fail ×3 (strikes=3 で open)
      await expect(fetchModrinthProject('fail1')).rejects.toThrow('429');
      await expect(fetchModrinthProject('fail2')).rejects.toThrow('429');
      await expect(fetchModrinthProject('healthy')).resolves.toHaveProperty('title', 'OK');
      await expect(fetchModrinthProject('fail3')).rejects.toThrow('429');
      await expect(fetchModrinthProject('fail4')).rejects.toThrow('429');
      // 3 連続失敗目もまだ実際に fetch される (fail-fast ではない)
      await expect(fetchModrinthProject('fail5')).rejects.toThrow('429');
      // open 後は fail-fast
      await expect(fetchModrinthProject('fail6')).rejects.toThrow('circuit breaker');
    });
  });

  describe('fetchModrinthProjectAuthor (追加分岐)', () => {
    it('members が空配列なら null', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug/members', () =>
          HttpResponse.json([])
        )
      );
      await expect(fetchModrinthProjectAuthor('sodium')).resolves.toBeNull();
    });

    it('role が無いメンバーでも判定できる (?? の右辺)', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug/members', () =>
          HttpResponse.json([
            { user: { name: 'Roleless Dev', username: 'roleless' } }
          ])
        )
      );
      await expect(fetchModrinthProjectAuthor('sodium')).resolves.toBe('Roleless Dev');
    });

    it('owner が居なければ先頭メンバーの名前を使う', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug/members', () =>
          HttpResponse.json([
            { role: 'member', user: { name: 'First Dev', username: 'first' } }
          ])
        )
      );
      await expect(fetchModrinthProjectAuthor('sodium')).resolves.toBe('First Dev');
    });

    it('name が無ければ username を使う', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug/members', () =>
          HttpResponse.json([
            { role: 'owner', user: { username: 'anonymous-dev' } }
          ])
        )
      );
      await expect(fetchModrinthProjectAuthor('sodium')).resolves.toBe('anonymous-dev');
    });

    it('名前が空なら null', async () => {
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug/members', () =>
          HttpResponse.json([
            { role: 'owner', user: { name: '   ', username: '  ' } }
          ])
        )
      );
      await expect(fetchModrinthProjectAuthor('sodium')).resolves.toBeNull();
    });
  });

  describe('fetchModrinthProjectVersions (本番パス・環境変数)', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });

    it('VITEST 無しなら unstable_cache 経由で取得する (loader/mcVersion あり)', async () => {
      vi.stubEnv('VITEST', '');
      vi.stubEnv('NODE_ENV', 'production');
      const versions = await fetchModrinthProjectVersions('sodium', {
        loader: 'Fabric',
        mcVersion: '1.20.1'
      });
      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBeGreaterThan(0);
    });

    it('VITEST 無しなら unstable_cache 経由で取得する (filter 無し)', async () => {
      vi.stubEnv('VITEST', '');
      vi.stubEnv('NODE_ENV', 'production');
      const versions = await fetchModrinthProjectVersions('sodium');
      expect(Array.isArray(versions)).toBe(true);
    });

    it('MODRINTH_FETCH_TIMEOUT_MS が有効な値なら採用する', async () => {
      vi.resetModules();
      vi.stubEnv('MODRINTH_FETCH_TIMEOUT_MS', '5000');
      const mod = await import('@/lib/modrinth/server');
      const project = await mod.fetchModrinthProject('sodium');
      expect(project.slug).toBe('sodium');
    });

    it('MODRINTH_FETCH_TIMEOUT_MS が無効な値なら既定値にフォールバックする', async () => {
      vi.resetModules();
      vi.stubEnv('MODRINTH_FETCH_TIMEOUT_MS', 'abc');
      const mod = await import('@/lib/modrinth/server');
      const project = await mod.fetchModrinthProject('sodium');
      expect(project.slug).toBe('sodium');
    });

    it('MODRINTH_MAX_RETRY_WAIT_MS が有効な値なら採用する', async () => {
      vi.resetModules();
      vi.stubEnv('MODRINTH_MAX_RETRY_WAIT_MS', '5000');
      const mod = await import('@/lib/modrinth/server');
      const project = await mod.fetchModrinthProject('sodium');
      expect(project.slug).toBe('sodium');
    });

    it('MODRINTH_MAX_RETRY_WAIT_MS が無効な値なら既定値にフォールバックする', async () => {
      vi.resetModules();
      vi.stubEnv('MODRINTH_MAX_RETRY_WAIT_MS', 'abc');
      const mod = await import('@/lib/modrinth/server');
      const project = await mod.fetchModrinthProject('sodium');
      expect(project.slug).toBe('sodium');
    });

    it('429 で MIN_WAIT 未設定なら既定の最小ウェイトで再試行する', async () => {
      vi.useFakeTimers();
      _resetRateLimitStateForTesting();
      let attempts = 0;
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () => {
          attempts++;
          if (attempts === 1) {
            return new HttpResponse('rl', {
              status: 429,
              headers: { 'Retry-After': '0' }
            });
          }
          return HttpResponse.json({ id: 'ok', slug: 'ok', title: 'OK' });
        })
      );
      const p = fetchModrinthProject('ok').then(
        (v) => v,
        (e: Error) => {
          throw e;
        }
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const project = await p;
      expect(attempts).toBe(2);
      expect(project.title).toBe('OK');
    });

    it('429 で MIN_WAIT が無効値なら既定の最小ウェイトで再試行する', async () => {
      vi.useFakeTimers();
      _resetRateLimitStateForTesting();
      vi.stubEnv('MODRINTH_429_MIN_WAIT_MS', 'abc');
      let attempts = 0;
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () => {
          attempts++;
          if (attempts === 1) {
            return new HttpResponse('rl', {
              status: 429,
              headers: { 'Retry-After': '0' }
            });
          }
          return HttpResponse.json({ id: 'ok2', slug: 'ok2', title: 'OK2' });
        })
      );
      const p = fetchModrinthProject('ok2').then(
        (v) => v,
        (e: Error) => {
          throw e;
        }
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const project = await p;
      expect(attempts).toBe(2);
      expect(project.title).toBe('OK2');
    });

    it('429 の Retry-After が無効値なら指数バックオフで再試行する', async () => {
      vi.useFakeTimers();
      _resetRateLimitStateForTesting();
      vi.stubEnv('MODRINTH_429_MIN_WAIT_MS', '1');
      let attempts = 0;
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () => {
          attempts++;
          if (attempts === 1) {
            return new HttpResponse('rl', {
              status: 429,
              headers: { 'Retry-After': 'abc' }
            });
          }
          return HttpResponse.json({ id: 'ok3', slug: 'ok3', title: 'OK3' });
        })
      );
      const p = fetchModrinthProject('ok3').then(
        (v) => v,
        (e: Error) => {
          throw e;
        }
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const project = await p;
      expect(attempts).toBe(2);
      expect(project.title).toBe('OK3');
    });

    it('429 の Retry-After が未来の HTTP-date ならその時刻まで待つ', async () => {
      vi.useFakeTimers();
      _resetRateLimitStateForTesting();
      vi.stubEnv('MODRINTH_429_MIN_WAIT_MS', '1');
      const future = new Date(Date.now() + 60_000).toUTCString();
      let attempts = 0;
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () => {
          attempts++;
          if (attempts === 1) {
            return new HttpResponse('rl', {
              status: 429,
              headers: { 'Retry-After': future }
            });
          }
          return HttpResponse.json({ id: 'ok4', slug: 'ok4', title: 'OK4' });
        })
      );
      const p = fetchModrinthProject('ok4').then(
        (v) => v,
        (e: Error) => {
          throw e;
        }
      );
      await vi.advanceTimersByTimeAsync(120_000);
      const project = await p;
      expect(attempts).toBe(2);
      expect(project.title).toBe('OK4');
    });

    it('429 の Retry-After が過去の HTTP-date なら指数バックオフで再試行する', async () => {
      vi.useFakeTimers();
      _resetRateLimitStateForTesting();
      vi.stubEnv('MODRINTH_429_MIN_WAIT_MS', '1');
      const past = new Date(Date.now() - 60_000).toUTCString();
      let attempts = 0;
      server.use(
        http.get('https://api.modrinth.com/v2/project/:slug', () => {
          attempts++;
          if (attempts === 1) {
            return new HttpResponse('rl', {
              status: 429,
              headers: { 'Retry-After': past }
            });
          }
          return HttpResponse.json({ id: 'ok5', slug: 'ok5', title: 'OK5' });
        })
      );
      const p = fetchModrinthProject('ok5').then(
        (v) => v,
        (e: Error) => {
          throw e;
        }
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const project = await p;
      expect(attempts).toBe(2);
      expect(project.title).toBe('OK5');
    });
  });
});
