// ============================================================================
// /modpack ページ (Phase 12-C / PHASE12_PLAN.md §10.6)
//
// Modpack 管理ハブ。
//
// ## Modpack はカテゴリではなく「Profile の Source」
//
// Modpack を導入すると中身は `mods/` `resourcepacks/` `shaderpacks/` に分散する。
// したがってここは「Modpack 一覧」ではなく、**この Profile がどの Modpack から
// 作られたか**と、その更新状況・紐付け解除 (D-6) を扱う場所。
//
// Phase 12 以前は `ReservedCategoryPage` (予約ページ) だった。
// ============================================================================

import type { Metadata } from 'next';
import { ModpackHubClient } from '@/features/modpack/components/ModpackHubClient';

export const metadata: Metadata = {
  // ルートレイアウトの template が '%s | DropMod' なので、
  // ここで ' - DropMod' を付けると「Modpacks - DropMod | DropMod」と二重になる。
  // (`app/resourcepack/page.tsx` と同じ書き方)
  title: 'Modpacks',
  description:
    '導入済み Modpack の確認・更新チェック・紐付け解除。Modrinth .mrpack からインポートしたプロファイルを管理します。'
};

export default function ModpackPage() {
  return (
    <main className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <header className="mb-4">
        <h1 className="theme-text-primary text-xl sm:text-2xl font-bold flex items-center gap-2.5">
          <i className="fa-solid fa-boxes-stacked theme-text-primary" />
          Modpacks
        </h1>
        <p className="theme-text-secondary text-sm mt-1.5">
          このプロファイルの導入元 Modpack と更新状況を確認します。
        </p>
      </header>

      <ModpackHubClient />
    </main>
  );
}
