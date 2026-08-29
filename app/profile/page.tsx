// ============================================================================
// /profile ページ (Phase 9-F: URL 再設計で /mods から改名)
//
// 選択中プロファイルの Mod 一覧、バージョン変更、ZIP 出力、依存チェックを行う。
// プロファイル依存の Client Component。SSR ではプロファイル情報 (LocalStorage
// 由来) を持てないため、ページ本体は Client でレンダーする。
//
// URL 変更経緯:
//   - Phase 9-F 以前: /mods (このパスに配置)
//   - Phase 9-F 以降: /profile (Modrinth 検索結果一覧を /mods に譲るため)
//   - 旧 /mods は 301 redirect で /profile に飛ばす (SEO 保全)
// ============================================================================

import { ModsPageClient } from '@/components/ModsPageClient';

export const metadata = {
  // // ルートレイアウトの title.template = '%s | DropMod' が自動付与されるため
  // ここに ' - DropMod' を含めるとサイト名が二重になる
  // (規約は lib/server/project-detail.ts のコメント参照)
  title: '選択中のMod',
  description:
    '選択中プロファイルのMod一覧、バージョン変更、ZIP出力、依存チェックを行うページ'
};

export default function ProfilePage() {
  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <ModsPageClient />
    </main>
  );
}
