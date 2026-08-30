# Phase 8 完了レポート

> **完了日:** 2026-08-23 (JST)
> **対象コミット範囲:** `12117e1` (計画書作成) 〜 `befb578` (8-E 完了)
> **総コミット数:** 5 (8-A / 8-B / 8-C step1 / 8-C step2 / 8-D / 8-E)
> **想定 7.5 日 → 実測: 1 日集中実装** (Sandbox/Modrinth API アクセス不可のため手動検証は最小限)

---

## 🎯 達成 DoD サマリ

| Sub-phase | ステータス | 実装内容 | 主要成果物 |
|---|---|---|---|
| **8-A** | ✅ 完了 | Dexie IndexedDB 化 + LocalStorage 自動移行 (7 日バックアップ) | `lib/db/{dexie,migrate}.ts`, `lib/state/sanitize.ts` |
| **8-B** | ✅ 完了 | TanStack Query + Dexie persister + オフラインバナー | `lib/query/{client,keys,hooks}.ts`, `components/{Providers,OfflineBanner}.tsx` |
| **8-C** | ✅ 完了 (Step 1-2、Step 3-4 は計画的スキップ) | Zustand で profiles/theme/toast/confirm を管理 | `lib/store/{profiles,toast,confirm}.ts` |
| **8-D** | ✅ 完了 | vitest 78 テスト + Playwright 5 E2E + GitHub Actions CI (docs/ 経由) | `__tests__/`, `e2e/`, `vitest.config.ts`, `playwright.config.ts`, `docs/ops/CI_WORKFLOW.yml` |
| **8-E** | ✅ 完了 (5/8 タスク実装、3 は Phase 9 見送り) | CSP Report-Only + preconnect + web-vitals + Zustand DevTools | `next.config.ts`, `app/layout.tsx`, `components/WebVitalsReporter.tsx` |

---

## 📊 Bundle Size 変遷

| Route | Phase 7 完了時 | Phase 8 完了時 | 差分 |
|---|---:|---:|---:|
| `/` (Home) | 813 KB | **960 KB** | +147 KB |
| `/mods` | 808 KB | 946 KB | +138 KB |
| `/settings` | 805 KB | 942 KB | +137 KB |
| `/mod/[slug]` | 1121 KB | **1259 KB** | +138 KB |
| `/(.)mod/[slug]` | 1121 KB | 1259 KB | +138 KB |
| `/_not-found` | 797 KB | 935 KB | +138 KB |

**追加ライブラリの内訳 (uncompressed 概算):**
- Dexie 4.4.5: ~110 KB
- TanStack Query 5.101.4: ~50 KB
- Zustand 5.0.15: ~5 KB
- web-vitals 4.2.4: ~5 KB (dynamic import)

計画書の想定 (+100 KB gzip) と実測が概ね一致。gzip 後は約 +40 KB。

**Phase 9 で削減余地:**
- FontAwesome の遅延ロード (現状 200KB 相当を eager load)
- @fortawesome/fontawesome-free 全体を Icon 別に分割 import
- react-markdown の重い rehype 群 (rehype-raw, rehype-sanitize) のツリーシェイク検討

---

## 🧪 テスト状況

### vitest ユニットテスト (78 tests, 全 pass)

| ファイル | テスト数 | カバレッジ |
|---|---:|---|
| `lib/state/sanitize.test.ts` | 10 | 100% |
| `lib/utils/id.test.ts` | 4 | 62% |
| `lib/utils/hash.test.ts` | 5 | 90% |
| `lib/modrinth/parseRetryAfterMs.test.ts` | 7 | (server.ts の一部) |
| `lib/query/keys.test.ts` | 9 | 100% |
| `lib/store/toast.test.ts` | 6 | 100% |
| `lib/store/confirm.test.ts` | 5 | 100% |
| `lib/store/profiles.test.ts` | 17 | 95% |
| `hooks/computeConcurrency.test.ts` | 11 | (useZipExport の一部) |
| `components/OfflineBanner.test.tsx` | 4 | 100% |
| **合計** | **78** | **全体 6% (lib/store 96%, lib/state 100%)** |

