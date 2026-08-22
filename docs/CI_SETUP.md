# GitHub Actions CI セットアップ手順 (Sub-Phase 8-D)

Arena エージェント (GitHub App) には `.github/workflows/` を書き込む権限が無いため、
以下の手順でユーザー側で有効化する必要があります。

## 手順

1. リポジトリのルートに `.github/workflows/` ディレクトリを作成
   ```bash
   mkdir -p .github/workflows
   ```

2. 本リポジトリの `docs/CI_WORKFLOW.yml` を `.github/workflows/ci.yml` にコピー
   ```bash
   cp docs/CI_WORKFLOW.yml .github/workflows/ci.yml
   ```

3. コミット & push (ユーザーのアカウントで実施)
   ```bash
   git add .github/workflows/ci.yml
   git commit -m "ci: enable GitHub Actions workflow"
   git push origin arena/01a01fcf-dropmod
   ```

4. GitHub リポジトリ Settings > Actions > General で:
   - **Actions permissions**: "Allow all actions and reusable workflows"
   - **Workflow permissions**: "Read and write permissions" (artifact upload に必要)

## ワークフロー概要

| Job | トリガー | 内容 | 想定時間 |
|---|---|---|---|
| `static-checks` | push / PR | tsc + lint + vitest+coverage | ~3-5 min |
| `build` | static-checks 後 | pnpm build | ~2 min |
| `e2e` | push のみ (PR は skip) | Playwright chromium + iPhone14 | ~5-10 min |

## 失敗時の artifact

- `coverage/` — vitest カバレッジレポート (常時保存)
- `.next/diagnostics/` — build stats (成功時)
- `playwright-report/` — E2E 失敗時のみ
- `test-results/` — E2E トレース (失敗時のみ)

いずれも 7 日間保持。
