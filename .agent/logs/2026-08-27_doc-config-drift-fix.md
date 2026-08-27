# ドキュメント/設定ドリフトの是正 (実測値・ブランチ名・削除済み参照)

> Date: 2026-08-27(JST) / Commit: 本コミット / Branch: `arena/01a04363-dropmod`
> 対応 task-list ID: `DOC-3`

## 1. 指示内容 (Task Summary)

リポジトリ全体を理解するタスクの完了報告で提示した「理解の過程で見つけた不整合」
(削除済みファイルへの stale 参照・テスト件数の記載ズレ・旧ブランチ名) を修正する。
ユーザー指示: 「まずは修正してください。」

## 2. 実行内容 (Executed Actions)

| # | ファイル | 修正内容 |
| :--- | :--- | :--- |
| 1 | `vitest.config.ts` | `coverage.exclude` の **`components/AppContext.tsx` を削除** (Phase 10-B で実ファイル削除済みの dead entry)。コメントも実態に更新 |
| 2 | `docs/README.md` | 「コード側からの参照」表から **`components/AppContext.tsx` 行と `biome.json` 行を除去** (前者は削除済み、後者は JSON のためコメント参照を持てず旧 `eslint.config.mjs` も撤去済み)。除去理由を注記 |
| 3 | `README.md` | テスト規模を実測値に更新: 72 files/626 tests/84.5% → **73 files/637 tests/84.65%** (br 73.74 / fn 90.55 / lines 86.69 も併記)。ディレクトリ構成の `72 files` → `73 files` |
| 4 | `docs/ops/CI_SETUP.md` | カバレッジ実測値 629 tests/84.5% → **637 tests/73 files/84.65%**。push コマンドのハードコードされたブランチ名を **`$(git branch --show-current)`** に変更 (以後 stale 化しない) |
| 5 | `AGENT.md` | §4.1.1 の fetch 先 / §4.4 (5 箇所) / §5 の完了条件を `arena/01a04363-dropmod` → **`arena/01a04363-dropmod`** に更新。§4.4 に「ブランチ名はセッションごとに変わるため `git branch --show-current` で確認」+ 過去セッションの経緯を明記 |
| 6 | `.agent/hooks/pre-task.md` | 同上 (ブランチ名の確認手順を現在値に更新) |
| 7 | `.agent/skills/sandbox-constraints.md` | 同上 |
| 8 | `.agent/skills/testing.md` | 548 tests/65 files → **637/73**。coverage 総計 stmt 81.88/br 69.4/fn 89.01/lines 84.09 → **84.65/73.74/90.55/86.69** |
| 9 | `.agent/skills/project-overview.md` | 規模セクションを実測の表に置換 (app 1,871 / components 9,181 / lib 5,476 / hooks 2,541 / __tests__ 11,721 / e2e 1,266)。最大ファイル top5 を実測に更新。**フェーズ進捗の見出しと Phase 11 行が「Phase 11 前」「11-A/B/C 完了」のままだったのを、task-list.md の実態 (P11-E2E 完了・CI run `33071105483` green) に更新** + 正本は task-list.md である旨を明記 |
| 10 | `.agent/skills/index.md` | `project-overview.md` / `testing.md` の最終更新を 2026-08-27 に |
| 11 | `components/HomeInteractive.tsx` / `hooks/useZipExport.ts` / `hooks/useZipImport.ts` | **新規発見**: コード内コメントが「AppContext から取得」「AppContext の useMemo deps」と誤記 → 実機構 (useCurrentProfileWithFallback / AppShell の appActionsStore register deps) に修正。コメントのみの変更で挙動影響なし |
| 12 | `docs/task-list.md` | `DOC-3` を登録 (完了 / 100%) |

検証 (4 種): typecheck 0 error / biome 0 warning / **test:unit 637 passed / 73 files** /
build exit 0。**coverage exit 0** (全 threshold green)。`.archive/vite/` 無変更。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **数値をドキュメントに書く時は「実測したコマンドと日時」を併記する**のが腐敗防止に効く。
  今回 stale 化していた 4 箇所 (README / CI_SETUP / skills×2) はいずれも数値のみ書いて
  測定方法を書いていなかった。README には `(2026-08-27 実測)` を明記する形に統一した。
- **セッション依存の値 (ブランチ名) はハードコードせず `$(git branch --show-current)` で
  参照する**のが正解。CI_SETUP.md はこの方式に変えた。AGENT.md は規約文書なので
  現在値 + 「必ず git で確認」+ 過去経緯の 3 点セットにした。
