# Phase 9 実装と計画書 (PHASE9_PLAN.md) の差分

> **監査開始日:** 2026-08-23 (JST)
> **監査追加日:** 2026-08-24 (JST) — 徹底レビュー第 1 回、D2〜D9 追加
> **対象:** `docs/planning/complete/PHASE9_PLAN.md` (計画書 v1) vs. 実装 (HEAD `5a3bde1`)
> **記録方針:** 意図的な設計変更・順序変更・未実装項目・仕様との齟齬を全てここに記録。
> バグ (実装ミスや潜在的不具合) は `docs/audit/issues-phase9.md` に別途記録。

---

## 🎯 差分サマリ

| ID | 該当章 | 差分の性質 | 影響 | 対応方針 |
|---|---|---|---|---|
| D1 | §4 Sub-Phase 順序 | **順序変更** (9-B → 9-A) | Server Component 経由の props 渡し不能問題を回避 | 9-B を先に実施 (対応済み) |
| D2 | §5.5 / §10.1 | **AppContext.tsx 行数超過** (計画 50〜60 行 / 実装 73 行) | 実質 コメント過多、実コードは 18 行 | Phase 10 で完全削除するので許容 |
| D3 | §5.3 | **props 渡し設計を撤廃、代わりに appActionsStore を新設** | 計画書は "Props (AppShell 局所 state 由来)" で受け取る設計だったが、実装は `useAppAction(key)` 経由に統一 | D1 の理由により全 action を Zustand 経由に統一。実装として一貫性が向上したので許容 |
| D4 | §3.2, §6.2 (zipImport) | **isNewProfileModalOpen / openNewProfileModal / closeNewProfileModal 未実装** | 計画では `zipImport.ts` に含める予定だったが実装には無し | Modal open state は AppShell 局所 useState のまま残された。実害無し、意図的なスコープ縮小 |
| D5 | §6.2 (zipExport) | **命名差分**: 計画 `resetCancel` / 実装 `clearCancelRequest` | 動作は同じ | 命名の一貫性のみ、実害無し |
| D6 | §6.2 (zipExport) | **設計違反 (dead code)**: cancelRequested / requestCancel / clearCancelRequest が実装 hook で未使用 | 計画 §6.3 で「download logic は cancelRequested / updateZipState を経由」と書かれたが、実装は AbortController のみで cancel を実現 | `docs/audit/issues-phase9.md` B7 で追跡 |
| D7 | §6.2 | **markChecked 実装が仕様と齟齬**: 計画は型のみ、実装は `lastCheckAt + isChecking=false` を同時セット | 意図的な追加だが計画書に明記なし | 実質的に有用な拡張。docs 更新推奨 |
| D8 | §7.5 | **per-module thresholds が計画値と異なる** | 計画 `lib/store: 90/85/90/90` / 実装 `85/80/90/85` (branches が緩め) | Phase 9-C.6 で threshold 引き下げ、実測値 lib/store=96.18% で問題なし |
| D9 | §7.5 | **branches 全体閾値が計画 55 → 実装 60 に厳格化** | 計画超過の厳しい設定 | 良い方向の変更 |
| D10 | §7.5 | **lib/utils threshold は計画に無いが実装で追加** (60/60/60/60) | 追加 | ○ |
| D11 | §7.5 exclude | **計画には無い exclude 設定を大量追加** (Phase 9-C.6 で追加) | Client Component 群を単体テストから除外し E2E 担保に | 実務判断として妥当。ただし計画書と乖離 |
| D12 | §8.2 | **Profiler 測定手順が完全に代替方法に置換** | 計画: 実際に `3780f28` を checkout して React DevTools で計測 → 実装: `__tests__/perf/rerender.test.tsx` で fake Context モデルとの比較 | §8.4 に「代替も用意」と記載あるが、代替のみで済ませたのは仕様変更 |
| D13 | §8.3 | **測定シナリオが完全に異なる** | 計画: カテゴリ変更/プロファイル切替/Mod 追加 → 実装: theme 切替/Toast 追加/ZIP 進捗更新 | 実際のアプリ操作シナリオではなく Zustand slice 単位の合成シナリオ |
| D14 | §3.2 | **appActionsStore が計画に無い** | 実装で新規追加 (D3 の副産物) | 妥当な追加。docs 反映済み (README/diff.md) |
| D15 | §3.3 | **`lib/query/client.test.ts` 未実装** | 計画では `query/{client,hooks}.test.ts` の 2 ファイル、実装は `hooks.test.tsx` のみ | vitest.config.ts で `lib/query/client.ts` を exclude、実データフローは useProjectQuery テスト経由で担保という判断 |
| D16 | §10.1 | **AppContext.tsx 行数目標 60 行 vs §5.5 の 50 行で計画書内齟齬** | 計画書自身の内部矛盾 | Phase 10 で完全削除するので実務影響なし |
| D17 | docs/planning/complete/PHASE9_COMPLETE.md | **All files coverage 91.34% と記載、実測 91.5%** | Phase 9-E.1 で CacheStatusBadge テスト追加後にドキュメント未更新 | docs 更新推奨 (0.16 pt 差) |
| D18 | 型定義重複 | **`ZipProgressState` interface が hooks/useZipExport.ts と lib/store/zipExport.ts の両方で export されている** | 名前空間衝突リスク | `docs/audit/issues-phase9.md` B5 で追跡 |
| D19 | 定数重複 | **`INITIAL_STATE` が両ファイルで定義**、hooks/ 側は dead code | 保守性リスク | `docs/audit/issues-phase9.md` B5 で追跡 |
| D20 | ESLint config | **`__tests__/perf/rerender.test.tsx` で react-hooks/rules-of-hooks を全 disable** | 将来の hook 追加で rules 違反が検知されない | `docs/audit/issues-phase9.md` B36 で追跡 |

