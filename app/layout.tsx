import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/AppShell';
import { JsonLd } from '@/components/JsonLd';
import { Providers as QueryProviders } from '@/components/Providers';
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from '@/lib/seo/jsonld';
import { resolveSiteOrigin } from '@/lib/server/site-url';
import './globals.css';

// FontAwesome アイコン (Phase 10-A: subset 化)
//   全 CSS (~90 KB) + 未使用フォント (fa-regular / v4compat) を bundle するのではなく、
//   scripts/build-fontawesome-subset.mjs で生成した subset CSS のみを import する。
//   Font ファイル (fa-solid-900.woff2 / fa-brands-400.woff2) は public/webfonts/ に
//   配置され、CSS 内の url(/webfonts/...) から絶対パス参照される。
//   Icon 追加時は該当 JSX に <i className="fa-solid fa-xxx"> を追加した上で
//   `pnpm build:fa-subset` を再実行して subset を再生成する (詳細は AGENT.md)。
import '@/styles/fontawesome-subset.css';

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
    card: 'summary_large_image',
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
  viewportFit: 'cover',
  // ブラウザ UI バーの色。サイト内テーマ (html.dark class) に連動させるため
  // CSS 側の color-scheme と組み合わせて機能する。
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1f5f9' },
    { media: '(prefers-color-scheme: dark)', color: '#090d14' }
  ]
};

/**
 * Root Layout (Phase 9-F 更新: URL 再設計で @modal Parallel Route を撤去)
 *
 * 従来 (Phase 6 〜 Phase 9-E): Root Layout に `@modal` Parallel Route slot を
 *   置いて、Home からのソフトナビで `/mod/[slug]` を全ページ共通でモーダル表示
 *   していた。
 *
 * Phase 9-F 以降:
 *   - URL 構造を再設計 (/mod/[slug] → /mods/[slug])
 *   - Intercepting Route の scope は「/mods 一覧 → /mods/[slug]」に限定
 *   - Parallel Route slot は `app/mods/layout.tsx` に移設
 *   - Root layout は children のみを描画するシンプルな構造に
 *   - 他ページ (/, /profile, /settings) から /mods/[slug] クリック時は
 *     通常のフルページ遷移 (SEO 保全 + シンプルな挙動)
 *
 * AppShell (Client Component) が Toast/Confirm/theme を管理し、
 * その内側で children (各ページ) を描画する。
 */
export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  // theme FOUC (SSR dark → hydration 後 light) を回避する inline script。
  // hydration 前に LocalStorage を読み取り、'light' が保存されていれば
  // <html> の dark クラスを外す。これで hydration 時にちらつきが起きない。
  // dangerouslySetInnerHTML は script タグ挿入の Next.js 推奨方法。
  const themeInitScript = `
try {
  var cookieTheme = '';
  var parts = document.cookie ? document.cookie.split('; ') : [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].indexOf('dropmod_theme=') === 0) {
      cookieTheme = decodeURIComponent(parts[i].slice('dropmod_theme='.length));
      break;
    }
  }
  var theme = cookieTheme;
  if (theme !== 'light' && theme !== 'dark') {
    var raw = localStorage.getItem('dropmod_state_v2') || localStorage.getItem('craftforge_state_v2');
    if (raw) {
      var s = JSON.parse(raw);
      if (s && (s.theme === 'light' || s.theme === 'dark')) theme = s.theme;
    }
  }
  if (theme === 'light') document.documentElement.classList.remove('dark');
  else document.documentElement.classList.add('dark');
} catch (e) { /* noop */ }
  `.trim();

  return (
    // 2026-08-27: className="dark" を削除。React hydration が vdom 値 (SSR 時点の
    // "dark") で上書きし、init script が cookie に基づき外した dark クラスを
    // 復活させていた (ライトテーマ ユーザーの FOUC / E2E 失敗)。
    // html のクラスは head 内の init script (描画前・同期) が唯一設定する。
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* color-scheme: ページが両モード対応であることを CSS 読み込み前に
            ブラウザに伝える (Flash of Wrong Theme + 自動ダークモード対策)。
            実際の切替は globals.css の :root/html.dark color-scheme が担当。 */}
        <meta name="color-scheme" content="light dark" />
        {/* Sub-Phase 8-E (E-6): Modrinth CDN と API への preconnect で
            初回リクエスト時の DNS + TLS ハンドシェイクを前倒し。
            Mod アイコン画像 (cdn.modrinth.com/data/...) の LCP 短縮に寄与。 */}
        <link rel="preconnect" href="https://cdn.modrinth.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.modrinth.com" />
        {/* Phase 10-P5 (security/noDangerouslySetInnerHtml): theme FOUC 対策の
            定番パターン。__html はハードコード (ユーザー入力なし) なので XSS
            リスクなし。next/script では hydration 前実行が保証されず FOUC が
            戻るため、dangerouslySetInnerHTML を意図的に使用。 */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme FOUC 対策のハードコード script */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen flex flex-col pb-28 md:pb-0 antialiased selection:bg-emerald-500 selection:text-white">
        {/* C7-2 修正 追随: QueryClientProvider を Root Layout に移動。
             AppShell の中で useQueryClient() を使うため、AppShell 全体を
             PersistQueryClientProvider の中に入れる必要がある。 */}
        <QueryProviders>
          <JsonLd data={buildWebSiteJsonLd(resolveSiteOrigin())} />
          <JsonLd data={buildOrganizationJsonLd(resolveSiteOrigin())} />
          <AppShell>{children}</AppShell>
        </QueryProviders>
      </body>
    </html>
  );
}
