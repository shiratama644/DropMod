# 2026-08-27 — 計画書のタスク管理形式への全面再構成

## タスク

ユーザー指示:
1. Qiita 記事 (https://qiita.com/Y-Y-dev/items/d526fb7cdbe35a3f9384) のとおりに
   今後の計画書を作成する (恒久ルール化)
2. 既存計画書も同形式に作り直す (実装済み。文書整理目的)
3. **既存計画書の良い点も取り入れる** (設計詳細・Gotchas・DoD・サブフェーズ表を保持)

## 実装 (コミット 3b48725 + 本コミット)

### システム (3b48725)
- docs/task-list.md — 唯一の正本。全フェーズ + フェーズ外タスクを
  ID/状態/進捗/依存/完了条件/証拠 で管理 (運用規則: 状態定義・ID 再利用禁止・
  新問題は新タスク・証拠ベース判定)
- docs/planning/_TEMPLATE.md — 記事の 6 項目 + 旧計画書の良い点
  (サブフェーズ表 / DoD / 設計詳細 / Gotchas / 実績) を統合したテンプレート
- AGENT.md §6.9.1 — 恒久ルールとして登録
- docs/README.md — 目次・案内を更新

### 既存 12 計画書の再構成 (本コミット)
全て _TEMPLATE 形式 (§1 開始前確認 / §2 目的 / §3 変更範囲 / §4 禁止事項 /
§5 完了条件 / §6 テスト方法 / §7 停止条件 / §8 完了時に行うこと / §9 サブタスク /
§10 設計詳細 / §11 Gotchas / §12 実績) に再構成:
- NEXTJS_MIGRATION (P0-7) / PHASE08 / PHASE09 / PHASE09_5 / PHASE10 /
  PHASE10_5 / PHASE11 / ROUTING_REDESIGN — 完了分。実績・証拠 (コミット SHA) を記載
- PHASE12 — 未着手。設計詳細は元の実装レベル仕様 (削除安全条件 / Preview UI /
  Executor / .mrpack) を充実させて保持
- PHASE13 — 保留 (Phase 12 完了後に改訂)
- PHASE10_CANDIDATES / SEO_CANDIDATES — 候補レジストリ形式 (採否表)

### 保持した「既存計画書の良い点」
- DoD チェックリスト (Yes/No 判定可能な完了条件)
- サブフェーズ表 (テーマ・成果物・依存)
- 設計詳細 (判定アルゴリズム・データモデル・URL 設計など圧縮して継承)
- Gotchas (Loader 判定 / ZipSource pathPrefix / 429 対策など)
- 設計論点の記録 (PHASE12 §12 は着手前の協議リストとして明示)

### 圧縮について
8,151 行 → 約 1,600 行に圧縮。詳細な履歴 (現状分析・ChatGPT レビュー反映記録等) は
git 履歴 + docs/complete/ + docs/audit/ に残るため、再構成版では要点のみ記載。
元ファイルは git 履歴で復元可能。

## 検証

- typecheck 0 error / biome 0 warning (ドキュメントのみの変更)
- 全 markdown 内リンクの切れチェック実施 (0 件)
- 証拠 (SHA) は git log / PHASE10_COMPLETE.md / PR 情報から実在のみ記載
