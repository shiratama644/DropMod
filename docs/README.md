# DropMod ドキュメント索引

DropMod のドキュメント一式を種類別に整理したものです。ルート `README.md` からアプリの概要へアクセスできます。

---

## 📂 ディレクトリ構造

```
docs/
├── README.md                          ← 本ファイル (全ドキュメントの目次)
├── task-list.md                       ★ タスク管理の唯一の正本 (進捗・証拠)
├── planning/                          # 計画書 (Phase 単位・_TEMPLATE.md 形式 / 実装計画は complete/ 配下)
│   ├── _TEMPLATE.md                   # 計画書テンプレート (新規計画書は必ず本形式)
│   ├── NEXTJS_MIGRATION_PLAN.md       # Vite → Next.js 16 段階的移行計画 (Phase 0-7)
│   ├── ROUTING_REDESIGN_PLAN.md       # URL ルーティング再設計 (型別URL + モーダル/詳細維持 + 詳細ページボタン)
│   ├── FEATURE_FOLDER_PLAN.md         # Feature フォルダ移行 (11 Feature。コード未着手)
│   ├── ARCH3_FEATURE_SLOTS_PLAN.md    # Feature 直下 index.ts 撤去 & 責務別スロット化 (ORG 移行)
│   ├── CODEBASE_ORG_PLAN.md           # コードベース構成整理計画 (src/features 化)
│   ├── SEO_CANDIDATES.md              # SEO 候補レジストリ (2-1〜2-6 は SEO-2/SEO-1 で実施済み)
│   ├── COVERAGE_90_PLAN.md            # カバレッジ 90% 化 (COV-1〜5: テスト/E2E 強化, 2026-09-01)
│   └── complete/                      # 実装された計画書 + 完了レポート (完了フェーズ)
│       ├── PHASE08_PLAN.md            # Phase 8 (Dexie/TSQ/Zustand + テスト土台)
│       ├── PHASE09_PLAN.md            # Phase 9 (AppContext 撤去 + テスト強化 + Profiler)
│       ├── PHASE09_5_PLAN.md          # Phase 9.5 (ランディングページ刷新 + BottomNav 再設計)
│       ├── PHASE10_PLAN.md            # Phase 10 実施計画書 (FontAwesome subset / AppContext 削除 / Image / E2E / shimmer)
│       ├── PHASE10_5_PLAN.md          # Phase 10.5 (Emergency: カバレッジ回復 — vitest 4 対応)
│       ├── PHASE10_CANDIDATES.md      # Phase 10 実施候補と優先度
│       ├── PHASE10_COMPLETE.md        # Phase 10 全 5 サブフェーズ完了レポート
│       ├── PHASE11_PLAN.md            # Phase 11 (Read-only Import & Analysis)
│       ├── PHASE12_PLAN.md            # Phase 12 (Sync & Modrinth Modpack)
│       ├── PHASE12D_FIX_PLAN.md       # Phase 12-D (フォルダ自動紐付け + Modpack 展開/競合解決)
│       ├── PHASE13_PLAN.md            # Phase 13 (SEO。ローカル検証済み。本番目視は延期)
│       ├── PHASE8_COMPLETE.md         # Phase 8 完了 (+ Phase 9 実施結果の追記あり)
│       ├── PHASE9_COMPLETE.md         # Phase 9 全体まとめ
│       ├── PHASE9_C_COMPLETE.md       # Phase 9-C (テスト強化) 単独スナップショット
│       └── PHASE9_PROFILER.md         # Phase 9-D 再レンダー計測レポート
├── audit/                             # 差分・バグ監査
│   ├── diff-vite-vs-nextjs.md         # Vite 版と Next.js 版の全ファイル差分
│   ├── diff-phase8.md                 # Phase 8 実装と計画書との齟齬
│   ├── diff-phase9.md                 # Phase 9 実装と計画書との齟齬
│   ├── issues-legacy.md               # 第 1〜7 波の総合バグリスト (2792+ 行)
│   └── issues-phase9.md               # Phase 9 徹底監査で発見した 39 バグ + 修正状況
└── ops/                               # 運用ドキュメント (デプロイ・CI 実務)
    ├── DEPLOY.md                      # Vercel 本番デプロイ手順チェックリスト
    ├── CI_SETUP.md                    # GitHub Actions セットアップ + 動作確認手順
    └── CI_WORKFLOW.yml                # GitHub Actions ワークフロー (正本は .github/workflows/ci.yml のレプリカ)
```

