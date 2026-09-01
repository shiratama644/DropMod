# DropMod

Minecraft Mod プロファイルマネージャ (Next.js 16 App Router + Modrinth API + Vercel)。

Modrinth から Mod を検索・追加・バージョン管理・ZIP エクスポートできる Web アプリです。プロファイル (MC バージョン / Mod ローダー / Mod セット) を IndexedDB (Dexie) に永続化し、`.mrpack` / `.jar` ZIP のインポート、およびローカル Minecraft 環境 (`.minecraft` フォルダ / ZIP) の読み取り専用取り込みにも対応します。

## 主な機能

- Modrinth API で Mod を検索・追加・削除 (Hero Banner から検索条件をプロファイルに自動連動)
- 検索一覧の表示形式 4 種 (最大ヘッダー画像 / 1 / 2 / 3 カラム)。モバイルの 3 カラムは compact カードに自動切替
- Mod 詳細を **Parallel + Intercepting Routes** による SPA モーダルで表示。ソフトナビ時はモーダル、直接 URL アクセス時は SSR フルページ (SEO / OGP 対応)
- Home 初期 24 件は cookie ベースの Dynamic SSR (ユーザーの実プロファイル別)、Modrinth API 応答は fetch cache で 5 分間 revalidate。以降の検索・無限スクロールは CSR
- Fabric / Quilt / Forge / NeoForge のローダーバージョンを各公式メタ API から自動取得 (オフライン・失敗時は内蔵フォールバック)
- 依存・競合チェック (背景 1.2 秒デバウンス実行 + 手動リフレッシュ、BottomNav / Header に警告バッジ)
- ZIP エクスポート (プロファイル全 `.jar` を並列 DL → JSZip、`navigator.connection` 情報で並列数自動判定)、`.mrpack` / `.jar` ZIP インポート
- **ローカル環境取り込み (Read-only)**: `.minecraft` フォルダや Prism インスタンスを選択すると、MC バージョン / ローダーを自動検出 (公式ランチャー `versions/*.json`・`mmc-pack.json`) し、Mods / リソースパック / シェーダーを SHA-1 で Modrinth と照合して新規プロファイルを作成。解析結果 (互換性・依存・未識別ファイル) は作成前に確認可能。Firefox / Safari / モバイルでは `.minecraft` を ZIP 化して取り込み。ローカル環境への書き込みは一切行いません (同期は Phase 12 で実装予定)
- ダーク / ライトテーマ切替、**IndexedDB (Dexie)** 永続化 (旧 `craftforge_state_v2` / `dropmod_state_v2` LocalStorage からの自動移行 + 7 日バックアップ)
- **オフライン閲覧**: TanStack Query の Dexie persister により、既読の Mod 詳細・検索結果がオフラインでも表示可能 (24h TTL)
- **キャッシュヒットバッジ**: Home 検索結果に「🌐 X 分前のキャッシュ / 🔄 取得中」の視覚化バッジ
- トースト通知の ON/OFF 設定 (設定ページ)

## 技術構成

| 層 | 使用技術 |
| --- | --- |
| フレームワーク | Next.js 16.3.3 (App Router, Turbopack / Webpack 切替, Server Components + Route Handlers) |
| UI | React 19.2.8, Tailwind CSS 4.3, FontAwesome, `@fontsource/inter` + `@fontsource/jetbrains-mono` |
| 型 | TypeScript 7 (strict) |
| データ取得 | Modrinth API v2 (Server 側 fetch cache + ISR + Client 側 LRU/TTL キャッシュ) |
| データ同期 | TanStack Query 5 (`useQuery` / `useInfiniteQuery` / `PersistQueryClient` with Dexie persister) |
| 状態管理 | Zustand 5 (`profiles` / `toast` / `confirm` / `zipExport` / `zipImport` / `depCheck` / `appActions` / `uiState` の 8 slice、`subscribeWithSelector` middleware) |
| 永続化 | **IndexedDB (Dexie 4)** — `dropmod_state_v2` LocalStorage → Dexie 自動移行、7 日間 LocalStorage バックアップ |
| キャッシュ | `apiCache` テーブル (TanStack Query persister、24h TTL) + Cookie (`dropmod_active_profile`, SSR プロファイル反映用) |
| テスト | Vitest 4 + `@testing-library/react` 16 + `@testing-library/user-event` 14 + `fake-indexeddb` 6 + **msw 2.15** (Modrinth API mock) + jsdom 30 + Playwright (E2E) |
| メトリクス | web-vitals 4 (LCP / INP / CLS を Server Analytics endpoint に送信) |
| デプロイ | Vercel (`next start` / Edge/Node ランタイム両対応) |
| パッケージマネージャ | pnpm 11.24.0 (Node 22.22.2 以上、`.nvmrc` は 24) |

