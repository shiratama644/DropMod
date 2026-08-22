// -----------------------------------------------------------------------------
// /mod/[slug] フルページ (RSC + ISR + SEO/OGP)
//
// - Home からのソフトナビは (.)mod/[slug] にインターセプトされモーダル化される
// - 直接アクセス / 共有 URL の場合はこのフルページが SSR/ISR で描画される
// - `generateStaticParams` で人気 100 件を事前生成 (Modrinth の 300 req/min
//   レート制限に配慮して 100 件に抑制)
// - `generateMetadata` で og:title / og:image / description を出力 (SEO)
// -----------------------------------------------------------------------------

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  fetchModrinthProject,
  fetchModrinthProjectVersions,
  fetchModrinthSearch
} from '@/lib/modrinth/server';
import { ModDetailModalShell } from '@/components/ModDetailModalShell';

export const revalidate = 3600;
export const dynamicParams = true;

// 事前生成する人気 Mod の件数 (Modrinth のレート制限に配慮して 100 件)
const PREBUILD_LIMIT = 100;

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  try {
    const result = await fetchModrinthSearch({
      query: '',
      category: 'All',
      sortBy: 'popular',
      offset: 0,
      limit: PREBUILD_LIMIT
    });
    return result.hits
      .map((h) => h.slug || h.project_id)
      .filter((s): s is string => Boolean(s))
      .map((slug) => ({ slug }));
  } catch (e) {
    // ビルド時にレート制限や外部通信不可でも build 全体が落ちないよう
    // 空配列を返す (dynamicParams=true なので実行時に生成される)
    console.warn('[DropMod] generateStaticParams failed, falling back to []:', e);
    return [];
  }
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const canonicalPath = `/mod/${slug}`;
  try {
    const project = await fetchModrinthProject(slug);
    // H4-2 修正: layout.tsx の title.template = '%s | DropMod' が自動で ' | DropMod' を
    // 付与するため、ここでは Mod タイトルのみを返す (以前は '- DropMod' も付けて重複していた)。
    // openGraph.title / twitter.title は template が効かないため明示的に " | DropMod" 付き。
    const shortTitle = project.title;
    const fullTitle = `${project.title} | DropMod`;
    const description =
      project.description ||
      `${project.title} の詳細情報。Modrinth から取得したメタデータ・ダウンロード・スクリーンショット。`;
    return {
      title: shortTitle,
      description,
      alternates: { canonical: canonicalPath },
      openGraph: {
        title: fullTitle,
        description,
        type: 'article',
        url: canonicalPath,
        images: project.icon_url ? [{ url: project.icon_url }] : undefined
      },
      twitter: {
        card: 'summary',
        title: fullTitle,
        description,
        images: project.icon_url ? [project.icon_url] : undefined
      }
    };
  } catch (e) {
    // build 全体を落とさないよう try/catch でフォールバック
    console.warn('[DropMod] generateMetadata failed for', slug, e);
    return {
      title: slug,
      description: 'Modrinth Mod 詳細',
      alternates: { canonical: canonicalPath }
    };
  }
}

export default async function ModDetailPage({ params }: Params) {
  const { slug } = await params;

  const [project, versions] = await Promise.all([
    fetchModrinthProject(slug).catch(() => null),
    fetchModrinthProjectVersions(slug).catch(() => [])
  ]);

  if (!project) notFound();

  return (
    <ModDetailModalShell
      project={project}
      versions={versions}
      variant="page"
      slug={slug}
    />
  );
}
