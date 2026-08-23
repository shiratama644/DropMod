// ============================================================================
// /settings ページ
//
// プロファイル管理 (追加・切替・削除)、テーマ切替、ZIPインポート/エクスポート、
// データ初期化を提供する Client Component。
// ============================================================================

import { SettingsPageClient } from '@/components/SettingsPageClient';

export const metadata = {
  title: '設定 - DropMod',
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
