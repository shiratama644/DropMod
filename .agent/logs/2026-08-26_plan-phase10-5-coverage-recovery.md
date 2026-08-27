# Phase 10.5 (Emergency) カバレッジ回復計画書の作成

> Date: 2026-08-26 (JST) / Commit: `37b8787` / Branch: `arena/01a0337c-dropmod`

## 1. 指示内容 (Task Summary)

vitest 4 アップグレード (`ccd5f98`) の完了報告時に提示した coverage threshold 違犯への対応方針として、
ユーザーが「**テストを追加してカバレッジ回復したいが、それを Phase 10.5 として Emergency として計画書を作成してください**」と指示。
→ テスト追加による回復を主体とする Phase 10.5 緊急フェーズの計画書 `docs/planning/PHASE10_5_PLAN.md` を作成する。

## 2. 実行内容 (Executed Actions)

| 変更 | 内容 |
| :--- | :--- |
| `docs/planning/PHASE10_5_PLAN.md` | 新規作成 (231 行)。背景・現状データ・未カバーインベントリ・サブフェーズ A〜E・mock 戦略・DoD・リスク |
| `docs/README.md` | planning インデックスに PHASE10_5_PLAN.md を追加 |
| `.agent/skills/project-overview.md` | フェーズ進捗表に 10.5 行を追加、テスト数表記を 376 に更新 |

計画書作成にあたって `/tmp/coverage-v4-summary.json`（vitest 4 実測）から
全 0% ファイルの stmt/branches/functions 実測値を抽出し、threshold ごとの
「必要カバー数 − 現在カバー数」のギャップを算定してサブフェーズ分割に反映した。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **ギャップ算定の結果**（計画書 §1.2/§2 の要約）:
  - hooks branches +30 / global branches +13 → **hooks 3 種 (useCountUp/useScrollDirection/useScrollReveal, 45br) のテストだけで両方解消**
  - components stmt +22 / fn +13 → **BottomSheet 以外の 0% components 10 ファイル (123 stmt/42 fn) で解消**（BottomSheet 単体は 183 stmt あるが実装難度が最高なため品質強化フェーズ D に分離）
  - lib/store branches +3 → confirm.ts の cleanup 分岐のみ
- **既存テストに next/navigation / matchMedia / IntersectionObserver / anime.js の mock 前例が一切ない**（grep で確認）。landing・BottomSheet 系テストは mock 基盤の新設が必須 → サブフェーズ A に基盤を前置。
- PHASE10_PLAN.md の構成（0. 方針 / 1. サブフェーズ一覧 / 2. DoD / 3. リスク / 4. 次フェーズ）が緊急対応系計画書の良きテンプレート。
- 計画書では coverage.exclude 追加を `app/**/layout.tsx` のみに限定（既存 `app/layout.tsx` 除外と同じ「RSC wrapper は E2E 担保」ポリシーの整合性拡張）。閾値回避のための除外はユーザー方針（緩和禁止）に反するため明記して禁止。

## 4. 次にすべきこと (Next Actions)

1. **ユーザーに計画書をレビューしてもらう** → 承認後に Phase 10.5-A（browser API mock 基盤 + hooks 3 種テスト）から着手。
2. Phase 10.5 完了後、Phase 11-A（ProjectItem データモデル基盤 + Dexie v2 migration）に着手。
3. 10.5-E (server 層テスト) は Phase 11 着手前の実施を推奨（project-detail.ts のリネーム競合を regression 検出できるため）。
