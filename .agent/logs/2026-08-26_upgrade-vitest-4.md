# vitest 3.2.7 → 4.1.11 アップグレード + Node 24 回避策 (vitest.environment.ts) の削除

> Date: 2026-08-26 (JST) / Commit: `ccd5f98` / Branch: `arena/01a04363-dropmod`

## 1. 指示内容 (Task Summary)

vitest.environment.ts のコメントに記載済みの後片付けを実施すること:
vitest 4 へのアップグレード時に上流で vitest#8374 が解決されるため、
カスタムテスト環境 (vitest.environment.ts) を削除し、
vitest.config.ts の `environment` を `'jsdom'` に戻す。

## 2. 実行内容 (Executed Actions)

| 変更 | 内容 |
| :--- | :--- |
| `package.json` / `pnpm-lock.yaml` | vitest / @vitest/coverage-v8 / @vitest/ui を 3.2.7 → **4.1.11** に。**vite ^7.3.6 を devDependencies に明示追加** |
| `vitest.config.ts` | `environment: './vitest.environment.ts'` → `'jsdom'`。コメントを「vitest 4 で上流解決済み」の事実に更新 |
| `vitest.environment.ts` | **削除** (54e58f8 で導入した AbortController/AbortSignal 差し戻し workaround) |
| `__tests__/hooks/useProfiles.test.tsx` | Harness mock 3 種 (setThemeState / showToast / confirmDialog) を `Mock<シグネチャ>` + `vi.fn<シグネチャ>()` で明示型付け |
| `__tests__/hooks/useZipImport.test.tsx` | 同上 3 種 (setCurrentProfileId / setIsNewProfileModalOpen / showToast)。setProfiles は `as unknown as React.Dispatch` で渡すため従来型のまま |
| `AGENT.md` §6.1 / skills `project-overview` / `testing` / `index.md` | Vitest 4 化 + 知見反映 |

検証 (node v24.19.0 / pnpm 11.24.0): typecheck 0 error / biome lint 0 error (169 files) / **test:unit 376 passed / 42 files** / build exit 0 / .archive/vite/ 無変更。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **vitest#8374 は vitest 4.1.11 で解決済み（実証）**: 素の `environment: 'jsdom'` + Node v24.19.0 で fetch 系テスト含む 376 tests 全 pass。workaround は完全に不要。
- **vite の peer 固定が必須**: vitest 4 は vite `^6||^7||^8` を依存に持つ。pnpm の自動解決に任せると **vite 8.2.2** (2026-08 時点の latest) が入り、`@vitejs/plugin-react@4.7.0` (peer `^4.2〜^7`) と不整合。`vite: ^7.3.6` を devDependencies に明示固定して解決（plugin-react 6 系は vite 8 + oxc スタックで別世界のため、今回は見送り）。
- **vitest 4 の vi.fn 型変更**: `vi.fn()` が constructor 呼び出し可能な型 (`MockInstance<Procedure | Constructable> & (new (...) => any) & {}`) を返すようになり、`ReturnType<typeof vi.fn>` は `(x: string) => void` 等のパラメータ型と非互換。**`vi.fn<(id: string) => void>()` の明示ジェネリクス**で解決（`Mock<T>` を import して Harness interface に使う）。→ skills/testing.md に反映済み。
- **V8 coverage の AST ベース再マッピングで数値が変わる（重要・未解決）**:
  - vitest 3（同一ソース）: stmt/lines 68.42 / branches **78.33** / functions 90.77
  - vitest 4: stmt 69.42 / lines 70.82 / branches **59.22** / functions 74.1
  - branches/functions は大きく低下（旧 v8-to-istanbul は過大計上だった）。stmt/lines はむしろ微増（ランタイムコード無し行が除外されるため）。
  - **threshold 違反は一部「元から」**: components stmt/lines は vitest 3 でも **49.86% < 50%** で違反していた（Phase 10-P1 / ルーティング再設計で追加された landing/* ・BottomSheet 系・DesktopSidebar 等の未テストファイル。test:unit は threshold を見ないため気づかず、CI も最近未実行）。vitest 4 ではさらに global branches (59.22<60)・lib/store branches (76.05<80)・hooks branches (54.86<60)・components functions (42.13<50) も違反。
  - CI (docs/ops/CI_WORKFLOW.yml) は `pnpm test:coverage` を gate にしているため、CI 整備時に要対応。
  - skills/testing.md の「カバレッジ 91%+」は Phase 10-P1 以前の古い数値だった（今回訂正）。

## 4. 次にすべきこと (Next Actions)

1. **coverage threshold 違反の対応方針をユーザーに確認**（本タスクの完了報告時に質問予定）:
   - (a) AST ベースの新数値に threshold を再キャリブレーション
   - (b) 既存ポリシー（E2E 担保の server/presentational は exclude）に沿って除外リストを拡充
   - (c) 未カバー対象にテストを追加
2. CI の green 確認（vitest 4 化後の static-checks + E2E。ユーザー側作業）。
3. Phase 11-A（データモデル基盤: ProjectItem 化 + Dexie v2 migration）の実装着手。
