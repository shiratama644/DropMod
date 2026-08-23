# DropMod

Minecraft Mod プロファイルマネージャ (Next.js 16 App Router + Modrinth API + Vercel)。

Modrinth から Mod を検索・追加・バージョン管理・ZIP エクスポートできる Web アプリです。プロファイル (MC バージョン / Mod ローダー / Mod セット) を LocalStorage に永続化し、`.mrpack` / `.jar` ZIP のインポートにも対応します。

## 主な機能

- Modrinth API で Mod を検索・追加・削除 (Hero Banner から検索条件をプロファイルに自動連動)
- Mod 詳細を **Parallel + Intercepting Routes** による SPA モーダルで表示
  ソフトナビ時は `/mod/[slug]` でモーダル、直接 URL アクセス時は SSR フルページ (SEO / OGP 対応)
- Home 初期 24 件は cookie ベースの Dynamic SSR (ユーザーの実プロファイル別)、Modrinth API 応答は fetch cache で 5 分間 revalidate。以降の検索・無限スクロールは CSR
- 依存・競合チェック (背景 1.2 秒デバウンス実行 + 手動リフレッシュ、Zustand `depCheckStore` で BottomNav / Header 警告バッジ)
- ZIP エクスポート (プロファイル全 `.jar` を並列 DL → JSZip、`navigator.connection` 情報で並列数自動判定)、`.mrpack` / `.jar` ZIP インポート
- ダーク / ライトテーマ切替、**IndexedDB (Dexie)** 永続化 (旧 `craftforge_state_v2` / `dropmod_state_v2` LocalStorage からの自動移行 + 7 日バックアップ)
- **オフライン閲覧**: TanStack Query の Dexie persister により、既読の Mod 詳細・検索結果がオフラインでも表示可能 (24h TTL)
- **キャッシュヒットバッジ**: Home 検索結果に「🌐 X 分前のキャッシュ / 🔄 取得中」の視覚化バッジ

## 技術構成

| 層 | 使用技術 |
| --- | --- |
| フレームワーク | Next.js 16.3.2 (App Router, Turbopack, Server Components + Route Handlers) |
| UI | React 19.2.8, Tailwind CSS 4.3, FontAwesome, `@fontsource/inter` + `@fontsource/jetbrains-mono` |
| 型 | TypeScript 5 (strict) |
| データ取得 | Modrinth API v2 (Server 側 fetch cache + ISR + Client 側 LRU/TTL キャッシュ) |
| データ同期 | TanStack Query 5 (`useQuery` / `useInfiniteQuery` / `PersistQueryClient` with Dexie persister) |
| 状態管理 | Zustand 5 (`profiles` / `toast` / `confirm` / `zipExport` / `zipImport` / `depCheck` / `appActions` の 7 slice、`subscribeWithSelector` middleware) |
| 永続化 | **IndexedDB (Dexie 4)** — `dropmod_state_v2` LocalStorage → Dexie 自動移行、7 日間 LocalStorage バックアップ |
| キャッシュ | `apiCache` テーブル (TanStack Query persister、24h TTL) + Cookie (`dropmod_active_profile`, SSR プロファイル反映用) |
| テスト | Vitest 3 + `@testing-library/react` 16 + `@testing-library/user-event` 14 + `fake-indexeddb` 6 + **msw 2.15** (Modrinth API mock) + Playwright (E2E) |
| メトリクス | web-vitals 4 (LCP / INP / CLS を Server Analytics endpoint に送信) |
| デプロイ | Vercel (`next start` / Edge/Node ランタイム両対応) |
| パッケージマネージャ | pnpm 11.22.0 (Node 20 以上) |

## セットアップ

```bash
# 依存インストール
pnpm install

# 開発サーバ (http://localhost:3000)
pnpm dev

# 型チェック
pnpm typecheck

# 本番ビルド
pnpm build

# 本番ランタイム起動
pnpm start

# 単体テスト (Vitest + msw)
pnpm test:unit

# カバレッジ計測 (per-module thresholds enforcement)
pnpm test:coverage

# E2E (Playwright、CI でのみ実行推奨。Chromium バイナリのローカル install が必要)
pnpm test:e2e
```

現状のテスト規模: **29 test files / 275 tests、全体 statement coverage 91.34%** (Phase 9-C 完了時)。

## 環境変数

`.env.example` を `.env.local` にコピーしてください。実運用では以下を設定します:

- `MODRINTH_USER_AGENT` (推奨) — Modrinth API に送る User-Agent。例: `DropMod/1.1.0 (https://github.com/shiratama644/DropMod)`

