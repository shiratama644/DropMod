# 2026-08-27 — APP_PROFILE によるセキュリティ/ログのプロファイル切替

## タスク

`.env` / 環境変数 `APP_PROFILE=production|development` に応じて
CSP レベル・その他セキュリティ項目・ログ出力を切り替える仕組みを実装した。

## 実装内容

### 新規ファイル

| ファイル | 役割 |
| :--- | :--- |
| `lib/server/profile.ts` | APP_PROFILE 解決 (APP_PROFILE → VERCEL_ENV → NODE_ENV、不正値は fail-secure で production) |
| `lib/server/logger.ts` | プロファイル連動ロガー (debug/info は development のみ、warn/error は常時) |
| `lib/server/rate-limit.ts` | CORS ヘッダー + レート制限 + クライアント IP を lib/server に集約 (2 route の重複解消)。development ではレート制限無効 |
| `__tests__/lib/server/*.test.ts` | 上記 3 モジュールの単体テスト (41 tests) |
| `__tests__/next-config.security.test.ts` | next.config.mjs のヘッダー切替回帰テスト (15 tests) |

### プロファイルによる差分

| 項目 | production | development |
| :--- | :--- | :--- |
| CSP | Enforce | Report-Only |
| HSTS | 2 年 + preload | なし |
| upgrade-insecure-requests | あり | なし |
| connect-src ws://localhost (HMR) | なし | あり |
| API レート制限 | 120/60 req/min | 無効 |
| サーバログ debug/info | 抑制 | 出力 |
| /api/health の profile | "production" | "development" |

### 変更ファイル

- `next.config.mjs` — resolveAppProfile (lib/server/profile.ts と同一ロジック) で
  ヘッダーを切替。起動時にバナー 1 行を出力 (VITEST 実行時は抑制)
- `app/api/modrinth/[...path]/route.ts` — lib/server へ集約 + logger + debug ログ追加
- `app/api/loaders/versions/route.ts` — 同上
- `app/api/health/route.ts` — profile フィールド追加
- `lib/modrinth/server.ts` / `lib/server/project-detail.ts` / `app/page.tsx` /
  `app/sitemap.ts` / `app/robots.ts` / `lib/search/loadDiscoverSearch.ts` —
  console.warn/error → logger 変換 (出力形式は従来互換: `[DropMod] msg`, ...args)
- `.env.example` — APP_PROFILE ドキュメント追加

## 重要な技術事実 (実証済み)

1. **Next.js 16 は .env を next.config 評価前にロードする**
   (`node_modules/next/dist/server/config.js`: L1404 `loadEnvConfig` → その後に
   config import)。よって next.config.mjs 内で `process.env.APP_PROFILE` が
   .env / .env.local / .env.development / .env.production から読める。
   実環境変数が常に優先 (@next/env 仕様)。
   検証: `.env.local` に置いたプローブ変数が `next dev` / `next build` 両方で
   next.config.mjs から見えた。
2. **headers() は build 時に routes-manifest.json へ確定する**。
   `next start` での環境変数変更はヘッダーに反映されない (再ビルドが必要)。
   ランタイム側 (logger / rate-limit / health) は毎起動時に解決するため、
   「dev ビルド + prod ランタイム」のような混在状態が可能 (実測で確認)。
   - 実測: dev build を prod runtime で起動 → Report-Only ヘッダー + レート制限有効 + health=production
3. `next dev` 時の NODE_ENV は config 評価時点で 'development'、
   `next build` 時は 'production' (プローブログで実測)。

## 検証 (4 種 + 実機)

- typecheck 0 error / biome lint 0 warning (220 files)
- test:unit **596 passed / 69 files** (新規 56 tests 含む)
- build exit 0 (turbopack, production profile バナー確認)
- 実機検証:
  - production ビルド + next start → CSP Enforce / HSTS / health=production
  - 130 req → 120 通過 + 10 × 429 (Retry-After: 60, X-RateLimit-Remaining: 0)
  - APP_PROFILE=development build + start → Report-Only / HSTS なし /
    health=development / 130 req 全通過 (レート制限無効)
- .archive/vite/ 無変更

## 備考

- クライアント側 (error.tsx / client.ts / migrate.ts 等) の console は
  意図的に未変換 (ブラウザ側は本番でもユーザー報告用に warn/error 残すべきため)。
- logger は typeof window ガード付きで、誤ってクライアントバンドルに
  組み込まれても静かに warn/error 専用に落ちる。
