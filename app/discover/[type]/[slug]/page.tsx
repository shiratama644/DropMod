// /discover/<複数>/<slug> 直接アクセス時のプレビューモーダル（単体描画）。
// soft nav 時は @modal/(.)[slug] が Intercept するのでこちらは直接 URL/共有/リロード時のみ。

import { ModDetailModalShell } from '@/components/ModDetailModalShell';
import {
  buildDiscoverModalMetadata,
  fetchProjectDetailData
} from '@/lib/server/project-detail';

interface Params {
  params: Promise<{ type: string; slug: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { type, slug } = await params;
  return buildDiscoverModalMetadata(type, slug);
}

export default async function DiscoverModalDirectPage({ params }: Params) {
  const { slug } = await params;
  const { project, versions, author } = await fetchProjectDetailData(slug);
  return (
    <ModDetailModalShell
      project={project ? { ...project, author: author ?? project.author } : null}
      versions={versions}
      variant="modal"
      slug={slug}
    />
  );
}
