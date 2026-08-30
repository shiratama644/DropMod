// /discover/<複数> 一覧からの soft nav で /discover/<複数>/<slug> を Intercept し、
// モーダルとして重ねる（一覧は破棄されず状態保持）。

import { ModDetailModalShell } from '@/features/project';
import { fetchProjectDetailData } from '@/features/project/api/projectDetail';

interface Params {
  params: Promise<{ type: string; slug: string }>;
}

export default async function InterceptedDiscoverModalPage({ params }: Params) {
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
