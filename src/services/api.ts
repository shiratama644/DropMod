import { ModrinthVersion, ModrinthProject } from '../types';

const apiCache = new Map<string, any>();
const DIRECT_MODRINTH_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'CraftForge/1.1.0 (https://github.com/craftforge/craftforge-mod-manager)';

export async function fetchModrinth<T = any>(
  endpoint: string,
  params: Record<string, any> = {},
  options: { noCache?: boolean; signal?: AbortSignal; method?: string; body?: any } = {}
): Promise<T> {
  const cacheKey =
    endpoint +
    '?' +
    JSON.stringify(params) +
    (options.method || 'GET') +
    JSON.stringify(options.body || {});
  if (!options.noCache && apiCache.has(cacheKey)) {
    return apiCache.get(cacheKey);
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

  let response: Response | null = null;
  let errorMsg = '';

  const reqInit: RequestInit = {
    method: options.method || 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    signal: options.signal,
    ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {})
  };

  try {
    const res = await fetch(proxyUrl, reqInit);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      response = res;
    } else {
      errorMsg = `Proxy returned HTTP ${res.status} (${contentType})`;
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    errorMsg = e.message;
  }

  if (!response) {
    try {
      const directRes = await fetch(directUrl, reqInit);
      if (directRes.ok) {
        response = directRes;
      } else {
        throw new Error(`Direct API returned HTTP ${directRes.status} ${directRes.statusText}`);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      throw new Error(`Failed to fetch from Modrinth: ${e.message}`);
    }
  }

  const data = await response.json();
  if (!options.noCache) {
    apiCache.set(cacheKey, data);
  }
  return data as T;
}

export async function fetchStableModVersion(
  projectId: string,
  profile: { loader: string; mcVersion: string }
): Promise<{ targetVersion: ModrinthVersion; allVersions: ModrinthVersion[] } | null> {
  let versions: ModrinthVersion[] = [];
  try {
    versions = await fetchModrinth<ModrinthVersion[]>(`/project/${projectId}/version`, {
      loaders: [profile.loader.toLowerCase()],
      game_versions: [profile.mcVersion]
    });
  } catch (e) {}

  if (!versions || versions.length === 0) {
    try {
      versions = await fetchModrinth<ModrinthVersion[]>(`/project/${projectId}/version`);
    } catch (e) {}
  }

  if (!versions || versions.length === 0) return null;

  const stableVersion = versions.find((v) => v.version_type === 'release') || versions[0];
  return { targetVersion: stableVersion, allVersions: versions };
}

export async function fetchLatestMinecraftVersions(): Promise<string[]> {
  try {
    const data = await fetchModrinth<Array<{ version: string; version_type: string }>>('/tag/game_version');
    if (Array.isArray(data)) {
      const releaseVersions = data
        .filter((v) => v.version_type === 'release')
        .map((v) => v.version);
      if (releaseVersions.length > 0) {
        return releaseVersions;
      }
    }
  } catch (e) {}
  return [
    '1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1',
    '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2'
  ];
}