import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/AppShell';
import './globals.css';

// FontAwesome アイコンをグローバル読み込み (Vite 版と同一)
import '@fortawesome/fontawesome-free/css/all.min.css';

// Inter フォント
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';

// JetBrains Mono フォント
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';

export const metadata: Metadata = {
  title: 'DropMod - Minecraft Mod Downloader',
  description:
    'Modrinth から Minecraft の Mod を検索・ダウンロード・プロファイル管理できる Web アプリ',
  applicationName: 'DropMod'
};

// WCAG 2.1 SC 1.4.4 準拠のためピンチズーム許可 (Vite 版と同じ扱い)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

/**
 * Root Layout (Phase 4 版)
 *
 * AppShell (Client Component) が Toast/Confirm/theme を管理し、
 * その内側で children (各ページ) を描画する。
 *
 * Phase 4 で `@modal` Parallel Route slot を追加:
 *   - `/mod/[slug]` を Home からクリック時 → `@modal/(.)mod/[slug]` に
 *     インターセプトされ、Home ページの上にモーダルとして重ねて描画
 *   - 直接 URL アクセス時 → 通常の `/mod/[slug]/page.tsx` がフルページ描画
 *   - `@modal/default.tsx` = 何もない状態、`@modal/[...catchAll]/page.tsx`
 *     = 他ページに遷移した際にモーダルを閉じる (両方必須)
 */
export default function RootLayout({
  children,
  modal
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen flex flex-col pb-28 md:pb-24 antialiased selection:bg-emerald-500 selection:text-white">
        <AppShell>
          {children}
          {modal}
        </AppShell>
      </body>
    </html>
  );
}
