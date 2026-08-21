import type { NextConfig } from 'next';

/**
 * DropMod Next.js 設定
 *
 * - React Strict Mode を維持 (Vite 版の main.tsx と同挙動)
 * - X-Powered-By ヘッダは公開情報として不要なので無効化
 * - Modrinth CDN の画像を <Image> で使えるように許可
 * - Phase 3 以降のパフォーマンス最適化として、大きめのパッケージを
 *   optimizePackageImports に追加
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.modrinth.com' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' } // Modrinth 本文中の画像埋め込み用
    ]
  },
  experimental: {
    optimizePackageImports: ['@fortawesome/fontawesome-free', 'react-markdown']
  }
};

export default nextConfig;
