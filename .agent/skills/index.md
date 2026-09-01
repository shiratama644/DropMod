# Skills Index — DropMod コードベース知識

> このファイルは `.agent/skills/` の**入口**。タスク着手時に本ファイルだけ読み、
> 必要なスキルだけをピンポイントで読み込む（コンテキストの無駄遣いを防ぐ）。
> 各スキルは「このコードベースの *事実/仕様/暗黙了解*」をまとめたもの。
> 作業規約（コミット手順・Lint 等）は `AGENT.md` を参照。

## 読み方ガイド（どの状況でどのスキルを読むか）

| 状況 | 読むスキル |
| :--- | :--- |
| 初回 / 全体把握 | [`project-overview.md`](./project-overview.md) → [`architecture-and-data-flow.md`](./architecture-and-data-flow.md) |
| State / Store / プロファイル操作を触る | [`state-and-storage.md`](./state-and-storage.md) |
| Modrinth API / 検索 / 詳細 / プロキシ を触る | [`modrinth-integration.md`](./modrinth-integration.md) |
| 画像・アイコン・GIF・Markdown 画像 を触る | [`image-strategy.md`](./image-strategy.md) |
| ルーティング / URL / ページ追加 を触る | [`routing-and-pages.md`](./routing-and-pages.md) |
| フォルダ/ZIP 取り込み・環境検出 (Phase 11) / **Sync・Diff Engine (Phase 12)** を触る | [`env-import.md`](./env-import.md) |
| セキュリティヘッダー / APP_PROFILE / ロガー / レート制限 を触る | [`app-profile.md`](./app-profile.md) |
| ヘッダー / サイドバー / BottomNav / モーダル / レイアウト崩れ | [`ui-layout.md`](./ui-layout.md) |
| テスト / カバレッジ / msw / E2E を触る | [`testing.md`](./testing.md) |
| 「動かない / 重い / フォーマット効かない」環境トラブル | [`sandbox-constraints.md`](./sandbox-constraints.md) |

## スキル一覧

| ファイル | 概要 | 最終更新 |
| :--- | :--- | :--- |
| [project-overview.md](./project-overview.md) | 製品概要・技術スタック・フェーズ進捗（0–13）。最初に読む。 | 2026-08-31 |
| [architecture-and-data-flow.md](./architecture-and-data-flow.md) | RootLayout→AppShell→Zustand→Dexie→TSQ→Modrinth の全体レイヤとデータフロー。 | 2026-08-31 |
| [state-and-storage.md](./state-and-storage.md) | Zustand store 設計・appActionsStore（Server→Client 制約）・ProjectItem データモデル・**Dexie v3（managedFiles / dirHandles）**・LocalStorage 移行・cookie。 | 2026-08-31 |
| [modrinth-integration.md](./modrinth-integration.md) | server.ts/client.ts・キャッシュ TTL・レート制限 (429 backoff + breaker)・バッチ・slim version・プロキシ Route Handler。 | 2026-08-31 |
| [image-strategy.md](./image-strategy.md) | ⭐ 画像の高速化・高画質化の方針（unoptimized / raw_url / ネイティブ img）。直近で確立した重要知見。 | 2026-08-31 |
| [routing-and-pages.md](./routing-and-pages.md) | URL 設計（2026-08-24 再設計後：検索複数形/詳細単数形型別/モーダル/詳細の4責務）。SEO-2 noindex。 | 2026-08-31 |
| [env-import.md](./env-import.md) | Import 基盤（EnvironmentSource / Detector chain / Analyzer + SHA-1 Worker / Analysis / ZIP fallback）+ **Phase 12-A の Sync 基盤（ManagedFileRecord / `computeSyncPlan`）**。 MojoLauncher (mojo_instance.json) 検出含む。 | 2026-08-31 |
| [app-profile.md](./app-profile.md) | APP_PROFILE (production/development) による CSP/HSTS/レート制限/ログ切替。.env は next.config 評価前にロードされる点、headers は build 時確定する点。 | 2026-08-31 |
| [ui-layout.md](./ui-layout.md) | 🎨 アクションボタン設計ルール (主操作右端・緑 1 色のみ) / 検索表示形式 (モバイル 3 カラム compact) / PC サイドバー / BottomNav / z-index / モーダル / glass 方針 (backdrop-blur 全廃)。 | 2026-08-31 |
| [testing.md](./testing.md) | vitest+msw+fake-indexeddb・browserApi stub 基盤・per-module カバレッジ・E2E（CI のみ）。COV-90 計画で exclude 整理済み。 | 2026-09-01 |
| [sandbox-constraints.md](./sandbox-constraints.md) | Sandbox/Vercel Hobby/GitHub App の制約と迂回策 (webpack キャッシュ条件含む、AGENT.md §6 の実態版)。 | 2026-08-31 |

## 運用ルール

- スキルを更新したら**必ず本 index.md の「最終更新」も更新**する。
- 新スキル追加時は「読み方ガイド」と「一覧」の両方に追記する。
- AGENT.md と重複する作業規約はスキルに書かず AGENT.md を正とする（スキルは*事実/仕様*中心）。
- ファイル名は `kebab-case.md`。