---

## 🗺️ 用途別リファレンス

### 「まず全体像を把握したい」

| 見る順 | ドキュメント | 内容 |
|---:|---|---|
| 1 | [`../README.md`](../README.md) | アプリ概要、技術スタック、セットアップ |
| 2 | [`task-list.md`](task-list.md) | **タスク管理の正本** (全フェーズの状態・証拠が一覧できる) |
| 3 | [`planning/complete/PHASE11_PLAN.md`](planning/complete/PHASE11_PLAN.md) | 直近完了フェーズ (Read-only Import & Analysis) |

### 「これから開発を継続したい」

| 見る順 | ドキュメント | 内容 |
|---:|---|---|
| 1 | [`task-list.md`](task-list.md) | 次に着手すべきタスクと依存・検証待ち項目の一覧 |
| 2 | [`planning/_TEMPLATE.md`](planning/_TEMPLATE.md) | 計画書テンプレート (新規タスクはこの形式で計画) |
| 3 | [`planning/complete/PHASE12_PLAN.md`](planning/complete/PHASE12_PLAN.md) | **次フェーズ**: Sync (双方向書き込み) & Modrinth Modpack。§12 の設計論点を確定してから着手 |
| 4 | [`planning/complete/PHASE13_PLAN.md`](planning/complete/PHASE13_PLAN.md) | **Phase 13**: SEO（SEO-2/SEO-1 ローカル検証済み。本番目視は延期） |
| 5 | [`planning/SEO_CANDIDATES.md`](planning/SEO_CANDIDATES.md) | SEO 候補レジストリ（実施 DoD は PHASE13_PLAN） |
| 2 | [`audit/issues-phase9.md`](audit/issues-phase9.md) | 未修正の Low 優先度バグ (17 件、実害なしで放置中) |
| 3 | [`audit/diff-phase9.md`](audit/diff-phase9.md) | Phase 9 実装と計画書の意図的な齟齬 (背景理解に有用) |

### 「デプロイしたい / CI を動かしたい」

| ドキュメント | 内容 |
|---|---|
| [`ops/DEPLOY.md`](ops/DEPLOY.md) | Vercel 本番デプロイ手順 (環境変数・DNS・OGP 検証) |
| [`ops/CI_SETUP.md`](ops/CI_SETUP.md) | GitHub Actions 有効化手順 + 配置後の動作確認 |
| [`ops/CI_WORKFLOW.yml`](ops/CI_WORKFLOW.yml) | ワークフロー YAML の参照用レプリカ (正本は `.github/workflows/ci.yml`) |

### 「特定 Phase の詳細を調べたい」

| Phase | 計画書 | 完了レポート | 監査 |
|:---:|---|---|---|
| **8** | [`planning/complete/PHASE08_PLAN.md`](planning/complete/PHASE08_PLAN.md) | [`planning/complete/PHASE8_COMPLETE.md`](planning/complete/PHASE8_COMPLETE.md) | [`audit/diff-phase8.md`](audit/diff-phase8.md) |
| **9** | [`planning/complete/PHASE09_PLAN.md`](planning/complete/PHASE09_PLAN.md) | [`planning/complete/PHASE9_COMPLETE.md`](planning/complete/PHASE9_COMPLETE.md), [`planning/complete/PHASE9_C_COMPLETE.md`](planning/complete/PHASE9_C_COMPLETE.md), [`planning/complete/PHASE9_PROFILER.md`](planning/complete/PHASE9_PROFILER.md) | [`audit/diff-phase9.md`](audit/diff-phase9.md), [`audit/issues-phase9.md`](audit/issues-phase9.md) |
| **1-7** | [`planning/NEXTJS_MIGRATION_PLAN.md`](planning/NEXTJS_MIGRATION_PLAN.md) | (Phase 7 完了時点まで、計画書内に完了マーク) | [`audit/diff-vite-vs-nextjs.md`](audit/diff-vite-vs-nextjs.md), [`audit/issues-legacy.md`](audit/issues-legacy.md) |

