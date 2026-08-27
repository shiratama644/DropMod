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
//     → JEI/no-chat-reports など巨大 project では応答が数 MB 〜 8 MB になり、
//       Next.js Data Cache の 2 MB 上限に引っかかる。そのため /version は
//       Data Cache に載せず、`unstable_cache` + slim 化した射影オブジェクト
//       だけをメモリレイヤにキャッシュする (Phase 10-P2)。
//   - /tag/game_version:  24時間 (ほぼ静的)
//
// レートリミット対策:
//   - 300 req/min の Modrinth 制限に配慮し、fetch キャッシュに任せる
//   - 429 が返ったら Retry-After を尊重して 1 回だけリトライ
//
// タイムアウト戦略 (Phase 10-P2):
//   - build 時に Modrinth の一部エンドポイントが数十秒応答しない事象が観測された
//     (euphoria-patches / cobblemon / lithium / distanthorizons など)。
//   - Vercel Hobby の 10s Function timeout に合わせ、fetch 単位で AbortSignal.timeout(8s)
//     を必ず付与する。呼び出し側 signal と `AbortSignal.any` で合成。
//   - タイムアウト時は throw され、上位の try/catch で fallback される。
// ============================================================================

import { logger } from '@/lib/server/logger';
import { unstable_cache } from 'next/cache';
import type { ModrinthHit, ModrinthProject, ModrinthVersion } from '@/types';

const MODRINTH_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT =
  process.env.MODRINTH_USER_AGENT ||
  'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';

// fetch 単位のハード timeout (ミリ秒)。Vercel Hobby の 10s Function timeout
// から 429 リトライ余裕 2s を差し引いた 8s を既定に。
// 環境変数 MODRINTH_FETCH_TIMEOUT_MS で上書き可能。
const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const FETCH_TIMEOUT_MS = (() => {
  const raw = process.env.MODRINTH_FETCH_TIMEOUT_MS;
  if (!raw) return DEFAULT_FETCH_TIMEOUT_MS;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_FETCH_TIMEOUT_MS;
})();

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
// 429 レート制限対策 (2026-08-26: build 時バースト保護)
//
// 問題: build の generateStaticParams が詳細ページを大量に事前生成し、
// 各ページ 3 fetch × 400 ページ ≒ 1,200 req をバースト → Modrinth の
// 300 req/min を確実に超過し全面 429 になっていた。また Modrinth は
// `Retry-After: 0` を返すことがあり、旧実装は 0ms 待ちで即再試行して
// いたためレート制限の穴を深めるだけだった。
//
// 対策 (2026-08-26 実施、PHASE10_5_PLAN.md 続報):
//   1. Retry-After の値が小さくても最低 MODRINTH_429_MIN_WAIT_MS (既定 1s)
//      待ってから再試行 (2 回まで、待ち時間は倍々 backoff)
//   2. サーキットブレーカー: 429 で最終失敗したリクエストが連続
//      RATE_LIMIT_BREAKER_THRESHOLD 回 (既定 3) に達したら、
//      RATE_LIMIT_BREAKER_COOLDOWN_MS (既定 60s) 間は fetch せず
//      即座に throw (fail-fast)。build の残りページはフォールバック
//      表示で素早く完了し、レート制限の回復を待つ。
// -----------------------------------------------------
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_DEFAULT_MIN_WAIT_MS = 1_000;
const RATE_LIMIT_BREAKER_THRESHOLD = 3;
const RATE_LIMIT_BREAKER_COOLDOWN_MS = 60_000;

/** Retry-After の最小ウェイト (ms)。テスト高速化のため call 時に env を読む。 */
function rateLimitMinWaitMs(): number {
  const raw = process.env.MODRINTH_429_MIN_WAIT_MS;
  if (!raw) return RATE_LIMIT_DEFAULT_MIN_WAIT_MS;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return RATE_LIMIT_DEFAULT_MIN_WAIT_MS;
}

let rateLimitStrikes = 0;
let rateLimitOpenUntil = 0;

function isRateLimitBreakerOpen(): boolean {
  return Date.now() < rateLimitOpenUntil;
}

/** 429 最終失敗を記録。連続 THRESHOLD 回で breaker を開く。 */
function registerRateLimitFailure(endpoint: string): void {
  rateLimitStrikes++;
  if (rateLimitStrikes >= RATE_LIMIT_BREAKER_THRESHOLD) {
    rateLimitOpenUntil = Date.now() + RATE_LIMIT_BREAKER_COOLDOWN_MS;
    rateLimitStrikes = 0;
    logger.warn(
      `Modrinth rate-limit breaker OPEN (${endpoint}): ${RATE_LIMIT_BREAKER_COOLDOWN_MS}ms 間 fail-fast します`
    );
  }
}

/** 成功で連続失敗カウントをリセット。 */
function resetRateLimitStrikes(): void {
  rateLimitStrikes = 0;
}

