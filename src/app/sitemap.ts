import type { MetadataRoute } from 'next';
import { logger } from '@/lib/platform/logger';
import { popularDetailSitemapEntries, staticSitemapEntries } from '@/features/seo';
import { resolveSiteOrigin } from '@/lib/platform/siteUrl';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolveSiteOrigin();
  const now = new Date();
  const staticEntries = staticSitemapEntries(baseUrl, now);

  try {
    const detailEntries = await popularDetailSitemapEntries(baseUrl, now);
    return [...staticEntries, ...detailEntries];
  } catch (e) {
    logger.warn('sitemap: Modrinth 取得失敗、静的ルートのみ出力:', e);
    return staticEntries;
  }
}
