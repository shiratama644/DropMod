# Hooks Index — 定型ワークフロー & トリガー

> このファイルは `.agent/hooks/` の**入口**。特定トリガー時に本ファイルで該当フックを特定し、
> 手順（`.md`）やスクリプト（`.sh`）を実行する。作業規約の本体は `AGENT.md`（§2/§3/§4）。
> ここは「いつ・どのフック」の索引と、再利用可能な具体手順。

## トリガー → フック 対応表

| トリガー（いつ） | フック | 形式 |
| :--- | :--- | :--- |
| **タスク開始時**（ユーザー指示を受けた直後） | [`pre-task.md`](./pre-task.md) | 手順 |
| **commit 直前**（§3.1 検証） | [`verify-before-commit.md`](./verify-before-commit.md) | 手順 |
| **タスク完了時**（ユーザー指示を完了した直後） | [`log-task.md`](./log-task.md) | 手順 |
| **Sandbox 再構築を検知**（`git status` が大量削除/未追跡, node_modules 無, ログが起点1件） | [`sandbox-rebuild-recovery.md`](./sandbox-rebuild-recovery.md) + [`restore-sandbox-env.sh`](./restore-sandbox-env.sh) | 手順 + スクリプト |

## フック一覧

| ファイル | 実行トリガー | 対象 / 内容 |
| :--- | :--- | :--- |
| [pre-task.md](./pre-task.md) | タスク開始時 | 現状把握（git status/branch/log）→ `.agent/skills/index.md` から必要スキルをピンポイント読込 → `.archive/vite/` 不変意識 |
| [verify-before-commit.md](./verify-before-commit.md) | commit 直前 | 4 検証（typecheck/biome/test:unit/build）+ `.archive/vite/` 無変更確認 + bundle 確認 |
| [log-task.md](./log-task.md) | タスク完了時 | `.agent/logs/YYYY-MM-DD_<summary>.md` 作成（4 セクション）→ 重要知見を `.agent/skills/` へ同期 → `skills/index.md` + 本 index の「最終更新」更新 |
| [sandbox-rebuild-recovery.md](./sandbox-rebuild-recovery.md) | Sandbox 再構築検知時 | `git fetch` → `reset --hard FETCH_HEAD`（例外的許可）→ `restore-sandbox-env.sh` で依存再構築 → 健全性確認 |
| [restore-sandbox-env.sh](./restore-sandbox-env.sh) | 上記から呼出 | `corepack enable pnpm` + `pnpm install --frozen-lockfile` |

## 運用ルール

- フックは**必須実行**ではなく「該当トリガー時に**必ず参照すべき**手順」。迷ったら該当フックを読む。
- 新フック追加時は本 index の「対応表」「一覧」両方に追記する。
- 実行スクリプト（`.sh`/`.py`）は `kebab-case` + 拡張子。手順は `kebab-case.md`。
- フック内のコマンドは `package.json` script or 既知コマンドのみ（捏造禁止, AGENT.md §3.1）。
