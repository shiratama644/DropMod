# task-list.md ソース・計画書突合

> Date: 2026-08-30(JST) / Branch: arena/01a04e55-dropmod

## 1. 指示内容 (Task Summary)

未完了タスクの洗い出し。計画書とソースを照合し、状態の誤記があれば `docs/task-list.md` を更新する。

## 2. 実行内容 (Executed Actions)

- PHASE12 / PHASE12D / PHASE13 / SEO 計画書と `lib/env/*`・`app/` を突合
- task-list に「未完了サマリー」を追加。P12-B/C は計画書 §13 の「未着手」が陳腐化、ソースでは実装済み → 実環境検証待ちのまま証拠を更新
- 誤って「完了」になっていた実装欠落は無し。SEO-2 は noindex 無しで未着手のまま正しい
- 4 検証: typecheck / biome / 1232 tests / build exit 0

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- 進捗の正本は task-list。計画書 §13 実績表は更新漏れしやすい
- P12-D の「ローカル検証済み 100%」は AI 実装完了。実機はユーザー側で 完了 にはしない

## 4. 次にすべきこと (Next Actions)

ユーザー判断: SEO-2 実装 / P12-E2E の CI 再実行 / 実機確認 (P12-B/C, UIP-5, SEC-1)
