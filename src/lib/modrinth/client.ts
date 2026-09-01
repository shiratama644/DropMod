import type { ModrinthVersion, ModrinthProject } from '@/types';

// ==========================================================================
// 定数
// ==========================================================================
const DIRECT_MODRINTH_BASE = 'https://api.modrinth.com/v2';

// LRU + TTL キャッシュ設定
const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

// 429 (Too Many Requests) 対応
// Modrinth 公式: 300 req/min, 429 時は Retry-After ヘッダ尊重
// https://docs.modrinth.com/api/#ratelimits
const MAX_RETRY_ON_429 = 3;
const DEFAULT_RETRY_AFTER_MS = 2000;
const MAX_RETRY_AFTER_MS = 30_000; // 過剰な待機防止の上限

// ==========================================================================
// LRU + TTL キャッシュ実装
// ==========================================================================
// Phase 10-P5 (noExplicitAny): cache 値は呼び出し側 (fetchModrinth) の
//   ジェネリクス T で型付けされる。cache 内部では any → unknown で持ち、
//   呼び出し側で as T に narrowing する形。
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const apiCache = new Map<string, CacheEntry>();

/** LRU: Map の insertion order を利用。get する度に末尾へ移動する。 */
function cacheGet(key: string): unknown | undefined {
  const entry = apiCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    apiCache.delete(key);
    return undefined;
  }
  // LRU: 末尾へ移動 (Map の再挿入)
  apiCache.delete(key);
  apiCache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: unknown): void {
  apiCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  // 上限超過時は最古 (先頭) を削除。
  // ループ条件で size > CACHE_MAX_ENTRIES が保証されるためキーは必ず取得できる。
  while (apiCache.size > CACHE_MAX_ENTRIES) {
    // biome-ignore lint/style/noNonNullAssertion: ループ条件で size > CACHE_MAX_ENTRIES のため必ず存在
    apiCache.delete(apiCache.keys().next().value!);
  }
}

/** テスト・データリセット用 */
export function clearApiCache(): void {
  apiCache.clear();
}

// ==========================================================================
// ヘルパー
// ==========================================================================

/** params のキーを昇順にソートしてから stringify (キャッシュキー安定化) */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  const src = obj as Record<string, unknown>;
  const keys = Object.keys(src).sort();
  const sorted: Record<string, unknown> = {};
  keys.forEach((k) => {
    sorted[k] = src[k];
  });
  return JSON.stringify(sorted);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry-After ヘッダ (秒 or HTTP-date) をパースしてミリ秒に変換。
 * 上限を超える値は上限にクランプ。無効値は null。
 */
function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const asNumber = Number(headerValue);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.min(asNumber * 1000, MAX_RETRY_AFTER_MS);
  }
  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now();
    if (diff > 0) return Math.min(diff, MAX_RETRY_AFTER_MS);
  }
  return null;
}

// ==========================================================================
// 本体
// ==========================================================================
// Phase 10-P5 (noExplicitAny): <T = unknown> にすると呼び出し側で型指定が
//   必須になり広範囲の boilerplate 増加。ここは Modrinth API との境界層で
//   呼び出し側が具体型 (ModrinthProject / ModrinthVersion 等) を明示するのが
//   正しい使い方なので、default = unknown で unsafe な暗黙 any を防ぐ。
export async function fetchModrinth<T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {},
  options: { noCache?: boolean; signal?: AbortSignal; method?: string; body?: unknown } = {}
): Promise<T> {
  const method = options.method || 'GET';
  const cacheKey =
    `${endpoint}?${stableStringify(params)}${method}${stableStringify(options.body || {})}`;

  if (!options.noCache) {
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached as T;
  }

  const searchParams = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      searchParams.append(
        key,
        typeof params[key] === 'object' ? JSON.stringify(params[key]) : String(params[key])
      );
    }
  });

  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const proxyUrl = `/api/modrinth${endpoint}${queryString}`;
  const directUrl = `${DIRECT_MODRINTH_BASE}${endpoint}${queryString}`;

  // 注意: User-Agent は forbidden header なのでブラウザ fetch では設定不可
  // (サーバプロキシ側の Hono で改めて付与する)
  const reqInit: RequestInit = {
    method,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    signal: options.signal,
    ...(options.body
      ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) }
      : {})
  };

  // --- 429 対応付きリトライループ (プロキシと直接を順に試す) ---
  let response: Response | null = null;
  let lastErrorMsg = '';

  for (let attempt = 0; attempt <= MAX_RETRY_ON_429; attempt++) {
    // 1) プロキシ経由
    let usedDirect = false;
    let res: Response | null = null;
    try {
      res = await fetch(proxyUrl, reqInit);
    } catch (e: unknown) {
      // TS 4.4+ の catch は default unknown。AbortError は再 throw、
      // それ以外は message を extract して lastErrorMsg に記録。
      const err = e as { name?: string; message?: string } | null;
      if (err?.name === 'AbortError') throw e;
      lastErrorMsg = `Proxy fetch failed: ${err?.message || String(e)}`;
    }

    // 2) プロキシが 5xx/JSONでない を返した場合、直接 Modrinth へフォールバック
    if (!res?.ok || !(res.headers.get('content-type') || '').includes('application/json')) {
      if (res) lastErrorMsg = `Proxy HTTP ${res.status} ${res.statusText}`;
      try {
        res = await fetch(directUrl, reqInit);
        usedDirect = true;
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string } | null;
        if (err?.name === 'AbortError') throw e;
        lastErrorMsg = `Direct fetch failed: ${err?.message || String(e)}`;
        res = null;
      }
    }

    if (!res) {
      // ネットワーク完全失敗: リトライしても意味が薄いので break
      break;
    }

    // 3) 429 Too Many Requests → Retry-After 尊重で待機・再試行
    if (res.status === 429 && attempt < MAX_RETRY_ON_429) {
      const retryAfterMs =
        parseRetryAfterMs(res.headers.get('Retry-After')) ??
        DEFAULT_RETRY_AFTER_MS * 2 ** attempt; // fallback: 指数バックオフ
      console.warn(
        `[DropMod] Modrinth rate-limited (429). Waiting ${retryAfterMs}ms before retry ${
          attempt + 1
        }/${MAX_RETRY_ON_429}. Endpoint: ${endpoint}${usedDirect ? ' (direct)' : ' (proxy)'}`
      );
      await sleep(retryAfterMs);
      continue; // 次の attempt へ
    }

    // 4) 成功
    if (res.ok) {
      response = res;
      break;
    }

    // 5) その他エラー (4xx/5xx で 429 以外)
    lastErrorMsg = `Modrinth returned HTTP ${res.status} ${res.statusText}${
      usedDirect ? ' (direct)' : ' (proxy)'
    }`;
    break;
  }

  if (!response) {
    // ここに到達する時点で lastErrorMsg は必ず設定済み (全失敗経路で代入される)
    console.warn('[DropMod] fetchModrinth error:', lastErrorMsg);
    throw new Error(`Failed to fetch from Modrinth: ${lastErrorMsg}`);
  }

  const data = await response.json();
  if (!options.noCache) {
    cacheSet(cacheKey, data);
  }
  return data as T;
}

