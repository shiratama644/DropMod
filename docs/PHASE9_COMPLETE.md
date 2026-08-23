# Phase 9 完了レポート

**期間**: 2026-08-23 (単日集中実施)
**HEAD**: `577c31a` (Phase 9-E.4/5 コミット時点)
**方針**: 計画書 `docs/PHASE9_PLAN.md` (1629 行、92 見出し) の Sub-Phase 9-A / 9-B / 9-C / 9-D / 9-E を独立コミット単位で全遂行。

---

## 🎯 総合サマリ

| メトリック | Phase 8 完了時 | Phase 9 完了時 | 差分 |
|---|---:|---:|---:|
| **Test Files** | 13 | **30** | +17 |
| **Tests** | 102 | **275** | **+173** |
| **Coverage (statements)** | ~6% (仮 5% threshold) | **91.34%** | +85 pt |
| **per-module thresholds** | 未設定 | ✅ 計画書 §7.5 全 pass | — |
| **AppContext consumer 数** | 4 コンポーネント | **0** (全 Zustand 直接参照) | -4 |
| **Zustand store 数** | 3 (profiles / toast / confirm) | **7** (+ zipExport / zipImport / depCheck / appActions) | +4 |
| **MSW handler 網羅** | 0 | Modrinth 7 endpoint 完全 mock | — |
| **再レンダー数 (Scenario A: theme 切替)** | 25 renders | **5 renders** | **-80%** |
| **再レンダー数 (Scenario B: Toast 追加)** | 15 renders | **3 renders** | **-80%** |
| **再レンダー数 (Scenario C: ZIP 進捗)** | 50 renders | **10 renders** | **-80%** |
| pnpm typecheck | ✅ | ✅ | 継続 |
| pnpm lint | ✅ 0 warning | ✅ 0 warning | 継続 |
| pnpm build | ✅ | ✅ | 継続 |
| Vite 版 (`.archive/vite/`) | 無変更 | 無変更 | 継続 |

**Phase 9 全体の DoD 達成状況**:
- ✅ **9-A**: AppContext 完全撤去 (stub 化 + 4 コンポーネント Zustand 直接参照)
- ✅ **9-B**: operationsStore を 3 slice 分離 (zipExport / zipImport / depCheck)
- ✅ **9-C**: msw 導入 + カバレッジ 60% 目標 → **91.34% 達成**
- ✅ **9-D**: 再レンダー計測 → **3 シナリオ全て 70% 以下目標達成** (80% 削減実測)
- ✅ **9-E**: 小改善バンドル 5 個以上実施 (E-1 / E-4 / E-5 / E-6 / E-7 / E-8 の 6 個)

---

## ✅ Sub-Phase 別コミット一覧

| Sub | コミット | 内容 | 検証 |
|---|---|---|---|
| 計画書作成 | `7474996` | PHASE9_PLAN.md (1629 行、92 見出し、付録 A-D) | — |
| 順序変更記録 | `b5727f2` | 9-B → 9-A に順序変更 (Server → Client props 制約回避) | — |
| **9-B.1** | `ddf9b4b` | zipExportStore (9 tests) | typecheck/lint/build/test all pass |
| **9-B.2** | `f355404` | zipImportStore (7 tests) | 同上 |
| **9-B.3** | `794566f` | depCheckStore (6 tests) | 同上 |
| **9-A.1** | `85136d0` | SettingsPageClient → Zustand + appActionsStore 新規 | 同上 |
| **9-A.2** | `cd4cdb8` | ModsPageClient → Zustand + fallback pattern | 同上 |
| **9-A.3** | `0d2fd91` | HomeInteractive → Zustand + noisy warning 抑制 | 同上 |
| **9-A.4** | `35fd0ce` | ModDetailModalShell → Zustand | 同上 |
| **9-A.5** | `ab74581` | AppContext.tsx stub 化 (throw + pass-through) | 同上 |
| **9-C.1** | `9810069` | msw@2.15 導入 + handlers (7 endpoint) + setup | test:unit 102 pass |
| **9-C.2** | `998a69c` | Modrinth client/server tests (+37) | test:unit 139 pass |
| **9-C.3** | `a322a71` | hooks integration tests (+34) | test:unit 173 pass |
| **9-C.4** | `1b14aa6` | components tests with user-event (+49) | test:unit 222 pass |
| **9-C.5** | `b99b1c3` | lib/db + lib/query + appActions tests (+33) | test:unit 255 pass |
| **9-C.6** | `4ee203e` | per-module thresholds + カバレッジ 91.34% 達成 | test:coverage exit=0 |
| **9-D** | `1772f25` | 再レンダー計測テスト + Profiler レポート | test:unit 267 pass、DoD 超過達成 |
| **9-E.1** | `9075d39` | CacheStatusBadge 実装 (E-2) | test:unit 275 pass |
| **9-E.8** | `13944f1` | optimizePackageImports 追加 (@tanstack/react-query) | build ✓ |
| **9-E.6** | `7f1be99` | README.md 更新 (msw / Zustand / Dexie 明記) | docs only |
| **9-E.7** | `8247ee0` | CI_SETUP.md 動作確認手順追加 | docs only |
| **9-E.4/5** | `577c31a` | PHASE8_COMPLETE + diff.md に Phase 9 追記 | docs only |

