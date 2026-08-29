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
   # ブランチ名はセッションごとに変わるためハードコードせず現在値を使う
   git push origin "$(git branch --show-current)"
   ```

4. GitHub リポジトリ Settings > Actions > General で:
   - **Actions permissions**: "Allow all actions and reusable workflows"
   - **Workflow permissions**: "Read and write permissions" (artifact upload に必要)

## ローカル PRoot 環境での E2E 実行について (2026-08-27 追記)

Android (PRoot-Distro) では Playwright の並列 worker × Chromium でメモリ不足
(signal 9 / OOM killer) により実行が強制終了されることが実測されています
(12 GB RAM でも 4 workers で中断 — `e2e-log.txt`)。

- **E2E は GitHub Actions での実行を推奨** (ubuntu-latest 16 GB・workers: 2・retries: 2 で安定)
- ローカルで実行する場合の回避策:
  ```bash
  pnpm test:e2e -- --workers=1   # worker 数を 1 に絞ってメモリ消費を抑制
  ```
- `playwright-report/` / `test-results/` は `.gitignore` 対象のためリポジトリに
  入らない。CI では失敗時に artifact として自動アップロードされる (下記)。

## ワークフロー概要

| Job | トリガー | 内容 | 想定時間 |
|---|---|---|---|
| `static-checks` | push / PR | tsc + lint + vitest+coverage | ~3-5 min |
| `build` | static-checks 後 | pnpm build | ~2 min |
| `e2e` | push のみ (PR は skip) | Playwright (chromium-desktop + chromium-mobile=Pixel 7) | ~5-10 min |

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
| `e2e` | 5-10 分 | Playwright (chromium-desktop / chromium-mobile=Pixel 7) 全 spec pass、失敗時のみ `playwright-report` upload |

### 3. カバレッジ確認

- Actions summary > `static-checks` job > `coverage-report` artifact をダウンロード
- `coverage/index.html` をブラウザで開くと per-file カバレッジが見える
- 現状目標: **All files 60%+, per-module thresholds (計画書 §7.5) 全 pass**
  (2026-08-27 実測: 637 tests / 73 files / statements 84.65%)

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

### Actions が「workflow file issue」で 0 秒 failure になる (2026-08-27 実績)

- 原因: YAML の引用符なしスカラーに **「: 」(コロン+スペース)** が含まれると
  mapping entry の誤パースになり、GitHub がワークフローを起動できない
  (実例: `name: Biome lint (Phase 10-P5: ESLint から移行)` → 引用符で修正)
- ローカル検証方法 (js-yaml の strict モード):
  ```bash
  pnpm add -D js-yaml && node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'),{json:true})"
  ```
- **Arena エージェント (GitHub App) は `.github/workflows/` を push できない**
  (`refusing to allow a GitHub App to create or update workflow`)。
  ワークフロー修正は docs/ops/CI_WORKFLOW.yml (正本) にコミット →
  ユーザーが `cp` で反映して push する運用 (本書の手順 2〜3)。

### トリガー変更: 二重実行防止 + ドキュメント変更で CI スキップ (2026-08-29)

- **問題**: PR ブランチでは `push` (arena/**) と `pull_request` の両方が発火し、
  1 commit につき CI が 2 本実行されていた (PR #4 で実測)。
- **対応 (ユーザー採用: 案 B + 案 C 拡張)**:
  - `push` の `branches` を `[main]` のみに変更 (PR ブランチは
    `pull_request` イベントが担う。PR の無いブランチは Actions タブから
    `workflow_dispatch` で手動実行)
  - `paths-ignore` を push / pull_request の両方に追加:
    `README.md` / `AGENT.md` / `.agent/**` / `docs/**`
    → ドキュメント系のみのコミットでは CI は走らない
- **反映手順**: 正本を反映して push
  ```bash
  cp docs/ops/CI_WORKFLOW.yml .github/workflows/ci.yml
  git add .github/workflows/ci.yml
  git commit -m "ci: トリガー調整 (push=main のみ / docs 変更でスキップ)"
  git push origin "$(git branch --show-current)"
  ```
- **注意**: このコミット自体は `docs/**` 変更なので push しても CI は走らない
  (意図どおり)。動作確認は次回のコード変更コミットで行う。

### E2E の手動実行 (workflow_dispatch) (2026-08-29 追記)

- **経緯**: `push` を main のみにしたため、PR の無いブランチ (arena/**) では
  自動 CI が走らない。そこで Actions タブからの手動実行で E2E も動かせるようにした。
- **変更**: `e2e` ジョブの `if` を
  `github.event_name == 'push' || github.event_name == 'workflow_dispatch'` に変更。
  (push = main マージ時 / workflow_dispatch = 手動実行時)
- **手動実行手順**:
  1. GitHub リポジトリ → **Actions** タブ → 左の **CI** を開く
  2. 右上 **Run workflow** を押す
  3. `Use workflow from` で実行したいブランチを選ぶ (例: `arena/...`)
  4. **Run workflow** を実行
- **挙動**: 手動実行は `paths-ignore` の対象外なので、**docs のみの変更でも
  全ジョブ (static-checks → build → e2e) が実行される**。E2E は
  PR イベント (pull_request) では従来どおりスキップ。

### upload-artifact が「No files were found」で .next を転送できない (2026-08-27 実証)

- 原因: **upload-artifact v4 は隠し (ドット) ディレクトリ配下のファイルを対象外**
  (内部の excludeHiddenFiles 挙動)。`.next/**` はパターンをどう変えても 0 件になる。
  (@actions/glob を excludeHiddenFiles: true で実行して再現・実証済み)
- 対策: **tar でアーカイブして単一ファイルとしてアップロード**し、
  取得側で展開する (正本 CI_WORKFLOW.yml は修正済み):
  ```yaml
  run: tar --exclude='.next/cache' -czf next-build.tgz .next   # build job
  run: tar -xzf next-build.tgz                                  # e2e job
  ```
- 副次的修正: `Upload build stats` (.next/diagnostics/) は対象ディレクトリが
  存在しないため常に空警告だった → 削除。

### `pnpm/action-setup` が「Multiple versions of pnpm specified」で失敗する (2026-08-27 実績)

- 原因: workflow の `version:` 入力と package.json の `packageManager` が重複指定。
  pnpm/action-setup はバージョン不整合 (ERR_PNPM_BAD_PM_VERSION) 防止のため失敗する。
- 対策: **workflow 側に `version:` を書かない**。package.json の
  `packageManager: pnpm@11.24.0` から自動解決される (正本 CI_WORKFLOW.yml は修正済み)。

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
