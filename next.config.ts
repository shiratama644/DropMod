import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const webpackCacheDirectory = path.join(process.cwd(), '.next', 'cache', 'webpack');
const nextConfigFile = fileURLToPath(import.meta.url);

/**
 * DropMod Next.js 設定
 *
 * - React Strict Mode を維持 (Vite 版の main.tsx と同挙動)
 * - X-Powered-By ヘッダは公開情報として不要なので無効化
 * - Modrinth CDN の画像を <Image> で使えるように許可
 * - パフォーマンス最適化: 大きめのパッケージを optimizePackageImports
 * - 全ページに標準的なセキュリティヘッダを付与
 *   (Vercel + Next.js の最小ハードニング。CSP は Markdown 内の任意 HTML を
 *    許容する必要があるためここでは付与せず、rehype-sanitize 側の allowlist に
 *    任せる。将来的に Report-Only モードで追加検討)
 */

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    // カメラ・マイク・位置情報などは使わないので明示的に無効化
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  },
  // Strict-Transport-Security:
  //   Vercel は自動で HSTS を付与するが、本番以外 (self-hosted / preview) でも
  //   確実に付くよう明示。max-age=63072000 (2 年) + includeSubDomains + preload。
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  // Cross-Origin-Opener-Policy:
  //   Spectre 系 side-channel 攻撃対策として popup を同一 origin に限定。
  //   本アプリは window.open で外部 URL を新規タブに開くが noopener 付きなので影響なし。
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Sub-Phase 8-E (E-3): Content-Security-Policy を Report-Only モードで導入。
  //   - まず違反レポートを見て何が壊れるか把握し、Phase 9 で enforce へ切り替える段階策
  //   - Markdown 内の任意 iframe (YouTube / Vimeo / Twitch / Streamable) と Modrinth CDN 画像は許可
  //   - script-src は 'self' + 'unsafe-inline' (theme init script) を許容
  //   - style-src も 'unsafe-inline' 許容 (Tailwind JIT が inline を使うため)
  //   - font-src はフォント配信元を明示 (@fontsource)
  //   - connect-src は Modrinth API と Vercel の内部通信を許可
  //   - report-uri は現時点未設定 (Vercel deployment 後にコンソールで確認可能)
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://cdn.modrinth.com https://raw.githubusercontent.com https://avatars.githubusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://api.modrinth.com https://cdn.modrinth.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://player.twitch.tv https://clips.twitch.tv https://streamable.com",
      "media-src 'self' https://cdn.modrinth.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests"
    ].join('; ')
  }
  // 注: Cross-Origin-Resource-Policy は当初 same-origin で全ページに付けようとしたが、
  //     favicon / icon.png / apple-icon.png / og:image などの静的リソースが Discord や
  //     Twitter などの外部 SNS からフェッチされる際にブロックされる副作用があるため、
  //     画像リソースには別途 headers() で cross-origin を付ける方式に変更。
  //     (下の headers() 関数を参照)
  //
  // Cross-Origin-Embedder-Policy: require-corp は Modrinth CDN / GitHub raw の
  // 画像が CORP ヘッダを返さない限り読み込めなくなるため未設定。
];

// 画像・静的アイコン向けの CORP: cross-origin (SNS の og:image プレビュー等で必要)
const imageCorsHeaders = [
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // pathname で絞り込み (Modrinth CDN は /data/**、
      // GitHub raw は /**/*.{png,jpg,...} が多いが後者は絞りにくいので広範のまま)
      { protocol: 'https', hostname: 'cdn.modrinth.com', pathname: '/data/**' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' } // Modrinth 本文中の画像埋め込み用
    ]
  },
  experimental: {
    // @fortawesome/fontawesome-free は CSS-only ライブラリで
    // JS export が無いため optimizePackageImports の対象にできない (含めない)。
    //
    // Phase 9-E.8 追加: @tanstack/react-query
    //   - useQuery/useInfiniteQuery/useMutation/QueryClient/QueryClientProvider など
    //     アプリで使う exports が 10 個超、内部モジュール分割が細かい library で
    //     optimizePackageImports の tree-shaking メリットが大きい
    //   - react-markdown の実績と同じく、動作差分なく数 KB の削減が見込める
    //   - PersistQueryClientProvider (@tanstack/react-query-persist-client) は
    //     別 package なので個別に追加が必要
    optimizePackageImports: [
      'react-markdown',
      '@tanstack/react-query',
      '@tanstack/react-query-persist-client'
    ],
    // 2 回目以降の `next build` を速くする (16.3+)。PRoot では --webpack 側の
    // filesystem cache を使うので、このフラグは Turbopack 経路でのみ効く。
    turbopackFileSystemCacheForBuild: true,
    turbopackFileSystemCacheForDev: true
  },
  // PRoot-Distro 等 Turbopack 不可環境 (`scripts/build.ts` が --webpack) 用。
  // Turbopack 実行時は webpack() は呼ばれない。
  webpack: (config, { dev }) => {
    if (!dev) {
      config.cache = {
        type: 'filesystem',
        name: 'dropmod-webpack',
        cacheDirectory: webpackCacheDirectory,
        compression: 'gzip',
        maxMemoryGenerations: 1,
        buildDependencies: {
          config: [nextConfigFile]
        }
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        // 全ページに標準セキュリティヘッダを付与
        source: '/:path*',
        headers: securityHeaders
      },
      {
        // 画像・アイコン・favicon などの静的リソースは SNS プレビュー等
        // クロスオリジン参照を許可
        source: '/:path*.(png|jpg|jpeg|gif|webp|avif|svg|ico|webmanifest)',
        headers: imageCorsHeaders
      }
    ];
  },
  // Phase 9-F: URL 再設計に伴う 308 リダイレクト (SEO 保全)
  //   - /mod/[slug]  (旧 Mod 詳細、単数)     → /mods/[slug]  (新 Mod 詳細、複数)
  //     旧 /mods (選択中プロファイル) は「Modrinth 検索一覧」に役割変更されたため、
  //     /mods 自体はリダイレクトしない (BottomNav から /profile に案内)。
  //   - permanent: true = 308 Permanent Redirect (検索エンジンの旧 URL cache を
  //     置き換え、被リンク先の Value を新 URL に集約)
  async redirects() {
    return [
      // 旧 Mod 詳細 (単数) → 新 Mod 詳細 (複数): SEO 上の Value を保全
      {
        source: '/mod/:slug',
        destination: '/mods/:slug',
        permanent: true
      },
      // 検索一覧は /discover/* 。詳細 /mods/[slug] は動かさない。
      {
        source: '/mods',
        has: [{ type: 'query', key: 'type', value: 'modpack' }],
        destination: '/discover/modpack',
        permanent: true
      },
      {
        source: '/mods',
        has: [{ type: 'query', key: 'type', value: 'resourcepack' }],
        destination: '/discover/resourcepack',
        permanent: true
      },
      {
        source: '/mods',
        has: [{ type: 'query', key: 'type', value: 'shader' }],
        destination: '/discover/shader',
        permanent: true
      },
      {
        source: '/mods',
        destination: '/discover/mods',
        permanent: true
      }
      // /modpack /resourcepack /shader は Phase 11/12 の予約ルート。
      // 検索 (/discover/*) へリダイレクトしないこと。
    ];
  }
};

export default nextConfig;