---

## D1. Sub-Phase 順序の変更: 9-B を 9-A の前に実施

### 計画書の想定 (§4.1)

```
9-A → 9-B → 9-C → 9-D → 9-E
```

理由:「AppContext 撤去で hooks/components がどの store から何を取っているか明確化。テスト側も store を直接扱う方が書きやすい」

### 実装で判明した問題

Phase 9-A.1 (SettingsPageClient) の実装を開始した時点で以下の構造制約を発見:

- `SettingsPageClient` は **Server Component (`app/settings/page.tsx`) から `<SettingsPageClient />` として呼ばれている**
- Server Component から Client Component への **関数 props 渡しは Next.js の仕様上不可能** (シリアライズできない)
- つまり `handleDownloadZip / handleImportZipInput / handleDropZip` などの `useZipExport / useZipImport` 由来の関数を `SettingsPageClient` に届ける経路は:
  1. Server Component 経由の props 渡し (**不可**)
  2. `React.cloneElement` で children に inject (不自然、動的)
  3. **Context 経由** (現状の useAppContext がまさにこれ)
  4. **Zustand store 経由** (Client Component 間なら OK)

つまり **Zustand store 化されていない関数は Context を撤去できない**。

### 対応: 順序を 9-B → 9-A に入れ替え

```
9-B (operationsStore 3 分割) → 9-A (AppContext 撤去) → 9-C → 9-D → 9-E
```

1. 9-B で `useZipExportStore / useZipImportStore / useDepCheckStore` が揃う
2. これで **SettingsPageClient は Zustand 経由で `handleDownloadZip` 等を取れる**
3. 9-A で AppContext を撤去する際、**Zustand 直接参照だけで完結**する

---

## D2. AppContext.tsx 行数超過

### 計画書 §5.5 / §10.1 の齟齬

- §5.5「AppContext.tsx が **~50 行以下** に縮小」
- §10.1「AppContext.tsx 行数 目標 **≤ 60 行**」

計画書内部で 50 と 60 の 2 つの数値がある。

### 実装

`wc -l components/AppContext.tsx` = **73 行**。

内訳:
- コメント/空行 = 55 行
- 実コード = 18 行 (throw 実装 + pass-through Provider)

Phase 10 で完全削除される予定なので実務影響はほぼ無いが、計画書のいずれの基準も超過している。

---

## D3. Props 渡し設計を撤廃、appActionsStore を新設

### 計画書 §5.3 の設計

```tsx
// Before → After
export interface SettingsPageClientProps {
  handleResetData: () => void;
  handleDownloadZip: () => void;
  handleImportZipInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDropZip: (e: React.DragEvent) => void;
  handleSwitchProfile: (id: string) => void;
  handleDeleteProfile: (id: string) => void | Promise<void>;
  openNewProfileModal: () => void;
}

export const SettingsPageClient: React.FC<SettingsPageClientProps> = (props) => { ... };
```

