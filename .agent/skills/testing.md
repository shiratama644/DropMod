# Testing — vitest + msw + Playwright

> テスト・カバレッジ・モック・E2E を触る時に読む。

## コマンド（`package.json`）

| コマンド | 用途 |
| :--- | :--- |
| `pnpm test:unit` | `vitest run`（**commit 前検証はこれ**, `pnpm test` は watch なので使わない） |
| `pnpm test:coverage` | `vitest run --coverage`（per-module threshold チェック） |
| `pnpm test:e2e` | `playwright test`（**Sandbox では実行不可, CI のみ**） |

## スタック

- Vitest 3 + jsdom + @testing-library/react **16** + user-event 14 + **msw 2.15** + fake-indexeddb 6。
- 現状: **373 tests / 42 files pass**, カバレッジ **91%+**（per-module threshold 全 pass）。

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
