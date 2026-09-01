# Phase 14: Material 3 Expressive (M3E) への全面移行と GSAP 導入

> 対応 task-list ID: `M3E-1` 〜 `M3E-6` (docs/task-list.md)
> 計画書テンプレート: docs/planning/_TEMPLATE.md 準拠

## 1. 開始前確認

- 現在のブランチ / HEAD / `git status` を確認する (未コミット変更があれば停止)
- `docs/task-list.md` で依存タスクの完了を確認する
- 関連仕様 (AGENT.md §6 / .agent/skills/) を読む
- 本計画書の §5 (完了条件) と §7 (停止条件) を再読する

## 2. 目的 (Why)

現在の DropMod における UI（Tailwind CSS と独自クラスによる「glass-card」等のデザイン）から、Google の **Material 3 Expressive (M3E)** ベースのデザインへとパラダイムシフトを行い、UI の一貫性とエモーショナルな表現力を強化する。
MUI v9 (Material UI) は標準の Material 3 には対応しているが、Expressive 固有の「バネのようなアニメーション(Spring)」「高クロマな色使い」「大胆なシェイプ」といった表現はまだ標準パッケージとして組み込まれていない。
そのため、**「MUI v9 の堅牢な M3 基盤 (CSS Variables 等) とコンポーネント群を利用しつつ、GSAP による高度な物理ベースアニメーションとテーマのオーバーライドで Expressive の世界観を再現するハイブリッドアプローチ」** を採用する。

また、既存の `animejs` は開発が停滞気味であり、M3E に求められる複雑な Spring (バネ) アニメーションや Morphing (形状変化) の実装には力不足となる懸念がある。これを機に業界標準であり高度なイージングとタイムライン制御を持つ **GSAP (GreenSock Animation Platform)** に全面移行する。

## 3. 変更範囲 (Scope)

変更対象:
- **ライブラリ導入と撤去**:
  - 追加: `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/material-nextjs`, `@mui/icons-material`, `@fontsource/roboto-flex`
  - 完全撤去: `animejs`, `@fortawesome/fontawesome-free` (およびサブセット生成スクリプト)
- **App Router との統合**: `app/layout.tsx` の `AppRouterCacheProvider` によるラッピング。
- **テーマエンジン拡張**: ユーザー設定 (Zustand) からのキーカラー取得と、MUI v9 `createTheme({ cssVariables: true })` を用いた高彩度 (Chroma) パレットの動的生成。
- **アニメーションの刷新**: `src/components` および `src/features` 内で `animejs` を使用している全箇所を `gsap` (および `@gsap/react`) に書き換え。
- **UI の M3E 化**: 全ページの Tailwind 要素を MUI コンポーネントに置換し、Expressive 仕様の Shape (角丸) と Motion を適用。
- **Server/Client 境界の再設計**: MUI コンポーネントは Client Component (`'use client'`) となるため、既存の Server Components で構築されたページ (`app/page.tsx`, `app/[projectType]/[slug]/page.tsx`) のデータ取得層 (Server) と UI 描画層 (Client) の分離。

変更しない (境界外):
- データの永続化層 (Dexie データベースのスキーマやマイグレーションロジック)
- TanStack Query による API キャッシュや Modrinth 通信のコアロジック (UI からの呼び出し方は変わるが通信の裏側は不変)
- `.archive/vite/` (歴史的保存ディレクトリのため絶対不可侵)

## 4. 禁止事項

- `.archive/vite/` ディレクトリ配下のファイルを一切変更しないこと。
- テストを通すためだけに、既存のビジネスクリティカルな動作 (例: 依存チェックの判定ロジック) を改変しないこと。
- MUI コンポーネントに直接非同期の `fetch` を埋め込まないこと (必ず Server Component でデータ取得するか、クライアント側なら TanStack Query 経由で行う)。
- GSAP を React に組み込む際、クリーンアップ漏れによるメモリリークを起こさないこと (原則 `@gsap/react` の `useGSAP` フックを活用する)。
- 不明点は推測で埋めず、§7 の停止条件に従って質問すること。

## 5. 完了条件 (DoD)