## ディレクトリ構成

```
app/                          # Next.js App Router
├── layout.tsx                # Root Layout (children + @modal 2 スロット)
├── page.tsx                  # Home (ISR + HomeInteractive)
├── mods/page.tsx             # 選択中の Mod (Client)
├── settings/page.tsx         # 設定 (Client)
├── mod/[slug]/               # Mod 詳細フルページ (SSG + ISR + OGP)
│   ├── page.tsx
│   ├── loading.tsx
│   └── not-found.tsx
├── @modal/                   # Intercepting Modal スロット (Parallel Routes)
│   ├── default.tsx
│   ├── [...catchAll]/page.tsx
│   └── (.)mod/[slug]/page.tsx
├── api/
│   ├── health/route.ts
│   └── modrinth/[...path]/route.ts  # Modrinth 直プロキシ (path traversal 対策済)
└── globals.css

components/                   # Client / Server 共通 React Components (20 個)
hooks/                        # Dexie hydration・ZIP・依存チェック・Toast・確認ダイアログ hooks (7 個、shim パターン)
lib/
├── constants/
│   ├── categories.ts
│   └── search.ts             # SEARCH_LIMIT 等
├── db/
│   ├── dexie.ts              # 3 テーブル (profiles / apiCache / meta) 定義 + CRUD ヘルパ
│   └── migrate.ts            # LocalStorage → Dexie 自動移行 + 7 日 backup + restore
├── modrinth/
│   ├── client.ts             # ブラウザ側 Modrinth ラッパ (LRU/TTL + proxy→direct fallback + 429 リトライ)
│   └── server.ts             # Server 側 Modrinth ラッパ (fetch cache + ISR tags + 429 リトライ)
├── query/
│   ├── client.ts             # QueryClient + Dexie async storage persister (24h TTL)
│   ├── hooks.ts              # useProjectQuery / useVersionsQuery / useProjectsBatchQuery
│   └── keys.ts               # queryKeys.search/project/version/versions/projectsBatch/gameVersions (canonical)
├── state/sanitize.ts         # LocalStorage 復元時の pure sanitizer
├── store/                    # Zustand slice (7 store)
│   ├── profiles.ts           # profiles / currentProfileId / theme (subscribeWithSelector + devtools)
│   ├── toast.ts              # toasts (MAX_VISIBLE=5)
│   ├── confirm.ts            # ConfirmDialog Promise-based caller
│   ├── zipExport.ts          # ZIP エクスポート進捗 + キャンセルフラグ
│   ├── zipImport.ts          # NewProfileModal に渡す ImportData
│   ├── depCheck.ts           # hasDepWarning / isChecking / lastCheckAt
│   └── appActions.ts         # AppShell hook 由来 action の登録先 (Phase 9-A)
└── utils/{download,hash,id}.ts
types.ts                      # 全 TypeScript 型
```

## Vercel デプロイ

Phase 7 で Vercel 本番デプロイ用の設定が入っています:

- `vercel.json` — 東京リージョン (`hnd1`) 固定、`cleanUrls: true`
- `next.config.ts` — セキュリティヘッダ (`X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options` / `Permissions-Policy`)
- `app/sitemap.ts` — 静的ルート + 人気 Mod 100 件を動的出力 (1h ISR)
- `app/robots.ts` — 全ページ許可、`/api/*` を disallow、sitemap を明示
- `app/layout.tsx` — `metadataBase` を `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL` から解決、OGP / Twitter Card テンプレを設定
- `app/mod/[slug]/page.tsx` — `generateMetadata` に `alternates.canonical` を追加

セットアップ手順・環境変数一覧・検証チェックリストは [`docs/ops/DEPLOY.md`](./docs/ops/DEPLOY.md) を参照してください。全ドキュメントの一覧は [`docs/README.md`](./docs/README.md) を参照してください。

主な環境変数:

| Key | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | OGP / sitemap / robots の baseUrl (例: `https://dropmod.vercel.app`) |
| `MODRINTH_USER_AGENT` | Modrinth API に送る meaningful UA (レートリミット緩和のため推奨) |

## 移行履歴

Vite + Hono から Next.js 16 + Vercel への段階的移行 (2025-08〜2026-08)。
詳細は [`docs/planning/NEXTJS_MIGRATION_PLAN.md`](./docs/planning/NEXTJS_MIGRATION_PLAN.md) を参照。

旧 Vite 版の完全なソースは [`/.archive/vite/`](./.archive/vite) に保存されています (履歴・比較用、ビルド対象外)。

## ライセンス

TBD (プライベートリポジトリ)。