// ==========================================================================
// 高レベル API
// ==========================================================================
export async function fetchStableModVersion(
  projectId: string,
  profile: { loader: string; mcVersion: string },
  options?: { skipLoader?: boolean }
): Promise<{ targetVersion: ModrinthVersion; allVersions: ModrinthVersion[] } | null> {
  let versions: ModrinthVersion[] = [];
  const versionQuery: Record<string, unknown> = {
    game_versions: [profile.mcVersion]
  };
  // Resource Pack / Shader は loader facet を持たない。付けると 0 件になりやすい。
  if (!options?.skipLoader && profile.loader) {
    versionQuery.loaders = [profile.loader.toLowerCase()];
  }
  try {
    versions = await fetchModrinth<ModrinthVersion[]>(
      `/project/${projectId}/version`,
      versionQuery
    );
  } catch {
    // 絞り込み検索は失敗しても続行 (下でフォールバック) — catch binding 省略
  }

  if (!versions || versions.length === 0) {
    try {
      versions = await fetchModrinth<ModrinthVersion[]>(`/project/${projectId}/version`);
    } catch {
      // 完全失敗 — catch binding 省略
    }
  }

  if (!versions || versions.length === 0) return null;

  // versions[0] は T | undefined
  // versions[0] は直上の length チェックで必ず存在する
  // biome-ignore lint/style/noNonNullAssertion: versions.length > 0 を確認済みのため必ず存在
  const stableVersion = (versions.find((v) => v.version_type === 'release') || versions[0])!;
  return { targetVersion: stableVersion, allVersions: versions };
}

export async function fetchLatestMinecraftVersions(): Promise<string[]> {
  try {
    const data = await fetchModrinth<Array<{ version: string; version_type: string }>>(
      '/tag/game_version'
    );
    if (Array.isArray(data)) {
      const releaseVersions = data
        .filter((v) => v.version_type === 'release')
        .map((v) => v.version);
      if (releaseVersions.length > 0) {
        return releaseVersions;
      }
    }
  } catch {
    // ネットワーク不通時のフォールバックとして固定リスト — catch binding 省略
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

// -----------------------------------------------------------------------------
// Modrinth batch endpoint (/versions?ids=[]、/projects?ids=[]、
// /version_files POST) は 1000 個までのリクエスト上限がある。
// 500+ Mod の大規模 ModPack で 400 Bad Request になるのを防ぐため、
// chunkedBatchFetch で 100 個ずつ分割リクエストする共通ヘルパを提供。
// -----------------------------------------------------------------------------

const DEFAULT_BATCH_SIZE = 100;

/**
 * GET /versions?ids=[...] や GET /projects?ids=[...] を chunk 分割で呼ぶ。
 * 各 batch のレスポンス配列を連結して返す。
 *
 * @param endpoint '/versions' or '/projects'
 * @param ids       全 ID 配列 (100 個ずつに分割される)
 * @param batchSize デフォルト 100
 */
export async function fetchModrinthBatch<T = unknown>(
  endpoint: '/versions' | '/projects',
  ids: string[],
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<T[]> {
  if (!ids || ids.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const batch = await fetchModrinth<T[]>(endpoint, {
      ids: JSON.stringify(chunk)
    });
    if (Array.isArray(batch)) results.push(...batch);
  }
  return results;
}

/**
 * POST /version_files (SHA1 ハッシュ照合) を chunk 分割で呼ぶ。
 * 各 batch の Record<sha1, ver> を merge して返す。
 */
export async function fetchModrinthVersionFilesBatch<T = unknown>(
  hashes: string[],
  algorithm: 'sha1' | 'sha512' = 'sha1',
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<Record<string, T>> {
  if (!hashes || hashes.length === 0) return {};
  const merged: Record<string, T> = {};
  for (let i = 0; i < hashes.length; i += batchSize) {
    const chunk = hashes.slice(i, i + batchSize);
    const batch = await fetchModrinth<Record<string, T>>(
      '/version_files',
      {},
      {
        method: 'POST',
        body: { hashes: chunk, algorithm },
        noCache: true
      }
    );
    if (batch && typeof batch === 'object') {
      Object.assign(merged, batch);
    }
  }
  return merged;
}

// 未使用インポート除去のため型を再エクスポート (呼び出し側の互換性維持)
export type { ModrinthVersion, ModrinthProject };
