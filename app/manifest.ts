import type { MetadataRoute } from 'next';

/**
 * M6-4 修正: PWA `manifest.json` を App Router 標準の `app/manifest.ts` で提供。
 *
 * - `name` / `short_name`: ホーム画面追加時の表示名
 * - `theme_color`: emerald-600 (#059669) DropMod のブランドカラー
 * - `background_color`: slate-900 (#0f172a) ダーク UI と統一
 * - `display: 'standalone'`: PWA としてアプリライクに表示
 * - `icons`: `/icon.png` (192) / `/icon-512.png` (512) + `apple-icon.png`
 *   → `app/icon.png` / `app/icon-512.png` / `app/apple-icon.png` として配置。
 *     Next.js App Router のファイル規約により自動配信される。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DropMod - Minecraft Mod プロファイルマネージャ',
    short_name: 'DropMod',
    description:
      'Modrinth から Minecraft の Mod を検索・ダウンロードし、プロファイル単位で管理できる Web アプリ。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#059669',
    lang: 'ja',
    dir: 'ltr',
    categories: ['utilities', 'productivity'],
    icons: [
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png'
      }
    ]
  };
}