/** テスト用: breaker / strikes 状態を初期化 (実コードからは使わない)。 */
export function _resetRateLimitStateForTesting(): void {
  rateLimitStrikes = 0;
  rateLimitOpenUntil = 0;
}

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
 * 呼び出し側 signal と timeout signal を安全に合成する。
 * AbortSignal.any は Node.js 20.3+ / 21 で利用可能 (Next.js 16 の要件を満たす)。
 */
function combineSignals(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!external) return timeoutSignal;
  // AbortSignal.any は複数 signal のうち最初に abort されたものを反映する
  return AbortSignal.any([external, timeoutSignal]);
}

/**
 * Modrinth API を Server 側から叩く共通関数。
 *
 * - meaningful UA を必ず付与
 * - fetch キャッシュ (revalidate + tags) を有効化
 *   ※ ただし呼び出し側で `cache: 'no-store'` を渡した場合は Data Cache
 *      をバイパスする (2MB 超のレスポンス回避のため)
 * - AbortSignal.timeout(8s) を必ず適用してハングを防ぐ
 * - 429 Too Many Requests は Retry-After を尊重して backoff 再試行
 *   (最大 2 回、最低 1s)。連続失敗時はサーキットブレーカーで fail-fast
 */
async function fetchModrinthServer<T>(
  endpoint: string,
  init: {
    searchParams?: Record<string, string | number | undefined>;
    revalidate: number;
    tags?: string[];
    /** 呼び出し側で abort したい場合 */
    signal?: AbortSignal;
    /**
     * `no-store` を渡すと Next.js Data Cache をバイパスする。
     * 2MB を超える可能性がある巨大レスポンス (project versions) 用。
     * この場合、キャッシュは呼び出し側で unstable_cache 等を使って行うこと。
     */
    cache?: 'no-store';
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

  // サーキットブレーカーが開いている間は fetch せず即座に失敗させる
  // (build 時の全面 429 で残りページの fetch を打ち切る)。
  if (isRateLimitBreakerOpen()) {
    throw new Error(`Modrinth ${endpoint}: rate-limit circuit breaker open (fail fast)`);
  }

  const doFetch = () => {
    const signal = combineSignals(init.signal, FETCH_TIMEOUT_MS);
    const fetchInit: RequestInit & { next?: { revalidate: number; tags?: string[] } } = {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      signal
    };
    if (init.cache === 'no-store') {
      fetchInit.cache = 'no-store';
    } else {
      fetchInit.next = {
        revalidate: init.revalidate,
        tags: init.tags
      };
    }
    return fetch(url, fetchInit);
  };

  let res = await doFetch();

  // 429: Retry-After を尊重しつつ、最小ウェイトを保証して backoff 再試行。
  // Modrinth は Retry-After: 0 を返すことがあるため、0ms 待ちの即再試行
  // (レート穴を深めるだけ) を防ぐ。
  let attempt = 0;
  while (res.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
    const parsed = parseRetryAfterMs(res.headers.get('Retry-After'));
    // ヘッダなし: 最小ウェイトの 2 倍から倍々 backoff (既定 2s → 4s。
    // テストは MODRINTH_429_MIN_WAIT_MS=1 で高速化)
    const backoff = parsed ?? rateLimitMinWaitMs() * 2 * (attempt + 1);
    const waitMs = Math.max(backoff, rateLimitMinWaitMs());
    logger.warn(
      `Modrinth 429 (server). Waiting ${waitMs}ms then retrying (${attempt + 1}/${RATE_LIMIT_MAX_RETRIES}): ${endpoint}`
    );
    await sleep(waitMs);
    attempt++;
    res = await doFetch();
  }

  if (res.status === 429) {
    registerRateLimitFailure(endpoint);
    throw new Error(`Modrinth ${endpoint}: HTTP ${res.status} ${res.statusText}`);
  }
  if (!res.ok) {
    throw new Error(`Modrinth ${endpoint}: HTTP ${res.status} ${res.statusText}`);
  }
  resetRateLimitStrikes();
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
  /** 未指定時は mod。LP / BrowseSheet の type= に対応 */
  projectType?: 'mod' | 'modpack' | 'resourcepack' | 'shader';
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
  const projectType = params.projectType ?? 'mod';
  const facets: string[][] = [[`project_type:${projectType}`]];
  if (params.mcVersion) facets.push([`versions:${params.mcVersion}`]);
  if (params.loader && (projectType === 'mod' || projectType === 'modpack')) {
    facets.push([`categories:${params.loader.toLowerCase()}`]);
  }
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

interface ModrinthTeamMember {
  role?: string;
  user?: {
    username?: string;
    name?: string | null;
  };
}

/**
 * `/project` 応答には author が無い。members から Owner (なければ先頭) の表示名を取る。
 * 失敗時は null (詳細 UI は author なしで描画する)。
 */
export async function fetchModrinthProjectAuthor(
  slug: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const members = await fetchModrinthServer<ModrinthTeamMember[]>(
      `/project/${encodeURIComponent(slug)}/members`,
      {
        revalidate: REVALIDATE.PROJECT,
        tags: ['modrinth:project', `modrinth:project:${slug}:members`],
        signal
      }
    );
    if (!Array.isArray(members) || members.length === 0) return null;
    const owner =
      members.find((m) => (m.role ?? '').toLowerCase() === 'owner') ?? members[0];
    const name = owner?.user?.name?.trim() || owner?.user?.username?.trim();
    return name || null;
  } catch (e) {
    logger.warn('fetchModrinthProjectAuthor failed:', slug, e);
    return null;
  }
}

/**
 * `ModrinthVersion` を「詳細ページ表示に必要な最小フィールド」だけに射影する。
 *
 * Phase 10-P2: 巨大 project (JEI=8MB, no-chat-reports=6.7MB 等) では
 * changelog / dependencies / hashes / featured / downloads などが肥大化して
 * Next.js Data Cache の 2MB 上限に引っかかっていた。詳細ページで実際に
 * 使うフィールド (id, version_number, version_type, game_versions, loaders,
 * files.{url,filename,primary,size}) だけ残す。
 *
 * export 理由:
 *   - unit test で射影漏れ (今後 UI で参照するフィールドを追加した際) を検知
 *   - モーダル側 (ModDetailModalShell) で同じ slim 版を消費するため型が合う
 */
export function slimVersion(v: ModrinthVersion): ModrinthVersion {
  return {
    id: v.id,
    project_id: v.project_id,
    // Vite 版互換のため、以下 3 フィールドはダミー値を入れて型を満たす
    // (詳細ページ UI では参照しないが、消費者側の ModrinthVersion 型が required)。
    author_id: '',
    featured: false,
    name: v.name ?? v.version_number,
    version_number: v.version_number,
    date_published: v.date_published,
    downloads: 0, // 意図的に落とす (プロジェクト DL 数と紛らわしく UI 未使用)
    version_type: v.version_type,
    files: (v.files ?? []).map((f) => ({
      url: f.url,
      filename: f.filename,
      primary: f.primary,
      size: f.size
    })),
    // dependencies: 詳細ページ UI では未使用 (依存チェックは別 hook)。省略。
    game_versions: v.game_versions ?? [],
    loaders: v.loaders ?? []
  };
}

// unstable_cache 化するための内部 fetch。呼び出し側の filter / slug で
// キー生成しキャッシュエントリを分ける (keyParts 経由)。
async function fetchModrinthProjectVersionsRaw(
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
  const raw = await fetchModrinthServer<ModrinthVersion[]>(
    `/project/${encodeURIComponent(slug)}/version`,
    {
      searchParams,
      revalidate: REVALIDATE.VERSION,
      tags: ['modrinth:versions', `modrinth:versions:${slug}`],
      signal,
      // Phase 10-P2: 巨大レスポンス (>2MB) が Next.js Data Cache に載らず
      // 大量の警告を吐くのを回避。射影後の slim 版を unstable_cache に載せる。
      cache: 'no-store'
    }
  );
  return raw.map(slimVersion);
}

/**
 * Modrinth /project/{slugOrId}/version を取得。
 * loader / game_versions で絞り込み。空でも呼び出せる (全バージョン)。
 *
 * Phase 10-P2 修正:
 *   - 応答を詳細ページ表示に必要な最小フィールドだけに slim 化してから返す
 *   - fetch は `no-store` で Data Cache をバイパス (2MB 上限回避)
 *   - 結果は `unstable_cache` にメモリ層でキャッシュ (TTL = REVALIDATE.VERSION)
 *   - キャッシュキーは slug + filter を含む (loader/mcVersion 別で分離)
 *   - revalidateTag('modrinth:versions:<slug>') で個別無効化可能
 */
export async function fetchModrinthProjectVersions(
  slug: string,
  filter?: { loader?: string; mcVersion?: string },
  signal?: AbortSignal
): Promise<ModrinthVersion[]> {
  // vitest 実行時は Next のリクエストコンテキスト (incrementalCache) が無いため
  // unstable_cache は invariant で throw する。テスト時は素の fetch を直接呼ぶ。
  // (production build 時は Next のグローバルコンテキストが張られているので OK)
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return fetchModrinthProjectVersionsRaw(slug, filter, signal);
  }
  // unstable_cache は「関数を包む」形なので、slug/filter を keyParts に含めて
  // 呼び出し毎にエントリを分離する。signal はキャッシュに乗せず raw fetch に渡す。
  const cached = unstable_cache(
    async () => fetchModrinthProjectVersionsRaw(slug, filter, signal),
    [
      'modrinth:versions',
      slug,
      filter?.loader ?? '',
      filter?.mcVersion ?? ''
    ],
    {
      revalidate: REVALIDATE.VERSION,
      tags: ['modrinth:versions', `modrinth:versions:${slug}`]
    }
  );
  return cached();
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
    logger.warn('fetchLatestMinecraftVersions fell back:', e);
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
