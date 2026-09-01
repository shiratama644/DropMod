# Hook: Verify Before Commit（commit 直前検証）

> **トリガー**: 実装が終わり、Git Commit する直前。
> **目的**: AGENT.md §3.1 の 4 検証を必ず全 pass させてから commit する。途中の検証失敗で次へ進んではならない。

## 4 検証（順に実行、1 つでも失敗したら原因特定→修正→再全検証）

```bash
pnpm typecheck                # tsc --noEmit (main + tsconfig.test.json 両方)
pnpm exec biome lint .        # Biome 直接呼出（pnpm lint より起動が速い）
pnpm test:unit                # vitest run （※ pnpm test は watch なので使わない）
pnpm build                    # Next.js production build (turbopack)
```

### 各コマンドの注意

- **typecheck**: `tsc --noEmit && tsc --noEmit -p tsconfig.test.json`。`noUncheckedIndexedAccess` 有効なので配列アクセスに注意。
- **biome lint**: `0 error / 0 warning` まで。`biome-ignore` は対象コードの**直前の行**に置く（1 行以上離れると unused 判定で逆に警告になる, §6.5）。自動生成 CSS（`src/styles/fontawesome-subset.css`）は biome.json で除外済。
- **test:unit**: `pnpm test`（watch）**ではない**。必ず `test:unit`（vitest run）。
- **build**: Modrinth `ECONNRESET`/`TypeError: fetch failed` は **Sandbox 制約で無視**（§6.2）。**exit code 0 なら成功**。
  - bundle サイズは turbopack が出力しない → `find .next/static -name "*.css" -exec ls -lh {} \;` 等で直接確認。
  - `.archive/vite/` は build 対象外（`tsconfig.json` exclude 済）。

## 追加確認（commit 前）

```bash
git status
git diff                       # 意図しないファイル/差分が無いか
git diff --stat -- .archive/vite/   # ← 必ず 空 であること（§4.5 絶対不変）
```

## 検証失敗時の原則（§3.2）

- テストを通すためだけの**不正な修正厳禁**（テスト削除/skip・アサーション緩和・安易な `any`・Lint 無効化・エラー握り潰し）。
- 既存テストが落ちたら「テストが間違っている」と即断せず、**既存仕様を壊していないか**先に確認。

## E2E について

- `pnpm test:e2e`（Playwright）は **Sandbox では実行不可**（Chromium install 不可）。CI（GitHub Actions）でのみ。
- commit 前検証には**含めない**。書けるがローカルで走らせない。

## 完了後

4 検証 all pass + `.archive/vite/` 無変更 を確認 → commit（Conventional Commits 形式）→ `git push origin <session-branch>`。
