# UI Layout — PC / Mobile / Modal

> ヘッダー・サイドバー・BottomNav・モーダル・レイアウト崩れ を触る時に読む。

## 🎨 アクションボタン デザインルール (2026-08-27 ユーザー指定・恒久ルール)

**モバイル UI の主操作 (プライマリーボタン) は「右端」に配置する** (iOS/Android 共通の標準)。

並び順 (左 → 右):
1. **閉じる / 戻る** — テキスト or ダークグレー (`theme-sub-box`) の目立たないボタン
2. **詳細 / ダウンロード等の補助操作** — 枠線 (アウトライン) またはダークグレー
3. **主操作 (追加系)** — 鮮やかな緑の塗りつぶし (`bg-emerald-600`) を**右端に 1 つだけ**

視認性の 3 ルール:
1. **高さ・幅の統一**: 同一行のアクションは高さを揃える (モバイル `h-11` = 44px、
   ページ CTA は `h-12` = 48px)。同格ボタン 3 つは等幅 (`flex-1 min-w-0` +
   `max-w-*` キャップ) で均等に並べる。
2. **色数を減らし主役を 1 つ**: 緑の塗りつぶしは主操作のみ。その他は
   `theme-sub-box` / `glass-card` 枠線に統一。**青系 (bg-blue-600) の CTA は使わない**。
3. **テキストは簡潔に** (1 行 4 ボタン前提):
   - 詳細ページ →「詳細」/ .jar 直DL →「DL」or「ダウンロード」/
     ＋プロファイルに追加 →「＋ 追加」(プラスアイコン + 「追加」)
   - 視覚テキストを短くし、**aria-label に正式名称** (「プロファイルに追加」等) を付与して
     アクセシビリティを担保する (E2E も aria-label 経由で参照できる)。

適用済み (2026-08-27): `ModDetailModalShell` フッター (閉じる/詳細/DL/追加)、
`ModDetailPageView` ヒーロー CTA (Modrinth/ダウンロード/追加)、`ModCard` の
追加/追加済みボタン (両状態で同寸 h-9・min-w-[7rem] に統一 = 追加時にカード寸法が変わらない)。

## テキストコントラスト (2026-08-27)

- `--text-muted` (説明文・作者名等): dark は **#a9b7c9** (実効背景比 7.40:1)、
  light は **#64748b** (4.55:1)。light をこれ以上明るくすると WCAG AA (4.5:1) を割るため
  現状維持。「グレーが暗い」報告はほぼ dark テーマの低輝度環境。
- カテゴリバッジ (ModCard): `whitespace-nowrap shrink-0` で**縦折り返し禁止**。
  「ライブラリ」等の日本語タグが 1 カラム幅のカードで縦に崩れるのを防ぐ。

## 検索一覧の表示形式 (2026-08-27 改定)

- 選択肢は **最大 (ヘッダー画像あり) / 1 / 2 / 3 カラム** の 4 つ。
  **「自動」(アスペクト比再配置) は廃止** (`autoCardSpanClass` 等も削除済み)。
- **2 / 3 カラムはモバイルでもそのまま適用** (grid クラスに sm: prefix を付けない。
  Modrinth と同じ挙動)。旧実装は `sm:grid-cols-2` のためモバイルで常に 1 カラムになる
  バグがあった。
- **モバイルの 3 カラムは compact カード** (`ModCard` が `useIsMobile()` で切替):
  aspect-square アイコン + line-clamp-2 タイトル + DL 数 + 全幅 h-7 追加ボタンの
  最小構成。PC 版カードの縮小ではなく独自 UI (スマホでも 3 カラムするため)。
- 「最大」のヘッダー画像は `h-44 sm:h-60` で大きく表示。
- `hooks/useMediaQuery.ts`: SSR/jsom-safe な media query hook (`useIsMobile`)。

## ガラス表現 (glass-panel) の方針 (2026-08-27)

- **`.glass-panel` / dropdown に `backdrop-filter` は使わない**。GPU のない環境 (PRoot / software rendering・低スペック端末) で再合成のたびに「白く一瞬光る」フラッシュが起きるため削除済み。`--bg-panel` の不透明度 (dark 0.92 / light 0.96) で視覚を維持。
- **`backdrop-filter` / `backdrop-blur-*` は全廃済み (2026-08-27)**。モーダルオーバーレイ・BottomSheet・OfflineBanner からも削除。GPU のない環境での白フラッシュは完全に解消するまで残っていたため。新規 UI でも使わないこと。

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
