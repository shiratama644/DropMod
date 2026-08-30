// ============================================================================
// /settings ページ
//
// プロファイル管理 (追加・切替・削除)、テーマ切替、ZIPインポート/エクスポート、
// データ初期化を提供する Client Component。
// ============================================================================

import { SettingsPageClient } from '@/features/settings';

export const metadata = {
  // // ルートレイアウトの title.template = '%s | DropMod' が自動付与されるため
  // ここに ' - DropMod' を含めるとサイト名が二重になる
  // (規約は lib/platform/project-detail.ts のコメント参照)
  title: '設定',
  description:
    'プロファイル管理・テーマ変更・ZIPインポート/エクスポート・データ初期化などの設定ページ'
};

export default function SettingsPage() {
  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <SettingsPageClient />
    </main>
  );
}