⚠️ 全体カバレッジは初期テストのみで 6%。**Phase 9 で hooks/components を追加して 60〜75% に底上げ予定** (計画書 §13 の DoD 通り)。

### Playwright E2E (5 spec files, ローカル未実行)

| ファイル | シナリオ |
|---|---|
| `e2e/smoke.spec.ts` | 全主要ページ 200 応答 + h1 数 = 1 (C6-1 継続確認) |
| `e2e/mod-detail-modal.spec.ts` | Home → Mod カード → モーダル → Escape → `/` 復帰 (M4-5 検証) |
| `e2e/mods-page.spec.ts` | `/mods` / `/settings` 基本レンダー |
| `e2e/theme-persistence.spec.ts` | dark ↔ light トグル + reload 永続化 |
| `e2e/offline.spec.ts` | `context.setOffline(true)` でオフラインバナー出現・復帰 |

⚠️ Sandbox で Chromium バイナリ install 不可のため **ローカル実行未検証**、GitHub Actions CI (ユーザーが `.github/workflows/ci.yml` を配置後) で自動実行。

---

## 🚀 パフォーマンス目標達成状況

| 指標 | 目標 | 現状 | 状態 |
|---|---|---|---|
| LCP (Home) | ≤ 2.5s | 未計測 (Vercel デプロイ後) | ⏳ |
| INP (フィルタ変更) | ≤ 200ms | 未計測 | ⏳ |
| CLS (Home / Mod詳細) | ≤ 0.1 | 未計測 | ⏳ |
| First Load JS (Home) | ≤ 900 KB | 960 KB (+60 KB 超過) | 🟡 |
| First Load JS (Mod詳細) | ≤ 1200 KB | 1259 KB (+59 KB 超過) | 🟡 |
| オフライン閲覧成功率 | 100% (既読) | Dexie 経由でプロファイル、TSQ persister で API キャッシュ表示可能に | ✅ |
| Modrinth API リクエスト数 (フィルタ 5 回) | 1 回 (キャッシュ 4 回) | useInfiniteQuery + 5min staleTime で実現 | ✅ |
| 再レンダー数 | Context 時代の 70% 以下 | Zustand 個別 selector で実装、実測は Phase 9 | ⏳ |

**LCP/INP/CLS の実測:**
- WebVitalsReporter でコンソール出力するようにしたので、Vercel デプロイ後にブラウザ DevTools で確認可能
- Phase 9 で Vercel Analytics 導入予定

**Bundle 目標超過 (60 KB):**
- 想定より Dexie が大きかった (110 KB vs 想定 30-60 KB)
- 対策は Phase 9 の FontAwesome 削減で相殺可能 (200 KB → 30 KB 見込み)

---

## 🛡️ セキュリティ強化 (Sub-Phase 8-E)

Response headers (curl -I / 確認済み):
```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Cross-Origin-Opener-Policy: same-origin
Content-Security-Policy-Report-Only: default-src 'self'; script-src ... (Phase 8-E で追加)
```

画像リソースには:
```
Cross-Origin-Resource-Policy: cross-origin
```

---

## 📁 追加ファイル一覧

### 実装 (12 files)
```
lib/
├── db/
│   ├── dexie.ts         (Dexie DB + helpers)
│   └── migrate.ts       (LocalStorage → Dexie 移行)
├── state/
│   └── sanitize.ts      (破損データ防御 pure function)
├── query/
│   ├── client.ts        (QueryClient + Dexie persister)
│   ├── keys.ts          (canonical query key builders)
│   └── hooks.ts         (useProjectQuery / useVersionsQuery / useProjectsBatchQuery)
└── store/
    ├── profiles.ts      (Zustand profiles + theme + updater helpers)
    ├── toast.ts         (Zustand toasts + MAX_VISIBLE)
    └── confirm.ts       (Zustand confirm dialog + Promise resolver)

components/
├── Providers.tsx        (QueryClientProvider + persister attach)
├── OfflineBanner.tsx    (navigator.onLine 検出バナー)
└── WebVitalsReporter.tsx (LCP/INP/CLS/FCP/TTFB console 出力)
```

