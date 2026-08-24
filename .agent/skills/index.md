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
| ヘッダー / サイドバー / BottomNav / モーダル / レイアウト崩れ | [`ui-layout.md`](./ui-layout.md) |
| テスト / カバレッジ / msw / E2E を触る | [`testing.md`](./testing.md) |
| 「動かない / 重い / フォーマット効かない」環境トラブル | [`sandbox-constraints.md`](./sandbox-constraints.md) |

## スキル一覧

| ファイル | 概要 | 最終更新 |
| :--- | :--- | :--- |
| [project-overview.md](./project-overview.md) | 製品概要・技術スタック・フェーズ進捗（0–13）。最初に読む。 | 2026-08-24 |
| [architecture-and-data-flow.md](./architecture-and-data-flow.md) | RootLayout→AppShell→Zustand→Dexie→TSQ→Modrinth の全体レイヤとデータフロー。 | 2026-08-24 |
| [state-and-storage.md](./state-and-storage.md) | Zustand 7 store 設計・appActionsStore（Server→Client 制約）・Dexie 3 テーブル・LocalStorage 移行・cookie。 | 2026-08-24 |
| [modrinth-integration.md](./modrinth-integration.md) | server.ts/client.ts・キャッシュ TTL・レート制限・バッチ・slim version・プロキシ Route Handler。 | 2026-08-24 |
| [image-strategy.md](./image-strategy.md) | ⭐ 画像の高速化・高画質化の方針（unoptimized / raw_url / ネイティブ img）。直近で確立した重要知見。 | 2026-08-24 |
| [routing-and-pages.md](./routing-and-pages.md) | URL 再設計（Phase 9-F）・リダイレクト・Intercepting Routes・/discover・予約 URL。 | 2026-08-24 |
| [ui-layout.md](./ui-layout.md) | PC サイドバー / モバイル Header+BottomNav / z-index 序列 / body 余白 / モーダル。 | 2026-08-24 |
| [testing.md](./testing.md) | vitest+msw+fake-indexeddb・per-module カバレッジ・E2E（CI のみ）。 | 2026-08-24 |
| [sandbox-constraints.md](./sandbox-constraints.md) | Sandbox/Vercel Hobby/GitHub App の制約と迂回策（AGENT.md §6 の実態版）。 | 2026-08-24 |

## 運用ルール

- スキルを更新したら**必ず本 index.md の「最終更新」も更新**する。
- 新スキル追加時は「読み方ガイド」と「一覧」の両方に追記する。
- AGENT.md と重複する作業規約はスキルに書かず AGENT.md を正とする（スキルは*事実/仕様*中心）。
- ファイル名は `kebab-case.md`。
