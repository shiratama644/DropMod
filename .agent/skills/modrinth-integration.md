# Modrinth Integration

> 検索/詳細/バージョン/バッチ/プロキシ を触る時に読む。

## 2 つのラッパ（server / client）

| 側 | ファイル | 用途 | キャッシュ |
| :--- | :--- | :--- | :--- |
| Server (RSC/Route Handler) | `src/lib/modrinth/server.ts` | SSR/ISR fetch | Next Data Cache / `unstable_cache` |
| Client (browser) | `src/lib/modrinth/client.ts` | CSR fetch | LRU+TTL（200件/5min）+ TSQ |

## server.ts の要点

- `USER_AGENT` = `MODRINTH_USER_AGENT` env or `DropMod/1.1.0 (...)`（必須, 規約遵守+rate limit 緩和）。
- **タイムアウト**: `AbortSignal.timeout(FETCH_TIMEOUT_MS=8s)`（Vercel Hobby 10s Function timeout から 2s 引き）。env `MODRINTH_FETCH_TIMEOUT_MS` で上書き。呼び出し側 signal と `AbortSignal.any` で合成。
- **429 対策 (2026-08-26 強化)**: `Retry-After` ヘッダ尊重（`parseRetryAfterMs`, 上限 `MAX_RETRY_WAIT_MS=8s`）+ **最小 1s クランプ**（Modrinth は `Retry-After: 0` を返すことがあるため。`MODRINTH_429_MIN_WAIT_MS` で上書き）で backoff 再試行 **2 回**（2s→4s）。さらに**サーキットブレーカー**: 429 最終失敗が連続 3 リクエストで 60s 間 fail-fast（fetch せず即 throw、build の残りページはフォールバックで完走）。成功で連続カウントはリセット。テストは `_resetRateLimitStateForTesting()` で状態初期化。
- **build 時リクエスト量の上限意識**: 詳細ページ事前生成は `src/features/project/api/projectDetail.ts` の `PREBUILD_LIMIT=15/型`（≈180 req/build）。**Modrinth は 300 req/min**。事前生成を増やす場合は 1 ページ 3 fetch (project/versions/members) であることに注意。
- **REVALIDATE 定数**: `SEARCH=300s(5m)` / `PROJECT=3600s(1h)` / `PROJECT_LIST=1800s` / `VERSION=3600s` / `VERSION_LIST=1800s` / `TAG=86400s(24h)`。

### 公開関数

- `fetchModrinthSearch(params)` — facets 構築（project_type/mcVersion/loader/category）。`projectType: mod|modpack|resourcepack|shader`。
- `fetchModrinthProject(slug)` — slug も id も可。404 で throw。
- `fetchModrinthProjectVersions(slug, {loader, mcVersion})` — **slim 化 + unstable_cache**（後述）。
- `fetchModrinthProjectAuthor(slug)` — `/project/{slug}/members` から Owner 名（失敗時 null）。
- `fetchLatestMinecraftVersions()` — `/tag/game_version`（失敗時 fallback リスト）。

### 巨大レスポンス対策（Phase 10-P2, 重要）

JEI(8MB)・no-chat-reports(6.7MB) 等が Next **Data Cache の 2MB 上限**に引っかかる問題を解消:
- `/project/{slug}/version` は `cache:'no-store'`（Data Cache バイパス）。
- `slimVersion(v)` で**詳細表示に必要な最小フィールド**だけ射影（id/version_number/version_type/game_versions/loaders/files.{url,filename,primary,size}）。
- slim 版を `unstable_cache`（keyParts = slug+loader+mcVersion, TTL VERSION）に載せる。
- vitest 実行時（`process.env.VITEST`）は `unstable_cache` が throw するため素の fetch にフォールバック。

## client.ts の要点

- `fetchModrinth<T>(endpoint, params, {noCache, signal, method, body})` — 汎用。
  - キャッシュキーは `stableStringify`（キー昇順ソート）で安定化。
  - **proxy 優先**（`/api/modrinth/*`）→ 5xx/非 JSON なら **direct**（`api.modrinth.com`）フォールバック。UA はブラウザ forbidden header なので proxy 側で付与。
  - 429 で `MAX_RETRY_ON_429=3` 回、Retry-After or 指数バックオフでリトライ。
- 高レベル: `fetchStableModVersion`（release 優先）/ `fetchModrinthBatch`（/versions・/projects を 100 件 chunk）/ `fetchModrinthVersionFilesBatch`（/version_files POST, SHA-1 照合, .mrpack 用）。
- Resource Pack / Shader は loader facet 無しで呼ぶ（`skipLoader`）。

## Route Handler プロキシ（`src/app/api/modrinth/[...path]/route.ts`）

- `runtime='nodejs'`, `dynamic='force-dynamic'`。GET/POST/HEAD を export。
- **セキュリティ**: `isSafePath`（`..`/`%2e%2e` 等の path traversal reject）→ URL 生成後に host 検証（`api.modrinth.com` のみ）。
- UA 注入・`Content-Type`/`Retry-After` のみ透過・レスポンスは Web Stream でパススルー（100MB+ も効率良く）。

## Sandbox での注意

- `api.modrinth.com` が **ECONNRESET で到達不可**（§6.2）。`pnpm build` 時に `TypeError: fetch failed` が出るが **exit 0 なら成功**。ローカルでは Modrinth 依存機能が空表示になる（ユーザー環境で正常表示）。→ [sandbox-constraints.md](./sandbox-constraints.md)

## 関連

- [image-strategy.md](./image-strategy.md)（CDN 画像）/ [routing-and-pages.md](./routing-and-pages.md)（/api/*）
- [app-profile.md](./app-profile.md)（プロキシ Route の CORS/レート制限は `src/lib/platform/rateLimit.ts` に集約済み。APP_PROFILE=development で無効化）
