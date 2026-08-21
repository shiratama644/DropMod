// -----------------------------------------------------------------------------
// Intercepting Route: /mod/[slug] を Home 上に「モーダル」として重ねる
//
// `(.)` は同じセグメント階層 (root) からのインターセプトを意味する。
//   - Home で <Link href="/mod/xyz"> や router.push('/mod/xyz') が発火すると
//     このモジュールが Home の @modal slot に描画される (URL は /mod/xyz)
//   - 直接 /mod/xyz を開いた場合は @modal slot が非マッチとなり、通常の
//     `app/mod/[slug]/page.tsx` (フルページ) が描画される
//
// Server Component として project / versions を並列 fetch、Client 側の
// `<ModDetailModalShell variant="modal">` に流し込む。
// -----------------------------------------------------------------------------

import { fetchModrinthProject, fetchModrinthProjectVersions } from '@/lib/modrinth/server';
import { ModDetailModalShell } from '@/components/ModDetailModalShell';

// モーダル側も 1 時間 ISR (フルページと同一 TTL)
export const revalidate = 3600;

interface Params {
  params: Promise<{ slug: string }>;
}

export default async function InterceptedModModalPage({ params }: Params) {
  const { slug } = await params;

  const [project, versions] = await Promise.all([
    fetchModrinthProject(slug).catch((e) => {
      console.warn('[DropMod] intercepted modal project fetch failed:', e);
      return null;
    }),
    fetchModrinthProjectVersions(slug).catch((e) => {
      console.warn('[DropMod] intercepted modal versions fetch failed:', e);
      return [];
    })
  ]);

  return (
    <ModDetailModalShell
      project={project}
      versions={versions}
      variant="modal"
      slug={slug}
    />
  );
}
