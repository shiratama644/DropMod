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
    return Response.json({ error: 'Unknown loader' }, { status: 400 });
  }

  const fallback = getLoaderVersions(loaderRaw);
  try {
    const live = await liveVersions(loaderRaw, mcVersion);
    const versions = mergeVersionLists(live, fallback);
    return Response.json(
      { loader: loaderRaw, versions, source: live.length > 0 ? 'live' : 'fallback' },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
        }
      }
    );
  } catch (err) {
    console.warn('[DropMod] loader versions fallback:', loaderRaw, err);
    return Response.json({ loader: loaderRaw, versions: fallback, source: 'fallback' });
  }
}
