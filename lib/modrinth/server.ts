// ============================================================================
// Modrinth API サーバ側ラッパ (Server Components / Route Handlers 用)
//
// Vite 版の services/api.ts と異なり、こちらはブラウザではなく Node.js
// (Vercel サーバ) から直接 Modrinth を叩く。ISR / Data Cache のため
// fetch(..., { next: { revalidate, tags } }) を活用する。
//
// キャッシュ戦略 (docs/planning/NEXTJS_MIGRATION_PLAN.md §7 参照):
//   - /search:            5分   (人気順の並びは頻繁に微変動するが安定性を優先)
//   - /project/{id}:      1時間 (メタ情報は数日〜数週間単位で更新)
//   - /project/{id}/version: 1時間 (新版が出たら 1時間以内に反映)
//   - /tag/game_version:  24時間 (ほぼ静的)
//
// レートリミット対策:
//   - 300 req/min の Modrinth 制限に配慮し、fetch キャッシュに任せる
//   - 429 が返ったら Retry-After を尊重して 1 回だけリトライ
// ============================================================================

import type { ModrinthHit, ModrinthProject, ModrinthVersion } from '@/types';

const MODRINTH_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT =
  process.env.MODRINTH_USER_AGENT ||
  'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';

// -----------------------------------------------------
// TTL 一覧 (秒)
// -----------------------------------------------------
export const REVALIDATE = {
  SEARCH: 300, // 5分
  PROJECT: 3600, // 1時間
  PROJECT_LIST: 1800, // 30分
  VERSION: 3600, // 1時間
  VERSION_LIST: 1800, // 30分
  TAG: 86400 // 24時間
} as const;

// -----------------------------------------------------
// 内部ヘルパー
// -----------------------------------------------------

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Vercel の Serverless Function timeout に合わせて Retry-After 上限を絞る。
//   - Hobby: 10s, Pro: 60s, Enterprise: 900s
// Hobby プランでも動くよう、既定は 8s (10s - 2s の安全マージン) とし、
// より上位プランを使う場合は環境変数 MODRINTH_MAX_RETRY_WAIT_MS で上書き可能。
const DEFAULT_MAX_RETRY_WAIT_MS = 8_000;
const MAX_RETRY_WAIT_MS = (() => {
  const raw = process.env.MODRINTH_MAX_RETRY_WAIT_MS;
  if (!raw) return DEFAULT_MAX_RETRY_WAIT_MS;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_RETRY_WAIT_MS;
})();

// テスト容易性のため export (Sub-Phase 8-D)
export function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const asNumber = Number(headerValue);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.min(asNumber * 1000, MAX_RETRY_WAIT_MS);
  }
  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now();
    if (diff > 0) return Math.min(diff, MAX_RETRY_WAIT_MS);
  }
  return null;
}

/**
 * Modrinth API を Server 側から叩く共通関数。
 *
 * - meaningful UA を必ず付与
 * - fetch キャッシュ (revalidate + tags) を有効化
 * - 429 Too Many Requests の場合 Retry-After を尊重して 1 回だけリトライ
 */
