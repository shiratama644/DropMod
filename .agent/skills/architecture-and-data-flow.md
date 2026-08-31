# Architecture & Data Flow — DropMod

> 全体レイヤ構造とデータフロー。コンポーネントを横断して触る時に読む。

## レイヤ構造（描画ツリー）

```
app/layout.tsx  (RootLayout = Server Component)
 ├ <head>: theme FOUC inline script (dropmod_theme cookie 読込) + preconnect(cdn.modrinth.com)
 └ <body class="min-h-screen flex flex-col pb-28 md:pb-0 ...">
     └ <QueryProviders>  (PersistQueryClientProvider + Dexie persister)   … C7-2 でここに昇格
         └ <AppShell>  (Client, 全 hook 集約, Root Layout 直下の 1 インスタンスのみ)
             ├ <WebVitalsReporter/> <OfflineBanner/> <ToastContainer/>
             ├ <DesktopSidebar/>   (PC md+, fixed left w-64 z-40)
             ├ <Header/>           (mobile <md のみ, LP では非表示)
             ├ <div class="md:pl-64">{children}</div>   … 各ページ
             ├ <BottomNav/>        (mobile <md のみ, z-[60])
             └ グローバルモーダル群 (NewProfile/EditProfile/DepCheck/Zip/Confirm)
```

- `children` = 各ページ（`/`=LP, `/mods`=検索, `/profile`, `/settings`, `/mods/[slug]`=詳細 等）
- 下流コンポーネントは **AppContext を使わず Zustand を直接参照**（Phase 9-A/10-B で AppContext は完全削除済）。
- アクセシビリティ: 各ページ h1=1（SEO 要件 C6-1）。

## 状態/ストレージ/API の 3 層モデル

| 層 | 役割 | 主ファイル |
| :--- | :--- | :--- |
| Component | UI・イベント | `src/components/**` |
| State (Zustand) | クライアント状態（純粋 setter のみ） | `src/features/{profiles,zip,dep-check}/store/*.ts` + `src/components/{feedback,layout}/*Store.ts` + `src/components/layout/appActions.ts` |
| Hooks | 副作用・API 呼・業務ロジック | `src/features/*/hooks/*.ts`（ドメイン別）+ `src/hooks/*.ts`（共通） |
| Storage (Dexie) | 永続化 | `src/lib/db/{dexie,migrate}.ts` |
| Query (TSQ) | サーバ状態+キャッシュ | `src/lib/query/{client,keys,hooks}.ts` |
| Network | HTTP | `src/lib/modrinth/{server,client}.ts`, `src/app/api/modrinth/[...path]/route.ts` |

> **設計原則**: Zustand store は「シンプルな state 容器 + 純粋 updater」に徹し、
> Modrinth API 呼び出し・cookie・Toast 連携などの**副作用は hooks 側**に持たせる
> （テスト容易性向上）。→ 詳細は [state-and-storage.md](./state-and-storage.md)。

## データフロー例

**「Home で Mod を検索」**: `HomeInteractive` の `useInfiniteQuery` → TSQ が Dexie `apiCache` 確認 → hit で即表示+background refetch / miss で `/api/modrinth/search` fetch → Dexie に persist。

**「Mod をプロファイルに追加」**: `handleToggleMod`（src/hooks/useProfiles）→ `useProfilesStore.addModToProfile` → state 更新 → `save` useEffect が `dexieSyncProfiles` で永続化。`appActionsStore` 経由で下流が action を取得。

**「Mod 詳細を SSR」**: `src/app/[projectType]/[slug]/page.tsx`（RSC）が `fetchModrinthProject` + `fetchModrinthProjectVersions` + `fetchModrinthProjectAuthor` を並列 fetch（ISR 1h）→ `ModDetailPageView` に props 渡し。

## Server / Client 境界の要点

- `src/app/layout.tsx`, `src/app/**/page.tsx`, `src/app/[projectType]/[slug]/page.tsx` = **Server Component**（SSR/ISR）
- `'use client'`: AppShell, HomeInteractive, ModDetailPageView, ModsPageClient, SettingsPageClient, Header, BottomNav, DesktopSidebar, 各モーダル, MarkdownRenderer 等（ブラウザ API/src/hooks/event 使うもの）
- **Server Component → Client Component へ関数 props 渡し不可**（Next.js 仕様）。これが `appActionsStore` 存在理由。

## 関連

- [state-and-storage.md](./state-and-storage.md) / [modrinth-integration.md](./modrinth-integration.md) / [routing-and-pages.md](./routing-and-pages.md)
