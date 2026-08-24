# Hook: Sandbox Rebuild Recovery

> **トリガー**: Sandbox 再構築を検知した時。AGENT.md §4.1.1 の手順実体版。
> **検知ヒント**: `git log --oneline` が起点コミット 1 件のみ / `git status` が「大量の削除 + 大量の未追跡」/ `node_modules` が無い。

## 背景

Arena の Sandbox は再構築されることがあり、その場合ワークツリーは
「起点コミットのファイル」＋「push 済みコミットで追加されたファイルの未追跡バージョン」が混在した状態で立ち上がる。
ファイルは破損していないので、以下で確実に復旧する。

## 手順

```bash
# 1. リモートの最新を fetch（※ ブランチ名は git branch --show-current で確認）
git fetch origin <session-branch>

# 2. FETCH_HEAD にワークツリーごとリセット
#    （この場合の --hard は §4.3 厳禁ルールの例外 = Sandbox 再構築後の初回のみ許可。
#     未コミット変更は元々存在しない状態のため安全）
git reset --hard FETCH_HEAD

# 3. 依存を再構築（下記スクリプト、または手動 2 行）
bash .agent/hooks/restore-sandbox-env.sh
```

## 復旧後の健全性確認

```bash
git log --oneline -5          # push 済みコミットが見えること
pnpm test:unit                # テストが通ること
```
→ 問題なければ作業再開。

## 注意

- `.archive/vite/` が「未追跡」になっている場合も、`git reset --hard FETCH_HEAD` で追跡状態に戻る（新規にファイルを触らないこと, §4.5）。
- `git reset --hard` は**この例外场景以外では厳禁**（§4.3）。誤用に注意。