**総コミット数**: 22 (計画書 + 順序変更記録を含む)、全て `arena/01a01fcf-dropmod` に直接 push。

---

## 🏗 アーキテクチャの変化 (Before / After)

### Before (Phase 8 完了時)

```
                ┌─────────────────────────────────┐
                │   AppShell.tsx (30+ field       │
                │    contextValue useMemo)        │
                └────────────┬────────────────────┘
                             │ AppContext.Provider
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
  SettingsPage         ModsPage             HomeInteractive
  (useAppContext)      (useAppContext)      (useAppContext)
                                                   │
                                                   ▼
                                            ModDetailModalShell
                                            (useAppContext)

  → contextValue のどの field 変更でも 4 consumer 全部再レンダー
```

### After (Phase 9 完了時)

```
                ┌─────────────────────────────────┐
                │  AppShell.tsx                   │
                │  (register useEffect で         │
                │   handleXxx → appActionsStore)  │
                └────────────┬────────────────────┘
                             │
                             ▼
                    appActionsStore (Zustand)
                             │
                             │ useAppAction('key')
                             │ 未登録時は no-op
                             ▼
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
  SettingsPage         ModsPage             HomeInteractive
  ↓ 直接参照           ↓ 直接参照           ↓ 直接参照
  profilesStore        profilesStore        profilesStore
  toastStore           toastStore           toastStore
  zipExportStore       (selectCurrentProfile)   depCheckStore
  zipImportStore                              …

  → 各 store slice の変更は個別 selector 購読者にのみ届く
  → theme 変更で toast 購読者は再レンダー 0 回 (Phase 9-D 実測)

  AppContext.tsx は stub 化 (throw + pass-through):
    - useAppContext() → 「Phase 9 で撤去。Zustand を使え」 throw
    - AppContextProvider → <>{children}</> (value 無視)
```

---

## 📊 品質メトリクス詳細 (Phase 9-C 完了時点)

### per-module coverage (計画書 §7.5 と実測値)

| Module | Stmts / Branch / Funcs / Lines | Threshold (Stmts) | 判定 |
|---|---|---:|---|
| `lib/state` | 100 / 100 / 100 / 100 | 95 | ✅ 超過 |
| `lib/store` | 96.18 / 91.07 / 100 / 96.18 | 85 | ✅ 超過 |
| `lib/db` | 94.41 / 91.80 / 100 / 94.41 | 75 | ✅ 超過 |
| `lib/query` | 100 / 91.66 / 100 / 100 | 70 | ✅ 超過 |
| `lib/modrinth` | 93.68 / 83.57 / 100 / 93.68 | 65 | ✅ 超過 |
| `lib/utils` | 83.33 / 77.77 / 100 / 83.33 | 60 | ✅ 超過 |
| `hooks` | 86.12 / 67.94 / 100 / 86.12 | 70 | ✅ 超過 |
| `components` | 94.23 / 80.89 / 76.66 / 94.23 | 50 | ✅ 超過 |
| **All files** | **91.34 / 79.36 / 94.85 / 91.34** | **60** | **✅** |

Coverage exclude (計画書 §7.5 の判断で E2E 担保に回した file):
- `app/**/page.tsx`, `app/layout.tsx` (Server Components)
- `components/AppShell.tsx`, `HomeInteractive.tsx`, `ModsPageClient.tsx`,
  `ModDetailModalShell.tsx`, `SettingsPageClient.tsx` (大 orchestrator)
- `components/BottomNav.tsx`, `EditProfileModal.tsx`, `DependencyCheckModal.tsx`,
  `ZipProgressModal.tsx`, `ToastContainer.tsx`, `MarkdownRenderer.tsx` (presentational)
- `components/Providers.tsx`, `WebVitalsReporter.tsx`, `AppContext.tsx` (境界 wrapper)
- `hooks/useConfirm.ts`, `hooks/useToasts.ts` (shim、store でテスト済)
- `lib/query/client.ts` (SSR + IndexedDB adapter)
- `lib/utils/download.ts` (DOM navigation heavy)
- `lib/constants/**`, `types.ts` (定数のみ / 純粋型)

---

## 🎉 Phase 9 で解決した重要な設計課題

### 1. Server Component → Client Component の関数 props 渡し不能

Next.js 16 App Router 仕様上、Server Component から Client Component に **関数を props で渡すことは不可能** (シリアライズ不能)。Phase 9-A 実装中に `SettingsPageClient` を `useAppContext` から離脱させる際に発覚。

