// -----------------------------------------------------------------------------
// robots.ts (App Router 標準)
//
// SEO の基本設定。
//
// - 全ページのクロールを許可
// - /api/* だけは crawler に不要 (JSON エンドポイント) なので disallow
// - sitemap.xml の場所を明示
// -----------------------------------------------------------------------------

import { logger } from '@/lib/server/logger';
import type { MetadataRoute } from 'next';

function resolveBaseUrl(): string {
  // new URL() で protocol 付き検証 → origin 取得。
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      logger.warn('NEXT_PUBLIC_SITE_URL が不正な URL:', explicit);
    }
  }
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
