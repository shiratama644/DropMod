# UI Layout — PC / Mobile / Modal

> ヘッダー・サイドバー・BottomNav・モーダル・レイアウト崩れ を触る時に読む。

## ガラス表現 (glass-panel) の方針 (2026-08-27)

- **`.glass-panel` / dropdown に `backdrop-filter` は使わない**。GPU のない環境 (PRoot / software rendering・低スペック端末) で再合成のたびに「白く一瞬光る」フラッシュが起きるため削除済み。`--bg-panel` の不透明度 (dark 0.92 / light 0.96) で視覚を維持。
- モーダルのオーバーレイ (`backdrop-blur-md` / `backdrop-blur-[2px]`, 計 9 ファイル) は現状残している (モーダル表示中しか合成されないため)。フラッシュ報告が続くなら同じ理由で削除候補。

## AppShell の描画分岐（`components/AppShell.tsx`）

- **PC（md+, ≥768px）**: `<DesktopSidebar>`（fixed left `w-64`, z-40, 全ページ表示）+ 内容 `<div class="md:pl-64">`。**Header も BottomNav も非表示**。
- **Mobile（<md）**: `<Header>`（sticky z-30, ロゴ+ボタン群）+ `<BottomNav>`（fixed bottom z-[60]）。
- **LP（`/`）のみ**: Header 非表示（`pathname !== '/'` で Header を出す）。DesktopSidebar と BottomNav は表示継続。

> §6.6（AGENT.md）の PC/モバイル分離・z-index 序列・BottomSheet 仕様が正。ここは実体メモ。

## body と全体余白（`app/layout.tsx`）

- `<body class="min-h-screen flex flex-col pb-28 md:pb-0 ...">`
- **`pb-28`（mobile）** = BottomNav クリアランス（7rem）。**`md:pb-0`（PC）** = PC は下部固定バーが無いため余白なし（※ かつて `md:pb-24` で LP フッター下に空白ができていた → 修正済 `ed5f7c1`）。
- theme FOUC 対策: `<head>` の inline script が `dropmod_theme` cookie / LocalStorage を読み、hydration 前 (`dark` クラス) を決定（`dangerouslySetInnerHTML`, ハードコード所以 XSS 無し）。

## z-index 序列（§6.6.4）

| 要素 | z-index |
| :--- | :--- |
| DesktopSidebar | `z-40` |
| Header（mobile, sticky） | `z-30` |
| BottomSheet stack | `z-[50]` → `z-[52]` → `z-[54]`（重ね順で 1 段上） |
| BottomNav（mobile） | **`z-[60]`**（Sheet の backdrop が BottomNav 領域を覆わない） |
| 詳細モーダル（ModDetailModalShell） | `z-[70]` |
| ConfirmDialog 等アプリ最上位 | `z-[100]+` |
| ScreenshotGalleryModal | `z-[110]` |

## BottomSheet（`components/BottomSheet.tsx`）

- 共通コンポーネント。`useModalA11y`（Escape + focus trap）再利用。
- 開閉アニメ Anime.js（`translateY 100%→0`）。背景クリック/Escape で close。
- **close 経路 1 本化（§6.6.2）**: URL が変わる操作（`<Link>` 等）は `usePathname` watcher で自動 close。URL 変わらない操作（テーマ切替等）のみ明示 `onClose()`。`<input type=file>` に `onClick={inputRef.click()}` は**無限ループ危険**で書かない（`<label>` 任せ）。
- bottom オフセット: iOS safe-area 対応で inline style `calc(4rem + env(safe-area-inset-bottom,0px))`（`bottomOffsetPx` prop, default 64）。

## スクロール挙動

- Header / BottomNav は**常時表示**（スクロール hide は撤回済 §6.6.5）。
- 詳細モーダル（`variant="modal"`）マウント中は背景スクロール抑止（`ModDetailModalShell` 内の useEffect で `body.overflow=hidden`）。フルページ（`ModDetailPageView`）は**抑止しない**（Phase 10-P3 修正）。
- モーダル多重オープンで `isAnyModalOpen` → body scroll lock。

## 詳細ページ本文スクロール（Phase: 画像修正で追加）

- `ModDetailPageView` の本文: `max-h-[70vh] overflow-y-auto`（長文が無限伸長しないよう、モーダルの `max-h-96` と同思想）。
- ギャラリーは **1 行横スクロール**（`flex + overflow-x-auto + shrink-0`, モーダルと統一）。

## テーマ（CSS 変数）

- `app/globals.css` に `--bg-panel` / `--color-text-brand` 等の CSS 変数で定義。`dark` クラスを `<html>` に付与（`.dark` / `:root`）。
- Tailwind v4 CSS-in-CSS 方式（`@import "tailwindcss"`）。config ファイル無し。

## 関連

- [routing-and-pages.md](./routing-and-pages.md) / [architecture-and-data-flow.md](./architecture-and-data-flow.md)