- [ ] `animejs` が `package.json` から完全に削除され、既存のアニメーションが GSAP に置き換わっている。
- [ ] FontAwesome 関連スクリプトと CSS が削除され、UI 内のアイコンが Material Icons (`@mui/icons-material`) に置き換わっている。
- [ ] MUI v9 の `AppRouterCacheProvider` と `ThemeProvider` が導入され、クライアント側でキーカラーを変更した際にアプリ全体の色が M3E 仕様 (高彩度) で動的に切り替わる。
- [ ] すべてのページ (Landing, Discover, Detail, Settings) の主要 UI が MUI コンポーネントベースになり、M3E の Expressive な Shape と余白が適用されている。
- [ ] `pnpm typecheck` / `biome lint` / `pnpm test:unit` (Coverage 90% 維持) / `pnpm build` がすべて PASS すること。
- [ ] `docs/task-list.md` の M3E タスクがすべて「完了」になっている。

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | 必須 | Zustand テーマ設定・MUI コンポーネント化に伴う DOM の変更に対して既存テストが落ちないよう追従する。GSAP アニメーション部分はモック化して状態テストに集中する。 |
| Component | 必須 | MUI の ThemeProvider 越しにレンダリングし、a11y (`aria-*` 属性等) が維持されているか検証する。 |
| E2E (Playwright) | 必須 | CI 上で動作させ、M3E 化後も画面遷移・テーマ切替・Mod 追加/削除のフローが壊れていないことを最終確認する。 |
| 実環境 | 必須 | 本番 Build (`pnpm build && pnpm start`) において、MUI の CSS が Next.js 側で正しく SSR / Hydration され、FOUC (チラつき) が起きないか目視確認する。 |

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:
- MUI v9 の App Router 統合機能が現在の Next.js 16 の構成と致命的な非互換を起こし、Build できない場合。
- 既存のテスト数百件を一斉に修正する必要が生じ、段階的なコミットが不可能な状況に陥った場合。
- GSAP の Spring アニメーションのパラメータ (duration, bounce 等) において、ユーザー判断が必要な「手触り」の設計論点に到達した場合。

## 8. 完了時に行うこと

1. 差分を自己レビュー (無関係なリファクタリングが混ざっていないか)。
2. 4 検証 (typecheck / lint / test:unit / build) を実行。
3. `docs/task-list.md` の状態・進捗・証拠を更新。
4. コミットメッセージにタスク ID (例: `feat(M3E-1): ...`) を含める。
5. 証拠中心の完了報告を行う。

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 |
|---|---|---|---|
| M3E-1 | **インフラ整備** | MUI v9, GSAP の導入、AppRouterCacheProvider 構築。animejs / FontAwesome パッケージ撤去 | - |
| M3E-2 | **アニメーションの GSAP 移行** | 既存アニメーション (Marquee, モーダル開閉等) を `@gsap/react` に置き換え | M3E-1 |
| M3E-3 | **M3E テーマエンジン構築** | Zustand 連携による動的 M3 カラースキーム、CSS Variables 化、高彩度パレット化 | M3E-1 |
| M3E-4 | **グローバルレイアウト M3E 化** | Header, BottomNav, Sidebar の MUI 化 (Drawer, BottomNavigation 等) とアイコン置換 | M3E-3 |
| M3E-5 | **各ページの M3E 化** | Landing, Discover (Card 等), Detail Modal, Settings 画面の MUI 置換 | M3E-4 |
| M3E-6 | **E2E 修正と最終クリーンアップ** | 壊れたテストの追従、不必要な Tailwind クラスの剥がし、本番動作 FOUC チェック | M3E-5 |

## 10. 設計詳細・仕様

- **カラーと Chroma (彩度)**: M3E は通常の M3 よりも大胆な色使いを推奨する。動的テーマ生成時に、`@mui/material/colors` や `color-manipulator` を用いて、ユーザー指定色から Primary, Secondary 等を計算する際、彩度を高く保つ補正を入れる。
- **モーションと GSAP**: M3E のモーションは「Spatial Tokens (位置・サイズ・形状変化)」においてオーバーシュート (バネのように行き過ぎて戻る) を許容する。GSAP の `CustomEase` または標準の `back.out`, `elastic.out` を活用し、「Expressive (遊び心とダイナミック)」な手触りを演出する。
- **Roboto Flex**: バリアブルフォントである Roboto Flex を利用し、見出し (h1, h2) では `wdth` (幅) や `wght` (ウェイト) を調整し、M3E 特有のタイポグラフィの強弱をつける。

## 11. リスク・Gotchas

- **RSC (Server Components) の分割地獄**: MUI のコンポーネント ( `<Button>` 等) は Client Component であるため、Server Component 側から直接呼び出す際に `'use client'` 宣言を適切に境界ファイル (`*Client.tsx` や `*View.tsx`) に置かなければならない。これまでの Tailwind では HTML タグを出力するだけだった箇所が、全て分割の対象となる可能性がある。
- **Zustand × MUI Theme の Hydration ミスマッチ**: サーバー側でレンダリングする色 (デフォルト) とクライアントに保存された色 (Zustand 永続化) が異なるとエラーになる。MUI v9 の `InitColorSchemeScript` または CSS Variables の機能を活用し、Hydration エラーを防ぐ必要がある。
