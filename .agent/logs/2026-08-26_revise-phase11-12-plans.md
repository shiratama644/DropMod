# Phase 11/12 計画書をセッション合意の確定仕様に改定

> Date: 2026-08-26 (JST) / Commit: `19a17b5` / Branch: `arena/01a0337c-dropmod`

## 1. 指示内容 (Task Summary)

これまでのセッション合意（データモデル ProjectItem 化・環境サブオブジェクト化・新規 Profile のみ・命名自動生成・linkedSource の Phase 12 延期・環境不一致破棄等）を `PHASE11_PLAN.md` と `PHASE12_PLAN.md` に反映すること。

## 2. 実行内容 (Executed Actions)

| ファイル | 主な変更 |
| :--- | :--- |
| `PHASE11_PLAN.md` | 冒頭に「2026-08-26 改定」セクション（8 項目）追加。§4.5 を ProjectItem 方式に全面書き換え（型定義＋マイグレーション表）。§1.2.1 予約 URL 複数形化。§3.1 フロー「常に新規」。§4.1/§6.4/§8.3 handle 永続化の Phase 12 延期。§6.1 命名自動生成ルール。§7 タスクリスト更新（データモデル基盤コミット追加、snapshot 廃止）。§9 全論点解決済み。§11 改定注記 |
| `PHASE12_PLAN.md` | 冒頭に「2026-08-26 改定」セクション（5 項目）追加。contentId→ProjectItem.projectId。Diff アルゴリズム更新。§4.1 linkedSource を Phase 12-A で追加。§7 タスクリスト更新。§9 に Sync 時環境不一致の新論点。§11 反映状況更新。単数形 discover URL 修正 |

検証: ドキュメントのみ（Lint/Build 対象外）。残存 `ContentItem` はすべて「不採用」説明文脈のみ。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **⭐ `.gitignore` の `logs` パターンが `.agent/logs/` も無視していた**。AGENT.md §8.5「`.agent/` は Git 追跡対象」に反し、**過去のログ（2026-08-24 の 4 件）は一度も commit/push されておらず、Sandbox 再構築で消失**していた。`.gitignore` に `!.agent/logs` を追加して修正。**教訓: gitignore の広域パターン（`logs` 等）は新ディレクトリと衝突しないか `git check-ignore -v <path>` で必ず確認する。**
- **計画書の「確定事項セクション」パターンが有効**: 既存本文を書き換えつつ、冒頭に改定経緯テーブルを置くことで「いつ・なぜ変わったか」が追跡可能。
- `git grep` で「旧用語の残存」を機械的に確認するのが効率的（ContentItem / linkedSource / 単数形 discover URL の 3 種をチェックした）。
- Phase 12 側にも波及する決定（linkedSource 延期・ProjectItem 化）は、**両方の計画書を同時に更新**しないと不整合が残る。
- §4.1.1 Sandbox 再構築がまた発生（コミット前の `git status` で検知 → fetch + reset --hard で復旧）。

## 4. 次にすべきこと (Next Actions)

- **Phase 11-A の実装着手**（最初のコミット = データモデル基盤: ProjectItem リネーム＋environment 化＋Dexie v2 migration＋sanitize＋全アクセス書き換え＋テスト）。
- 実装時の注意: セグメント設定はリテラル必須（routing-and-pages.md の罠）。
- Phase 12 着手時に §9 の新論点（Sync 時環境不一致）を決める。
