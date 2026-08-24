# Hook: Log Task（タスク完了時のログ記録）

> **トリガー**: ユーザーからの指示（タスク）を完了し、commit/push した直後。
> **目的**: 実行記録を残し、得た知見をスキルへ同期して記憶をアップデートする。

## 1. ログファイル作成

**パス**: `.agent/logs/YYYY-MM-DD_<kebab-case-summary>.md`
- 日付 = 今日（ハイフン区切り, 時系列ソート用に先頭）。
- summary = タスク内容の kebab-case（例: `fix-image-display-performance-and-quality`）。
- 同日に複数タスクがある場合は summary で識別（同日内は summary 辞書順でソート）。

## 2. 記述テンプレート（4 セクション）

```markdown
# <Task Title>

> Date: YYYY-MM-DD(JST) / Commit: <hash> / Branch: <branch>

## 1. 指示内容 (Task Summary)
ユーザーから依頼された具体的な内容・ゴール。

## 2. 実行内容 (Executed Actions)
実行した手順・変更ファイル・使用コマンド。表でまとめる推奨。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)
実装中に発見した仕様・注意点・コードベースの癖。
（※ 重要な知見は .agent/skills/ にも同期し、skills/index.md を更新する）

## 4. 次にすべきこと (Next Actions)
今後発生しうる課題・リファクタ候補・次に指示されそうな事項。
```

## 3. 知見のスキル同期（重要）

「3. 気づいたこと」が**再利用性の高いコードベース知識**なら、該当する `.agent/skills/*.md` に反映する:
- 既存スキルを更新 → [`../skills/index.md`](../skills/index.md) の該当行「最終更新」日付を更新。
- 新スキルが必要 → 新規 `kebab-case.md` 作成 → `skills/index.md` の「読み方ガイド」「一覧」両方に追記。
- ※ 一過性の作業メモ（「〇〇のコミットハッシュ」等）はスキル化せずログに留める。

## 4. 完了条件

- ログファイル作成済（4 セクション記載）。
- 必要に応じてスキル + skills/index.md 更新済。
- （ログ・スキル・index も含めて）commit/push 済。

## 運用メモ

- ログは**追加のみ**（過去ログを書き換えない）。修正は新ログで。
- ログの目的は「次回の自分（別セッション）が過去の判断経緯を追えること」。主観・推測も明記してよい（§7.3）。
