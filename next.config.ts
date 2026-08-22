import type { NextConfig } from 'next';

/**
 * DropMod Next.js 設定 (Phase 7)
 *
 * - React Strict Mode を維持 (Vite 版の main.tsx と同挙動)
 * - X-Powered-By ヘッダは公開情報として不要なので無効化
 * - Modrinth CDN の画像を <Image> で使えるように許可
 * - パフォーマンス最適化: 大きめのパッケージを optimizePackageImports
 * - Phase 7 追加: 全ページに標準的なセキュリティヘッダを付与
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
  }
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // L5-9 修正: pathname で絞り込み (Modrinth CDN は /data/**、
      // GitHub raw は /**/*.{png,jpg,...} が多いが後者は絞りにくいので広範のまま)
      { protocol: 'https', hostname: 'cdn.modrinth.com', pathname: '/data/**' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' } // Modrinth 本文中の画像埋め込み用
    ]
  },
  experimental: {
    // M5-8 修正: @fortawesome/fontawesome-free は CSS-only ライブラリで
    // JS export が無いため optimizePackageImports の対象として無効 → 削除。
    optimizePackageImports: ['react-markdown']
  },
  async headers() {
    return [
      {
        // 全ページに標準セキュリティヘッダを付与
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