## セットアップ

```bash
# 依存インストール
pnpm install

# 開発サーバ (http://localhost:3000)
pnpm dev

# 型チェック (main + test の 2 tsconfig)
pnpm typecheck

# Lint (Biome)
pnpm lint

# 単体テスト (Vitest + msw)
pnpm test:unit

# カバレッジ計測 (per-module thresholds enforcement)
pnpm test:coverage

# 本番ビルド (環境を自動判定 → 詳細は下記「環境ごとのビルド方法」)
pnpm build

# 本番ランタイム起動
pnpm start

# E2E (Playwright、CI でのみ実行推奨。ローカルで動かす場合は先に
# `pnpm exec playwright install chromium` でブラウザバイナリを導入)
pnpm test:e2e
```

## 環境ごとのビルド方法

`pnpm build` は `scripts/build.ts` が実行環境を自動判定し、バンドラとキャッシュ戦略を切り替えます。

| 実行環境 | バンドラ | 自動判定方法 | 備考 |
| --- | --- | --- | --- |
| PC (Linux / macOS / Windows) | **Turbopack** (persistent cache) | 上記以外すべて | `turbopackFileSystemCacheForBuild` で 2 回目以降の build を高速化 |
| Android **PRoot-Distro** | **Webpack** (filesystem cache) | `uname -a` に `PRoot-Distro` を含む | PRoot 上で Turbopack が動作しないため。`next.config.mjs` 化により webpack の filesystem cache が効く (コールド 14.7s → ウォーム 4.8s 実測) |
| Android **Termux** | **Webpack** (filesystem cache) | `TERMUX_VERSION` または `PREFIX` に `com.termux` を含む | Termux は機種によって `uname` で判定できないため環境変数で判定 |
| Vercel | Turbopack | — (Vercel 側が `next build` を実行) | `vercel.json` で東京リージョン (`hnd1`) 固定 |

バンドラの手動指定:

```bash
pnpm build -- --webpack    # Webpack を強制
pnpm build -- --turbo      # Turbopack を強制
DROP_MOD_BUNDLER=webpack pnpm build   # 環境変数でも指定可
```

ビルドキャッシュの永続化 (Android のストレージ再マウント対策):

- `.next/cache` → `.cache/dropmod-build/next-cache` へ symlink (Turbopack / Webpack 両方のキャッシュを持つ)
- pnpm store → `.cache/dropmod-build/pnpm-store`
- 場所は `DROP_MOD_CACHE_ROOT` / `PNPM_STORE_DIR` で変更可能 (下記「環境変数」参照)

> 💡 PRoot / Termux でのビルドは syscall 翻訳オーバーヘッドのため **1 分前後かかるのが正常** です。キャッシュが効けば数秒〜十数秒に短縮されます。

その他のランタイム:

- `pnpm dev` — 開発サーバ (Turbopack、`.env` 変更で自動再起動)
- `pnpm start` — 本番ビルドの起動 (`NODE_ENV=production` → `APP_PROFILE` は自動で `production`)

## 環境変数

`.env.example` を参考に、目的に応じたファイル名で作成してください (すべて git 管理外)。