### 実装

```tsx
// SettingsPageClient は props なし
export const SettingsPageClient: React.FC = () => {
  const handleDownloadZip = useAppAction('handleDownloadZip');
  const handleImportZipInput = useAppAction('handleImportZipInput');
  // ... 全 hook 由来 action を useAppAction 経由で取得
};
```

### 齟齬

D1 の順序変更に加えて、**Server Component 経由の props 渡しが不可能**なので、全 hook 由来 action を Zustand (`appActionsStore`) 経由に統一。計画書の Props interface はゼロに。

これにより 3 コンポーネント (Settings/Mods/Home + ModDetail) 全てが appActionsStore を subscribe する構造になった。

---

## D4. zipImport.ts のスコープ縮小

### 計画書 §3.2 / §6.2

```typescript
export interface ZipImportStoreState {
  pendingImportData: PendingImportData | null;
  isNewProfileModalOpen: boolean;      // ← 計画のみ
  setPendingImportData: (data: PendingImportData | null) => void;
  openNewProfileModal: () => void;     // ← 計画のみ
  closeNewProfileModal: () => void;    // ← 計画のみ
}
```

### 実装

```typescript
export interface ZipImportStoreState {
  pendingImportData: PendingImportData | null;
  setPendingImportData: (data: PendingImportData | null) => void;
  clearPendingImportData: () => void;   // 実装で追加
}
```

Modal open state は `AppShell.tsx` の局所 `useState` として残された。`useZipImport(setProfiles, setCurrentProfileId, setIsNewProfileModalOpen, ...)` のように `setIsNewProfileModalOpen` を props で受け取る形。

理由推測: Modal open state を Zustand に置いても他 hook からの参照がなく、Zustand 化するメリット薄。妥当な判断だが、計画書との差分として記録。

---

## D5〜D6. zipExport の cancelRequested が dead code

### 計画書 §6.2 の設計

```typescript
export interface ZipExportStoreState {
  cancelRequested: boolean;
  requestCancel: () => void;
  resetCancel: () => void;
}
```

### 計画書 §6.3 の hook 設計

```typescript
export const useZipExport = (currentProfile, showToast, ...) => {
  const cancelRequested = useZipExportStore((s) => s.cancelRequested);
  const requestCancel = useZipExportStore((s) => s.requestCancel);
  const resetCancel = useZipExportStore((s) => s.resetCancel);
  // ... download logic は cancelRequested / updateZipState を経由 ...
};
```

### 実装

- `lib/store/zipExport.ts`: `cancelRequested / requestCancel / clearCancelRequest` を追加 (`resetCancel` を `clearCancelRequest` に改名)
- `hooks/useZipExport.ts`: **これらの action / state を一切 subscribe しない**。cancel は `activeZipAbortRef` (AbortController) のみで実現

結果、**store の cancelRequested / requestCancel / clearCancelRequest は完全に dead code**。テストコードのみが叩いている状態。

**バグ扱い**: `docs/audit/issues-phase9.md` B7 で追跡。

---

## D7. markChecked の実装拡張

### 計画書 §6.2

```typescript
export interface DepCheckStoreState {
  markChecked: () => void;  // ← 中身の実装は未記述
}
```

### 実装

```typescript
markChecked: () => set({ lastCheckAt: Date.now(), isChecking: false }),
```

意図的な拡張 (isChecking を同時にリセット)。計画書に「markChecked() は lastCheckAt + isChecking をリセット」と明記されていない → docs 更新推奨。

また実装で `reset: () => set({ hasDepWarning: false, lastCheckAt: null, isChecking: false })` が追加されているが計画書に記載なし。

---

## D8〜D11. per-module thresholds の齟齬

### 計画書 §7.5

```typescript
'lib/store/**/*.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
'lib/state/**/*.ts': { statements: 95, branches: 90, functions: 95, lines: 95 },
'lib/db/**/*.ts':    { statements: 75, branches: 70, functions: 75, lines: 75 },
'lib/query/**/*.ts': { statements: 70, branches: 60, functions: 70, lines: 70 },
'lib/modrinth/**/*.ts': { statements: 65, branches: 55, functions: 65, lines: 65 },
'hooks/**/*.ts':     { statements: 70, branches: 60, functions: 70, lines: 70 },
'components/**/*.tsx': { statements: 50, branches: 45, functions: 50, lines: 50 }
// グローバル: branches: 55
```

