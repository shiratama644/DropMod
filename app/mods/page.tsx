// ============================================================================
// /mods ページ (Phase 5)
//
// プロファイル依存の Client Component。SSR ではプロファイル情報 (LocalStorage
// 由来) を持てないため、ページ本体は Client でレンダーする。
// ============================================================================

import { ModsPageClient } from '@/components/ModsPageClient';

export const metadata = {
  title: '選択中のMod - DropMod',
  description: '選択中プロファイルのMod一覧、バージョン変更、ZIP出力、依存チェックを行うページ'
};

export default function ModsPage() {
  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <ModsPageClient />
    </main>
  );
}
