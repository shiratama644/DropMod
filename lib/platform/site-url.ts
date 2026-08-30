import { logger } from '@/lib/platform/logger';

/**
 * sitemap / JSON-LD / OGP で使うサイト origin。
 * layout.tsx の metadataBase と同じ優先順位。
 */
export function resolveSiteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    try {
      return new URL(explicit.replace(/\/$/, '')).origin;
    } catch {
      logger.warn('NEXT_PUBLIC_SITE_URL が不正な URL:', explicit);
    }
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return 'http://localhost:3000';
}
