# 2026-08-27 — E2E ローカル OOM の記録と GitHub Actions セットアップ準備

## 状況 (ユーザー報告 + コミット 66a310a の分析)

- ユーザーが PRoot-Distro (Android, 12 GB RAM) で `pnpm test:e2e` を実行 →
  **signal 9 (OOM killer) で実行中に強制終了**。
- `e2e-log.txt` (コミット済み) は 7 行で途切れており、
  「Running 74 tests using 4 workers」の後にサマリなし = 完走していない。
- `playwright-report/` / `test-results/` は .gitignore 対象のためコミットされて
  いない (正しい挙動。成果物はリポジトリに入れない)。
- 74 tests = chromium-desktop + chromium-mobile の 2 project 合計。

## 対応

1. E2E の本命実行環境を **GitHub Actions に移行** (ubuntu-latest 16 GB・
   workers: 2・retries: 2 で安定)。ワークフローは docs/ops/CI_WORKFLOW.yml
   に既存 (Phase 8-D で作成)。
2. CI_WORKFLOW.yml の修正:
   - cache key の `next.config.ts` → `next.config.mjs` (2026-08-27 リネーム漏れ)
   - `workflow_dispatch` 追加 (Actions タブから手動実行可)
3. CI_SETUP.md の修正:
   - 旧ブランチ名 arena/01a01fcf-dropmod → arena/01a0337c-dropmod
   - E2E ブラウザ表記 iPhone14 → chromium-desktop + Pixel 7 (現行)
   - カバレッジ実測値更新 (629 tests / 84.5%)
   - 「ローカル PRoot での OOM」節を追記 (CI 推奨 + `--workers=1` 回避策)
4. task-list.md: P11-E2E に OOM 中断の事実を記録 (状態は実環境検証待ちのまま)。

## 配置手順 (ユーザー実施 — AGENT.md §6.3 で Agent は .github/ に書けない)

docs/ops/CI_SETUP.md に記載のとおり:
1. `git pull origin arena/01a0337c-dropmod` (修正済み yml を取得)
2. `mkdir -p .github/workflows && cp docs/ops/CI_WORKFLOW.yml .github/workflows/ci.yml`
3. commit & push → push to arena/** が CI を trigger (E2E 含む全 job)

## 検証

- typecheck 0 error / biome 0 warning (docs + yml のみの変更)
- YAML 構文の簡易チェック実施
