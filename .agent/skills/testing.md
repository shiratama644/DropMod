# Testing — vitest + msw + Playwright

> テスト・カバレッジ・モック・E2E を触る時に読む。

## コマンド（`package.json`）

| コマンド | 用途 |
| :--- | :--- |
| `pnpm test:unit` | `vitest run`（**commit 前検証はこれ**, `pnpm test` は watch なので使わない） |
| `pnpm test:coverage` | `vitest run --coverage`（per-module threshold チェック） |
| `pnpm test:e2e` | `playwright test`（**Sandbox では実行不可, CI のみ**） |

## スタック

- **Vitest 4** + jsdom + @testing-library/react **16** + user-event 14 + **msw 2.15** + fake-indexeddb 6。
  - **vite は `^7.3.6` を devDependencies に明示固定**（vitest 4 の peer `^6||^7||^8` を野放しにすると vite 8 が解決され `@vitejs/plugin-react@4`（peer 〜^7）と不整合するため）。
  - Node 24 (undici v7) の fetch が jsdom 由来 AbortSignal を拒否する問題 (vitest#8374) は **vitest 4 で上流解決済み**。旧 workaround（`vitest.environment.ts` カスタム環境）は 2026-08-26 に削除し `environment: 'jsdom'` に戻した。
  - **vitest 4 の型変更**: `vi.fn()` が constructor 呼び出し可能型を返すため、`ReturnType<typeof vi.fn>` は `(x: T) => void` 系パラメータと非互換。特定シグネチャの引数に渡す mock は `vi.fn<(id: string) => void>()` のように明示ジェネリクスで型付けする（`Mock<T>` 型を import して Harness 等に使う）。
- 現状: **399 tests / 45 files pass**。
- ⚠ **coverage threshold 違反あり（Phase 10.5 で対応中）**: vitest 4 の V8 coverage は AST ベース再マッピングに変更され branch/function 数値が低下（より正確）。加えて Phase 10-P1 / ルーティング再設計で追加された未テストファイル（landing/*, BottomSheet 系, DesktopSidebar 等）の影響も元からある。CI は `pnpm test:coverage` を gate にしているため要対応。
  - **Phase 10.5-A 完了 (2026-08-26)**: hooks branches 61.63% / global branches 61.54% まで回復し解消。
  - 残: components stmt/lines/functions（→ 10.5-B）と lib/store branches 76.05%（→ 10.5-C）。計画は `docs/planning/PHASE10_5_PLAN.md`。

## jsdom 未実装 API の stub 基盤（Phase 10.5-A）

- `__tests__/test-utils/browserApi.ts` に stub 群を集約。**10.5-B/D の components テストでも再利用する**:
  - `stubMatchMedia(reduced)` — jsdom は `window.matchMedia` 未実装（呼ぶと TypeError）。reduced-motion 分岐の網羅に必須。`setReducedMotion(bool)` で切替。
  - `stubIntersectionObserver()` — `io.trigger(isIntersecting)` で callback を手動発火。`instances[n].options` / `observe` / `disconnect` で呼び出し検証。
  - `stubRequestAnimationFrame('sync' | 'queued')` — sync は即時実行、queued は `flush()` まで保留（rAF throttle の検証用）。
  - `stubScrollY(initial)` — `window.scrollY` は getter のため `defineProperty` で差し替え。
- **vi.fn 実装は arrow 不可**: vitest 4 は `new` で呼ばれた mock を construct するため、実装は function 宣言/式にする（arrow は `not a constructor` で落ちる）。biome の useArrowFunction を避けるには function 宣言を分離して `vi.fn(宣言名)` に渡す。
- anime.js は `vi.mock('animejs', () => ({...}))` で差し替え（dynamic import も intercept される）。複雑な実型と切り離すため `vi.hoisted` で mock 変数を定義して factory から返す。

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
| components | 50 | |
| **全体** | **60** | |

`coverage.exclude`: `app/**/page.tsx`/`layout.tsx`（RSC）・大 orchestrator（AppShell/HomeInteractive/Mods/ModDetail/Settings 各 Client）・presentational（BottomNav/EditProfileModal 等）・`lib/query/client.ts`（SSR+IDB 依存で単体困難, E2E 担保）・`lib/utils/download.ts`・定数/型。→ 詳細は `vitest.config.ts`。

## テストヘルパ

- `__tests__/test-utils/queryWrapper.tsx` — `createTestQueryClient` + `createQueryWrapper`（TSQ Provider 注入）。
- `__tests__/test-utils/browserApi.ts` — jsdom 未実装 API の stub 群（matchMedia / IntersectionObserver / rAF / scrollY。Phase 10.5-A、詳細は上記セクション）。

## E2E（Playwright, 8 spec）

`e2e/`: smoke / mod-detail-modal / mods-page / offline / theme-persistence / **zip-export / zip-import / dep-check**。
- `e2e/helpers/mrpack.ts` — jszip で最小 `.mrpack` を動的生成（fixture 不要）。
- Chromium 単独（`--disable-gpu` 必須）。`playwright.config.ts` webServer = `pnpm build && pnpm start`。
- **Sandbox は Chromium install 不可 → CI（GitHub Actions）でのみ実行**。ローカルで実行を試みない。

## CI

- ワークフロー本体 = `docs/ops/CI_WORKFLOW.yml`（GitHub App 権限で `.github/workflows/` に書けないため）。ユーザーが `cp` して配置。手順 = `docs/ops/CI_SETUP.md`。
- job: static-checks（tsc/biome/vitest+coverage）→ build → e2e（push のみ）。

## 関連

- AGENT.md §3（検証ルール）/ [sandbox-constraints.md](./sandbox-constraints.md)
