// /discover/* からのソフトナビで /mods/[slug] をモーダル表示する。

import {
  fetchModrinthProject,
  fetchModrinthProjectAuthor,
  fetchModrinthProjectVersions
} from '@/lib/modrinth/server';
import { ModDetailModalShell } from '@/components/ModDetailModalShell';

export const revalidate = 3600;

interface Params {
  params: Promise<{ slug: string }>;
}

export default async function InterceptedDiscoverModalPage({ params }: Params) {
  const { slug } = await params;

  const [project, versions, author] = await Promise.all([
    fetchModrinthProject(slug).catch((e) => {
      console.warn('[DropMod] intercepted /discover modal project fetch failed:', e);
      return null;
    }),
    fetchModrinthProjectVersions(slug).catch((e) => {
      console.warn('[DropMod] intercepted /discover modal versions fetch failed:', e);
      return [];
    }),
    fetchModrinthProjectAuthor(slug).catch(() => null)
  ]);

  return (
    <ModDetailModalShell
      project={project ? { ...project, author: author ?? project.author } : null}
      versions={versions}
      variant="modal"
      slug={slug}
    />
  );
}
