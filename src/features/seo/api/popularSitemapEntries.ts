import type { MetadataRoute } from 'next';
import { fetchModrinthSearch } from '@/lib/modrinth/server';
import { PROJECT_TYPES, detailPathFromProject, type ProjectType } from '@/lib/constants/search';
import { logger } from '@/lib/platform/logger';

/** 型あたりの人気件数。4 型 × 25 = 100 URL。build 時 4 search で 429 を避ける。 */
export const SITEMAP_PER_TYPE = 25;

function parseLastModified(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function popularDetailSitemapEntries(
  baseUrl: string,
  now: Date
): Promise<MetadataRoute.Sitemap> {
  const results = await Promise.all(
    PROJECT_TYPES.map(async (type: ProjectType) => {
      try {
        const result = await fetchModrinthSearch({
          query: '',
          category: 'All',
          sortBy: 'popular',
          offset: 0,
          limit: SITEMAP_PER_TYPE,
          projectType: type
        });
        return result.hits;
      } catch (e) {
        logger.warn(`sitemap: ${type} 取得失敗:`, e);
        return [];
      }
    })
  );

  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];
  for (const hits of results) {
    for (const h of hits) {
      const slug = h.slug || h.project_id;
      if (!slug) continue;
      const path = detailPathFromProject(h.project_type, slug);
      if (seen.has(path)) continue;
      seen.add(path);
      entries.push({
        url: `${baseUrl}${path}`,
        lastModified: parseLastModified(h.date_modified, now),
        changeFrequency: 'weekly',
        priority: 0.7
      });
    }
  }
  return entries;
}