async function fetchModrinthServer<T>(
  endpoint: string,
  init: {
    searchParams?: Record<string, string | number | undefined>;
    revalidate: number;
    tags?: string[];
    /** 呼び出し側で abort したい場合 */
    signal?: AbortSignal;
  }
): Promise<T> {
  const params = new URLSearchParams();
  if (init.searchParams) {
    for (const [key, value] of Object.entries(init.searchParams)) {
      if (value === undefined || value === null || value === '') continue;
      params.append(key, String(value));
    }
  }
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const url = `${MODRINTH_BASE}${endpoint}${queryString}`;

  const doFetch = () =>
    fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      signal: init.signal,
      next: {
        revalidate: init.revalidate,
        tags: init.tags
      }
    });

  let res = await doFetch();

  if (res.status === 429) {
    const retryAfterMs = parseRetryAfterMs(res.headers.get('Retry-After')) ?? 2000;
    console.warn(
      `[DropMod] Modrinth 429 (server). Waiting ${retryAfterMs}ms then retrying: ${endpoint}`
    );
    await sleep(retryAfterMs);
    res = await doFetch();
  }

  if (!res.ok) {
    throw new Error(`Modrinth ${endpoint}: HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ==========================================================================
// 高レベル API
// ==========================================================================

export interface SearchParams {
  query?: string;
  mcVersion?: string;
  loader?: string;
  category?: string;
  sortBy?: 'popular' | 'relevance' | 'updated' | 'newest';
  offset?: number;
  limit?: number;
}

export interface SearchResult {
  hits: ModrinthHit[];
  total_hits: number;
  offset: number;
  limit: number;
}

function toIndexParam(sortBy: SearchParams['sortBy']): string {
  if (sortBy === 'relevance') return 'relevance';
  if (sortBy === 'updated') return 'updated';
  if (sortBy === 'newest') return 'newest';
  return 'downloads';
}

/**
 * Modrinth /search を叩く (Home ページの初期 24 件 SSR 用)。
 */
export async function fetchModrinthSearch(
  params: SearchParams,
  signal?: AbortSignal
): Promise<SearchResult> {
  const facets: string[][] = [['project_type:mod']];
  if (params.mcVersion) facets.push([`versions:${params.mcVersion}`]);
  if (params.loader) facets.push([`categories:${params.loader.toLowerCase()}`]);
  if (params.category && params.category !== 'All')
    facets.push([`categories:${params.category}`]);

  return fetchModrinthServer<SearchResult>('/search', {
    searchParams: {
      query: (params.query ?? '').trim(),
      facets: JSON.stringify(facets),
      index: toIndexParam(params.sortBy),
      limit: params.limit ?? 24,
      offset: params.offset ?? 0
    },
    revalidate: REVALIDATE.SEARCH,
    tags: ['modrinth:search'],
    signal
  });
}

/**
 * Modrinth /project/{slugOrId} を取得 (Mod 詳細ページ・モーダル用)。
 * slug と id のどちらも許容 (Modrinth 側の仕様)。
 */
export async function fetchModrinthProject(
  slug: string,
  signal?: AbortSignal
): Promise<ModrinthProject> {
  return fetchModrinthServer<ModrinthProject>(`/project/${encodeURIComponent(slug)}`, {
    revalidate: REVALIDATE.PROJECT,
    tags: ['modrinth:project', `modrinth:project:${slug}`],
    signal
  });
}

/**
 * Modrinth /project/{slugOrId}/version を取得。
 * loader / game_versions で絞り込み。空でも呼び出せる (全バージョン)。
 */
export async function fetchModrinthProjectVersions(
  slug: string,
  filter?: { loader?: string; mcVersion?: string },
  signal?: AbortSignal
): Promise<ModrinthVersion[]> {
  const searchParams: Record<string, string> = {};
  if (filter?.loader) {
    searchParams.loaders = JSON.stringify([filter.loader.toLowerCase()]);
  }
  if (filter?.mcVersion) {
    searchParams.game_versions = JSON.stringify([filter.mcVersion]);
  }
  return fetchModrinthServer<ModrinthVersion[]>(
    `/project/${encodeURIComponent(slug)}/version`,
    {
      searchParams,
      revalidate: REVALIDATE.VERSION,
      tags: ['modrinth:versions', `modrinth:versions:${slug}`],
      signal
    }
  );
}

/**
 * Modrinth /tag/game_version を取得 (Minecraft バージョン一覧)。
 * 24時間 ISR + フェールセーフのため fallback list を持つ。
 */
export async function fetchLatestMinecraftVersions(
  signal?: AbortSignal
): Promise<string[]> {
  try {
    const data = await fetchModrinthServer<
      Array<{ version: string; version_type: string }>
    >('/tag/game_version', {
      revalidate: REVALIDATE.TAG,
      tags: ['modrinth:tag:game_version'],
      signal
    });
    const releaseVersions = data
      .filter((v) => v.version_type === 'release')
      .map((v) => v.version);
    if (releaseVersions.length > 0) return releaseVersions;
  } catch (e) {
    console.warn('[DropMod] fetchLatestMinecraftVersions fell back:', e);
  }
  return [
    '1.21.4',
    '1.21.3',
    '1.21.1',
    '1.20.6',
    '1.20.4',
    '1.20.1',
    '1.19.4',
    '1.19.2',
    '1.18.2',
    '1.16.5',
    '1.12.2'
  ];
}
