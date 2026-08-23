// -----------------------------------------------------------------------------
// sitemap.ts (App Router 標準の動的 sitemap)
//
// SEO スコア 100 と検索エンジン発見性のため追加。
//
// - 静的ルート (/, /mods, /profile, /settings) を必ず出力 (Phase 9-F: URL 再設計)
// - 人気 Mod 100 件の /mods/[slug] を動的に追加 (build/ISR 時に生成)
// - Modrinth が到達不可の場合は静的ルートのみを返す (build 失敗を回避)
//
// baseUrl の解決は layout.tsx の metadataBase と同じロジックを使う。
// -----------------------------------------------------------------------------

import type { MetadataRoute } from 'next';
import { fetchModrinthSearch } from '@/lib/modrinth/server';

const PREBUILD_LIMIT = 100;

function resolveBaseUrl(): string {
  // new URL() で protocol 付き検証 → origin 取得。
  // 以前は文字列 concat のみで NEXT_PUBLIC_SITE_URL=example.com (プロトコルなし) を
  // 設定すると sitemap の URL が壊れていた。
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      console.warn('[DropMod] NEXT_PUBLIC_SITE_URL が不正な URL:', explicit);
    }
  }
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
      changeFrequency: 'weekly',
      priority: 0.8
    },
    {
      url: `${baseUrl}/mods`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1.0
    },
    {
      url: `${baseUrl}/profile`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4
    },
    {
      url: `${baseUrl}/settings`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3
    },
    {
      url: `${baseUrl}/modpack`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5
    },
    {
      url: `${baseUrl}/resourcepack`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5
    },
    {
      url: `${baseUrl}/shader`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5
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
        // Phase 9-F: /mod/[slug] → /mods/[slug] (URL 再設計)
        url: `${baseUrl}/mods/${slug}`,
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
