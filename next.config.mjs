/**
 * DropMod Next.js 設定
 *
 * ⚠ このファイルは .ts ではなく .mjs であること (2026-08-27):
 *   Next 16 は next.config.ts を next.config.compiled.js にコンパイルして
 *   読み込み後に削除する。webpack の persistent cache がそのパスを解決できず
 *   「Caching failed for pack」警告で毎回キャッシュが無効化されるため。
 *   .mjs はコンパイルなしで直接読み込まれ、キャッシュが正常に永続化する
 *   (検証済み: コールド 14.7s → ウォーム 4.8s、警告ゼロ)。
 *   また webpack の cache 設定は独自 override せず Next 標準を使う
 *   (独自 override すると pnpm レイアウトで mini-css-extract-plugin の
 *   pack 解決に失敗するため)。
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
  // 2026-08-27 追加: DNS プリフェッチの明示的許可 (cdm.modrinth.com のみ)
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
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
  // 2026-08-27: CSP を Report-Only から本番 (Enforce) モードに移行。
  //   - Report-Only は「違反を報告するが阻止しない」ため、実質 CSP 無しと同じ。
  //   - script-src 'unsafe-inline' は theme init script (1 箇所) のみに必要。
  //     Next.js の inline script は hash ベースで許可するのが理想だが、
  //     ビルドごとに hash が変わるため、当面 'unsafe-inline' を残しつつ
  //     object-src 'none' + base-uri + form-action + frame-ancestors で
  //     主要攻撃ベクトル (object embed / base hijack / form hijack /
  //     clickjacking) をすべて封じる。
  //   - style-src 'unsafe-inline' は Tailwind CSS v4 が CSS-in-JS で
  //     inline style を注入するため必須 (React の style={} も CSP 管轄)。
  //   - worker-src を追加 (Phase 11 の SHA-1 Web Worker 用)。
  //   - manifest-src を追加 (PWA manifest)。
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://cdn.modrinth.com https://raw.githubusercontent.com https://avatars.githubusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://api.modrinth.com https://cdn.modrinth.com",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://player.twitch.tv https://clips.twitch.tv https://streamable.com",
      "media-src 'self' https://cdn.modrinth.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // Modrinth CDN はアイコン (/data/<id>/...)・本文画像 (/data/cached_images/...) 等
      // 複数パスから画像を配信するため pathname 絞り込みなしで信頼ホストとして許可。
      // (本アプリでは Modrinth 画像は unoptimized 直接配信が基本だが、最適化経路で
      //  使われる場合もあるため広めに設定)
      { protocol: 'https', hostname: 'cdn.modrinth.com' },
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
    // 2 回目以降の `next build` を速くする (16.3+)。webpack (--webpack) 側も
    // Next 標準の filesystem cache (.next/cache/webpack) が効くようになった
    // (next.config.mjs 化により)。このフラグは Turbopack 経路でのみ効く。
    turbopackFileSystemCacheForBuild: true,
    turbopackFileSystemCacheForDev: true
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
      // /mods は検索一覧 (/discover/mods) の友好 alias。
      // 旧 /mod/:slug → /mods/:slug 等は未デプロイのため削除。
      // 詳細は /<型>/[slug] (例: /mod/sodium)、モーダルは /discover/<複数>/<slug>。
      {
        source: '/mods',
        destination: '/discover/mods',
        permanent: true
      }
      // /modpack /resourcepack /shader は Phase 11/12 の予約ルート＆詳細の名前空間ルート。
      // 検索 (/discover/*) へリダイレクトしないこと。
    ];
  }
};

export default nextConfig;
