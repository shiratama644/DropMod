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

// -----------------------------------------------------------------------------
// metadataBase の解決
//
// og:image などの相対 URL を絶対 URL に展開するため必須。優先順位:
//   1. NEXT_PUBLIC_SITE_URL (ユーザーが Vercel Environment Variables で
//      本番ドメインを設定した場合。例: https://dropmod.vercel.app)
//   2. VERCEL_URL (Vercel が自動注入。プレビューデプロイの一意 URL)
//   3. http://localhost:3000 (ローカル dev のフォールバック)
// -----------------------------------------------------------------------------
function resolveMetadataBase(): URL {
  // NEXT_PUBLIC_SITE_URL に末尾スラッシュがあると canonical URL 生成時に
  // '//' (二重スラッシュ) になる可能性があるため事前に除去。sitemap.ts / robots.ts の
  // resolveBaseUrl と同じ挙動に統一。
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    try {
      return new URL(explicit.replace(/\/$/, ''));
    } catch {
      /* fallthrough */
    }
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return new URL(`https://${vercelUrl}`);
  }
  return new URL('http://localhost:3000');
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: 'DropMod - Minecraft Mod Downloader',
    template: '%s | DropMod'
  },
  description:
    'Modrinth から Minecraft の Mod を検索・ダウンロード・プロファイル管理できる Web アプリ',
  applicationName: 'DropMod',
  openGraph: {
    type: 'website',
    siteName: 'DropMod',
    locale: 'ja_JP',
    title: 'DropMod - Minecraft Mod Downloader',
    description:
      'Modrinth から Minecraft の Mod を検索・ダウンロード・プロファイル管理できる Web アプリ'
  },
  twitter: {
    card: 'summary',
    title: 'DropMod - Minecraft Mod Downloader',
    description:
      'Modrinth から Minecraft の Mod を検索・ダウンロード・プロファイル管理できる Web アプリ'
  },
  // manifest.json (`app/manifest.ts`) と各種アイコンを明示的にリンク。
  //   - favicon.ico は `app/favicon.ico` から自動的に <link rel="icon"> として注入されるが、
  //     PWA / iOS Safari 用の追加サイズは metadata.icons で補う。
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }]
  }
};

// WCAG 2.1 SC 1.4.4 準拠のためピンチズーム許可 (Vite 版と同じ扱い)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

/**
 * Root Layout
 *
 * AppShell (Client Component) が Toast/Confirm/theme を管理し、
 * その内側で children (各ページ) を描画する。
 *
 * `@modal` Parallel Route slot の役割:
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
  // theme FOUC (SSR dark → hydration 後 light) を回避する inline script。
  // hydration 前に LocalStorage を読み取り、'light' が保存されていれば
  // <html> の dark クラスを外す。これで hydration 時にちらつきが起きない。
  // dangerouslySetInnerHTML は script タグ挿入の Next.js 推奨方法。
  const themeInitScript = `
try {
  var raw = localStorage.getItem('dropmod_state_v2') || localStorage.getItem('craftforge_state_v2');
  if (raw) {
    var s = JSON.parse(raw);
    if (s && s.theme === 'light') {
      document.documentElement.classList.remove('dark');
    }
  }
} catch (e) { /* noop */ }
  `.trim();

  return (
    <html lang="ja" className="dark" suppressHydrationWarning>
      <head>
        {/* Sub-Phase 8-E (E-6): Modrinth CDN と API への preconnect で
            初回リクエスト時の DNS + TLS ハンドシェイクを前倒し。
            Mod アイコン画像 (cdn.modrinth.com/data/...) の LCP 短縮に寄与。 */}
        <link rel="preconnect" href="https://cdn.modrinth.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.modrinth.com" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen flex flex-col pb-28 md:pb-24 antialiased selection:bg-emerald-500 selection:text-white">
        <AppShell>
          {children}
          {modal}
        </AppShell>
      </body>
    </html>
  );
}