### .env ファイルの使い分け (Next.js 標準仕様)

| ファイル | 読み込まれるタイミング | 主な用途 |
| --- | --- | --- |
| `.env.local` | `next dev` / `next build` / `next start` の **すべて** | 個人の全環境向け設定 |
| `.env.development` | **`next dev` のみ** | 開発専用設定 (ビルドに影響しない) |
| `.env.production` | **`next build` / `next start` のみ** | 本番ビルド専用設定 |
| `.env` | すべて (優先度は最下位) | チーム共通の既定値 |

> 💡 `APP_PROFILE=development` は **next dev (NODE_ENV=development) でのみ有効** です。`next build` / `next start` (NODE_ENV=production) では無視され **常に production** として扱われるため (警告 1 行が出ます)、開発緩和用に `.env.local` へ安心して書けます — 本番ビルドが緩和されることはありません。実環境変数 (shell や CI で設定) は常に `.env` ファイルより優先されます。

### アプリ動作系

| 変数 | 用途 | 既定値 |
| --- | --- | --- |
| `APP_PROFILE` | セキュリティ / ログのプロファイル (`production` \| `development`)。**`development` は next dev でのみ有効** (build / start では無視され常に production)。未設定は `VERCEL_ENV` → `NODE_ENV` で自動判定 (不正値は fail-secure で `production`) | 自動判定 |
| `NEXT_PUBLIC_SITE_URL` | OGP / sitemap / robots / metadataBase の正規 URL | `VERCEL_URL` → `http://localhost:3000` |
| `MODRINTH_USER_AGENT` | Modrinth API に送る User-Agent (規約・レートリミット緩和のため **推奨**)。例: `DropMod/1.1.0 (https://github.com/shiratama644/DropMod)` | `DropMod/1.1.0 (...)` |
| `MODRINTH_FETCH_TIMEOUT_MS` | Server 側の Modrinth fetch タイムアウト (Vercel Hobby の 10s Function timeout に合わせて既定 8s) | `8000` |
| `MODRINTH_429_MIN_WAIT_MS` | 429 (Too Many Requests) 時の再試行最小待ち (Retry-After が小さすぎる場合のクランプ) | `1000` |
| `MODRINTH_MAX_RETRY_WAIT_MS` | Retry-After の上限 (Hobby プラン前提の 8s。Pro 以上では引き上げ可) | `8000` |

`APP_PROFILE` による切替内容 (詳細は `.env.example` を参照):

| 項目 | `production` | `development` |
| --- | --- | --- |
| CSP | Enforce (違反を阻止) | Report-Only (違反を報告のみ) |
| HSTS | 2 年 + preload | なし |
| API レート制限 (`/api/*`) | 120 / 60 req/min | 無効 |
| サーバログ debug/info | 抑制 | 出力 |

> `next build` / `next start` は常に production プロファイルで動作するため、プロファイルの混在を意識する必要はありません。`next dev` は `.env` 変更で自動再起動するため開発中の切替も即反映されます。解決結果は `GET /api/health` の `profile` フィールドで確認できます。

### ビルド系 (scripts/build.ts)

| 変数 | 用途 | 既定値 |
| --- | --- | --- |
| `DROP_MOD_BUNDLER` | バンドラ強制指定 (`webpack` \| `turbopack`)。自動判定を上書き | 自動判定 |
| `DROP_MOD_CACHE_ROOT` | ビルドキャッシュ (`next-cache` / `pnpm-store`) の置き場所 | `<repo>/.cache/dropmod-build` |
| `PNPM_STORE_DIR` | pnpm store の位置 | `<キャッシュ>/pnpm-store` |

### Vercel が自動注入する変数 (設定不要)

`VERCEL` / `VERCEL_URL` / `VERCEL_ENV` (`production` \| `preview` \| `development`) / `VERCEL_GIT_COMMIT_SHA` — `APP_PROFILE` 未設定時は `VERCEL_ENV` から自動判定されます (preview デプロイも本番相当のセキュリティで提供)。

