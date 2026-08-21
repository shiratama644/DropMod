// -----------------------------------------------------------------------------
// sitemap.ts (App Router 標準の動的 sitemap)
//
// Phase 7: SEO スコア 100 と検索エンジン発見性のため追加。
//
// - 静的ルート (/, /mods, /settings) を必ず出力
// - 人気 Mod 100 件の /mod/[slug] を動的に追加 (build/ISR 時に生成)
// - Modrinth が到達不可の場合は静的ルートのみを返す (build 失敗を回避)
//
// baseUrl の解決は layout.tsx の metadataBase と同じロジックを使う。
// -----------------------------------------------------------------------------

import type { MetadataRoute } from 'next';
import { fetchModrinthSearch } from '@/lib/modrinth/server';

const PREBUILD_LIMIT = 100;

function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return 'http://localhost:3000';
}

// sitemap は 1 時間ごとに再生成 (人気 Mod ランキングの更新反映)
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolveBaseUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1.0
    },
    {
      url: `${baseUrl}/mods`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.6
    },
    {
      url: `${baseUrl}/settings`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3
    }
  ];

  try {
    const result = await fetchModrinthSearch({
      query: '',
      category: 'All',
      sortBy: 'popular',
      offset: 0,
      limit: PREBUILD_LIMIT
    });
    const modEntries: MetadataRoute.Sitemap = result.hits
      .map((h) => h.slug || h.project_id)
      .filter((s): s is string => Boolean(s))
      .map((slug) => ({
        url: `${baseUrl}/mod/${slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7
      }));
    return [...staticEntries, ...modEntries];
  } catch (e) {
    console.warn('[DropMod] sitemap: Modrinth 取得失敗、静的ルートのみ出力:', e);
    return staticEntries;
  }
}
