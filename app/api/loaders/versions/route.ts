import {
  type LoaderId,
  forgeVersionsForMc,
  getLoaderVersions,
  isLoaderId,
  mergeVersionLists,
  neoforgeVersionsForMc,
  parseFabricOrQuiltLoaders,
  parseMavenVersions
} from '@/lib/loaders/versions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 2026-08-27 セキュリティ強化: CORS + レート制限
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'same-origin',
  'Vary': 'Origin',
  'X-Content-Type-Options': 'nosniff'
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60; // loader versions は頻繁に変わらない → 60 req/min
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (rateLimitMap.size > 1000) {
      for (const [key, val] of rateLimitMap) {
        if (val.resetAt < now) rateLimitMap.delete(key);
      }
    }
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

const USER_AGENT =
  process.env.MODRINTH_USER_AGENT ||
  'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';

const UPSTREAM: Record<LoaderId, string> = {
  Fabric: 'https://meta.fabricmc.net/v2/versions/loader',
  Quilt: 'https://meta.quiltmc.org/v3/versions/loader',
  Forge: 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
  NeoForge: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
};

async function fetchText(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      signal: AbortSignal.timeout(10_000),
      cache: 'force-cache'
    });
  if (!res.ok) {
    throw new Error(`upstream ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function liveVersions(loader: LoaderId, mcVersion: string): Promise<string[]> {
  const body = await fetchText(UPSTREAM[loader]);
  if (loader === 'Fabric' || loader === 'Quilt') {
    let parsed: unknown = body;
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      parsed = [];
    }
    return mergeVersionLists(parseFabricOrQuiltLoaders(parsed));
  }
  const maven = parseMavenVersions(body);
  if (loader === 'Forge') return forgeVersionsForMc(maven, mcVersion);
  return neoforgeVersionsForMc(maven, mcVersion);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const loaderRaw = url.searchParams.get('loader') ?? '';
  const mcVersion = url.searchParams.get('mc') ?? '';
  if (!isLoaderId(loaderRaw)) {
    return Response.json({ error: 'Unknown loader' }, { status: 400, headers: CORS_HEADERS });
  }

  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp)) {
    return Response.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: { ...CORS_HEADERS, 'Retry-After': '60' }
      }
    );
  }

  const fallback = getLoaderVersions(loaderRaw);
  try {
    const live = await liveVersions(loaderRaw, mcVersion);
    const versions = mergeVersionLists(live, fallback);
    return Response.json(
      { loader: loaderRaw, versions, source: live.length > 0 ? 'live' : 'fallback' },
      {
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
        }
      }
    );
  } catch (err) {
    console.warn('[DropMod] loader versions fallback:', loaderRaw, err);
    return Response.json(
      { loader: loaderRaw, versions: fallback, source: 'fallback' },
      { headers: CORS_HEADERS }
    );
  }
}