### 実装 `vitest.config.ts`

```typescript
'lib/store/**/*.ts': { statements: 85, branches: 80, functions: 90, lines: 85 },  // 計画より緩い
'lib/state/**/*.ts': 計画通り
'lib/db/**/*.ts':    計画通り
'lib/query/**/*.ts': 計画通り
'lib/modrinth/**/*.ts': 計画通り
'lib/utils/**/*.ts': { statements: 60, branches: 60, functions: 60, lines: 60 }, // 計画に無し、追加
'hooks/**/*.ts':     計画通り
'components/**/*.tsx': 計画通り
// グローバル: branches: 60 (計画 55 → 厳格化)
```

さらに **coverage.exclude** に以下を追加 (計画書に無し):

- `app/**/page.tsx`, `app/layout.tsx` (Server Components)
- `components/AppShell.tsx`, `HomeInteractive.tsx`, `ModsPageClient.tsx`, `ModDetailModalShell.tsx`, `SettingsPageClient.tsx`
- `components/BottomNav.tsx`, `EditProfileModal.tsx`, `DependencyCheckModal.tsx`, `ZipProgressModal.tsx`, `ToastContainer.tsx`, `MarkdownRenderer.tsx`
- `components/Providers.tsx`, `WebVitalsReporter.tsx`, `AppContext.tsx`
- `hooks/useConfirm.ts`, `useToasts.ts`
- `lib/query/client.ts`, `lib/utils/download.ts`, `lib/constants/**`

判断としては「単体テストで検証しづらい File は E2E 担保に回す」で妥当だが、**計画書の per-module thresholds を pass するために exclude を大量追加した**という側面がある。実測値は全て per-module 目標を大幅に上回っているので、exclude を削減して全体カバレッジを再測定する余地は残る。

---

## D12〜D13. Profiler 測定シナリオが完全に異なる

### 計画書 §8.2

```bash
# Before の記録
git worktree add /tmp/dropmod-phase8 3780f28
cd /tmp/dropmod-phase8
pnpm install --frozen-lockfile
pnpm build && pnpm start --port 3201
# Chrome + React DevTools Profiler で以下シナリオ:
# Scenario A: カテゴリ変更
# Scenario B: プロファイル切替
# Scenario C: Mod 追加
```

### 実装 `__tests__/perf/rerender.test.tsx`

- 実際の Phase 8 commit を checkout せず、**同じテストファイル内で Context 版を fake モデルとして再構築**
- 測定シナリオ:
  - Scenario A: theme 切替 (5 回)
  - Scenario B: Toast 追加 (3 回)
  - Scenario C: ZIP 進捗更新 (10 tick)

計画書 §8.4 に「代替: `__tests__/perf/rerender.test.tsx` で `render count` を spy する軽量な自動テストも用意」とあるので、代替方法の実装自体は認められている。しかし:

1. 代替方法「のみ」で済ませ、実 branch checkout での実測を **一切していない**
2. 測定シナリオが計画書と全く別のもの (フィルタ変更 → theme 切替 に置換)

計画書 §8.5 の DoD「少なくとも 1 シナリオで 70% 以下達成」は達成したが、**計画書 §8.3 の期待値表 (フィルタ変更 30+ → 5-10 components) の検証は行われていない**。

---

## D14. appActionsStore が計画に無い

### 計画書 §3.2 の store 一覧

```
lib/store/
├── profiles.ts
├── toast.ts
├── confirm.ts
├── zipExport.ts
├── zipImport.ts
└── depCheck.ts
```

### 実装

上記 6 + `appActions.ts` の 7 store。

`appActionsStore` は D1/D3 で述べた通り、Server → Client 関数受け渡し制約への対応で新規追加。妥当な追加だが、**計画書に一切記載無し**。docs (README.md / diff.md §13.1) には反映済み。

---

## D15. `lib/query/client.test.ts` 未実装

### 計画書 §3.3

```
├── query/{client,hooks}.test.ts   ← Phase 9-C 新規
```

### 実装

