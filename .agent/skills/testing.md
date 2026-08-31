# Testing — vitest + msw + Playwright

> テスト・カバレッジ・モック・E2E を触る時に読む。

## コマンド（`package.json`）

| コマンド | 用途 |
| :--- | :--- |
| `pnpm test:unit` | `vitest run`（**commit 前検証はこれ**, `pnpm test` は watch なので使わない） |
| `pnpm test:coverage` | `vitest run --coverage`（per-module threshold チェック） |
| `pnpm test:e2e` | `playwright test`（**Sandbox では実行不可, CI のみ**） |

## スタック

- **Vitest 4** + jsdom 30 + @testing-library/react **16** + user-event 14 + **msw 2.15** + fake-indexeddb 6 + jest-dom 7（peer `@testing-library/dom`）。
  - **vite は `^8.2.2` + `@vitejs/plugin-react@^6`**（plugin-react 6 は Vite 8 専用。vitest 4 の peer は `^6||^7||^8`）。
  - Node 24 (undici v7) の fetch が jsdom 由来 AbortSignal を拒否する問題 (vitest#8374) は **vitest 4 で上流解決済み**。旧 workaround（`vitest.environment.ts` カスタム環境）は 2026-08-26 に削除し `environment: 'jsdom'` に戻した。
  - **vitest 4 の型変更**: `vi.fn()` が constructor 呼び出し可能型を返すため、`ReturnType<typeof vi.fn>` は `(x: T) => void` 系パラメータと非互換。特定シグネチャの引数に渡す mock は `vi.fn<(id: string) => void>()` のように明示ジェネリクスで型付けする（`Mock<T>` 型を import して Harness 等に使う）。
- 現状: **637 tests / 73 files pass**（2026-08-27 実測）。内訳の中心は Phase 11-A〜C
  （Dexie v2 migration / env 基盤: source・detector・analyzer・analysis・zipSource・profileName）
  と Phase 10.5 の hooks / 軽量 components、および `nextConfigSecurity` /
  `src/lib/platform/{profile,logger,rateLimit}` / `scripts/build-env` / `readInitialTheme` ほか。
- **coverage threshold 全 green**: `pnpm test:coverage` exit 0。総計 stmt **84.65** /
  br **73.74** / fn **90.55** / lines **86.69**（2026-08-27 実測）。
  - ⚠️ **branches % は `src/hooks/` 等のコメント・行編集でも ±0.2 程度ぶれる**（v8 の
    ブランチ位置マッピングが行数依存のため。2026-08-27 にコメント修正のみで
    73.92 → 73.74 に変動）。ドキュメントへ書く数値は必ず **その時点で再実行した結果**を
    使い、他セッションの記録を流用しない。stmt / fn / lines は安定していた。
  - 10.5-A: hooks branches 61.63% / global branches 61.54% まで回復
  - 10.5-B: components stmt 73.12 / br 67.7 / fn 76.51 / lines 75.17 まで回復
  - 10.5-C: lib/store branches 80%+ まで回復（confirm.ts cleanup の queue 破棄分岐）
  - 10.5-D（BottomSheet 本体）/ 10.5-E（server 層）は任意の品質強化として未実施。

## jsdom 未実装 API の stub 基盤（Phase 10.5-A）

- `__tests__/test-utils/browserApi.ts` に stub 群を集約。**10.5-B/D の components テストでも再利用する**:
  - `stubMatchMedia(reduced)` — jsdom は `window.matchMedia` 未実装（呼ぶと TypeError）。reduced-motion 分岐の網羅に必須。`setReducedMotion(bool)` で切替。
  - `stubIntersectionObserver()` — `io.trigger(isIntersecting)` で callback を手動発火。`instances[n].options` / `observe` / `disconnect` で呼び出し検証。
  - `stubRequestAnimationFrame('sync' | 'queued')` — sync は即時実行、queued は `flush()` まで保留（rAF throttle の検証用）。
  - `stubScrollY(initial)` — `window.scrollY` は getter のため `defineProperty` で差し替え。
- `__tests__/test-utils/navigation.ts`: `vi.mock('next/navigation', async () => (await import(...)).nextNavigationModuleMock())` の形で usePathname / useRouter を差し替え。`navigationMock.setPathname('/discover/mods')` で切替。
- **vi.fn 実装は arrow 不可**: vitest 4 は `new` で呼ばれた mock を construct するため、実装は function 宣言/式にする（arrow は `not a constructor` で落ちる）。biome の useArrowFunction を避けるには function 宣言を分離して `vi.fn(宣言名)` に渡す。
- anime.js は `vi.mock('animejs', () => ({...}))` で差し替え（dynamic import も intercept される）。複雑な実型と切り離すため `vi.hoisted` で mock 変数を定義して factory から返す。

## ⚠ vitest 4 の mocker 競合: 並行 dynamic import に mock が当たらない（2026-08-26 実証）

- **現象**: 同一モジュールから `await import('animejs')` を**並行**に走らせると、1 本目だけ vi.mock の mock が返り、**2 本目以降は実モジュールが返る**（実測: `true,false,false`）。逐次（await を挟む）なら全て mock。
- **影響**: `AnimatedStats` のように useCountUp を同時に複数 render して IO を一斉 trigger すると、一部カードだけ animate が呼ばれない。また mock でない実 anime.js の import は解決が遅く、テスト終了後に continuation が走って unhandled rejection（matchMedia 削除後など）になることも。
- **回避策**:
  1. IO instance を **1 つずつ `await act(async () => instance.trigger(true))` で逐次 trigger** する（AnimatedStats.test.tsx 参照）。
  2. matchMedia stub などは afterEach で削除せず **afterAll で復帰** する（late continuation 対策。MenuBottomSheet.test.tsx 参照）。
- 上流 issue は未特定（2026-08-26 時点で検索しても該当なし。vitest 4 の Module Runner 移行に起因する可能性）。vitest アップグレード時に再検証の価値あり。

## msw（Network レベル mock）

- ハンドラ: `__tests__/mocks/handlers.ts` — Modrinth 主要 **7 エンドポイント**（`/search`, `/project/:slug`, `/project/:slug/version`, `/version/:id`, `/projects`(batch), `/versions`(batch), `/version_files`(POST), `/tag/game_version`）。
- サーバ: `__tests__/mocks/server.ts`（`setupServer`）。
- `vitest.setup.ts`: `server.listen({ onUnhandledRequest: 'error' })`（**実 API 誤呼を即検出**）, `afterEach` で `resetHandlers`。
- ⚠ msw v2 は **path-only pattern**（`/api/modrinth/*`）で安定。absolute URL だと `client.ts` の相対 fetch にマッチしない（Phase 9-C.2 教訓）。
- msw の path-to-regexp は specific path を自動優先（登録順は無関係, B35）。

## fake-indexeddb

- `vitest.setup.ts` で `import 'fake-indexeddb/auto'` → Dexie が jsdom で動く。
- 追加 stub: `Element.prototype.scrollIntoView = () => {}`（CustomDropdown の Arrow キー用, jsdom 未実装）。
- DB リセット: `dexie._clearAllForTesting()`。

## per-module coverage threshold（`vitest.config.ts`）

| module | statements | 備考 |
| :--- | :--- | :--- |
| lib/state | 95 | sanitize（pure） |
| lib/store | 85 | Zustand |
| lib/db | 75 | Dexie |
| lib/query | 70 | TSQ |
| lib/modrinth | 65 | server/client |
| lib/utils | 60 | |
| hooks | 70 | |
| components | 50 | ui / layout / feedback |
| features | 50 | `__tests__/features/<name>/` ミラー（colocation なし） |
| **全体** | **60** | |

`coverage.exclude`: `src/app/**/page.tsx`/`layout.tsx`（RSC）・大 orchestrator（AppShell/HomeInteractive/Mods/ModDetail/Settings 各 Client）・presentational（BottomNav/EditProfileModal 等）・`src/lib/query/client.ts`（SSR+IDB 依存で単体困難, E2E 担保）・`src/lib/utils/download.ts`・定数/型。→ 詳細は `vitest.config.ts`。

- **COV-90 計画（2026-09-01〜）**: カバレッジ 4 指標 90% 化を `docs/planning/COVERAGE_90_PLAN.md`
  で進行中（COV-1〜5）。COV-1 で barrel re-export / 純粋な型定義（`**/types.ts`）/
  Next.js 生成画像（opengraph/twitter-image）/ Web Worker エントリ（hashWorker）/
  interface 定義のみ（sink.ts）/ re-export barrel（sync db.ts）を exclude に整理済み
  （`6abdddf`）。実測 88.56 / 78.55 / 92.64 / 90.41（st/br/fn/ln、129 files）。
  0% ファイルは COV-2/3 のテスト対象 4 件のみに縮小。

## テストヘルパ

- `__tests__/test-utils/queryWrapper.tsx` — `createTestQueryClient` + `createQueryWrapper`（TSQ Provider 注入）。
- `__tests__/test-utils/browserApi.ts` — jsdom 未実装 API の stub 群（matchMedia / IntersectionObserver / rAF / scrollY。Phase 10.5-A、詳細は上記セクション）。

## E2E（Playwright, 10 spec）

`e2e/`: smoke / mod-detail-modal / mods-page / offline / theme-persistence / **zip-export / zip-import / dep-check** / **folder-import / zip-env-import**（Phase 11）。
- `e2e/helpers/mrpack.ts` — jszip で最小 `.mrpack` を動的生成（fixture 不要）。
- `e2e/helpers/minecraftEnv.ts` (Phase 11) — .minecraft 構造 ZIP 生成 + **`installModrinthApiMock(page)`** (`page.route` で /version_files・/projects を決定論的に差し替え。proxy `/api/modrinth/*` と direct の両方をカバー)。
- `e2e/helpers/folderPickerMock.ts` (Phase 11) — **`installFolderPickerMock(page, rootName, files)`**: `addInitScript` で window.showDirectoryPicker をメモリ上 fake handle に差し替え (計画書の `__e2e_mock_handle__` 案)。init script はブラウザ側コードのため**文字列で注入** (TS strict / biome any 禁止の回避)。
- Chromium 単独（`--disable-gpu` 必須）。`playwright.config.ts` webServer = `pnpm build && pnpm start`。
- **Sandbox は Chromium install 不可 → CI（GitHub Actions）でのみ実行**。ローカルで実行を試みない。

## CI

- ワークフロー本体 = `docs/ops/CI_WORKFLOW.yml`（GitHub App 権限で `.github/workflows/` に書けないため）。ユーザーが `cp` して配置。手順 = `docs/ops/CI_SETUP.md`。
- job: static-checks（tsc/biome/vitest+coverage）→ build → e2e（push のみ）。

## 関連

- AGENT.md §3（検証ルール）/ [sandbox-constraints.md](./sandbox-constraints.md)
