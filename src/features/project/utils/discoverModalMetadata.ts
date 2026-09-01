import type { Metadata } from 'next';
import { detailPathForType, parseDiscoverSegment } from '@/lib/constants/search';

/**
 * プレビューモーダル直接 URL (`/discover/<複数>/<slug>`) の metadata。
 * SEO-2 / PHASE13_PLAN.md: 詳細を正として index せず、canonical だけ詳細へ向ける。
 */
export function buildDiscoverModalMetadata(typeSegment: string, slug: string): Metadata {
  const projectType = parseDiscoverSegment(typeSegment);
  const metadata: Metadata = {
    robots: { index: false, follow: true }
  };
  if (projectType) {
    metadata.alternates = { canonical: detailPathForType(projectType, slug) };
  }
  return metadata;
}
