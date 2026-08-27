# 2026-08-27 — CI ワークフロー初回起動失敗 (YAML 構文エラー) の修正

## 状況

- ユーザーが .github/workflows/ci.yml を配置・push (8077e5a) し、GitHub 側の
  Actions permissions を設定済み。
- しかし run 33058600818 が **0 秒で failure**: 「workflow file issue」。
- ローカルの E2E は PRoot 12 GB RAM でも OOM (signal 9) で完走不能
  (e2e-log.txt は 7 行で途切れ、サマリなし。前セッション 27ef7ab で記録済み)。

## 原因 (特定済み)

`.github/workflows/ci.yml` L42:
```yaml
name: Biome lint (Phase 10-P5: ESLint から移行)
```
引用符なしスカラー内の **「: 」(コロン+スペース)** が mapping entry の誤パースを
引き起こし、GitHub がワークフローを起動できなかった。
js-yaml (strict/json モード) で再現・検証 → `bad indentation of a mapping entry (42:38)`。

## 修正

- `name: "Biome lint (Phase 10-P5 ESLint から移行)"` (引用符 + コロン除去)
- docs/ops/CI_WORKFLOW.yml (正本) を修正 → `c415a0b` として push 済み。
- `.github/workflows/ci.yml` 側の同一修正コミットは **push 拒否**
  (GitHub App に workflows 権限が無い。§6.3 の既知制約)。
  → `git reset --soft` + file restore でローカル履歴をリモートに一致させ、
  ユーザーによる `cp` + push を待つ状態にした (内容は docs 側に保持)。

## ユーザーの次作業

```bash
git pull origin arena/01a0337c-dropmod
cp docs/ops/CI_WORKFLOW.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "fix(ci): apply YAML fix to workflow file"
git push origin arena/01a0337c-dropmod
```
push をトリガーに CI (static-checks → build → e2e) が自動実行される。
エージェント側から gh CLI で run 状況を監視・報告可能。

## 教訓 (skills 反映)

- workflow YAML の name 等に「: 」を含める場合は必ず引用符で囲む
- YAML 検証は js-yaml の { json: true } (strict) で行う。緩い検証では
  この手のエラーを見逃す (前セッションの「簡易チェック」は見逃した)
- CI_SETUP.md のトラブルシューティングに追記済み

## 検証

- 修正後 YAML を js-yaml strict で両ファイルともパース OK (jobs 3 つ認識)
- typecheck / lint 実施 (docs + yml のみ)

## 追記 (第 2 障害): pnpm バージョン重複指定 (同日)

ユーザーの再 push 後の run 33059506807 は YAML を通過したが、
`pnpm/action-setup` が 5 秒で失敗:

```
Error: Multiple versions of pnpm specified:
  - version 11 in the GitHub Action config with the key "version"
  - version pnpm@11.24.0 in the package.json with the key "packageManager"
```

→ 3 ジョブの `version: 11` を削除し packageManager から解決させるよう修正。
js-yaml strict で再検証 (jobs 3 つ・version キーなし)。
CI_SETUP.md のトラブルシューティングに追記。

備考: Actions のログ blob (productionresultssa3.blob.core.windows.net) は
Sandbox から到達不可のため、check-runs の annotations API で原因取得した
(失敗原因調査時の定石)。

## 追記 (第 3 障害): .next を artifact 化できない (同日)

run 33060388012: static-checks ✓ (1m4s) / build ✓ (39s) / e2e ✗ (15s)。
e2e は「Download .next build output」で失敗 — build job の upload が
「No files were found with the provided path: .next/」で空だったため。

原因: **upload-artifact v4 は隠し (ドット) ディレクトリ配下を対象外**
(excludeHiddenFiles)。`.next/**` はパターン変更では救えない。
@actions/glob を excludeHiddenFiles: true で実行して 0 件マッチを実証。

修正 (docs/ops/CI_WORKFLOW.yml):
- build job: `tar --exclude='.next/cache' -czf next-build.tgz .next` →
  単一ファイルを upload (cache 除外でサイズ削減)
- e2e job: download → `tar -xzf` で復元
- 存在しない `.next/diagnostics/` の Upload build stats step を削除

備考: 前回 run で PR event の run 33060389625 は success (1m58s) —
static-checks + build は CI 上で green を確認済み。
