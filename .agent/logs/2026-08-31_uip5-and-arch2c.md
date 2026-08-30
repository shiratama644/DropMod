# 2026-08-31 UIP-5 補完 + ARCH-2C 完了化

## 指示内容

- 「UIP-5 に着手し、ARCH-2C に着手してください」
- UIP-5: Samsung Browser モーダル途切れ + 2 カラム作者省略（完了条件: 実機で途切れないこと）
- ARCH-2C: `lib/server` → `lib/platform` リネーム

## 実行内容

### 調査（shallow clone の解消）

- `.git/shallow` に `57708ca` があり **shallow clone** 状態を確認。
  前回調査で「`a8ea685` / `a8fe85b` 等は git オブジェクトとして不存在」と
  誤認していたのはこのため。`git fetch origin --unshallow` で全履歴を取得し、
  **全 SHA が実在することを確認**（a8ea685: UIP-5 / a8fe85b: ARCH-2C /
  ea923d5: ARCH-2A / eb2a1a1: ARCH-2B）。

### UIP-5（コミット `e90e7927`）

- 実装は `a8ea685` で完了済みを確認: `.modal-max-h {max-height:92%}`（vh 非依存）
  を 5 モーダル（NewProfile / EditProfile / DependencyCheck / ModDetailModalShell /
  ScreenshotGallery）+ ModCard の `showAuthor = !(layout === '2' && isMobile)` +
  ModCard テスト +35 行。
- **適用漏れ 2 モーダルを追加修正**（ユーザー判断「揃える」）:
  `ModpackImportModal` / `SyncPreviewModal` の `max-h-[85vh]` → `modal-max-h`。
  どちらも内部 `flex-1 overflow-y-auto` のため % 制限で収まる。
- 検証: typecheck 0 / biome 0 / test:unit 1244 passed / build exit 0。

### ARCH-2C（コミット `fb1a15fe`）

- 実装は `a8fe85b` で完了済み（26 files: lib 4 ファイル + テスト 3 移動 + import 16 件）。
- 残っていたのは **docs の陳腐化のみ** で、以下を是正:
  - `docs/task-list.md`: ARCH-2C 行が a8fe85b 内の一括置換で
    「lib/platform → lib/platform」に化けていた → 修正 + 状態
    「未着手 0%」→「完了 100%」+ 証拠 `a8fe85b`。
    進行中タスク行も「ARCH-2D」→「なし（2A〜2D すべて完了）」へ。
  - `.agent/skills/`: app-profile (7) / modrinth-integration (2) /
    routing-and-pages (1) / testing (1) の `lib/server` stale 参照を
    `lib/platform` へ。project-detail は実パス `features/project/api/projectDetail.ts` へ
    （ARCH-1F で移動済みのため単純置換不可だった）。
  - `.agent/skills/index.md`: 4 スキルの最終更新日を 2026-08-31 へ。
  - `.agent/logs/` の 4 ファイルに残る `lib/server` は AGENT.md §8.5 により
    **置換対象外**（時点記録として保持）。
- 検証: typecheck 0 / biome 0 / test:unit 1244 passed / build exit 0。

### push

- `git push origin arena/01a0533e-dropmod` 完了（新規ブランチ）。

## 気づき

- **shallow clone が「コミット不存在」誤認の原因だった**。`.git/shallow` を
  先に確認してから `git fetch origin --unshallow` で全履歴を取得すべき。
  将来、計画書の証拠 SHA を検証する際はまず shallow 判定をする。
- a8fe85b の一括置換（`lib/server` → `lib/platform`）が task-list.md の
  **定義行「lib/server → lib/platform」自体を置換**して「lib/platform →
  lib/platform」に化けていた。一括置換時は「対象行の意味が壊れないか」まで
  確認すること（DOC-4 の教訓と同種）。
- UIP-5 の適用対象は a8ea685 時点で「5 モーダル」と明記されていたが、
  残り 2 モーダル（ModpackImport / SyncPreview）も同一構造のため
  実機で切れる余地があった。ユーザー確認のうえ今回スコープに含めて是正。

## 次アクション

- UIP-5 は**実機確認が残っている**（完了条件「Samsung Internet 実機で
  モーダル途切れないこと」・ユーザー担当）。全 7 モーダル
  （NewProfile / EditProfile / DependencyCheck / ModDetailModalShell /
  ScreenshotGallery / ModpackImport / SyncPreview）を対象に確認していただく。
- ARCH-2C は docs 整合まで完了。次タスクはユーザー指示待ち
  （進行中タスクなし）。