- **`git grep` 相当の機械的 sweep が有効**: 旧ブランチ名・旧テスト件数・`AppContext` の
  3 種を grep で洗い出し、「正当な歴史的記述」と「stale な指示」を仕分けた。
  `.agent/logs/` (追加のみ)・`docs/audit/`・`docs/complete/` (時点記録) は**書き換えない**
  のが正しい判断だった。
- **`biome.json` のような JSON ファイルはコメントを持てない**ため、
  「コード側からの参照」表に載せること自体が誤りだった (旧 `eslint.config.mjs` 時代の遺物)。
- **dead な `coverage.exclude` エントリは無害だが誤解を招く**: 実在しないファイルを
  exclude に残すと「まだ存在する」と読める。設定ファイルもドキュメントと同じく棚卸し対象。
- **e2e-log.txt は削除しなかった**: `docs/ops/CI_SETUP.md` L33 が OOM の証跡として
  参照しているため。削除するなら参照も同時に消す必要があり、証跡価値の方が高いと判断。

## 4. 次にすべきこと (Next Actions)

1. Phase 12-A 着手前に `PHASE12_PLAN.md` §12 の設計論点 6 件をユーザーと確定する。
2. (任意) SEO 2-1 (モーダル直接ページの noindex) は早期実施推奨のまま未着手。
3. (任意) 数値記載のあるドキュメントは「大幅なテスト追加のたびに実測更新」を
   DOC-1 の備考どおり継続する。今回追加した `readInitialTheme` / `ModDetailPageView` 等の
   テストが README 反映から漏れていたのが今回のズレの原因だった。

---

## 追記 (同日・ユーザー追加指示): 旧ブランチ名の一括置換と push ルールの恒久化

### A. push ルール変更（AGENT.md §4.3.1 を新設）

ユーザー指示: 「これからはユーザーの確認がなくても push するように。理由は、Sandbox 再構築に
あった場合早急に対応できるため。ローカルコミットのみだと破棄される可能性がある」

- 旧ルール §4.3「明示的な許可のない `git push`」を**撤去**し、§4.3.1 として
  「**push は事前許可済み**（§3.1 の 4 検証 PASS ＋ `.archive/vite/` 無変更 ＋
  意図しない差分なしを確認できたら、その場で push する）」を明文化。
- push 先はセッション固定ブランチのみ。`main` 直接 push / 他ブランチ push / force push は引き続き禁止。
- **PR 作成も許可**された（`gh pr create`）。§4.4 の「PR は作らず直接 push」を改訂。
- `.agent/skills/sandbox-constraints.md` にも同じ方針を追記。

### B. 旧セッションブランチ名の一括置換

ユーザー指示: 「旧ブランチ名は新しいブランチ名に変更してください」

- `arena/01a01fcf-dropmod` / `arena/01a0337c-dropmod` → **`arena/01a04363-dropmod`** へ
  **26 箇所 / 19 ファイル**を一括置換（`docs/audit/issues-legacy.md` 5 箇所、
  `docs/audit/diff-vite-vs-nextjs.md` 1、`docs/complete/PHASE9_COMPLETE.md` 1、
  `.agent/logs/` 16 ファイル 19 箇所、AGENT.md / pre-task.md / sandbox-constraints.md の
  「過去セッション列挙」3 箇所）。
- AGENT.md §4.4 / pre-task.md / sandbox-constraints.md では、旧名を列挙する代わりに
  「**過去セッションのブランチ名は文書に残さない**（後続セッションが dead branch を
  fetch/push する事故防止）」という方針文へ書き換えた。
- 置換後、リポジトリ内（`.git` / `.archive` / `node_modules` 除く）に旧ブランチ名の残存は **0 件**。

### C. 記録しておくべき事実（§8.1 の追記専用原則に対する例外の明示）

- 今回の一括置換は **`.agent/logs/` 内の過去ログ 16 ファイルも対象**にした。これは
  AGENT.md §8.1「ログは追記専用（過去のログを書き換えない）」に対する
  **ユーザー明示指示による例外的な一括更新**である。
- 置換前の実ブランチ名は `arena/01a01fcf-dropmod`（Phase 0–9 期）と
  `arena/01a0337c-dropmod`（Phase 10–11 期）であり、**2026-08-27 時点でも origin 上に実在**する
  （`git ls-remote --heads origin` で確認。ほかに `arena/01a02eb5-dropmod` も実在）。
  したがって過去ログ中の「push 先ブランチ」記述は、置換により**当時の事実とは一致しなくなった**。
  当時の正確なブランチ名が必要になった場合は本項を参照すること。
- 同様に `docs/audit/issues-legacy.md` 等の「対象コミット: <branch> HEAD <sha>」は、
  ブランチ名が現行名に統一された一方 **コミット SHA は当時のもの**である。
  監査対象の特定には SHA を正とする。
