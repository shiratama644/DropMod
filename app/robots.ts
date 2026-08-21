// -----------------------------------------------------------------------------
// robots.ts (App Router 標準)
//
// Phase 7: SEO の基本設定。
//
// - 全ページのクロールを許可
// - /api/* だけは crawler に不要 (JSON エンドポイント) なので disallow
// - sitemap.xml の場所を明示
// -----------------------------------------------------------------------------

import type { MetadataRoute } from 'next';

function resolveBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return 'http://localhost:3000';
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolveBaseUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/']
      }
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl
  };
}
