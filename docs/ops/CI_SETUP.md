# GitHub Actions CI セットアップ手順 (Sub-Phase 8-D)

Arena エージェント (GitHub App) には `.github/workflows/` を書き込む権限が無いため、
以下の手順でユーザー側で有効化する必要があります。

## 手順

1. リポジトリのルートに `.github/workflows/` ディレクトリを作成
   ```bash
   mkdir -p .github/workflows
   ```

2. 本リポジトリの `docs/ops/CI_WORKFLOW.yml` を `.github/workflows/ci.yml` にコピー
   ```bash
   cp docs/ops/CI_WORKFLOW.yml .github/workflows/ci.yml
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

## 配置後の動作確認手順 (Phase 9-E.7 追加)

`.github/workflows/ci.yml` を配置して初回 push した後、以下を確認してください。

### 1. Actions タブで実行を確認

- GitHub リポジトリ > Actions タブに `CI` ワークフローが表示され、
  最新 commit で自動 trigger されている
- 3 つの job (`static-checks` → `build` → `e2e`) が並んでいる

### 2. 成功時の期待値

| Job | 期待 duration | チェック観点 |
|---|---:|---|
| `static-checks` | 3-5 分 | tsc + lint + vitest + coverage が全て pass、artifact `coverage-report` が upload されている |
| `build` | 2-3 分 | pnpm build が成功、`.next` artifact (`next-build`) が upload されている |
| `e2e` | 5-10 分 | Playwright (Chromium + iPhone14 emulation) 全 spec pass、失敗時のみ `playwright-report` upload |

### 3. カバレッジ確認

- Actions summary > `static-checks` job > `coverage-report` artifact をダウンロード
- `coverage/index.html` をブラウザで開くと per-file カバレッジが見える
- 現状目標: **All files 60%+, per-module thresholds (計画書 §7.5) 全 pass**
  (Phase 9-C 完了時 91.34% 実測)

### 4. 依存の verify

- 初回 install で `pnpm-lock.yaml` の supply-chain 検証が pass することを確認
  (`corepack enable` + `pnpm install --frozen-lockfile` の順、`.github/workflows/ci.yml` に定義済み)
- `msw` (Phase 9-C.1 で追加) の postinstall script が実行されないこと
  (`pnpm-workspace.yaml` で `allowBuilds.msw: false` に設定済み、
  Node テスト用途では browser Service Worker 不要)

### 5. E2E 失敗時のデバッグ

- Actions > 失敗した run > Artifacts の `playwright-report` を展開
- `index.html` を開くと trace viewer で各ステップの screenshot / DOM snapshot が見える
- **注意**: E2E は Modrinth API に実接続する spec を含むため、
  API rate limit (300 req/min) が原因の flake を疑う (CI キャッシュに載っていない直後の run で発生しやすい)

## トラブルシューティング

### `pnpm install` が失敗する

- `pnpm-lock.yaml` が古い → 手動で `pnpm install` してから commit / push
- `allowBuilds` に載っていない新 package がある → `[ERR_PNPM_IGNORED_BUILDS]` が出るので
  `pnpm-workspace.yaml` に追記

### E2E が Chromium ダウンロードで失敗する

- `.github/workflows/ci.yml` の e2e job 内で `npx playwright install --with-deps chromium` を実行しているか確認
- GitHub-hosted runner (`ubuntu-latest`) は Chromium install 可能。self-hosted の場合は環境依存で失敗しうる

### 実運用 (main ブランチ merge 後の自動デプロイ)

- 本リポジトリの CI は「品質チェック専用」で、デプロイは Vercel Git Integration が担当
- `main` merge → Vercel が自動 build + deploy (CI とは独立)
- CI 失敗時に merge をブロックしたい場合は、GitHub Settings > Branches > Branch protection rules で
  `static-checks` / `build` を required status check に指定
