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
import { API_CORS_HEADERS, checkRateLimit, getClientIp } from '@/lib/server/rate-limit';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// loader versions は頻繁に変わらない → 60 req/min。
// APP_PROFILE=development ではレート制限が無効化される (lib/server/rate-limit.ts 参照)。
const RATE_LIMIT_MAX = 60;

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
    return Response.json({ error: 'Unknown loader' }, { status: 400, headers: API_CORS_HEADERS });
  }

  const clientIp = getClientIp(req);
  if (!checkRateLimit('loaders', clientIp, RATE_LIMIT_MAX).allowed) {
    return Response.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: { ...API_CORS_HEADERS, 'Retry-After': '60' }
      }
    );
  }

  const fallback = getLoaderVersions(loaderRaw);
  try {
    const live = await liveVersions(loaderRaw, mcVersion);
    const versions = mergeVersionLists(live, fallback);
    logger.debug('loader versions:', loaderRaw, `live=${live.length} fallback=${fallback.length}`);
    return Response.json(
      { loader: loaderRaw, versions, source: live.length > 0 ? 'live' : 'fallback' },
      {
        headers: {
          ...API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
        }
      }
    );
  } catch (err) {
    logger.warn('loader versions fallback:', loaderRaw, err);
    return Response.json(
      { loader: loaderRaw, versions: fallback, source: 'fallback' },
      { headers: API_CORS_HEADERS }
    );
  }
}
