import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { JsonLd } from '@/features/seo';
import { Providers as QueryProviders } from '@/components/layout/Providers';
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from '@/features/seo';
import { resolveSiteOrigin } from '@/lib/platform/siteUrl';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import M3EThemeProvider from '@/theme/M3EThemeProvider';

import './globals.css';

// FontAwesome アイコン (Phase 10-A: subset 化)
import '@/styles/fontawesome-subset.css';

// M3E 移行: Roboto Flex (Google Fonts)
import '@fontsource/roboto-flex';

// Inter フォント (将来的には Roboto Flex に完全移行するが、レイアウト崩れを防ぐため維持)
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

function resolveMetadataBase(): URL {
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
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }]
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1f5f9' },
    { media: '(prefers-color-scheme: dark)', color: '#090d14' }
  ]
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <link rel="preconnect" href="https://cdn.modrinth.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.modrinth.com" />
      </head>
      <body className="min-h-screen flex flex-col pb-28 md:pb-0 antialiased selection:bg-emerald-500 selection:text-white">
        <InitColorSchemeScript attribute="class" defaultMode="dark" />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <M3EThemeProvider>
            <QueryProviders>
              <JsonLd data={buildWebSiteJsonLd(resolveSiteOrigin())} />
              <JsonLd data={buildOrganizationJsonLd(resolveSiteOrigin())} />
              <AppShell>{children}</AppShell>
            </QueryProviders>
          </M3EThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