## セキュリティ

- **CSP**: 本番は Enforce モード (`object-src 'none'` / `base-uri 'self'` / `form-action 'self'` / `frame-ancestors 'self'` で主要攻撃ベクトルを封じ、YouTube 等の埋め込みは `frame-src` でホワイトリスト許可)。`APP_PROFILE` で Report-Only に切替可能
- **セキュリティヘッダー**: HSTS (2 年 + includeSubDomains + preload) / `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy` / `Cross-Origin-Opener-Policy`
- **API Route**: Same-Origin CORS + in-memory レート制限 (`/api/modrinth/*` 120 req/min、`/api/loaders/*` 60 req/min、429 時 `Retry-After` 返却) + path traversal 対策
- **Cookie**: `SameSite=Strict` + `Secure` (https のみ付与)
- **Markdown 描画**: rehype-sanitize の allowlist + iframe は `sandbox` + `referrerPolicy` 付与、画像は `no-referrer`
- **ローカル取り込みは Read-only**: File System Access API の読み取り専用モード (`mode: 'read'`) のみ使用し、ローカル環境へは一切書き込みません

## 対応ブラウザ

| 機能 | Chrome / Edge (Desktop) | Firefox / Safari | モバイルブラウザ |
| --- | --- | --- | --- |
| 検索・プロファイル管理・ZIP 出入口 | ✅ | ✅ | ✅ |
| `.minecraft` フォルダ直接取り込み (File System Access API) | ✅ | ❌ (API 未実装) | ❌ |
| `.minecraft` / `.mrpack` / `.jar` の **ZIP** で取り込み | ✅ | ✅ | ✅ |

フォルダ直接選択に非対応の環境では、UI が自動的に ZIP 取り込みへ案内します。

## テストと品質保証

コミット前の必須検証 (4 種):

```bash
pnpm typecheck          # tsc --noEmit (main + test)
pnpm lint               # Biome
pnpm test:unit          # vitest run (E2E は除外)
pnpm build              # 本番ビルド
```

- **単体テスト**: Vitest 4 + msw (Modrinth API mock) + fake-indexeddb + jsdom — **73 test files / 637 tests**、全体 statement coverage **84.65%** (branches 73.74% / functions 90.55% / lines 86.69%)。2026-08-27 実測。グローバル最低ライン 60% + per-module thresholds (state 95% / store 85% 等) を `vitest.config.ts` で強制
- **E2E**: Playwright (chromium-desktop + chromium-mobile の 2 project)、10 spec (smoke / mod-detail / mods-page / theme / offline / zip import・export / dep-check / Phase 11 取り込み 2 種)。CI での実行を推奨 (ローカルは `pnpm exec playwright install chromium` が必要)
- **CI**: GitHub Actions ワークフロー定義は [`docs/ops/CI_WORKFLOW.yml`](./docs/ops/CI_WORKFLOW.yml) (typecheck / lint / unit → build → E2E の 3 job)。導入手順は [`docs/ops/CI_SETUP.md`](./docs/ops/CI_SETUP.md)

## ディレクトリ構成

