// -----------------------------------------------------------------------------
// Intercepting Route: /mods/[slug] を /mods (一覧) 上に「モーダル」として重ねる
//                     (Phase 9-F: URL 再設計)
//
// `(.)` は同じセグメント階層 (/mods) からのインターセプトを意味する。
//   - /mods (一覧) で <Link href="/mods/sodium"> や router.push('/mods/sodium')
//     が発火すると、このモジュールが /mods の @modal slot に描画される
//     (URL は /mods/sodium に変わるが、視覚的にはモーダル)
//   - 直接 /mods/sodium を開いた場合、@modal slot は非マッチとなり
//     通常の `app/mods/[slug]/page.tsx` (フルページ) が描画される
//   - 他ページ (/, /profile, /settings) からのソフトナビは /mods layout
//     の外なので Parallel Route が発火せず、通常フルページ遷移になる
//
// Server Component として project / versions を並列 fetch、Client 側の
// `<ModDetailModalShell variant="modal">` に流し込む。
// -----------------------------------------------------------------------------

import {
  fetchModrinthProject,
  fetchModrinthProjectAuthor,
  fetchModrinthProjectVersions
} from '@/lib/modrinth/server';
import { ModDetailModalShell } from '@/components/ModDetailModalShell';

// モーダル側も 1 時間 ISR (フルページと同一 TTL)
export const revalidate = 3600;

interface Params {
  params: Promise<{ slug: string }>;
}

export default async function InterceptedModsModalPage({ params }: Params) {
  const { slug } = await params;

  const [project, versions, author] = await Promise.all([
    fetchModrinthProject(slug).catch((e) => {
      console.warn('[DropMod] intercepted /mods modal project fetch failed:', e);
      return null;
    }),
    fetchModrinthProjectVersions(slug).catch((e) => {
      console.warn('[DropMod] intercepted /mods modal versions fetch failed:', e);
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
