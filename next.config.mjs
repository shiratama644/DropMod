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
 * - 全ページに標準的なセキュリティヘッダを付与。
 *   CSP / HSTS は APP_PROFILE (production=Enforce+HSTS / development=
 *   Report-Only+HSTS なし) で切り替わる (下方の APP_PROFILE ブロック参照)。
 *   Markdown 内の任意 HTML は rehype-sanitize 側の allowlist で Sanitize 済み。
 */

// ============================================================================
// APP_PROFILE (production | development) — セキュリティレベル切替
// ============================================================================
// .env / 環境変数の APP_PROFILE で本番/開発の挙動を切り替える。
//
//   | 項目                       | production         | development     |
//   |----------------------------|--------------------|-----------------|
//   | CSP                        | Enforce            | Report-Only     |
//   | HSTS                       | あり (2 年+preload) | なし            |
//   | upgrade-insecure-requests  | あり               | なし            |
//   | connect-src (HMR websocket)| なし               | ws://localhost  |
//
// 解決優先度 (ランタイム側 lib/server/profile.ts と同一ロジック):
//   1. APP_PROFILE — 明示指定 (development は NODE_ENV !== production のみ有効)
//   2. VERCEL_ENV  — production|preview → production / development → development
//   3. NODE_ENV    — development → development / それ以外 → production
//   不正な値は production 扱い (fail-secure)。
//
// ■ development は next dev (NODE_ENV=development) 専用 (2026-08-27 修正):
//   Next.js は .env 系ファイルを next.config 評価 **前に** 読み込むため
//   (next/dist/server/config.js の loadEnvConfig → import 順、2026-08-27 実証済み)、
//   .env.local に APP_PROFILE=development を書くと next build にも適用され、
//   CSP Report-Only / HSTS なし の本番ビルドが作成される重大な footgun があった。
//   そのため NODE_ENV=production (= next build / next start) では development 指定を
//   無視して常に production とする (警告 1 回)。生の next build を含む全経路で保護。
//
// headers() の結果は build 時に routes manifest へ確定するが、上記により
// build/start は常に production profile になるため、プロファイル混在は発生しない。
// ============================================================================
function resolveAppProfile(env = process.env) {
  const explicit = (env.APP_PROFILE ?? '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'development') {
    // development は開発サーバー (next dev) でのみ有効。NODE_ENV=production
    // (= next build / next start) では本番ビルドへの緩和漏れを防ぐため無視。
    if (explicit === 'development' && env.NODE_ENV === 'production') {
      if (!process.env.__DROPMOD_APP_PROFILE_DEV_IGNORED_WARNED) {
        process.env.__DROPMOD_APP_PROFILE_DEV_IGNORED_WARNED = '1';
        console.warn(
          '[DropMod] APP_PROFILE=development は next dev (NODE_ENV=development) でのみ有効です。' +
            'このプロセスは NODE_ENV=production のため production として扱います ' +
            '(.env.local に書いた場合も build / start には反映されません)'
        );
      }
      return 'production';
    }
    return explicit;
  }
  if (explicit) {
    // 不正値の警告も build 時の config 再評価 (main + jest-worker) で重複するため
    // process.env ガードでプロセスツリー全体で 1 回だけ出す
    if (!process.env.__DROPMOD_APP_PROFILE_INVALID_WARNED) {
      process.env.__DROPMOD_APP_PROFILE_INVALID_WARNED = '1';
      console.warn(
        `[DropMod] APP_PROFILE="${env.APP_PROFILE}" は不正な値です。production | development のいずれかを指定してください (production として扱います)`
      );
    }
    return 'production';
  }
  const vercel = (env.VERCEL_ENV ?? '').trim().toLowerCase();
  if (vercel === 'development') return 'development';
  if (vercel === 'production' || vercel === 'preview') return 'production';
  return env.NODE_ENV === 'development' ? 'development' : 'production';
}

const appProfile = resolveAppProfile();
const isProductionProfile = appProfile === 'production';