```
src/                          # アプリコード
├── app/                      # Next.js App Router
│   ├── page.tsx              # Home (LP + Dynamic SSR 検索)
│   ├── [projectType]/[slug]/ # 型別詳細フルページ (mod/modpack/..., SSG + ISR + OGP)
│   ├── discover/[type]/      # 検索一覧 (page + layout)
│   │   ├── [slug]/           # 詳細 (直接 URL アクセス用)
│   │   └── @modal/(.)[slug]/ # Intercepting Modal (ソフトナビ時)
│   ├── profile/              # 選択中プロファイルの Mod 管理 (Client)
│   ├── settings/             # 設定 (テーマ / 通知 ON-OFF / データ管理)
│   ├── modpack/ resourcepack/ shader/   # 予約カテゴリページ
│   ├── api/
│   │   ├── health/route.ts   # ヘルスチェック (profile 確認可)
│   │   ├── modrinth/[...path]/route.ts  # Modrinth プロキシ (traversal 対策 / UA 付与 / レート制限)
│   │   └── loaders/versions/route.ts    # ローダーバージョン (公式メタ API + フォールバック)
│   ├── manifest.ts robots.ts sitemap.ts not-found.tsx error.tsx global-error.tsx
│   └── globals.css           # Tailwind v4 + テーマ変数 + アニメーション
├── components/               # 共通 UI (ui / layout / feedback)
├── features/                 # 11 ドメイン (catalog / profiles / sync / env-import / ...)
├── hooks/                    # 共通カスタムフック (useModalA11y / useMediaQuery 等)
├── lib/
│   ├── env/                  # Phase 11 取り込み基盤 (EnvironmentSource / Detector chain /
│   │                         #   Analyzer + SHA-1 Web Worker / .minecraft ZIP 対応 / 能力判定)
│   ├── modrinth/             # Modrinth ラッパ (server: fetch cache + 429 backoff / client: LRU+TTL)
│   ├── platform/             # サーバ基盤 (APP_PROFILE 解決 / logger / rateLimit / siteUrl)
│   ├── db/                   # Dexie 定義 + LocalStorage → IndexedDB 自動移行
│   ├── query/                # TanStack Query (hooks / keys / Dexie persister)
│   └── constants/ state/ utils/   # 定数 / sanitizer / ユーティリティ
├── types/                    # TypeScript 型 (profile / modrinth / sync / modpack / ui)
└── styles/                   # fontawesome-subset.css (自動生成)
scripts/                      # build.ts (環境判定ビルド) / buildEnv.ts / buildFontawesomeSubset.mjs
e2e/                          # Playwright E2E (11 spec + helpers)
__tests__/                    # 単体テスト (115 files: components / features / hooks / lib / scripts)
public/                       # 静的アセット (icon / webfonts)
```

## Vercel デプロイ

Phase 7 以降、Vercel 本番デプロイ用の設定が入っています:

- `vercel.json` — 東京リージョン (`hnd1`) 固定
- `next.config.mjs` — セキュリティヘッダ (CSP / HSTS 等、`APP_PROFILE` 連動) + 画像最適化設定 + 308 リダイレクト
- `src/app/sitemap.ts` — 静的ルート + 人気プロジェクトを動的出力 (ISR)
- `src/app/robots.ts` — 全ページ許可、`/api/*` を disallow、sitemap を明示
- `src/app/layout.tsx` — `metadataBase` を `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL` から解決、OGP / Twitter Card を設定

セットアップ手順・検証チェックリストは [`docs/ops/DEPLOY.md`](./docs/ops/DEPLOY.md) を参照してください。全ドキュメントの一覧は [`docs/README.md`](./docs/README.md) を参照してください。

## 開発ドキュメント

- [`AGENT.md`](./AGENT.md) — 開発規約 (コミット手順・検証・Git 運用・コミュニケーション規約)
- [`docs/planning/`](./docs/planning/) — フェーズ別計画書 (Phase 8〜13)・ルーティング再設計・SEO 候補
- [`docs/planning/complete/`](./docs/planning/complete/) — フェーズ完了報告
- [`docs/ops/`](./docs/ops/) — CI / デプロイ運用
- [`docs/audit/`](./docs/audit/) — 監査・差分記録

## 移行履歴

Vite + Hono から Next.js 16 + Vercel への段階的移行 (2025-08〜2026-08)。
詳細は [`docs/planning/NEXTJS_MIGRATION_PLAN.md`](./docs/planning/NEXTJS_MIGRATION_PLAN.md) を参照。

旧 Vite 版の完全なソースは [`/.archive/vite/`](./.archive/vite) に保存されています (履歴・比較用、ビルド対象外・Tailwind 走査対象外)。

## ライセンス

MIT License。詳細は [`LICENSE`](./LICENSE) を参照してください。
