# DEP-1 依存関係 latest 更新（メジャー含む）

> Date: 2026-08-30(JST) / Branch: arena/01a04e55-dropmod

## 1. 指示内容 (Task Summary)

package.json のアップデートをメジャー込みで全部進める。

## 2. 実行内容 (Executed Actions)

- next 16.3.3 / TanStack Query 5.102.x / RTL パッチ
- web-vitals 6.2.1 / jest-dom 7 + @testing-library/dom / jsdom 30 / plugin-react 6 / vite 8.2.2 / typescript 7.0.2
- engines.node >=22.22.2（jsdom 30 / jest-dom 7 要件）
- vitest.config の `__dirname` → `import.meta.dirname`（Vite 8 native configLoader 警告回避）
- 4 検証: typecheck / biome / 1232 tests / build (Next 16.3.3, TS 7 で typecheck 2.1s)

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- `typescript: ^7` だけでは latest タグが 5.9.3 のため 5 系に解決される。`pnpm add -D typescript@7.0.2` が必要
- Next 16.3.3 は TS 7 の Compiler API 無しでも `next build` の Running TypeScript が通った
- plugin-react 6 は Vite 8 専用。vite 7 のまま上げると unmet peer

## 4. 次にすべきこと (Next Actions)

CI E2E で jsdom 以外（Playwright）の回帰確認。ユーザー実機は不要（依存のみ）。
