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
| P11-C1 | Import UI 統合 (NewProfileModal 解析) | 完了 | 100% | P11-B3 | Analysis View + 名前自動生成 | `b6a5a54` |
| P11-C2 | ZIP フォールバック (.minecraft ZIP) | 完了 | 100% | P11-C1 | Firefox/Safari で取り込み可 | `b6a5a54` |
| P11-E2E | E2E spec 2 種 + ドキュメント | 実環境検証待ち | 90% | P11-C2 | **CI 上で E2E green** | `c0d13f8` (CI 実行はユーザー) |

### Phase 12: Sync & Modrinth Modpack (Read/Write) — 未着手

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P12-A | linkedSource + ManagedFile + Diff Engine | 未着手 | 0% | P11-E2E | computeSyncPlan の unit test 全分類 | - |
| P12-B | Preview UI + Transaction + Executor + Rollback | 未着手 | 0% | P12-A | Chromium で Direct Write 動作 | - |
| P12-C | ZipSink + ModrinthProvider + .mrpack | 未着手 | 0% | P12-B | Firefox/Safari で ZIP Sync | - |

### Phase 13: CurseForge 完全対応 — 未着手

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| P13-A | CurseForge Provider (API proxy + Murmur2) | 保留 | 0% | P12-C | Phase 12 完了後に詳細策定 | - |
| P13-B | CurseForge Modpack + 混在 Profile | 保留 | 0% | P13-A | 同上 | - |

---

## フェーズ外タスク (2026-08-24〜27)

### エージェント基盤・ツールチェーン

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| AGT-1 | .agent/ 自己知識管理システム初期構築 | 完了 | 100% | - | AGENT.md §8 + skills 10 種 | `ecdbb69` |
| AGT-2 | §7 コミュニケーション規約 | 完了 | 100% | - | AGENT.md §7 | `7f579df` |
| TOOL-1 | Node LTS 24 / pnpm 11 / vitest 4 統一 | 完了 | 100% | - | .nvmrc=24 + typecheck green | `49c74b6`〜`ccd5f98` |
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
| SEO-1 | SEO 改善候補 (重複コンテンツ対策等) | 保留 | 0% | P12-C | 候補リストから実施判断 | `fc2b2b6` / SEO_CANDIDATES.md |

---

## 検証待ち・将来タスク

| ID | タスク | 状態 | 進捗 | 依存 | 完了条件 | 証拠 |
|---|---|---|---:|---|---|---|
| VER-1 | E2E 全 spec の CI green 確認 | 実環境検証待ち | - | P11-E2E | GitHub Actions で全 spec green | docs/ops/CI_SETUP.md 手順でユーザー実施 |
| VER-2 | CSP Enforce の実環境表示確認 | 実環境検証待ち | - | SEC-1 | YouTube 埋め込み・CDN 画像・API が本番で動作 | ユーザー実施 |
| DEPLOY-1 | Vercel 本番デプロイ | 未着手 | 0% | P12-C, P13-B | 本番 URL で全機能動作 | PHASE10_CANDIDATES 方針 (最終ステップ) |
| EXP-1 | Vite 版資産の .archive 保管維持 | 完了 (継続) | 100% | - | 全タスクで .archive/vite 無変更 | 各コミットの検証チェックリスト |