---

## 🎯 各フォルダの役割

### `planning/` — 計画書

- **Phase 開始前**に作成する詳細な計画書 (**`_TEMPLATE.md` 形式**: 目的/変更範囲/禁止事項/
  完了条件/テスト方法/停止条件 + 設計詳細/Gotchas/実績。2026-08-27〜)
- 進捗・証拠は `task-list.md` (正本) で管理し、計画書は個別タスクの詳細を担う
- 実装で変更があれば `audit/diff-phaseN.md` に記録される

### `complete/` — 完了レポート

- **Phase 完了時**に作成する事後報告書
- メトリクス (テスト数・カバレッジ・再レンダー数・Bundle サイズなど)、実施した sub-phase、DoD 達成状況を記録
- `PHASE9_PROFILER.md` は Phase 9-D の再レンダー測定に特化した詳細レポート

### `audit/` — 差分・バグ監査

- **計画書 vs 実装** の差分 (`diff-*.md`)
- **発見したバグ・潜在的不具合** のリスト (`issues-*.md`)
- Phase 別に `-phase{N}.md` サフィックスで管理
- `-legacy.md` は Phase 8 以前の総合資料 (履歴として保管)

### `ops/` — 運用ドキュメント

- **デプロイ・CI・本番運用**の手順書
- 変更頻度は低く、実際にデプロイする際に参照する

---

## 📝 命名規約

- **タスクリスト**: `docs/task-list.md` (固定・唯一の正本)
- **計画書テンプレート**: `_TEMPLATE.md` (固定)
- **計画書**: `PHASE{N}_PLAN.md` (例: `PHASE9_PLAN.md`)、または `{TOPIC}_CANDIDATES.md`
- **完了レポート**: `PHASE{N}_COMPLETE.md`、sub-phase 単独レポートは `PHASE{N}_{S}_COMPLETE.md`
- **監査 (差分)**: `diff-phase{N}.md` または `diff-{context}.md`
- **監査 (バグ)**: `issues-phase{N}.md` または `issues-{context}.md`
- **運用**: 大文字スネークケース (例: `DEPLOY.md`, `CI_SETUP.md`)

---

## 🔗 コード側からの参照

一部のソースコード内コメントでドキュメントを参照しています:

| ソース | 参照先 |
|---|---|
| `src/lib/modrinth/server.ts` | `docs/planning/NEXTJS_MIGRATION_PLAN.md` §10.5 (キャッシュ戦略) |

ファイル移動時はこれらの参照も更新してください。

※ 2026-08-27 整理: 削除済みファイルを指す 2 行を除去した。
`components/AppContext.tsx` (Phase 10-B で完全削除) と `biome.json`
(JSON のためコメント参照を持てず、旧 `eslint.config.mjs` も Phase 10-P5 で撤去済み)。

---

## 🔗 予約 URL

| URL | Phase | 用途 |
|---|---|---|
| `/resourcepack` | 11 | Resource Pack ハブ |
| `/shader` | 11 | Shader ハブ |
| `/modpack` | 12 | Modrinth Modpack ハブ |

検索一覧は `/discover/mods` `/discover/resourcepack` `/discover/shader` `/discover/modpack`。
予約 URL を検索へリダイレクトしないこと。
詳細は [`planning/complete/PHASE11_PLAN.md`](planning/complete/PHASE11_PLAN.md) §10.1。

---

*このドキュメント索引は 2026-08-24 のドキュメント整理 (Phase 9-F 後) 時点の構造です。Phase 10 以降で新規追加された場合は本 README を更新してください。*