- `__tests__/lib/query/hooks.test.tsx` ✅ 実装済み
- `__tests__/lib/query/keys.test.ts` ✅ (既存)
- `__tests__/lib/query/client.test.ts` ❌ **未実装**

理由: vitest.config.ts で `lib/query/client.ts` を coverage exclude、SSR + IndexedDB 依存で単体テスト困難。しかし計画書との差分として明示的に記録すべき。

---

## D17. docs metrics の不一致 (91.34% vs 91.5%)

`docs/planning/complete/PHASE9_COMPLETE.md` と `docs/planning/complete/PHASE9_C_COMPLETE.md` で **All files coverage を 91.34% と記載**。

実測 (HEAD `5a3bde1` で `pnpm test:coverage`): **91.5%**

差 0.16 pt。原因は Phase 9-E.1 の CacheStatusBadge テスト (8 tests 追加) 後にドキュメントを再測定していないため。実害無しだが、レポートとしての正確性の問題。

**修正推奨**: `docs/planning/complete/PHASE9_C_COMPLETE.md` は Phase 9-C.6 時点のスナップショットなので触らず、`docs/planning/complete/PHASE9_COMPLETE.md` を更新して「Phase 9 完了時点 91.5%」と反映するのが妥当。

---

## D18〜D19. `ZipProgressState` / `INITIAL_STATE` の重複定義

### 実装コード状況

**`hooks/useZipExport.ts`**:
```typescript
export interface ZipProgressState { isOpen: boolean; ... }  // 79 行
const INITIAL_STATE: ZipProgressState = { ... };            // 87 行 (dead code)
```

**`lib/store/zipExport.ts`**:
```typescript
export interface ZipProgressState { isOpen: boolean; ... }  // 26 行 (同名同構造)
const INITIAL_STATE: ZipProgressState = { ... };            // 34 行 (実際に使用)
```

- hooks/ 側の `INITIAL_STATE` は **どこからも参照されない dead code**
- 型 `ZipProgressState` は両方 export されているが、誰も import していない → 名前空間衝突は現状無し
- しかし将来一方だけ変更した場合、静かに不整合になる保守性リスク

**バグ扱い**: `docs/audit/issues-phase9.md` B5 で追跡。

---

## D20. ESLint disable の集中使用

### 実装

`__tests__/perf/rerender.test.tsx` の冒頭:

```typescript
/* eslint-disable react-hooks/rules-of-hooks, react-hooks/immutability --
 *   このファイル固有の設計:
 *   render 関数を counter が register し、Counted の render 本体で hook を呼ぶ。
 *   ...
 */
```

**ファイル全体で react-hooks 関連の警告を止めている**。テストコードとはいえ、将来ここに新規 hook を追加した際に rules 違反が検知されない。

**バグ扱い**: `docs/audit/issues-phase9.md` B36 で追跡。

---

## その他の実装で追加された、計画書には無い設計

### 追加された file

- `components/CacheStatusBadge.tsx` — Phase 9-E.1 で実装 (計画書 §9.1 E-2 の "「🌐 X 分前のデータ」表示" に対応)
- `__tests__/perf/rerender.test.tsx` — Phase 9-D の代替実装 (計画書 §8.4 で言及)
- `__tests__/test-utils/queryWrapper.tsx` — Phase 9-C.3 のヘルパ (計画書に無し、テスト実装で新規)
- `__tests__/mocks/handlers.ts` の path-only pattern (proxy `/api/modrinth`) — 計画書は absolute URL だったが `client.ts` の実装 (相対 URL fetch) に合わせて変更
- `__tests__/lib/store/appActions.test.tsx` — D14 に対応する新規テスト
- `docs/planning/complete/PHASE9_C_COMPLETE.md`, `docs/planning/complete/PHASE9_PROFILER.md`, `docs/planning/complete/PHASE9_COMPLETE.md`, `docs/planning/complete/PHASE10_CANDIDATES.md` — 各種完了レポート

### 追加された vitest.setup.ts

```typescript
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
```

計画書に無し。CustomDropdown Arrow キー用の jsdom 未実装対応。

---

*本 docs/audit/diff-phase9.md は Phase 9 実装中に発見された「計画書との齟齬」を全て記録するものです。バグ (実装ミスや潜在的不具合) は `docs/audit/issues-phase9.md` に別途記載しています。*
