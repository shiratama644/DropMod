import { logger } from '@/lib/server/logger';
import { cookies } from 'next/headers';
import { fetchModrinthSearch } from '@/lib/modrinth/server';
import { SEARCH_LIMIT, type ProjectType } from '@/lib/constants/search';

const SSR_DEFAULT_MC_VERSION = '1.20.1';
const SSR_DEFAULT_LOADER = 'Fabric';

interface ActiveProfileCookie {
  mcVersion: string;
  loader: string;
}

function parseActiveProfileCookie(raw: string | undefined): ActiveProfileCookie | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const obj = JSON.parse(decoded);
    if (
      obj &&
      typeof obj === 'object' &&
      typeof obj.mcVersion === 'string' &&
      typeof obj.loader === 'string' &&
      obj.mcVersion.length < 32 &&
      obj.loader.length < 32
    ) {
      return { mcVersion: obj.mcVersion, loader: obj.loader };
    }
  } catch {
    /* 破損した cookie は無視 */
  }
  return null;
}

export async function loadDiscoverSearch(query: string, projectType: ProjectType) {
  const cookieStore = await cookies();
  const activeProfileCookie = cookieStore.get('dropmod_active_profile')?.value;
  const parsed = parseActiveProfileCookie(activeProfileCookie);

  const mcVersion = parsed?.mcVersion || SSR_DEFAULT_MC_VERSION;
  const loader = parsed?.loader || SSR_DEFAULT_LOADER;

  const searchResult = await fetchModrinthSearch({
    query,
    mcVersion,
    loader,
    category: 'All',
    sortBy: 'popular',
    offset: 0,
    limit: SEARCH_LIMIT,
    projectType
  }).catch((e) => {
    logger.warn('discover SSR search failed:', e);
    return { hits: [], total_hits: 0, offset: 0, limit: SEARCH_LIMIT };
  });

  return {
    hits: searchResult.hits,
    initialHasMore: searchResult.hits.length >= SEARCH_LIMIT
  };
}
