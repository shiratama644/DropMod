# DropMod

Minecraft Mod プロファイルマネージャ (Next.js 16 App Router + Modrinth API + Vercel)。

Modrinth から Mod を検索・追加・バージョン管理・ZIP エクスポートできる Web アプリです。プロファイル (MC バージョン / Mod ローダー / Mod セット) を LocalStorage に永続化し、`.mrpack` / `.jar` ZIP のインポートにも対応します。

## 主な機能

- Modrinth API で Mod を検索・追加・削除 (Hero Banner から検索条件をプロファイルに自動連動)
- Mod 詳細を **Parallel + Intercepting Routes** による SPA モーダルで表示
  ソフトナビ時は `/mod/[slug]` でモーダル、直接 URL アクセス時は SSR フルページ (SEO / OGP 対応)
- Home 初期 24 件は ISR (5 分キャッシュ) で SSR、以降の検索・無限スクロールは CSR
- 依存・競合チェック (背景 1.2 秒デバウンス実行 + 手動リフレッシュ)
- ZIP エクスポート (プロファイル全 `.jar` を並列 DL → JSZip)、`.mrpack` / `.jar` ZIP インポート
- ダーク / ライトテーマ切替、LocalStorage 永続化 (旧 `craftforge_state_v2` からの自動移行対応)

## 技術構成

| 層 | 使用技術 |
| --- | --- |
| フレームワーク | Next.js 16.3.1 (App Router, Turbopack, Server Components + Route Handlers) |
| UI | React 19.2.8, Tailwind CSS 4.3, FontAwesome, `@fontsource/inter` + `@fontsource/jetbrains-mono` |
| 型 | TypeScript 5 (strict) |
| データ | Modrinth API v2 直叩き (Server 側 ISR キャッシュ + Client 側 LRU/TTL キャッシュ) |
| 永続化 | LocalStorage (`dropmod_state_v2`) |
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
```

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

components/                   # Client / Server 共通 React Components (12 個)
hooks/                        # LocalStorage 永続化・ZIP・依存チェック・Toast 等の hooks (7 個)
lib/
├── constants/categories.ts
├── modrinth/
│   ├── client.ts             # ブラウザ側 Modrinth ラッパ (LRU/TTL + 429 リトライ)
│   └── server.ts             # Server 側 Modrinth ラッパ (fetch cache + ISR tags)
└── utils/{download,hash,id}.ts
types.ts                      # 全 TypeScript 型
```

## 移行履歴

Vite + Hono から Next.js 16 + Vercel への段階的移行 (2025-08〜2026-08)。
詳細は [`docs/NEXTJS_MIGRATION_PLAN.md`](./docs/NEXTJS_MIGRATION_PLAN.md) を参照。

旧 Vite 版の完全なソースは [`/.archive/vite/`](./.archive/vite) に保存されています (履歴・比較用、ビルド対象外)。

## ライセンス

TBD (プライベートリポジトリ)。
