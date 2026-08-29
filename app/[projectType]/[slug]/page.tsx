// -----------------------------------------------------------------------------
// /<projectType>/<slug>  —  プロジェクト詳細フルページ (RSC + ISR + OGP)
//
// ルーティング再設計: 型別 URL（例: /mod/sodium, /shader/complementary-reimagined）。
// projectType は {mod, modpack, resourcepack, shader} のいずれか。それ以外は 404。
// Modrinth 公式 URL (modrinth.com/<型>/<slug>) と一致。
//
// 直接アクセス・共有 URL・「詳細ページ」ボタン・プロファイル/LP カードから遷移。
// モーダル (/discover/<複数>/<slug>) とは別 URL で独立したフル詳細 View。
// -----------------------------------------------------------------------------

import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/JsonLd';
import { ModDetailPageView } from '@/components/ModDetailPageView';
import {
  buildBreadcrumbListJsonLd,
  buildSoftwareApplicationJsonLd,
  detailBreadcrumbItems
} from '@/lib/seo/jsonld';
import {
  buildDetailMetadata,
  fetchProjectDetailData,
  generateDetailStaticParams
} from '@/lib/server/project-detail';
import { resolveSiteOrigin } from '@/lib/server/site-url';
import {
  PROJECT_TYPES,
  parseDetailType,
  type ProjectType
} from '@/lib/constants/search';

// セグメント設定は静的解析可能なリテラルでなければならない（import した定数は不可）。
export const revalidate = 3600; // 1時間 ISR
export const dynamicParams = true;

// 全型の人気上位を事前生成（Vercel Edge Cache に即載る）
export async function generateStaticParams(): Promise<
  Array<{ projectType: string; slug: string }>
> {
  const all = await Promise.all(PROJECT_TYPES.map((t) => generateDetailStaticParams(t)));
  const params: Array<{ projectType: string; slug: string }> = [];
  PROJECT_TYPES.forEach((t, i) => {
    for (const p of all[i] ?? []) {
      params.push({ projectType: t, slug: p.slug });
    }
  });
  return params;
}

interface Params {
  params: Promise<{ projectType: string; slug: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { projectType, slug } = await params;
  const type = parseDetailType(projectType);
  if (!type) return { title: 'Mod 詳細' };
  return buildDetailMetadata(type, slug);
}

export default async function ProjectDetailRoutePage({ params }: Params) {
  const { projectType, slug } = await params;
  const type = parseDetailType(projectType) as ProjectType | null;
  if (!type) notFound();

  const { project, versions, author } = await fetchProjectDetailData(slug);
  if (!project) notFound();

  const withAuthor = { ...project, author: author ?? project.author };
  const origin = resolveSiteOrigin();

  return (
    <>
      <JsonLd data={buildSoftwareApplicationJsonLd(origin, type, withAuthor)} />
      <JsonLd
        data={buildBreadcrumbListJsonLd(
          origin,
          detailBreadcrumbItems(type, slug, withAuthor.title)
        )}
      />
      <ModDetailPageView project={withAuthor} versions={versions} slug={slug} />
    </>
  );
}
