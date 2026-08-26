# Project Overview — DropMod

> 製品の全体像。新規セッションの最初に読む 1 ファイル。

## 製品

**DropMod** は [Modrinth API](https://docs.modrinth.com/) から Minecraft の Mod / Resource Pack / Shader / Modpack を検索・ダウンロード・**プロファイル単位で構成管理**する Web アプリ。

- リポジトリ: `shiratama644/DropMod`（public, MIT）
- `package.json`: `dropmod` v1.1.0 / "Minecraft Mod プロファイルマネージャ (Next.js 16 App Router + Modrinth API)"
- デプロイ先: **Vercel（Hobby 前提）※まだ本番デプロイ未実施**（全 Phase 完了後の最終ステップ）

## 主な機能

- Mod 横断検索（人気/更新/カテゴリ/MC バージョン/Loader 絞り込み・無限スクロール）
- Mod 詳細（モーダル = Intercepting Routes／フルページ = ISR＋OGP）
- プロファイル CRUD・複製・切替
- Mod トグル（追加/削除）・バージョン切替
- ZIP エクスポート（mods フォルダ直置き用）／インポート（`.mrpack`）
- 依存関係チェック（欠落/競合検知）
- テーマ切替（dark/light, FOUC 対策済）・オフライン対応（Dexie キャッシュ）

## 技術スタック

| 層 | 技术 |
| :--- | :--- |
| FW | Next.js **16.3.2** App Router (Turbopack) / React **19.2.8** / TS 5 (`strict` + `noUncheckedIndexedAccess`) |
| Style | Tailwind **v4** (CSS-in-CSS, PostCSS) + CSS 変数テーマ |
| State | **Zustand 5**（7 store, `subscribeWithSelector` + `devtools`） |
| Server state | **TanStack Query 5** + Dexie persister |
| Storage | **Dexie 4**（IndexedDB）＋ LocalStorage 7 日バックアップ |
| UI 補助 | GSAP（Toast/Dropdown）・Anime.js v4（LP）・FontAwesome 7（**subset 化**） |
| Markdown | react-markdown 10 + remark-gfm + rehype-raw/sanitize |
| 圧縮 | JSZip 3 |
| Lint | **Biome 2.5**（ESLint 撤去済, formatter 無効） |
| Test | Vitest 3 + jsdom + @testing-library/react 16 + user-event + **msw 2.15** + fake-indexeddb |
| E2E | Playwright 1.62（Chromium 単独） |
| Pkg | pnpm 11.24 (corepack), Node ≥20（`.nvmrc`=24, LTS） |

## フェーズ進捗（現在 = Phase 10 完了直後）

| Phase | 内容 | 状態 |
| :--- | :--- | :--- |
| 0–7 | Vite+Hono → Next.js 16 移行（ISR / Parallel+Intercepting / Route Handlers） | ✅ |
| 8 | Dexie + TSQ + Zustand + テスト土台 + CI | ✅ |
| 9 | AppContext 撤去 + operationsStore 分割 + msw + カバレッジ 91% | ✅ |
| 9.5 | LP 刷新 + BottomNav 再設計 + **PC UI 一新（DesktopSidebar）** | ✅ |
| 10 | FontAwesome subset(-356KB) / AppContext 完全削除 / Markdown Image / E2E 拡張 / shimmer | ✅ |
| **11** | ローカル Minecraft 環境 Import & Analysis（**Read-only 絶対原則**） | ⏳ 計画済 |
| 12 | Sync（双方向書込）+ Modrinth Modpack（安全機構付き） | ⏳ |
| 13 | CurseForge 完全対応（Murmur2） | ⏳ |
| 最終 | Vercel 本番デプロイ（Hobby 制約のため全 Phase 後） | ⏳ |

## 規模（目安）

`app/` ~2.6k 行 / `components/` ~8.7k / `lib/` ~3.3k / `hooks/` ~2.3k / `__tests__/` 373 tests / `e2e/` 8 spec。
最大ファイル: `DependencyCheckModal.tsx`(871)・`useProfiles.ts`(818)・`ModDetailPageView.tsx`(676)。

## 関連

- 作業規約・コミット手順・Lint 検証: `AGENT.md`
- ドキュメント: `docs/`（planning/complete/audit/ops）— 詳細仕様はそちらが正
- 詳細アーキテクチャ: [architecture-and-data-flow.md](./architecture-and-data-flow.md)