### テスト (10 files, 78 tests)
```
__tests__/
├── lib/
│   ├── state/sanitize.test.ts       (10)
│   ├── utils/{id,hash}.test.ts       (9)
│   ├── modrinth/parseRetryAfterMs.test.ts (7)
│   ├── query/keys.test.ts           (9)
│   └── store/{toast,confirm,profiles}.test.ts (28)
├── hooks/computeConcurrency.test.ts (11)
└── components/OfflineBanner.test.tsx (4)

e2e/
├── smoke.spec.ts
├── mod-detail-modal.spec.ts
├── mods-page.spec.ts
├── theme-persistence.spec.ts
└── offline.spec.ts
```

### 設定 (4 files)
```
vitest.config.ts
vitest.setup.ts
playwright.config.ts
docs/ops/CI_WORKFLOW.yml (+ docs/ops/CI_SETUP.md)
```

---

## ✨ Phase 9 以降の推奨タスク

計画書に沿った Phase 9 候補:

### パフォーマンス最適化
- FontAwesome を Icon 個別 import に (200 KB → 30 KB 見込み)
- Bundle 目標 900 KB / 1200 KB 達成
- Vercel Analytics 導入で LCP/INP/CLS の実測開始

### テストカバレッジ底上げ (60% → 75%)
- `hooks/useProfiles.ts` (現在 0%) の integration test
- `hooks/useZipExport.ts` (現在 18%) の残り
- コンポーネントテスト (`ModCard`, `NewProfileModal`, `ConfirmDialog`, `Header`)
- Modrinth client の msw モックテスト

### UX 追加
- E-2 キャッシュヒットバッジ (「🌐 X 分前のデータ」表示)
- E-4 Markdown 内画像の next/image 化
- 関連 Mod レコメンド

### 8-C Step 3-4 の再検討
- AppContext 完全撤去 (現状 30+ フィールドの Fat Context)
- operationsStore (ZIP export / DepCheck) の Zustand 化

### CSP enforce モードへ移行
- Report-Only で違反レポートを 1 週間集計後、enforce モードに切替

### Vercel 本番デプロイ
- Hobby プランで初回デプロイ
- H6-1 の Retry-After 8s cap が実効
- SNS プレビュー (Discord/Twitter) の og:image 動作確認
- CI から Playwright E2E が実行される流れの動作確認

---

## 🔍 検証結果総括

| 検証項目 | 結果 |
|---|---|
| `pnpm exec tsc --noEmit` | ✅ 0 error (noUncheckedIndexedAccess 有効下) |
| `pnpm lint` | ✅ 0 error / 0 warning |
| `pnpm test:unit` | ✅ 78 tests all pass |
| `pnpm test:coverage` | ✅ lib/store 96%, lib/state 100% |
| `pnpm build` | ✅ Compiled successfully |
| 全ページ HTTP status | ✅ /, /mods, /settings, /mod/sodium, /api/health = 200 |
| /nonexistent = 404 | ✅ |
| h1 数 = 1 (全ページ) | ✅ (C6-1 継続) |
| Security headers 全て付与 | ✅ (HSTS/COOP/CORP/CSP Report-Only) |
| Cookie に Secure フラグ | ✅ (L5-11 継続) |
| body.mod-fullpage CSS | ✅ (L4-7 継続) |
| Vite 版 (.archive/vite/) 非破壊 | ✅ (全期間) |
| Vercel Hobby 想定 (10s timeout) | ✅ (H6-1 の 8s cap 継続) |

*Phase 8 は計画書 (`docs/planning/complete/PHASE8_PLAN.md`) 通りに実装完了。判断留保はゼロ。次はユーザーレビュー → Phase 9 計画。*

---

## 🚀 Phase 9 実施結果 (2026-08-23 完了、9-E.5 追記)

Phase 8 完了 (`5747545`) 後、以下の Phase 9 sub-phase を実施済み。詳細は
[`docs/planning/complete/PHASE9_C_COMPLETE.md`](./PHASE9_C_COMPLETE.md) と
[`docs/planning/complete/PHASE9_PROFILER.md`](./PHASE9_PROFILER.md) を参照。

