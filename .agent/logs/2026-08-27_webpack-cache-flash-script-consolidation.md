# webpack キャッシュ修正 + 白フラッシュ修正 + script/ 統合

> Date: 2026-08-27 (JST) / Branch: `arena/01a04363-dropmod`

## 1. 指示内容 (Task Summary)

1. ボタン押下・ページ遷移時にコンポーネントが「白くピカピカ光る」のを直したい (ユーザーは SSR 影響と推測)。
2. webpack ビルドの `[webpack.cache.PackFileCacheStrategy] Caching failed for pack: Can't resolve 'next.config.compiled.js'` 警告を無くし、**キャッシュが実際に通るように**したい。
3. `script/` と `scripts/` がわかりにくい → `scripts/` に統合。
4. (質問) Next.js なのに `src/` フォルダが無いのはなぜ?

## 2. 実行内容 (Executed Actions)

| 変更 | 内容 |
| :--- | :--- |
| `next.config.ts` → **`next.config.mjs`** | Next 16 は next.config.ts を `next.config.compiled.js` にコンパイルして読み込み後に削除するため、webpack の persistent cache が同パスを解決できず毎回無効化されていた。`.mjs` は直接読み込まれるため解決 |
| next.config.mjs から **webpack cache の独自 override を削除** | 独自 `config.cache` override は pnpm レイアウトで `mini-css-extract-plugin` の pack 解決を壊す (検証で発見)。Next 標準の cache 設定 (`.next/cache/webpack`) は pnpm 対応済み |
| `app/globals.css` | `.glass-panel` / `.custom-dropdown-menu-portal` から `backdrop-filter: blur(16px)` を削除。`--bg-panel` の不透明度を dark 0.85→0.92 / light 0.92→0.96 に上げて視覚維持 |
| `script/` 削除 + 参照更新 | `script/build.ts` (1 行の re-export エントリ) を削除し、package.json の build を `scripts/build.ts` 直参照に。tsconfig.test.json の include から `script/**/*.ts` を除去 |

検証:
- **webpack キャッシュ**: 警告を Sandbox で再現 → .mjs 化 + override 削除で **警告ゼロ・コールド 14.7s → ウォーム 4.8s** (TypeScript 4.7s → 1.9s) を実測。`.next/cache/webpack` にキャッシュ生成を確認 (PRoot では scripts/build.ts の symlink で永続化)
- typecheck 0 error / biome 0 warning (212 files) / test:unit 548 passed / build (turbopack) exit 0

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **next.config.ts と webpack persistent cache は両立しない (Next 16)**: コンパイル後の `next.config.compiled.js` がビルド後に削除されるため、次回ビルドのキャッシュ検証で必ず resolve 失敗する。「Caching failed for pack」が毎回出る=キャッシュが一度も効いていなかった、という意味。`.mjs` 化が正解。
- **webpack cache は独自 override しない**: Next 標準の cache snapshot 設定は pnpm の symlink レイアウトに対応している。`buildDependencies` 等を自前で再設定すると、逆に pnpm で pack 解決が壊れる (mini-css-extract-plugin は next の依存で root に hoist されない)。
- **backdrop-filter の白フラッシュ**: GPU のない環境 (PRoot / software rendering) では、blur レイヤーの再ラスタライズ時に未初期化の (白い) サーフェスが一瞬表示される。ボタン押下やページ遷移で DOM が変わるたびに固定 glass 要素 (sidebar / header / bottomnav) が再合成 → 「ピカピカ」。**SSR は無関係** (theme FOUC は cookie + inline script で既に防止済み)。対策は blur を諦めて不透明度で視覚を維持すること。
- `btn-hover-effect` クラスは **CSS 定義が存在しない dead class** (Vite 時代の名残) であることを確認。
- src/ について: Next.js は `app/` を root 置きするか `src/app/` にするか**どちらも公式サポート** (設定不要・機能差ゼロ)。本プロジェクトは Vite 移行時に root 置きで開始したため。移行は可能だが全 import パス変更 (~100 ファイル) で利益が薄い。

## 4. 次にすべきこと (Next Actions)

1. ユーザー環境で `pnpm build` を 2 回実行し、(a) 警告ゼロ、(b) 2 回目が高速化、を確認。
2. 白フラッシュがモーダル**内部**でも残る場合は、モーダルオーバーレイの `backdrop-blur-md` (9 ファイル) も削除する (1 行変更 × 9)。
3. src/ 移行は希望があれば別タスクとして実施可。
