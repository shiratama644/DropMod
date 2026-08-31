# 2026-08-31 ORG-2 src/ 移行 + サンドボックス再構築復旧

## 指示内容

- ユーザー「ORG-2 を許可します」→ src/ 移行 (計画 §10.3)
- coverage threshold 未達への対処はユーザー判断「別タスクに切り出し (推奨)」

## 実行内容

### 1. サンドボックス再構築の検知と復旧 (AGENT.md §4.1.1)

ORG-2 作業中に `git log` が起点 `57708ca` のみに戻り、push 済みコミットの
ファイルが未追跡として混在する状態を検知 (fb1a15fe / 3ffe918a が unknown
revision・ログファイルが ?? に再出現)。

復旧手順 (§4.1.1):
1. `git fetch origin arena/01a0533e-dropmod` → FETCH_HEAD = `3ffe918a` を確認
2. `git reset --hard FETCH_HEAD` (再構築後の初回のみ許可される例外)
3. `corepack enable pnpm && pnpm install --frozen-lockfile` (10.6s・キャッシュ有効)
4. 健全性確認: typecheck 0 error / test:unit 115 files 1244 tests pass

未コミットだった src/ 移動は失われたが、内容は記録済みだったため再実行した。

### 2. ORG-2a: src/ 移行 (コミット `2d22083`)

- 7 ディレクトリを `git mv` で src/ へ (app / components / features / hooks /
  lib / types / styles = 197 件・すべて rename 100% 類似度)
- 設定更新:
  - `tsconfig.json`: `"@/*"` → `"./src/*"` + ルート残置へのエイリアス
    `"@/__tests__/*"`・`"@/scripts/*"` を追加 (テスト 46 箇所の参照を維持)
  - `tsconfig.test.json`: include に src/ プレフィックス
  - `vitest.config.ts`: alias を src/ へ + coverage include/exclude/thresholds の
    glob に src/ プレフィックス (56 箇所)
  - `biome.json`: fontawesome-subset.css 除外パスを src/ へ
  - `src/app/globals.css`: `@source not` を `../../.archive` / `../../.agent` に
- `.next` を削除して `pnpm exec next typegen` で再生成 (移動前の型キャッシュ対策)
- 検証: typecheck 0 / biome 0 / test:unit 1244 passed / build exit 0
  (Route (app) 全 20 認識 = src/app 有効化確認・CSS 死クラス流出なし)

### 3. coverage threshold 未達の調査と切り出し (ORG-5)

`pnpm test:coverage` が以下で失敗 (移動後の src/ パス表記で):
- `src/features/profiles/store/store.ts` branches 76.47% < 80%
- `src/hooks/**/*.ts` branches 59.15% < 60%

**既存問題の証明** (ユーザー判断の材料):
- 対象ファイルの内容 (store.ts / useModalA11y.ts) が移動前後で完全に同一
- thresholds 設定がパス表記以外同一
- 8/30 の CI run (`4b53625` / `57708ca`) が既に failure (移動前)
- 8/29 の run は success → 8/30 の ARCH-2 系変更で threshold 未達が発生

ユーザー判断「別タスクに切り出し」により task-list に ORG-5 を採番。
ORG-2 の完了条件は「coverage 設定の src/ 化が正しく機能し、数値が移動前と
同一」で達成とした。

## 気づき

- **サンドボックス再構築はいつ起きてもおかしくない**: 作業は細かくコミット +
  push して checkpoint を作ること (§4.2)。未 push の作業は再構築で消える。
- **再構築の検知方法**: `git log --oneline` が起点コミットのみに減る / push 済み
  のファイルが ?? に再出現 / ログファイルが未追跡化。AGENT.md §4.1.1 のヒント
  と完全一致した。
- **coverage threshold は「移動のせい」に見えても移動起因とは限らない**:
  ファイル内容・設定を移動前後で diff し、CI 履歴 (gh api) で発生時期を特定して
  から対処を判断する。
- **`@/__tests__` エイリアス**: src/ 移行で `@/*` が `./src/*` を指すようになり、
  ルート残置の `__tests__/`・`scripts/` への `@/` 参照 (46 箇所) が解決不能に
  なった。tsconfig paths + vitest alias の両方に個別エイリアスを追加して解決。

## 次アクション

- ORG-3 (ドキュメント更新) の許可をユーザーに求める
- ORG-5 (coverage threshold 回復) は未着手。useModalA11y のテスト新規作成 +
  store.ts の未カバーブランチ埋めが候補