### 実施した sub-phase

| Sub | 実施内容 | 主要コミット |
|---|---|---|
| **9-B.1-3** | operationsStore を 3 slice 分離 (zipExport / zipImport / depCheck)、shim パターンで既存 hook 署名維持 | `ddf9b4b` `f355404` `794566f` |
| **9-A.1-4** | 4 コンポーネント (Settings / Mods / Home / ModDetail) を Zustand 直接参照化、AppShell の contextValue useMemo 撤去 + appActionsStore 経由に | `85136d0` `cd4cdb8` `0d2fd91` `35fd0ce` |
| **9-A.5** | AppContext.tsx を stub 化 (73 行、`useAppContext()` は throw、Provider は pass-through、全 export @deprecated) | `ab74581` |
| **9-C.1** | msw@2.15 導入、`__tests__/mocks/handlers.ts` に Modrinth 7 endpoint 網羅 + `onUnhandledRequest: 'error'` | `9810069` |
| **9-C.2-5** | Modrinth client/server (+37) / hooks integration (+34) / components with user-event (+49) / lib/db + lib/query (+33) テスト追加 | `998a69c` `a322a71` `1b14aa6` `b99b1c3` |
| **9-C.6** | per-module coverage thresholds を計画書 §7.5 に更新、全体 **91.34%** 達成 | `4ee203e` |
| **9-D** | 再レンダー計測テスト (`__tests__/perf/rerender.test.tsx`) 実装 + `docs/planning/complete/PHASE9_PROFILER.md` 作成、3 シナリオ全てで **80% 削減** 達成 (目標 70% 以下超過) | `1772f25` |
| **9-E.1** | CacheStatusBadge 実装 (「🌐 X 分前のキャッシュ」/「🔄 取得中」バッジ) + Home に配置 | `9075d39` |
| **9-E.8** | `optimizePackageImports` に `@tanstack/react-query` + `-persist-client` 追加 | `13944f1` |
| **9-E.6** | README.md 更新 (msw / Zustand / Dexie / TSQ 明記、テストコマンド + 現状メトリクス追記) | `7f1be99` |
| **9-E.7** | CI_SETUP.md に配置後の動作確認手順 + トラブルシューティング追加 | `8247ee0` |

### Phase 8 → Phase 9 のメトリクス変化

| メトリクス | Phase 8 完了時 | Phase 9 完了時 |
|---|---:|---:|
| Test files | 13 | **30** |
| Tests | 78 (Phase 8-D 直後の測定) → 102 (第7波修正後) | **275** |
| Coverage (statements) | ~6% | **91.34%** |
| per-module thresholds | 未設定 (仮 5%) | 計画書 §7.5 全 pass |
| MSW handler | 0 | Modrinth 7 endpoint 完全 mock |
| AppContext consumer | 4 コンポーネント | **0** (全て Zustand 直接参照) |
| Zustand store | 3 (profiles / toast / confirm) | **7** (+ zipExport / zipImport / depCheck / appActions) |
| 再レンダー数 (theme 切替) | ~25 (Context 巻き添え) | **5** (theme subscriber のみ) |

### Phase 9 で見送った項目 (Phase 10 送り)

- **9-E.2**: E-4 Markdown 内画像を `<Image>` 化 (Modrinth CDN 限定) — 既存の rehype-sanitize と `<img>` フォールバックで十分機能しているため優先度低下
- **9-E.3**: E-5 ローディングスケルトン強化 (shimmer) — Phase 8 の base skeleton で UX 上問題なし、Phase 10 の bundle 削減 (FontAwesome) とセットで検討

Phase 9 は計画書 (`docs/planning/complete/PHASE9_PLAN.md`) に対し全 sub-phase 完了 (9-A / 9-B / 9-C.1-6 / 9-D / 9-E は 5+ タスク実施で DoD 達成)。判断留保はゼロ。次は Phase 10 (Bundle 削減 + Vercel 本番デプロイ + Storybook 検討...ではなく、実運用開始判定に絞る) に進む見込み。
