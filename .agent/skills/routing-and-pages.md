# Routing & Pages

> URL 設計・ページ追加・リダイレクト・モーダル経路 を触る時に読む。

## URL 構成（実コード準拠, Phase 9-F 再設計後）

| URL | 役割 | レンダリング | ファイル |
| :--- | :--- | :--- | :--- |
| `/` | ランディング（LP） | RSC（Header 非表示, PC=DesktopSidebar / mobile=BottomNav のみ） | `app/page.tsx` |
| `/mods` | Modrinth 検索一覧 | RSC + Client | `app/mods/page.tsx` |
| `/mods/[slug]` | Mod 詳細フルページ | RSC + **ISR 1h** + OGP, `generateStaticParams` 人気100件 | `app/mods/[slug]/page.tsx` |
| `/mods/@modal/(.)[slug]` | `/mods` からのソフトナビを**インターセプト**してモーダル化 | Intercepting Route | `app/mods/@modal/(.)[slug]/page.tsx` |
| `/discover/[type]` | カテゴリ別検索（mods/modpack/resourcepack/shader） | RSC | `app/discover/[type]/page.tsx` |
| `/profile` | 選択中プロファイルの Mod 一覧（旧 `/mods` の役割） | Client | `app/profile/page.tsx` |
| `/settings` | 設定 | Client | `app/settings/page.tsx` |
| `/resourcepack` `/shader` `/modpack` | Phase 11/12 **予約ハブ**（Coming Soon） | — | `ReservedCategoryPage` |
| `/api/modrinth/[...path]` | Modrinth API 万能プロキシ | Route Handler (Node) | `app/api/modrinth/[...path]/route.ts` |
| `/api/health` `/api/loaders/versions` | ヘルス / ローダーバージョン | Route Handler | — |

## タブ（TabName）= `home / mods / profile / settings`

`types.ts` で定義。`AppShell` の `PATH_TO_TAB` + `usePathname()` で active 判定（`/mods/[slug]`・`/discover/*` は `'mods'` 扱い）。遷移は `<Link href>`（URL ベース）。

## リダイレクト（`next.config.ts` `redirects()`, 308 Permanent）

- `/mod/:slug` → `/mods/:slug`（旧単数→新複数, SEO 保全）
- `/mods` → `/discover/mods`
- `/mods?type=modpack|resourcepack|shader` → `/discover/<type>`
- ※ `/modpack` `/resourcepack` `/shader` は**予約ルートのまま**（検索へリダイレクトしないこと = `docs/README.md` 予約 URL）。

## Intercepting / Parallel Routes の要点

- `/mods`（一覧）→ `/mods/[slug]` のみソフトナビでモーダル化（`app/mods/@modal/(.)[slug]/`）。
- `app/mods/layout.tsx` が `@modal` Parallel slot を受け取る（Root Layout から移設, Phase 9-F）。
- `/discover` も独自 `@modal/(...)mods/[slug]` を持つ（cross-segment intercept）。
- モーダル閉じる = `router.back()`（Phase 9-F: `router.replace('/')` から変更, SSR fetch 回避で軽量）。

## 詳細ページの 2 コンポーネント（Phase 10-P1 分離）

- **フルページ** = `ModDetailPageView`（PC ワイド・サイドバー活用の専用デザイン）。
- **モーダル** = `ModDetailModalShell variant="modal"`。
- ※ `ModDetailModalShell` は `variant="page"` も持つが実行時は使われない（Phase 10-P1 でフルページ経路は PageView に移行）。互換で残置。

## ページ追加時のチェックリスト

1. `app/<route>/page.tsx` 作成（RSC なら SSR/ISR, `'use client'` なら CSR）。
2. `AppShell` の `PATH_TO_TAB` に新 path → TabName を追加（BottomNav active 用）。
3. h1=1（C6-1）・`generateMetadata`（OGP）・`sitemap.ts` 更新を検討。
4. `next.config.ts` の `redirects()` / `remotePatterns` に影響無いか確認。

## 関連

- [ui-layout.md](./ui-layout.md)（AppShell の描画分岐）/ [modrinth-integration.md](./modrinth-integration.md)
