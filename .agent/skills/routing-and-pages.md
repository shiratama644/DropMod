# Routing & Pages

> URL 設計・ページ追加・リダイレクト・モーダル経路 を触る時に読む。
> **2026-08-24 ルーティング再設計後**（`bd05b9b`）。詳細は `docs/planning/ROUTING_REDESIGN_PLAN.md`。

## URL 構成（現行）

| URL | 役割 | レンダリング | ファイル |
| :--- | :--- | :--- | :--- |
| `/` | ランディング（LP） | RSC（Header 非表示） | `src/app/page.tsx` |
| `/discover` | → リダイレクト `/discover/mods` | `redirect()` | `src/app/discover/page.tsx` |
| `/discover/{mods,modpacks,resourcepacks,shaders}` | **検索一覧**（複数形） | RSC + Client（searchParams `?q=` で動的） | `src/app/discover/[type]/page.tsx` |
| `/discover/<複数>/<slug>`（例: `/discover/mods/sodium`） | **プレビューモーダル**（直接 URL は **noindex** + canonical 詳細。SEO-2） | Intercept（soft nav＝一覧保持）／直接＝モーダル単体 | `src/app/discover/[type]/[slug]/` + `@modal/(.)[slug]/` |
| `/{mod,modpack,resourcepack,shader}/[slug]`（例: `/mod/sodium`） | **詳細フルページ**（単数形・型別・Modrinth 準拠） | SSG + ISR 1h + OGP | `src/app/[projectType]/[slug]/page.tsx` |
| `/profile` | 選択中プロファイルの Mod 一覧 | Client | `src/app/profile/page.tsx` |
| `/settings` | 設定 | Client | `src/app/settings/page.tsx` |
| `/modpack` `/resourcepack` `/shader` | **予約ハブ**（Phase 11/12）兼 詳細の名前空間ルート | `ReservedCategoryPage` | `src/app/{modpack,resourcepack,shader}/page.tsx` |
| `/api/modrinth/[...path]` | Modrinth API 万能プロキシ | Route Handler (Node) | — |

## 4 責務（分離）
- **Discovery** `/discover/<複数>` — 探す
- **Preview** `/discover/<複数>/<slug>` — モーダル（`ModDetailModalShell`、一覧の上に重ねる）
- **Detail** `/<型>/<slug>` — フル詳細（`ModDetailPageView`）
- **External** `modrinth.com/<型>/<slug>` — Modrinth 公式

## 導線
- 一覧カード → **モーダル** `/discover/<複数>/<slug>`（Intercept で一覧状態保持。戻るで復元）
- モーダルの **「詳細ページ」ボタン** → `/<型>/<slug>`（フル詳細）
- プロファイル/LP のカード → **詳細ページ** `/<型>/<slug>` 直接（モーダル経由しない）

## URL 生成は一元化（`src/lib/constants/search.ts`）
**直接 URL 文字列を組み立てないこと**。以下を使う:
- `discoverPathForType(type)` → `/discover/<複数>`
- `modalPathForType(type, slug)` / `modalPathFromProject(projectType, slug)` → `/discover/<複数>/<slug>`
- `detailPathForType(type, slug)` / `detailPathFromProject(projectType, slug)` → `/<型>/<slug>`
- `parseDiscoverSegment`（複数形）/ `parseDetailType`（単数形）

## 詳細/モーダルのデータ取得（`src/features/project/api/projectDetail.ts`）
- `fetchProjectDetailData(slug)` — project/versions/author 並列取得（両ルートで共用）
- `generateDetailStaticParams(type)` — 人気上位の事前生成
- `buildDetailMetadata(type, slug)` — OGP/canonical（`/<型>/<slug>`）

## リダイレクト（`next.config.ts`）
- `/mods` → `/discover/mods`（友好 alias）。旧 `/mod/:slug→/mods/:slug` 等は**削除済**（未デプロイのため）。
- `/modpack` `/resourcepack` `/shader` は予約ルート（検索へリダイレクトしない）。

## ⚠️ Next.js の罠（実装で踏んだ）
- **セグメント設定（`revalidate`/`dynamicParams`/`dynamic`/`runtime`）は静的解析可能なリテラル必須**。`export const revalidate = SOME_IMPORTED_CONST` は **「Invalid segment configuration export」エラー**になる。必ず `export const revalidate = 3600;` のようにリテラルで書く。
- Intercept は **`/discover/[type]/@modal/(.)[slug]`**（[type] layout が `{children, modal}` slot を宣言）。一覧（searchParams で動的）と同じ [type] セグメント下だが、モーダル側に `revalidate` を置くと競合するため**モーダル系ルートにはセグメント設定を置かない**（動的描画）。

## TabName（`home / mods / profile / settings`）
`/`→home、`/discover/*`・`/<型>/<slug>`→mods、`/profile`→profile、`/settings`→settings。
`AppShell` の `activeTab` は `/discover/` prefix と `^\/(mod|modpack|resourcepack|shader)\/` 正規で 'mods' 判定。

## ページ追加時のチェックリスト
1. `src/app/<route>/page.tsx`（RSC=SSR/ISR, `'use client'`=CSR）。
2. `AppShell` の `PATH_TO_TAB` と active 判定（`/discover/` or `/<型>/` なら 'mods'）に反映。
3. h1=1（C6-1）・`generateMetadata`（OGP）・`sitemap.ts` 更新。
4. セグメント設定は**リテラル**で。

## 関連
- [ui-layout.md](./ui-layout.md) / [modrinth-integration.md](./modrinth-integration.md)
- `docs/planning/ROUTING_REDESIGN_PLAN.md`（経緯・全文）
