/**
 * MSW handlers - Modrinth API mocks (Sub-Phase 9-C.1)
 *
 * lib/modrinth/client.ts はブラウザ側から呼ばれる際、まず自ドメインの
 * `/api/modrinth/*` プロキシを試し、失敗時に `https://api.modrinth.com/v2/*`
 * へ直接アクセスする。テスト環境 (jsdom) では相対 URL はデフォルトで
 * `http://localhost/` に解決されるため、両方の origin に同じハンドラを
 * 登録して、どちらの経路でも一貫した mock を返す。
 *
 * `server.use(...)` で個別テストが handler を上書き可能。
 */

import { http, HttpResponse } from 'msw';

const MODRINTH_DIRECT = 'https://api.modrinth.com/v2';
// client.ts は `/api/modrinth/${endpoint}` (相対 URL) を fetch する。
// msw v2 では relative URL は "パスマッチ" として扱われるため origin なしで登録。
const MODRINTH_PROXY = '/api/modrinth';

// ============================================================================
// 個別 handler builder (direct/proxy を同時に登録するためのヘルパ)
// ============================================================================

type HttpMethod = 'get' | 'post';

function both(method: HttpMethod, path: string, resolver: Parameters<typeof http.get>[1]) {
  return [
    http[method](`${MODRINTH_DIRECT}${path}`, resolver),
    http[method](`${MODRINTH_PROXY}${path}`, resolver)
  ];
}

// ============================================================================
// Handlers
// ============================================================================

export const handlers = [
  // ---------- /search ----------
  ...both('get', '/search', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('query') ?? '';
    const limit = Number(url.searchParams.get('limit') ?? 24);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return HttpResponse.json({
      hits: Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
        project_id: `mock-${offset + i}`,
        slug: `sodium-${offset + i}`,
        title: query ? `${query} result ${i}` : `Popular Mod ${i}`,
        description: 'Test mod description',
        icon_url: null,
        author: 'TestAuthor',
        categories: ['performance'],
        display_categories: ['performance'],
        versions: ['1.20.1'],
        downloads: 1000 + i * 100,
        follows: 100
      })),
      total_hits: 100,
      offset,
      limit
    });
  }),

  // ---------- /project/{slug or id}/members ----------
  ...both('get', '/project/:slug/members', ({ params }) => {
    return HttpResponse.json([
      {
        role: 'Owner',
        user: { username: `author-${params.slug}`, name: `Author ${params.slug}` }
      }
    ]);
  }),

  // ---------- /project/{slug or id}/version (list) ----------
  // B35 修正: msw v2 は path-to-regexp で specific path を自動優先するため
  //   登録順は matching に影響しない。しかしコード可読性のため specific → generic
  //   の順序を維持する (レビュアーに紛らわしい印象を与えないため)。
  ...both('get', '/project/:slug/version', ({ params, request }) => {
    const url = new URL(request.url);
    const loaders = url.searchParams.get('loaders');
    const gv = url.searchParams.get('game_versions');
    return HttpResponse.json([
      {
        id: 'ver-1',
        project_id: `id-${params.slug}`,
        version_number: '1.0.0',
        version_type: 'release',
        game_versions: gv ? (JSON.parse(gv) as string[]) : ['1.20.1'],
        loaders: loaders ? (JSON.parse(loaders) as string[]) : ['fabric'],
        files: [
          {
            hashes: { sha1: 'a1b2c3', sha512: 'd4e5f6' },
            url: 'https://cdn.modrinth.com/data/mock/versions/1.0.0/mock.jar',
            filename: 'mock-1.0.0.jar',
            primary: true,
            size: 100000
          }
        ],
        dependencies: []
      }
    ]);
  }),

  // ---------- /project/{slug or id} ----------
  ...both('get', '/project/:slug', ({ params }) => {
    return HttpResponse.json({
      id: `id-${params.slug}`,
      slug: String(params.slug),
      title: `Mock ${params.slug}`,
      description: 'Test description',
      icon_url: null,
      body: '# Test\n\nSome markdown',
      published: '2020-01-01T00:00:00.000Z',
      updated: '2026-08-01T00:00:00.000Z',
      versions: ['ver-1', 'ver-2'],
      loaders: ['fabric'],
      game_versions: ['1.20.1'],
      display_categories: ['performance'],
      categories: ['performance']
    });
  }),

  // ---------- /version/{versionId} ----------
  ...both('get', '/version/:versionId', ({ params }) => {
    return HttpResponse.json({
      id: String(params.versionId),
      project_id: 'proj-mock',
      version_number: '1.0.0',
      version_type: 'release',
      files: [
        {
          hashes: { sha1: 'a1b2c3', sha512: 'd4e5f6' },
          url: 'https://cdn.modrinth.com/data/mock.jar',
          filename: `${params.versionId}.jar`,
          primary: true,
          size: 100000
        }
      ],
      dependencies: []
    });
  }),

  // ---------- /projects (batch) ----------
  ...both('get', '/projects', ({ request }) => {
    const url = new URL(request.url);
    const idsParam = url.searchParams.get('ids');
    if (!idsParam) return HttpResponse.json([]);
    let ids: string[] = [];
    try {
      ids = JSON.parse(idsParam) as string[];
    } catch {
      ids = [];
    }
    return HttpResponse.json(
      ids.map((id) => ({
        id,
        slug: id,
        title: `Batch ${id}`,
        icon_url: null,
        description: 'batch mock'
      }))
    );
  }),

  // ---------- /versions (batch) ----------
  ...both('get', '/versions', ({ request }) => {
    const url = new URL(request.url);
    const idsParam = url.searchParams.get('ids');
    if (!idsParam) return HttpResponse.json([]);
    let ids: string[] = [];
    try {
      ids = JSON.parse(idsParam) as string[];
    } catch {
      ids = [];
    }
    return HttpResponse.json(
      ids.map((id) => ({
        id,
        project_id: `proj-${id}`,
        version_number: '1.0.0',
        version_type: 'release',
        game_versions: ['1.20.1'],
        loaders: ['fabric'],
        files: [
          {
            hashes: { sha1: `hash-${id}`, sha512: `sha512-${id}` },
            url: `https://cdn.modrinth.com/data/${id}.jar`,
            filename: `${id}.jar`,
            primary: true,
            size: 100000
          }
        ],
        dependencies: []
      }))
    );
  }),

  // ---------- /version_files (POST) ----------
  ...both('post', '/version_files', async ({ request }) => {
    const body = (await request.json()) as {
      hashes: string[];
      algorithm?: string;
    };
    const result: Record<string, unknown> = {};
    for (const hash of body.hashes) {
      result[hash] = {
        id: `ver-${hash}`,
        project_id: `proj-${hash}`,
        version_number: '1.0.0',
        files: [
          {
            hashes: { sha1: hash },
            url: `https://cdn.modrinth.com/data/${hash}.jar`,
            filename: `${hash}.jar`,
            primary: true,
            size: 100000
          }
        ]
      };
    }
    return HttpResponse.json(result);
  }),

  // ---------- /tag/game_version ----------
  ...both('get', '/tag/game_version', () => {
    return HttpResponse.json([
      { version: '1.21.4', version_type: 'release' },
      { version: '1.21.3', version_type: 'release' },
      { version: '1.21.2', version_type: 'snapshot' },
      { version: '1.20.1', version_type: 'release' },
      { version: '1.19.4', version_type: 'release' }
    ]);
  })
];
