# DropMod タスクリスト (唯一の正本)

> **運用規則** — Qiita「Claude Code／Codex に中〜大規模開発を任せるためのタスク管理」
> (<https://qiita.com/Y-Y-dev/items/d526fb7cdbe35a3f9384>) に基づく運用 (2026-08-27 導入)。
>
> 1. **本ファイルが進捗管理の唯一の正本**。チャット・Issue・AI の完了報告と本ファイルが
>    矛盾する場合は本ファイルを正とする (§ AGENT.md 6.9)。
> 2. **進行中タスクは原則 1 件**。複数を同時に進めない (独立性の高い調査・テストを除く)。
> 3. **タスク ID は再利用しない**。中止したタスクは行を消さず「対象外」にして理由を残す。
> 4. **作業中に見つけた新問題は新タスクとして登録**し、現在のタスクへ混ぜない
>    (現在の完了条件に必須の場合のみ例外)。
> 5. 完了は **AI の自己申告ではなく証拠で判定**する (テスト件数 / コミット SHA / PR / 実測値)。
> 6. 個別タスクの詳細 (目的・変更範囲・禁止事項・完了条件・テスト方法・停止条件) は
>    `docs/planning/*_PLAN.md` (計画書テンプレート `_TEMPLATE.md` 準拠) に書く。
>
> **状態の定義**: `未着手` / `調査中` / `実装中` / `ローカル検証済み` /
> `実環境検証待ち` (デプロイ先・実機での確認が残る) / `完了` / `保留` (外部判断待ち) /
> `対象外` (中止・不採用。理由を残す)

---

## 未完了サマリー (2026-08-30 ソース + 計画書突合)

> 計画書と task-list の食い違い: `PHASE12_PLAN.md` §13 は P12-B / P12-C を「未着手」と
> 残しているが、**ソースでは実装済み**。正本は本ファイル。`PHASE12D_FIX_PLAN.md` §12
> の実績表は D1/D2 までで、D3/D1B は未記入だがソース・本表ではローカル検証済み。
> 「完了」誤記は見つからず。実装済みなのに「未着手」だったのは計画書側のみ。

| ID | 状態 | 残作業 |
|---|---|---|
| P12-B | 実環境検証待ち (実装 90%) | 実機 Chromium で Direct Write + Transaction/Backup/Rollback |
| P12-C | 実環境検証待ち (実装 90%) | 実機 Firefox/Safari で ZipSink Sync |
| P12-E2E | 再検証待ち (90%) | CI `workflow_dispatch` で成功/失敗/復帰の再実行 |
| P12-D1 / D1B / D2 / D3 | ローカル検証済み | 実機でのフォルダ紐付け・Modpack 展開・Preview 競合はユーザー確認 (AI 実装はソース上完了) |
| P13-A / P13-B | 対象外 | CurseForge 計画を `.archive/docs/planning/PHASE13_PLAN.md` へ退避 (2026-08-30)。Phase 13 は SEO |
| UIP-5 | 実環境検証待ち | Samsung Internet 実機でモーダル途切れないこと |
| SEC-1 / VER-2 | 実環境検証待ち | 本番相当で YouTube / CDN 画像 / API |
| SEO-2 | ローカル検証済み | 実装済み `080ede1`。本番 meta robots 目視はユーザー延期 |
| SEO-1 | ローカル検証済み | 実装済み `52bf0b9`。本番 JSON-LD / OG 目視はユーザー延期 |
| DEPLOY-1 | 未着手 | P12-C 完了後。CurseForge (旧 P13) はアーカイブ済み |
| ARCH-1 | 計画済み（11 Feature に再構築） | コード移動は ARCH-1A Go 待ち |

進行中の AI 実装タスクは **なし**。SEO コードはローカル完了。次の計画済み作業は `ARCH-1A`（Go 後）。

---

## フェーズタスク

### Next.js 移行 (Vite + Hono → Next.js 16)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P0 | Vite 並行稼働基盤 (プロジェクト初期化) | 完了 | 100% | - | Next.js 16 App Router が起動 | PR #1 (2026-08-20 マージ) |
| P1 | UI コンポーネント移植 (Tailwind v4) | 完了 | 100% | P0 | 主要画面が Next 側で描画 | PR #1 |
| P2 | 状態管理移植 (LocalStorage) | 完了 | 100% | P1 | プロファイル CRUD が動作 | PR #1 |
| P3 | Modrinth API 層移植 | 完了 | 100% | P2 | 検索・詳細が動作 | PR #1 |
| P4 | Modal Route (Parallel + Intercepting) | 完了 | 100% | P3 | モーダル/フルページ二重 URL | PR #1 / NEXTJS_MIGRATION_PLAN §6 |
| P5 | Hono → Route Handlers 置換 | 完了 | 100% | P3 | /api プロキシが同一仕様 | PR #1 / NEXTJS_MIGRATION_PLAN §8 |
| P6 | SEO / OGP / sitemap | 完了 | 100% | P4 | メタデータ・サイトマップ生成 | PR #1 |
| P7 | Vercel 設定 + 旧 Vite の .archive 退避 | 完了 | 100% | P6 | vercel.json / .archive/vite | PR #1 |

※ P0〜P7 の詳細仕様は `NEXTJS_MIGRATION_PLAN.md` (§9 ロードマップ)。個別 SHA は
PR #1 (2026-08-20) マージ前に集約。**本番 Vercel デプロイは Phase 13 完了後**
(P10-CANDIDATES の方針を継承 → `DEPLOY-1`)。

### Phase 8: パフォーマンス・オフライン化 (2026-08-23 計画)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P8-A | Dexie (IndexedDB) 化 + LocalStorage 移行 | 完了 | 100% | - | profiles テーブル + 7 日バックアップ | PHASE8_COMPLETE.md |
| P8-B | TanStack Query + Dexie persister | 完了 | 100% | P8-A | apiCache テーブル + 24h TTL | PHASE8_COMPLETE.md |
| P8-C | Zustand 段階移行 (4 slice) | 完了 | 100% | P8-A | lib/store/ 4 slice + shim | PHASE8_COMPLETE.md |
| P8-D | テスト導入 + CI (msw 含む) | 完了 | 100% | P8-C | vitest + msw + CI ワークフロー | PHASE8_COMPLETE.md / docs/ops/ |
| P8-E | 小改善バンドル (CSP Report-Only 等) | 完了 | 100% | - | 各改善の動作確認 | PHASE8_COMPLETE.md |

### Phase 9: テスト・品質強化 + アーキテクチャ青写し (2026-08-23 計画)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P9-A | AppContext 撤去 + Zustand 直接参照化 | 完了 | 100% | P8-C | useAppContext 消費者 0 件 | PHASE9_COMPLETE.md |
| P9-B | operationsStore 3 分割 (zip/depCheck) | 完了 | 100% | P9-A | 7 slice 構成 + shim hooks | PHASE9_COMPLETE.md |
| P9-C | テスト強化 (coverage 60% 達成) | 完了 | 100% | P9-A/B | 275 tests / stmts 91.34% | PHASE9_C_COMPLETE.md |
| P9-D | 再レンダー検証 (profiler) | 完了 | 100% | P9-A/B | before/after 数値記録 | PHASE9_PROFILER.md |
| P9-E | 小改善バンドル (キャッシュバッジ等) | 完了 | 100% | - | E-2 バッジ表示 | PHASE9_COMPLETE.md |

### Phase 9.5: ランディングページ刷新 + BottomNav 再設計 (2026-08-24)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P95-A | BottomSheet 共通化 + BottomNav 3 タブ化 | 完了 | 100% | - | 4 タブ → 3 主タブ + sheet 2 種 | PR #2 (67e10b6) |
| P95-B | Header 条件付き非表示 + LP 骨組み | 完了 | 100% | P95-A | LP (/) で Header 非表示 | PR #2 |
| P95-C | Hero + スクロール演出 (useScrollReveal) | 完了 | 100% | P95-B | 7 セクション + stagger | PR #2 |
| P95-D | コンテンツ充実 + a11y 総点検 | 完了 | 100% | P95-C | 文言・SS・CTA 確定 | PR #2 |
| P95-X | ~~Three.js 3D Hero~~ | 対象外 | - | - | GSAP/Anime.js で十分 + bundle | 計画 §3 から 2026-08-24 に不採用 (軽量方針) |

### ルーティング再設計 (2026-08-24)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| ROUTE-1 | URL 再設計 (型別 URL + モーダル維持) | 完了 | 100% | - | DoD 10 項目 (計画書 §11) | `bd05b9b` |

### Phase 10: 品質・パフォーマンス仕上げ (2026-08-23〜24)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P10-A | FontAwesome subset 化 | 完了 | 100% | - | bundle 900 KB 台 | `8f69c76` (-356 KB) |
| P10-B | AppContext.tsx 完全削除 | 完了 | 100% | - | ファイル消滅 | `8e394a9` (-84 LOC) |
| P10-C | Markdown 内 `<Image>` 化 | 完了 | 100% | - | Modrinth CDN 画像の Image 化 | `4b4e5ee` |
| P10-D | E2E カバレッジ拡張 (+3 spec) | 完了 | 100% | - | zip-import/export/dep-check spec | `817cb2e` |
| P10-E | shimmer skeleton | 完了 | 100% | - | animate-pulse 置換 | `f59010e` |
| P10-DOOR | Phase 10 全体の完了レビュー | 完了 | 100% | A-E | PHASE10_COMPLETE.md 記録 | docs/complete/PHASE10_COMPLETE.md |

### Phase 10.5 (Emergency): カバレッジ回復 (2026-08-26)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P105-T | vitest 3 → 4 アップグレード | 完了 | 100% | - | 4.1.11 で全 test pass | `ccd5f98` |
| P105-A | browser API mock 基盤 + hooks 3 種 | 完了 | 100% | P105-T | hooks branches 60% 超 | `57d5bc9` |
| P105-B | 軽量 components 10 ファイル | 完了 | 100% | P105-A | components stmt 60% 超 | `115e44b` |
| P105-C | confirm.ts cleanup 分岐 | 完了 | 100% | P105-B | 全 threshold green | `29469c7` |
| P105-D | BottomSheet 本体テスト | 対象外 | - | - | (任意扱い。E2E で担保の方針) | 計画 §3-D「必須ではない」 |
| P105-E | server 層テスト (loadDiscoverSearch 等) | 対象外 | - | - | (任意扱い。Phase 12 計画時に再検討) | 計画 §3-E「任意」 |

### Phase 11: ローカル環境 Import & Analysis (Read-only) (2026-08-26)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P11-FIX | build 時 429 フラッド対策 (事前生成削減) | 完了 | 100% | - | build で全面 429 にならない | `c47b3db` |
| P11-A | ProjectItem モデル + Dexie v2 migration | 完了 | 100% | - | 型・sanitize・全アクセス置換 + テスト | `547f40c` |
| P11-B1 | EnvironmentSource 抽象 + picker | 完了 | 100% | P11-A | FileSystemSource + read モード picker | `1c43693` |
| P11-B2 | Detector chain (Official/Prism/Generic) | 完了 | 100% | P11-B1 | mmc-pack.json 解析を含む 3 検出器 | `b3f8d40` |
| P11-B3 | Analyzer (SHA-1 Worker + Modrinth 照合) | 完了 | 100% | P11-B2 | 3 カテゴリ照合 + 検証 6 項目 | `a2f44ba` |
| P11-B4 | MojoLauncher (`mojo_instance.json`) 検出 | 完了 | 100% | P11-B2 | versionId (Fabric/Quilt/Forge/NeoForge) → env 解析 + ZIP 判定 + UI ラベル | `5998a21d` 当初実装 / 名称修正・5 形式対応・単一関数化は P11-B7 / 当時の unit test 10 件追加・1226 tests green |
| P11-B5 | バージョン対応の事実確認 (NeoForge 旧/新形式 + Forge) | 完了 | 100% | P11-B4 | web 検索で一次情報 (FTB Wiki / files.minecraftforge.net) から確定し、コードコメント・テストへ反映 | `mcVersionFromNeoForge` を新形式 (26.x) 対応に修正・検証ソースをコメント明記 / detector.test 36 件 |
| P11-B6 | Detector 登録レジストリ + 共通基底 (他ランチャー追加の容易化) | 完了 | 100% | P11-B5 | ランチャー追加 = registry.ts へ 1 エントリ (chain・UI ラベル自動導出 / InstanceFileDetector 基底で JSON 定義形式は parse のみ) | DETECTOR_REGISTRY / createDetectorChain / rootTypeLabel / InstanceFileDetector + 注入テスト / unit 1231 tests green |
| P11-B7 | Modrinth App → MojoLauncher 名称修正 + versionId 単一関数化 | 完了 | 100% | P11-B6 | ユーザー指摘: 対応対象は Modrinth App ではなく MojoLauncher。MojoLauncher 公式リポジトリ (v3_openjdk) を直接確認し `Instances.java:43` / `ModLoader.java getVersionId()` で裏付け。`mcVersionFromNeoForge` を廃止し宣言テーブル + 単一関数 `parseVersionId` に統合。Legacy Fabric (`legacy-fabric-loader-…`) 追加 (Fabric として扱う) | `modrinthApp.ts` → `mojoLauncher.ts` / rootType `modrinth-app` → `mojo-launcher` (旧はレガシーラベル保持) / `VERSION_ID_FORMATS` 5 形式 / unit 1232 tests green / 4 検証 pass |
| P11-C1 | Import UI 統合 (NewProfileModal 解析) | 完了 | 100% | P11-B3 | Analysis View + 名前自動生成 | `b6a5a54` |
| P11-C2 | ZIP フォールバック (.minecraft ZIP) | 完了 | 100% | P11-C1 | Firefox/Safari で取り込み可 | `b6a5a54` |
| P11-E2E | E2E spec 2 種 + ドキュメント | 完了 | 100% | P11-C2 | **CI 上で E2E green** | `c0d13f8` + spec 修正 `1508a6e` / run `33071105483` 全 green |

### Phase 12: Sync & Modrinth Modpack (Read/Write) — 進行中

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P12-A | linkedSource + ManagedFile + Diff Engine | 完了 | 100% | P11-E2E | computeSyncPlan の unit test 全分類 | `lib/env/diff.ts` / `managed.ts` / Dexie v3 (`managedFiles`/`dirHandles`)。5 分類 + fingerprint unchanged。**2026-08-30 ソース確認済** |
| P12-B | Preview UI + Transaction + Executor + Rollback | 実環境検証待ち | 90% | P12-A | **実機 Chromium で Direct Write が Transaction + Backup + Rollback 付きで動作** | **実装はソース上完了** (2026-08-30): Dexie v4 `syncTransactions` / `executeSync` / `backup.ts` (UNDO_KEEP_COUNT=3) / `applySync` / `recovery` / `undo` / `SyncPreviewModal` / `InterruptedSyncDialog` (D-4) / `SyncHistorySection` / `environmentCheck` (D-1) / `FileSystemSink`。`4886245` ほか。**未完了は実機確認のみ** |
| P12-E2E | Sync の E2E spec (成功 / 失敗 / 復帰) | **再検証待ち** (手動 run で 成功系 PASS 済み) | 90% | P12-B | CI 上で mock handle 経由の Sync 成功/失敗/復帰が green | `e2e/sync.spec.ts` 存在確認 (2026-08-30)。run `33245015014` DIAG → 修正 `ab5fd0b3` → 手動 `33246962952` 成功系 PASS / 失敗系パス修正 `926c279f`・**要 CI 再実行 (workflow_dispatch)** |
| P12-C | ZipSink + ModrinthProvider + .mrpack | 実環境検証待ち | 90% | P12-B | **Firefox/Safari で ZipSink 経由の Sync が動作** | **実装はソース上完了** (2026-08-30): `lib/env/sink/zip.ts` / `mrpack.ts` / `modpack.ts` (CF 検出のみ) / `modpackUpdate.ts` / `lib/providers/modrinth.ts` / `ModpackHubClient` (`promoteModpackRecords` = D-6) / `useZipSync`。`db648c2`〜`b462bfa`。**未完了は実機 Firefox/Safari 確認のみ** |

※ **Phase 12 の設計論点は 2026-08-27 / 08-29 に確定済み**（`PHASE12_PLAN.md` §12 の D-1〜D-10）。着手を妨げる未確定事項は無い。
※ `PHASE12_PLAN.md` §13 の「P12-B/C 未着手」は **陳腐化**。実装有無は本表とソースを正とする。

### Phase 12-D: ユーザー報告バグ 3 件修正 (2026-08-29)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P12-D1 | 新規プロファイル作成モーダルのフォルダ選択 → **自動紐付け** + 台帳 seed (bug 1/2) | ローカル検証済み | 100% | P12-B | フォルダ選択して作成した Profile に `linkedSource` + `dirHandles` が保存され、ボタンが Sync に置換・ZIP 保存は設定ページのみ。§10.5 の artifact 台帳 seed 含む | `1709704` / typecheck・biome・unit 1176 passed・build pass |
| P12-D2 | Discover からの Modpack 追加 = 内容展開 + インポート時競合解決 UI (bug 3) | ローカル検証済み | 100% | P12-D1 | Modpack 追加時に `modrinth.index.json` の files[] を ProjectItem 展開。Profile 内の同一 projectId・別 versionId を競合として選択 UI (既定=ユーザー版)。`modpackSource` に projectId/versionId/**lockedVersions** を保存。overrides は source:modpack で台帳化 | `ac26e29` / typecheck・biome・unit 1196 passed・build pass |
| P12-D3 | Sync Preview の競合 (D-3) 検出・適用 (ロック情報の活用) | ローカル検証済み | 100% | P12-D2 | `lockedVersions` (導入時の指定) と Profile の現在値を突き合わせ (versionId 無→非競合 / 一致→非競合 / 相違→競合)、SyncPreviewModal に競合セクション (既定 = ユーザー版) を表示。replace 選択時は Profile をロック版へ復元して plan 再計算・Sync 適用 (completed 時のみ反映)。`ModpackLockedVersion` を実体情報 (fileUrl/filename/sha1/size/path) に拡張 | `c7f8db8` / docs `cfaa0f1` / typecheck・biome・unit 1216 passed・build pass |

| P12-D1B | 設定ページ「環境との同期」の紐付けでも台帳 seed | ローカル検証済み | 100% | P12-D1 | `useEnvironmentLink.link()` 成功時に §10.5 の artifact 台帳 seed (expandProfileToManaged + merge + syncManagedFiles) を実行。新規作成 (D1) と同じ整合性。失敗は warning のみ (紐付けは成功扱い) | `c7f8db8` / docs `cfaa0f1` / typecheck・biome・unit 1216 passed・build pass |

### Phase 13: SEO 改善 (2026-08-30 再定義)

> 旧 Phase 13 (CurseForge) はユーザー指示で
> `.archive/docs/planning/PHASE13_PLAN.md` へ退避。ID `P13-A` / `P13-B` は再利用せず対象外。
> 実施計画の正本: `docs/planning/PHASE13_PLAN.md`（候補表は `SEO_CANDIDATES.md`）。

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P13-A | CurseForge Provider (API proxy + Murmur2) | 対象外 | - | - | 計画アーカイブ。API キー取得後に新 ID で再開 | `.archive/docs/planning/PHASE13_PLAN.md` |
| P13-B | CurseForge Modpack + 混在 Profile | 対象外 | - | P13-A | 同上 | 同上 |

---

## フェーズ外タスク (2026-08-24〜27)

### エージェント基盤・ツールチェーン

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| AGT-1 | .agent/ 自己知識管理システム初期構築 | 完了 | 100% | - | AGENT.md §8 + skills 10 種 | `ecdbb69` |
| AGT-2 | §7 コミュニケーション規約 | 完了 | 100% | - | AGENT.md §7 | `7f579df` |
| TOOL-1 | Node LTS 24 / pnpm 11 / vitest 4 統一 | 完了 | 100% | - | .nvmrc=24 + typecheck green | `49c74b6`〜`ccd5f98` |
| DEP-1 | 依存関係を latest へ（パッチ + メジャー） | 完了 | 100% | - | 4 検証 pass。next 16.3.3 / TS 7 / vite 8 / jsdom 30 / web-vitals 6 / jest-dom 7 | 2026-08-30 本コミット |
| PERF-1 | 画像表示の高速化・高画質化 (unoptimized 方針) | 完了 | 100% | - | LCP 改善 + 詳細レイアウト修正 | `d41cee5` |
| BUG-1 | 全ファイル包括バグハント (8 件) | 完了 | 100% | - | 8 件修正 + 回帰テスト | `3f05032` |

### UI/UX 改善ラウンド (2026-08-26〜27)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| UIX-1 | webpack キャッシュ実効化 + 白フラッシュ修正 | 完了 | 100% | - | next.config.mjs 化 + コールド/ウォーム実測 | `0889884` |
| UIX-2 | アクションボタン設計ルール登録・適用 | 完了 | 100% | - | 詳細モーダル/ページの CTA 統一 | `2b96adc` |
| UIX-3 | 検索表示形式 4 種 + テーマ cookie 修正 | 完了 | 100% | - | max/1/2/3 カラム + SameSite 修正 | `5ae4047` |
| UIX-4 | カテゴリタグ折り返し + コントラスト改善 | 完了 | 100% | - | WCAG AA 維持 | `c72029c` |
| UIX-5 | カテゴリ英語化 + トースト ON/OFF 設定 | 完了 | 100% | - | categories.ts 全面英語 + 設定 UI | `40e2b5f` |
| UIX-6 | 端末ダークモード時ライト切替修正 | 完了 | 100% | - | color-scheme 宣言 | `f916764` |
| UIP-1 | 404 ページリニューアル | 完了 | 100% | - | ステータス 404 + 新デザイン | `603dac3` |
| UIP-2 | モーダル表示中の BottomNav 非表示 | 完了 | 100% | - | 7 モーダルで nav-modal-hidden | `6b98a72` |
| UIP-3 | カード追加ボタンのトグル化 (追加⇄削除) | 完了 | 100% | - | 色・ラベル切替 + 同寸維持 | `3ec7b5f` |
| UIP-4 | 全体アニメーション強化 | 完了 | 100% | - | modal-pop / hover / icon-swap 等 | `2d5b705` |
| UIP-5 | Samsung Browser モーダル途切れ + 2 カラム作者省略 | 実環境検証待ち | 90% | - | **実機で途切れないこと** | `a8ea685` (実機確認はユーザー) |

### セキュリティ

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| SEC-1 | セキュリティ全面強化 (CSP Enforce 等) | 実環境検証待ち | 90% | - | **実環境で YouTube/CDN 画像表示** | `7f3d4b1` |
| SEC-2 | APP_PROFILE によるプロファイル切替 | 完了 | 100% | SEC-1 | ビルド/ランタイム両方で切替実測 | `9233e0b` |
| SEC-3 | APP_PROFILE バナー重複出力の修正 | 完了 | 100% | SEC-2 | build 中 1 回のみ出力 | `4809d57` |
| SEC-4 | .env.local の development による本番緩和封止 | 完了 | 100% | SEC-3 | build/start で常に production 実測 | `0ea5204` |

### ドキュメント

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| DOC-1 | README 全面更新 (ビルド/環境変数/未記載) | 完了 | 100% | - | セクション充実 + 実測値 | `ab273b1` |
| DOC-2 | 計画書のタスク管理形式への再構成 | 完了 | 100% | - | 本ファイル + 12 計画書 + テンプレート | 本コミット |
| DOC-3 | ドキュメント/設定ドリフトの是正 (実測値・ブランチ名・削除済み参照) | 完了 | 100% | - | 記載値が実測と一致・stale 参照 0 件・4 検証 pass | 本コミット / `.agent/logs/2026-08-27_doc-config-drift-fix.md` |
| DOC-4 | 旧セッションブランチ名の一括置換 + push 事前許可ルールの恒久化 | 完了 | 100% | - | 現用ドキュメント 8 ファイルを置換。**過去ログ 15 ファイルは §8.1 により対象外**（一度誤適用し全復元）。AGENT.md §4.3.1 新設・§8.5 強化 | `.agent/logs/2026-08-27_doc-config-drift-fix.md` 追記 B/C |
| DOC-5 | 旧ブランチ 3 本の main へのマージ状態調査 | 完了 | 100% | - | PR #1/#2/#3 すべて MERGED・`compare` の ahead_by=0 で**完全取込を確認**。削除はユーザー指示待ち | 同上 C 項 |
| DOC-6 | 計画書・コード内コメントの節番号ドリフト是正 + SEO 2-1 の依存切り離し | 完了 | 100% | - | PHASE12_PLAN §9→§12・_TEMPLATE §9〜§11→§10〜§12・server.ts/docs/README §7→§10.5・PHASE11_PLAN 参照 15 ファイルを §10.x へ・PHASE11 状態行を実測に更新・SEO-2 新設 | `.agent/logs/2026-08-27_plan-doc-drift-fix.md` |
| SEO-1 | SEO 改善 (JSON-LD 2-2 / パンくず 2-4 / 動的 OGP 2-3 / sitemap 2-5 / 見出し・内部リンク 2-6) | ローカル検証済み | 100% | SEO-2 | 実装済み。本番 JSON-LD / OG 目視はユーザー延期 (完了にしない) | `52bf0b9` / typecheck + biome + 1244 tests + build |
| SEO-2 | 重複コンテンツ対策: モーダル直接ページの noindex (候補 2-1) | ローカル検証済み | 100% | - | 実装済み。本番 meta robots 目視はユーザー延期 (完了にしない) | `080ede1` / typecheck + biome + 1235 tests + build |

### アーキテクチャ (Feature フォルダ)

> 2026-08-30 再構築: 4 Feature では `lib/env` が潰れるため 11 Feature。
> 未着手だった ARCH-1B〜H の定義を計画再構築に合わせて更新（コード未実施のため）。

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| ARCH-1 | Feature フォルダ移行の計画書 | 完了 | 100% | - | 11 Feature + 再監査を §10.5/§9 に反映。ARCH-1P 不採番 | `FEATURE_FOLDER_PLAN.md` / `d0c1d6a` + 本整合コミット |
| ARCH-1A | 共通 UI を ui/layout/feedback へ | 未着手 | 0% | ARCH-1 Go | 旧パス re-export + 4 検証 | 計画 §10.4 |
| ARCH-1B | landing | 未着手 | 0% | ARCH-1A | `features/landing` | 計画 §10.5 |
| ARCH-1C | settings | 未着手 | 0% | ARCH-1A | `features/settings` | 計画 §10.5 |
| ARCH-1D | seo + sitemap-entries | 未着手 | 0% | ARCH-1A | `features/seo`（opengraph は app 残置） | 計画 §10.5 |
| ARCH-1E | catalog + categories.ts | 未着手 | 0% | ARCH-1A | HomeInteractive / ModCard / loadDiscoverSearch / categories | 計画 §10.5 |
| ARCH-1F | project + project-detail.ts | 未着手 | 0% | ARCH-1E | Detail / ModalShell / Gallery / server.ts（index に use client 禁止） | 計画 §10.5 |
| ARCH-1G | profiles + loaders + contentCategory | 未着手 | 0% | ARCH-1A | ModsPageClient / useProfiles / loaders / contentCategory | 計画 §10.5 |
| ARCH-1H | zip（プロファイル配布 ZIP） | 未着手 | 0% | ARCH-1G | useZipExport/Import。ZipSink は含まない | 計画 §10.5 |
| ARCH-1I | dep-check | 未着手 | 0% | ARCH-1G | フック + モーダル | 計画 §10.5 |
| ARCH-1J | env-import（検出・解析） | 未着手 | 0% | ARCH-1G | detector/analyzer/picker/profileName のみ先に移動 | 計画 §10.10 |
| ARCH-1K | sync + formatBytes | 未着手 | 0% | ARCH-1J | lib/env の書き込み系 + Sync UI + format.ts | 計画 §10.5 |
| ARCH-1L | modpack | 未着手 | 0% | ARCH-1J, ARCH-1E | Hub / mrpack / useModpackAdd | 計画 §10.5 |
| ARCH-1M | 旧パス shim 削除 | 未着手 | 0% | ARCH-1B〜L | 深い import 0 | 計画 §10.10 |
| ARCH-1N | テスト配置 | 未着手 | 0% | ARCH-1M | ミラー（既定） | 計画 §10.8 |
| ARCH-1O | 掃除と完了チェック | 未着手 | 0% | ARCH-1N | 計画 §13 | 計画 §13 |

---

## CI 構築 (2026-08-27 完了)

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| CI-1 | GitHub Actions ワークフロー起動 (YAML 構文修正) | 完了 | 100% | - | ジョブが開始される | `c415a0b` |
| CI-2 | pnpm バージョン重複解消 + .next tar 転送方式 | 完了 | 100% | CI-1 | build→e2e 間で成果物が渡る | `90fac49` / `f23623b` |
| CI-3 | E2E spec 全面修正 (陳腐化 7 件 + hydration 競合) | 完了 | 100% | CI-2 | E2E 全 spec green | `1508a6e` |
| CI-4 | 失敗テストのアノテーション出力レポーター | 完了 | 100% | - | API から失敗内容が読める | `3741c89` |
| CI-5 | theme 永続化バグ修正 (debounce 競合 + FOUC) | 完了 | 100% | CI-4 | theme-persistence spec green | `4df29af` / `2e1d302` |

## 検証待ち・将来タスク

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| VER-1 | E2E 全 spec の CI green 確認 | 完了 | 100% | P11-E2E | GitHub Actions で全 spec green | run `33071105483` (2026-08-27, 74 tests pass) |
| VER-2 | CSP Enforce の実環境表示確認 | 実環境検証待ち | - | SEC-1 | YouTube 埋め込み・CDN 画像・API が本番で動作 | ユーザー実施 |
| DEPLOY-1 | Vercel 本番デプロイ | 未着手 | 0% | P12-C | 本番 URL で全機能動作 | PHASE10_CANDIDATES 方針。旧 P13-B (CF) 依存は解除 |
| EXP-1 | Vite 版資産の .archive 保管維持 | 完了 (継続) | 100% | - | 全タスクで .archive/vite 無変更 | 各コミットの検証チェックリスト |
