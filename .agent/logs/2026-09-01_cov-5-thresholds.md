# COV-5: thresholds 90% 化

> Date: 2026-09-01(JST) / Commit: `95e2c4a` / Branch: `arena/01a0533e-dropmod`

## 1. 指示内容 (Task Summary)

coverage 90% 計画 (`docs/planning/COVERAGE_90_PLAN.md`) の最終段 **COV-5**。
`vitest.config.ts` のグローバル thresholds 4 指標すべてを 90 に引き上げ、per-module
thresholds も 90 未満のものを 90 に統一する (lib/state は 95/90/95/95 維持)。
`pnpm test:coverage` が exit 0 になることを確認し、CI 全 green で完了とする。

## 2. 実行内容 (Executed Actions)

| # | 内容 | 結果 |
|---|---|---|
| 1 | 90% 化に失敗する glob を特定 (フルスイート計測): `src/lib/query/**/*.ts` (br 86.21)・`src/hooks/**/*.ts` (br 87.32) の 2 glob のみ | coverage-final.json 集計 |
| 2 | `lib/query/hooks.test.tsx` に 3 テスト追加 (useVersionsQuery mcVersion/loader 未指定・useProjectsBatchQuery ids=null・enabled:false 明示) | 12 tests |
| 3 | `useModalA11y.test.tsx` に 5 テスト追加 (ref 未割り当てガード ×2 / 内部 Tab・Shift+Tab 非ラップ / tabindex 既存コンテナ) | 19 tests |
| 4 | `useMediaQuery.test.ts` 新規 (matchMedia 無し・初期値・change listener 発火・cleanup・useIsMobile) | 5 tests |
| 5 | `src/lib/query/hooks.ts` の `stableIds.length ?? 0` から `?? 0` を除去 (右オペランド到達不能。v8 が分岐計上) | 挙動不変 |
| 6 | `vitest.config.ts`: グローバル 60→90 (4 指標)、per-module は 90 未満を 90/90/90/90 に統一 (lib/state は 95/90/95/95 維持) | - |
| 7 | typecheck / biome lint / フル `pnpm test:coverage` | 全 pass / **exit 0** |

## 3. 実測値 (フルスイート `pnpm test:coverage`、thresholds 90% 適用後)

- **全体: 96.56 / 90.52 / 98.26 / 97.85** (st/br/fn/ln)、**123 files / 1603 tests**、
  `test:coverage` **exit 0**
- 全 14 per-module glob が 90% 以上:
  - lib/query: hooks.ts **100/100/100/100** (?? 0 除去 + 3 テスト追加)
  - hooks: useModalA11y br 90.38 (47/52)・useMediaQuery **100/100/100/100**・
    useScrollDirection br 92.31・useModalUi 100
  - components (tsx): 97.16/91.72/97.73/98.52 (BottomSheet 86.52 も aggregate で OK)
  - その他 11 glob すべて OK (詳細は coverage/coverage-summary.json)

## 4. 残存の未カバー分岐 (いずれも到達不能ガード)

- **useModalA11y**: 52 分岐中 5 未カバー — `mountedUids.has(uid)` 真 (StrictMode
  double-push は cleanup が必ず走るため発火しない)・cleanup の `idx >= 0` 偽
  (stack から必ず見つかる)・`!first || !last` 真 (L108 で length 0 は先に return)・
  `prev && typeof prev.focus === 'function'` 偽 (jsdom の activeElement は常に body)
- **hooks.ts の `?? 0`** は到達不能のため**除去** (デッドコード除去方針、COV-2/3 と同様)
- 全体 branches 90.52 は 90 を +0.52pt 上回る。BottomSheet 等の防御ガード分岐は
  E2E / 実運用で担保される範囲を超えて到達不能

## 5. 完了条件の確認

| 条件 | 結果 |
|---|---|
| グローバル thresholds 4 指標すべて 90 | ✅ `statements: 90, branches: 90, functions: 90, lines: 90` |
| `pnpm test:coverage` exit 0 | ✅ 96.56 / 90.52 / 98.26 / 97.85 |
| CI 全 green | ✅ PR #7 (pull_request CI) で Type/Lint/Unit + Build が green を確認 (後続 push で再確認) |