// ----------------------------------------------------------------------------
// プロファイルバナー (プロセスツリー全体で 1 回だけ表示)
//
// next build は main プロセスに加えて jest-worker の子プロセス (型チェック /
// static generation 等) がそれぞれ next.config を再評価するため、素朴に
// console.info すると同じ行が 3〜4 回出力される (2026-08-27 実測: webpack 4 回 /
// turbopack 2 回。main 1 + processChild.js × 3)。
//
// process.env にガードを置く理由:
//   - 同一プロセスでの再評価 → process.env は共有されるため抑止できる
//   - 子プロセス → fork 時に親の env を継承するため抑止できる
//     (親は必ず最初に config を読むので、worker 起動時にはガード済み)
//   - ガード値を profile そのものにするので、profile が変われば再表示される
//     (next dev で .env を書き換えた場合も新しい状態が 1 回だけ出る)
// ----------------------------------------------------------------------------
const BANNER_GUARD_KEY = '__DROPMOD_APP_PROFILE_BANNER_SHOWN';
if (!process.env.VITEST && process.env[BANNER_GUARD_KEY] !== appProfile) {
  process.env[BANNER_GUARD_KEY] = appProfile;
  const banner = isProductionProfile
    ? '[DropMod] APP_PROFILE=production — CSP=Enforce / HSTS=有効 / レート制限=有効'
    : '[DropMod] APP_PROFILE=development — CSP=Report-Only / HSTS=無効 / レート制限=無効 (next dev 専用)';
  // 2026-08-27 修正: development は NODE_ENV=production では解決段階で無視される
  // ため、このバナーが development になるのは next dev のみ。
  console.info(banner);
}

// CSP ディレクティブ共通部 (プロファイルで変わるのは connect-src と
// upgrade-insecure-requests のみ)。
//   - script-src 'unsafe-inline' は theme init script (1 箇所) のみに必要。
//   - style-src 'unsafe-inline' は Tailwind CSS v4 / React style={} 用。
//   - worker-src は Phase 11 の SHA-1 Web Worker 用。
//   - manifest-src は PWA manifest 用。
//   - object-src 'none' + base-uri + form-action + frame-ancestors で
//     主要攻撃ベクトル (object embed / base hijack / form hijack /
//     clickjacking) を封じる。
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.modrinth.com https://raw.githubusercontent.com https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  // development のみ HMR websocket (ws://localhost:3000 等) を明示許可。
  // CSP3 の 'self' は同一 origin の ws: も包含するはずだが、ブラウザ間の
  // 解釈差があるため Report-Only の違反レポート噪音を減らす意図で追加。
  `connect-src 'self' https://api.modrinth.com https://cdn.modrinth.com${
    isProductionProfile ? '' : ' ws://localhost:* ws://127.0.0.1:*'
  }`,
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://player.twitch.tv https://clips.twitch.tv https://streamable.com',
  "media-src 'self' https://cdn.modrinth.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // upgrade-insecure-requests は本番のみ (開発は http://localhost で動くため)。
  ...(isProductionProfile ? ['upgrade-insecure-requests'] : [])
];

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
  //   development プロファイルでは無効化 (localhost の http に意味がなく、
  //   HSTS はブラウザに永続キャッシュされるため誤って付与すると事故になる)。
  ...(isProductionProfile
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload'
        }
      ]
    : []),
  // Cross-Origin-Opener-Policy:
  //   Spectre 系 side-channel 攻撃対策として popup を同一 origin に限定。
  //   本アプリは window.open で外部 URL を新規タブに開くが noopener 付きなので影響なし。
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // CSP: production は Enforce、development は Report-Only。
  //   - Report-Only は「違反を報告するが阻止しない」ため、dev ツール
  //     (React DevTools / HMR / ブラウザ拡張) を壊さずに違反を検出できる。
  //   - 本番 (Enforce) 移行済み (2026-08-27)。APP_PROFILE=production が既定。
  {
    key: isProductionProfile
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only',
    value: cspDirectives.join('; ')
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
