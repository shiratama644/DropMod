# Hook: Pre-Task（タスク開始時）

> **トリガー**: ユーザーから指示を受け、作業を開始する直前。
> **目的**: 現状を把握し、必要な知識だけを読み込み、スコープ違い/履歴破壊を防ぐ。

## 手順

### 1. 現状把握（AGENT.md §4.1）

```bash
git status
git branch --show-current
git log -5 --oneline
```
- ※ ブランチ名は**セッションごとに変わる**。AGENT.md §4.4 の記載値を鵜呑みにせず、必ず `git branch --show-current` で確認する（今セッションは `arena/01a04363-dropmod`）。過去セッションのブランチ名は文書に残さない方針（AGENT.md §4.4）。
- 未コミット変更があれば勝手に破棄・混入しない。
- ログが起点 1 件のみ / `git status` が大量の削除+未追跡 / `node_modules` 無 → **Sandbox 再構築**。→ [`sandbox-rebuild-recovery.md`](./sandbox-rebuild-recovery.md)。

### 2. 知識のピンポイント読込（本 hook の核心）

[`../skills/index.md`](../skills/index.md) の「読み方ガイド」で**該当スキルだけ**を読む。
- 全スキルを常に読まない（コンテキスト浪費）。
- 初回/全体把握が必要な時だけ `project-overview.md` + `architecture-and-data-flow.md`。
- 例: 画像→`image-strategy.md`, State→`state-and-storage.md`, Modrinth→`modrinth-integration.md`。

### 3. `.archive/vite/` 不変の意識

- Phase 全期間で `.archive/vite/` は**絶対変更禁止**（§4.5）。作業前から意識しておく。
- commit 前に `git diff --stat -- .archive/vite/` が空であることを確認する習慣（→ [verify-before-commit.md](./verify-before-commit.md)）。

### 4. docs/ と実コードの優先順位（§6.9）

- 計画書（`docs/planning/PHASE*_PLAN.md`）と AGENT.md/skills が矛盾 → **計画書が正**。
- 計画書に無い事項 → AGENT.md（特に §6）→ skills の順。
- ※ docs/README.md の目次は Phase 9-F 時点でやや古い（PC UI一新・`/profile` URL 等は実コードが先行）。実コードを最終確認。

### 5. タスク粒度の確認（§1.2）

1 タスク = 1 つの意味のある論理的単位。「ついでに」スコープを広げない。

## 完了後

→ 実装 → [`verify-before-commit.md`](./verify-before-commit.md) で検証 → commit/push → [`log-task.md`](./log-task.md) でログ記録。