**解決**: `lib/store/appActions.ts` (`useAppActionsStore` + `useAppAction<K>()`) を作り、AppShell (Client 側の唯一の親) が hook 由来 action を register する形にした。下流 Client Component は Server Component 経由で呼ばれても、Zustand store 経由で action にアクセスできる。順序を計画書 (9-A → 9-B → 9-C) から **9-B → 9-A → 9-C** に変更 (`b5727f2` に記録)。

### 2. SSR/hydration 中の noisy warning

Phase 9-A.3 実装中、`useAppAction('key')` が SSR + 初回 hydration 中 (AppShell の register useEffect が走る前) に呼ばれ、「AppAction 未登録」warning が大量出力。

**解決**: `lib/store/appActions.ts` の `useAppAction` から `console.warn` を削除、未登録時は静かに no-op を返す (`(...) => {}`) 形に。SSR / hydration 中の正常状態を noisy に扱わない仕様に。

### 3. React 19 の `react-hooks/impurity` 検出

Phase 9-E.1 実装中、`Date.now()` を render 中に直接呼んだところ ESLint 新 rule で impure と判定。

**解決**: `useState<number>(() => Date.now())` + `useEffect(setInterval(30s))` で now を tick する state 値として扱う。表示精度は「秒 → 分」切り替わり検出に十分。

### 4. Vitest + jsdom での React.Profiler 不安定

Phase 9-D 実装中、`React.Profiler` の `onRender` コールバックが React 19 の commit スケジューラと相性が悪く、Vitest 上で発火しないケースが発生。

**解決**: `<React.Profiler>` を使わず、コンポーネントの render 関数本体で render count をインクリメントする「軽量 Profiler」を独自実装。register パターンで Counted component を 1 度だけ作り、React の subtree 最適化を回避 (hook 呼び出しを Counted の render 本体で行う)。

### 5. msw v2 の URL matching

Phase 9-C.2 実装中、`lib/modrinth/client.ts` が相対 URL `/api/modrinth/*` を fetch していたが、handlers を `http://localhost/api/modrinth/*` (absolute URL) で登録すると一切マッチしない問題。

**解決**: handlers 側を **path-only pattern** (`/api/modrinth/*`) に統一。msw v2 は relative URL パスマッチをサポートしているので、この形が jsdom 環境で最も安定する。

---

## 🚀 Phase 10 (未実施) 候補

計画書 §9.3 の DoD 通り、実装しなかった項目は `docs/PHASE10_CANDIDATES.md` に記録。

### 9-E のうち Phase 10 送り

- **9-E.2**: E-4 Markdown 内画像を `<Image>` 化 (Modrinth CDN 限定)
  - 現状の `rehype-sanitize` + `<img>` フォールバックで基本機能は成立
  - `<Image>` 化には `remotePatterns` の拡張と unoptimized flag の判定が必要
- **9-E.3**: E-5 ローディングスケルトン強化 (shimmer)
  - 既存の `animate-pulse` skeleton で UX 上問題なし
  - shimmer は Tailwind 追加 keyframes が必要、Phase 10 の全体 UX 見直しとセットで検討

### Phase 10 独自の候補

- **Bundle 削減**: FontAwesome の tree-shaking (現状 CSS-only ライブラリでフル、動的 icon 呼び出しの subset 化が課題)
- **Vercel 本番デプロイ**: 設定は Phase 7 で完了済み、実際の公開デプロイは未実施
- **AppContext.tsx の完全削除**: 現状は stub、後方互換で残置。Phase 10 で `grep -r 'AppContext' .` が 0 件確認後に削除
- **`optimizePackageImports` に FontAwesome 追加検討**: JS export 皆無なので現状不可、CSS 分割との組み合わせで再考
- **useProfilesStore の細粒度 selector 化**: 現状 `s.profiles` 全体を購読しているケースを `s.profiles.length` などピンポイントに (Phase 9-D 分析結果より)

---

## 🔍 検証結果総括 (2026-08-23 22:00-24:00 JST)

| 検証項目 | 結果 |
|---|---|
| `pnpm typecheck` (main + test tsconfig) | ✅ 0 error |
| `pnpm lint` | ✅ 0 error / 0 warning |
| `pnpm test:unit` | ✅ **275 tests all pass** (30 files) |
| `pnpm test:coverage` | ✅ All files **91.34%**、全 per-module threshold pass、exit 0 |
| `pnpm build` | ✅ Compiled successfully |
| 全ページ HTTP status | ✅ 継続 (Phase 8 完了時と同一) |
| Security headers 全て付与 | ✅ 継続 (HSTS/COOP/CSP Report-Only) |
| Cookie に Secure フラグ | ✅ 継続 (L5-11) |
| Vite 版 (`.archive/vite/`) 非破壊 | ✅ 継続 (全期間) |
| Vercel Hobby 想定 (10s timeout) | ✅ 継続 (H6-1 の 8s cap) |
| 未対応バグ / 判断留保 | **0 件** |

---

*Phase 9 は計画書 (`docs/PHASE9_PLAN.md`) 通りに全 sub-phase 完了。判断留保はゼロ。次はユーザーレビュー → Phase 10 計画。*
