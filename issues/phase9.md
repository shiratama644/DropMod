# Phase 9 バグ・潜在的不具合 監査レポート

> **監査日:** 2026-08-24 (JST)
> **対象:** Phase 9-A 〜 Phase 9-E 完了時点 (HEAD `5a3bde1`)
> **監査範囲:** Phase 9 で追加・改修された全ファイル (lib/store/, hooks/, components/, __tests__/, next.config.ts, vitest.config.ts, docs/)
> **修正方針:** **本監査では修正は行わず、発見したバグを全てここに列挙する** (ユーザー判断で優先度付け後に別セッションで修正)

---

## 🚨 重大度サマリ

| 重大度 | 件数 | 内容 |
|---|---:|---|
| 🔴 Critical | 1 | 実運用でユーザーに影響 (B24) |
| 🟠 High | 5 | 実運用で潜在的に影響、条件次第 (B4, B7, B10, B19, B22) |
| 🟡 Medium | 13 | 保守性/UX/コード品質の問題 (B1, B5, B8, B11, B12, B13, B16, B18, B23, B27, B28, B32, B33) |
| 🟢 Low | 20 | ドキュメント齟齬、dead code、コメント誤り、確認済み無害等 (B2, B3, B6, B9, B14, B15, B17, B20, B21, B25, B26, B29, B30, B31, B34, B35, B36, B37, B38, B39) |
| 総計 | **39** | |

**注**: B2/B3/B9/B29/B30/B34/B37/B38/B39 は詳細調査の結果、実害なし or 別バグ (B1/B10/B19) との重複と判明し Low に分類。B31 は SSR キャッシュヒットバッジ関連の UX 課題 (実害小)、B36 は ESLint disable の広さの品質問題。

---

## 🔴 Critical

### B24. `useProfiles` hydration で無効な `savedCurrentId` が profiles に存在しない場合の防御なし

**ファイル**: `hooks/useProfiles.ts` L143-145

```typescript
if (savedCurrentId) {
  setCurrentProfileId(savedCurrentId);
}
```

**症状**: Dexie meta に保存された `currentProfileId` が、Dexie profiles テーブルに存在しない ID (例: 別セッションで削除されたプロファイルの ID) だった場合、そのまま `setCurrentProfileId(ghostId)` を実行。

その後の `currentProfile = profiles.find((p) => p.id === currentProfileId) || profiles[0] || {...transient-fallback...}` で fallback `profiles[0]` が使われるので UI は表示されるが、**`currentProfileId` state と実際の `currentProfile.id` が不一致**になる。

**影響**:

1. 次回 syncProfiles で `dexieSetMeta(META_KEYS.CURRENT_PROFILE_ID, currentProfileId)` = 幽霊 ID が永続化される
2. `handleToggleMod` などが `p.id === currentProfileIdRef.current` で filter するので、Mod 追加/削除が対象 profile に反映されない (updated profile が見つからない → setState は no-op になる)
3. cookie `dropmod_active_profile` は `mcVersion / loader` のみで OK、実害無し
4. **実質的にプロファイル操作が全て silent 失敗**する

**再現条件**:
- 2 タブ運用で片方でプロファイル A を削除、もう片方が復元前だった場合
- LocalStorage 破損復元シナリオで `currentProfileId` だけ残り profiles は空だった場合

**修正案 (実装しない)**:
```typescript
if (savedCurrentId && dbProfiles.some((p) => p.id === savedCurrentId)) {
  setCurrentProfileId(savedCurrentId);
}
// もしくは
if (savedCurrentId) {
  const exists = dbProfiles.some((p) => p.id === savedCurrentId);
  setCurrentProfileId(exists ? savedCurrentId : dbProfiles[0]?.id ?? '');
}
```

---

## 🟠 High

### B4. `currentProfile` の transient fallback が render 毎に新規オブジェクト生成 (再レンダー暴走リスク)

**ファイル**: `hooks/useProfiles.ts` L291-300

```typescript
const currentProfile: Profile =
  profiles.find((p) => p.id === currentProfileId) ||
  profiles[0] || {
    id: 'transient-fallback',
    name: '既定プロファイル',
    mcVersion: '1.20.1',
    loader: 'Fabric',
    description: '',
    mods: []
  };
```

**問題**: `profiles.find(...)` が falsy かつ `profiles[0]` が falsy な場合 (`profiles=[]`)、右辺 object は **render のたびに新規生成される**。

**再現確認テスト実施 (2026-08-24)**:
```typescript
useProfilesStore.setState({ profiles: [], currentProfileId: 'missing' });
const { result, rerender } = renderHook(() => useProfiles(...));
const first = result.current.currentProfile;
rerender();
const second = result.current.currentProfile;
expect(first).toBe(second);  // ❌ FAILS - 参照が違う
```

**影響**:

1. `currentProfile` が render 毎に新参照
2. AppShell が `useDependencyCheck(currentProfile)` を呼び、hook 内 `useEffect(..., [currentProfile.mcVersion, currentProfile.loader, modsSignature])` の deps は文字列比較なので OK。ただし `AppShell` の register useEffect deps に `currentProfile` を含めており、**profile fallback 状態では毎レンダー register/unregister が発火**
3. これは B19 (register/unregister window) と組み合わさり、hydration 前は appActionsStore が 1 レンダー tick ごとに `null → actions → null → actions → ...` を繰り返す
4. 下流の `useAppAction` subscribers が毎レンダーで actions[key] の変更を検出、無限に再レンダーの可能性

**関連バグ**: B19, B33

---

### B7. `zipExport` store の `cancelRequested / requestCancel / clearCancelRequest` は完全に dead code

**ファイル**: `lib/store/zipExport.ts` L55-56, 78-80

**現状**:
- `lib/store/zipExport.ts` に `cancelRequested: boolean`, `requestCancel()`, `clearCancelRequest()` が実装されている
- **しかし `hooks/useZipExport.ts` はこれらを一切 subscribe / 呼び出ししない**
- Cancel は `activeZipAbortRef` (AbortController) のみで実現

**検証**:
```bash
grep -rn "requestCancel\|clearCancelRequest" app components hooks lib
# → 使用箇所は lib/store/zipExport.ts (定義) と __tests__/lib/store/zipExport.test.ts (テスト) のみ
```

**影響**:

1. **設計と実装の齟齬**: 計画書 §6.3 で「download logic は cancelRequested / updateZipState を経由」と明記されたが、実装は AbortController のみ
2. store から `useZipExportStore.getState().requestCancel()` を外部から呼んでも、hook 内の DL loop に何も伝わらず effectively no-op
3. テストコードだけがこれを叩いており、**「テストは pass しているが実運用で動作しない」機能**

**修正方針 (実装しない)**:
- A) `hooks/useZipExport.ts` の DL loop に `if (useZipExportStore.getState().cancelRequested) throw new Error('Aborted');` を挿入
- B) store から dead code を削除、AbortController のみの設計にする

**関連差分**: diff/phase9.md D5, D6

---

### B10. `handleToggleMod` の削除フローで toggleInFlightRef が即解放される → 同一ボタン連打で「削除→追加」の暴発リスク

**ファイル**: `hooks/useProfiles.ts` L410-503

**流れ**:

```typescript
try {
  if (toggleInFlightRef.current.has(projectId)) return;
  toggleInFlightRef.current.add(projectId);

  const existsIndex = latestProfile.mods.findIndex(...);
  if (existsIndex >= 0) {
    // --- 削除: setProfiles (同期呼び出し) ---
    setProfiles((prev) => ...);
    // ← ここで return されず finally に落ちる
  } else {
    // --- 追加: async fetch ... await ... ---
  }
} finally {
  toggleInFlightRef.current.delete(projectId);  // ← 削除フローでも即解放
}
```

**症状**:

1. ユーザーが「追加済み」ボタンをクリック (削除フロー) → setProfiles + finally で unlock
2. React が state 反映する前に、ユーザーが**同じボタン**を再度クリック (実際は既に "追加" 表示に変わっているはずだが、Strict Mode / event queue の関係でタイミングが微妙)
3. 2 回目クリック: `toggleInFlightRef.has(id)` = false → 通す
4. `latestProfile.mods` は Ref (render 中に同期更新) なので、**削除前の profile を掴む可能性** (Zustand の subscribe listener → Ref 更新 → 再render の順序次第)
5. `existsIndex >= 0` → 再度削除試行 → filter で hit しない → **UI 上「削除しました」toast が 2 回発火**

**リスク**:

- silent モード (dep check の autofix) では toast 出ないが、**依存 mod を追加しようとして「まだ追加されていない」と誤判定 → 想定と違う mod 群が追加される**可能性
- UX: 削除 toast の重複表示

**修正方針 (実装しない)**:
- 削除フローも `try { setProfiles(...) } finally { toggleInFlightRef.delete }` の代わりに、削除フローの直後で明示的に `toggleInFlightRef.current.delete(projectId)` を setState の setTimeout(0) 経由で遅延解除

---

### B19. AppShell の register useEffect が cleanup で `actions = null` に戻す window (Strict Mode で顕在化)

**ファイル**: `components/AppShell.tsx` L249-297

```typescript
const registerAppActions = useAppActionsStore((s) => s.registerAppActions);
const unregisterAppActions = useAppActionsStore((s) => s.unregisterAppActions);
useEffect(() => {
  registerAppActions({...});
  return () => unregisterAppActions();  // ← ここが問題
}, [..., mcVersions, currentProfile]);
```

**問題**:

- `useEffect` の cleanup で `unregisterAppActions()` → store の `actions = null`
- 次の render で `useEffect` が再実行 → `registerAppActions({...})` → 復活
- しかし cleanup と 再 register の間に **1 microtask の window** が発生
- この window 中に、下流コンポーネントの button click ハンドラが実行されると、`useAppAction('handleToggleMod')` は **no-op fn を返す** (B1 参照)
- **ユーザー操作が silent に無視される**

**Strict Mode で顕在化**:

React 19 Strict Mode は dev モードで useEffect を **意図的に 2 回連続で mount → unmount → mount** する。この時 unregister → register の window が **2 回連続で発生**する。

さらに B4 (currentProfile fallback が毎レンダー新参照) と組み合わさると、hydration 前は毎レンダー register/unregister が繰り返される。

**再現確認**:
```typescript
useAppActionsStore.getState().registerAppActions({... handleDownloadZip: realFn ...});
const { result } = renderHook(() => useAppAction('handleDownloadZip'));
result.current(); // called=1
act(() => useAppActionsStore.getState().unregisterAppActions());
result.current(); // called=1 のまま (no-op が呼ばれた)
```

**修正方針 (実装しない)**:
- cleanup での unregisterAppActions を止め、AppShell アンマウント時のみに限定 (別 useEffect で `useEffect(() => () => unregisterAppActions(), [])`)
- または registerAppActions を毎 render 呼ぶだけにして cleanup 無し

---

### B22. `useDependencyCheck` の catch/fallback コメントと実装が不一致

**ファイル**: `hooks/useDependencyCheck.ts` L60-62

```typescript
try {
  const batchVersions = await queryClient.fetchQuery({...});
  batchVersions.forEach((v: any) => versionMap.set(v.id, v));
} catch (_e) {
  // レートリミット等: 前回の hasDepWarning を保持して無音失敗
}
```

**問題**:

- コメントは「前回の hasDepWarning を保持」だが、**catch 後に何もせずに次の処理に進む**
- `versionMap` は空のまま outer loop へ
- `outer loop` は空 versionMap で回るので `warning = false` になる
- `setHasDepWarning(false)` が呼ばれる → **前回の警告状態が消される**

**再現確認 (Phase 9-C.3 テストで実測)**:

`__tests__/hooks/useDependencyCheck.test.tsx > /versions が 500 を返しても throw しない (実装は warning=false 側に倒す)` テストで既に「前回値保持ではなく false になる」と明記されている。**実装が仕様と乖離した状態でテストが書かれた**状態。

**影響**:

- Modrinth レートリミット (429) や一時的な 500 が発生した瞬間、**依存警告バッジが消える**
- ユーザーには「問題解決した」と誤認識される可能性
- 次回の profile 変更 (dep check 再発火) 時にまた警告が復活するが、その間の窓では警告なし

**修正方針 (実装しない)**:
```typescript
} catch (_e) {
  // 前回値を保持: 何もせず early return
  return;
}
```

もしくは finally で `markChecked()` は呼びつつ `setHasDepWarning` は skip。

---

## 🟡 Medium

### B1. `useAppAction` の no-op fallback が毎回新規参照

**ファイル**: `lib/store/appActions.ts` L108-113

```typescript
export function useAppAction<K extends keyof AppActions>(key: K): AppActions[K] {
  const fn = useAppActionsStore((s) => s.actions?.[key]);
  if (fn !== undefined) return fn;
  return ((..._args: unknown[]) => {}) as unknown as AppActions[K];
}
```

**問題**: 未登録時に **毎レンダーで新規 no-op function を生成**。

**再現確認**:
```typescript
useAppActionsStore.getState().unregisterAppActions();
const { result, rerender } = renderHook(() => useAppAction('handleToggleMod'));
const first = result.current;
rerender();
const second = result.current;
expect(first).toBe(second);  // ❌ FAILS - 別参照
```

**影響**:

- 呼び出し先で `useEffect(..., [action])` の deps に入れると再実行の原因
- 呼び出し先で `useCallback(cb, [action])` の deps に入れると新参照生成 → その cb が memo された child に渡ると child 再レンダー
- 現状の実装では useEffect deps に入れているケースは無いが、Phase 10 で memo 化するときにハマる

**修正方針 (実装しない)**:
```typescript
const NOOP: unknown = () => {};
export function useAppAction<K extends keyof AppActions>(key: K): AppActions[K] {
  const fn = useAppActionsStore((s) => s.actions?.[key]);
  return (fn ?? NOOP) as AppActions[K];
}
```

---

### B5. `ZipProgressState` 型と `INITIAL_STATE` の重複定義

**ファイル**:
- `hooks/useZipExport.ts` L79 (`export interface ZipProgressState`)、L87 (`const INITIAL_STATE`)
- `lib/store/zipExport.ts` L26 (`export interface ZipProgressState`)、L34 (`const INITIAL_STATE`)

**問題**:
- **同名 export type が 2 箇所** で定義されている (同構造だが)
- **`INITIAL_STATE` は hooks/ 側で dead code** (誰も参照しない)、lib/store/ 側のみが実際に使われる

**影響**:

1. 現状は誰も `hooks/useZipExport.ts` の `ZipProgressState` を import していないので実害無し
2. 将来 (Phase 10 等) で誰かが `import type { ZipProgressState } from '@/hooks/useZipExport'` した後、`lib/store/zipExport.ts` の shape だけ変更されると **静かに不整合**
3. `hooks/useZipExport.ts` の `INITIAL_STATE` は削除しても動作変わらない dead code

**修正方針 (実装しない)**:
- hooks/useZipExport.ts の `ZipProgressState` と `INITIAL_STATE` を削除
- 必要なら `import type { ZipProgressState } from '@/lib/store/zipExport'` に置き換え

---

### B8. `useProfiles` の fallback プロファイル復旧 useEffect が Strict Mode double-invoke で復旧 toast が 2 回出る

**ファイル**: `hooks/useProfiles.ts` L274-289

```typescript
useEffect(() => {
  if (!hasHydrated) return;
  if (profiles.length === 0) {
    const fallbackProfile: Profile = {
      id: generateId('default-profile-recovered'),
      // ...
    };
    setProfiles([fallbackProfile]);
    setCurrentProfileId(fallbackProfile.id);
    showToast('プロファイルが失われたため既定を復旧しました', 'warning');
  }
}, [profiles.length, hasHydrated, showToast, setProfiles, setCurrentProfileId]);
```

**問題**: Strict Mode で useEffect が 2 回連続 mount された場合:

1. 1回目 mount: `profiles.length === 0` → fallback 生成 (uuid1) → setProfiles → showToast
2. cleanup (Strict Mode の 2 回目 mount 前)
3. 2回目 mount: `profiles.length === 1` (setProfiles 反映済み) → if で return → **理論上 OK**

しかし、2回目 mount 時に **profiles が既に更新済みかどうかは React Strict Mode のスケジューリング次第**で、React 19 では state 更新が 2 回目 mount 前に反映される保証は微妙。反映されていない場合 → uuid1, uuid2 の 2 個 fallback が生成 → 最終的に uuid2 上書き (setProfiles([...])) だが **showToast 2 回発火**。

**再現条件**: Strict Mode + hydration 完了直後に `profiles=[]` (レア)

**影響**: 実運用では稀だが、UX として復旧 toast が重複表示される。

---

### B11. Dexie 保存 useEffect の並列書き込み (transaction queue に溜まる)

**ファイル**: `hooks/useProfiles.ts` L189-224

```typescript
useEffect(() => {
  if (!hasHydrated) return;
  void (async () => {
    try {
      await dexieSyncProfiles(profiles);
      await Promise.all([dexieSetMeta(META_KEYS.THEME, theme), ...]);
    } catch (e) {...}
  })();
  // ↑ 前の syncProfiles が完走する前に次の profiles で発火可能
}, [hasHydrated, theme, currentProfileId, profiles]);
```

**問題**: Zustand の `setProfiles` を高頻度で呼ぶ (Mod 大量追加時など) と、Dexie transaction が **queue に大量に溜まる**。

- Dexie 自体は transaction を FIFO でシリアライズするので **最終的な整合性は保たれる** (最後の state が最新)
- しかし transaction queue が長くなると **DOM Event Loop が詰まる** 可能性
- 100+ Mod ZIP インポート等では顕在化

**影響**: パフォーマンス劣化。実運用ではまず発生しないが、bulk operation で懸念。

**修正方針**:
- debounce 化 (最後の 500ms 沈黙後にのみ dexieSyncProfiles)
- または `AbortController` で前の transaction を kill

---

### B12. `CacheStatusBadge` の `useState(() => Date.now())` は SSR hydration mismatch リスク

**ファイル**: `components/CacheStatusBadge.tsx` L55-59

```typescript
const [now, setNow] = useState<number>(() => Date.now());
```

**問題**:

- SSR で render された時、`now = SSR実行時刻 A`
- Client hydration で render された時、`now = クライアント実行時刻 B` (A ≠ B、通常 数百 ms〜数秒差)
- `ageMs = now - dataUpdatedAt` を表示するので **SSR HTML と client 初回 render の text が異なる → hydration mismatch warning**

**現状**:

- `dataUpdatedAt=0` (SSR 時) では early return で `null` を返すので mismatch はしない
- しかし client 側でも 1 回目 render 時 `useState(() => Date.now())` が実行されるため、hydration mismatch を回避するには `useEffect` で client-side だけ設定する pattern が推奨

**推奨**:
```typescript
const [now, setNow] = useState<number>(0);
useEffect(() => {
  setNow(Date.now());
  const timer = setInterval(() => setNow(Date.now()), 30_000);
  return () => clearInterval(timer);
}, []);
```

---

### B13. `CacheStatusBadge` の 30 秒 tick では「秒 → 分」表示遷移が最大 30 秒遅延

**ファイル**: `components/CacheStatusBadge.tsx` L60-62

```typescript
useEffect(() => {
  const timer = setInterval(() => setNow(Date.now()), 30_000);
  return () => clearInterval(timer);
}, []);
```

**問題**: 30 秒間隔で `now` を更新する設計。しかし表示閾値は:
- 10 秒以内 → 「今取得」
- 10〜60 秒 → 「X 秒前のキャッシュ」 (毎秒表示更新すべき)
- 60 秒〜 → 「X 分前のキャッシュ」

30 秒 tick では:
- 「9 秒前」表示のバッジが 30 秒後に「39 秒前」に一気にジャンプ (実際は「今取得」→「9秒前」の遷移も見逃す)
- 「45 秒前」→ 30 秒後 → 「1分前」ではなく「75 秒前」→ ラベルが古いまま
- UX bug

**修正方針**:
- 動的な interval (最初 5 秒、10 秒過ぎたら 30 秒、1 分過ぎたら 60 秒、1 時間過ぎたら 300 秒) にする
- または最低でも 5 秒に短縮

---

### B16. Toast id 衝突リスク (Math.random 6 文字)

**ファイル**: `lib/store/toast.ts` L33

```typescript
const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
```

**問題**: Math.random() の base36 6 文字は約 2^31 の空間。**Strict Mode で同じ ms 内に showToast が double invoke**、あるいは AutoFix で 10+ toast を並列発火する場合、**同じ ID が衝突する確率は 1/2^31 程度で低い**が、React key で衝突すると「同じ key の 2 個の Toast」→ 片方が render されない。

**影響**: 極稀。実運用でほぼ発生しないが、`crypto.randomUUID()` 使うのが safer。

---

### B18. `useConfirmStore.confirm` の pending resolve 上書き silent キャンセル

**ファイル**: `lib/store/confirm.ts` L67-74

```typescript
confirm: (options, ownerId) =>
  new Promise<boolean>((resolve) => {
    if (pendingResolve) {
      pendingResolve(false);  // ← 前の confirm を silent に false 化
    }
    pendingResolve = resolve;
    pendingOwner = ownerId ?? null;
    set({ state: { ...options, isOpen: true } });
  }),
```

**問題**:

- 前の pending confirm を **silent に `false` で resolve**
- 呼び出し元 (`if (!ok) return;` パターン) には「ユーザーがキャンセルした」と映る
- 実際は「別の confirm で上書きされた」

**影響**:

- 通常 UX では 1 個の confirm が排他表示なので問題ない
- しかし `Promise.all([confirm(opt1), confirm(opt2)])` のように **並列で confirm を await するコード** (現状無いが将来書かれるかも) では、opt1 の結果が `false` になる → 想定外挙動
- AutoFix (依存 mod を並列追加) のような複数 mod 操作で **一度に複数 confirm** が必要になったら破綻

**修正方針**:
- キュー化 (2 個目の confirm は 1 個目完了を待つ)
- または明示的にエラーを throw して呼び出し側に警告

---

### B23. `useDependencyCheck` の `versionIds.length === 0` 時に前回警告が消える

**ファイル**: `hooks/useDependencyCheck.ts` L44-46

```typescript
const versionIds = profile.mods
  .map((m) => m.selectedVersionId)
  .filter((id) => id && id !== 'latest') as string[];

if (versionIds.length > 0) {
  try { /* fetch */ } catch {...}
}
// ← ここで versionMap は空のまま
// outer loop で warning=false のまま setHasDepWarning(false)
```

**問題**: 全 mod が `selectedVersionId='latest'` のとき、fetch を skip → **前回 warning が消える**。

**影響**: プロファイルで全て「最新版」設定にしている場合、依存警告が動作しない。UX bug。

**修正方針**: `versionIds.length === 0` の時は早期 return (前回値保持)。

---

### B27. `useZipExport` テストで JSZip.generateAsync 完了フローが検証できない (jsdom 差異)

**ファイル**: `__tests__/hooks/useZipExport.test.tsx` L74-77 (コメント)

```typescript
// 目的: 実 DL パイプライン (progress state → fetch → JSZip 追加) が回るところまで
//   検証する。JSZip.generateAsync({ type: 'blob' }) は jsdom の Blob 実装の一部で
//   失敗する既知パターンがあるため、完了 toast の 'success' vs 'warning' 分岐は
//   ブラウザ差に依存する。ここでは cdn hit と modal 閉じ、progress 進行を検証。
```

**問題**:

- テストは「JSZip.generateAsync が jsdom で失敗する」ことを許容
- **success 完了フロー全体は単体テストでカバーされない**
- 実装バグで success toast が全く出なくなっても、テストは pass

**影響**: 実質的にZIP エクスポート成功パスの回帰検出能力が無い。E2E テスト (Playwright) 頼み。

**修正方針**:
- JSZip を mock (`vi.mock('jszip')`) して generateAsync 完了を強制
- または `type: 'uint8array'` を使う (Blob より jsdom 互換性高い)

---

### B28. ZIP エクスポート cancel 後も JSZip 圧縮が継続実行される

**ファイル**: `hooks/useZipExport.ts` L384-391

```typescript
const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
  if (signal.aborted) return;  // ← progress 更新だけ skip
  // ...
});
```

**問題**:

- ユーザーが cancel した後、`signal.aborted = true` になっても **JSZip.generateAsync は継続実行**
- progress callback で return しても内部の圧縮ループは止まらない
- 100+ mod の場合、cancel 後も数秒〜数十秒 CPU 消費が続く

**影響**: UI は閉じているのに CPU 使い続ける (メモリ・バッテリ消費)。

**修正方針**: JSZip は AbortSignal を native サポートしていないので、`await Promise.race([zip.generateAsync(...), abortPromise])` で abort 側で throw させる。

---

### B32. `useModalA11y` の modalStack が Strict Mode double-invoke で uid 重複

**ファイル**: `hooks/useModalA11y.ts` L51-60

```typescript
const modalStack: string[] = [];  // module-level

useEffect(() => {
  if (!isOpen) return;
  const uid = uidRef.current;
  modalStack.push(uid);
  return () => {
    const idx = modalStack.lastIndexOf(uid);
    if (idx >= 0) modalStack.splice(idx, 1);
  };
}, [isOpen]);
```

**問題**: Strict Mode で useEffect が **mount → cleanup → mount** の順に double-invoke される。

1. 1回目 mount: `modalStack.push('modal-A')` → stack = ['modal-A']
2. cleanup: `modalStack.splice(indexOf('modal-A'), 1)` → stack = []
3. 2回目 mount: `modalStack.push('modal-A')` → stack = ['modal-A']

一見 OK に見えるが、**別のモーダルが同時に mount していた場合**:

1. modal-A mount: stack = ['modal-A']
2. modal-B mount: stack = ['modal-A', 'modal-B']
3. modal-B cleanup (Strict): stack = ['modal-A']
4. modal-B 2回目 mount: stack = ['modal-A', 'modal-B']
5. modal-A cleanup (Strict): stack = ['modal-B']
6. modal-A 2回目 mount: stack = ['modal-B', 'modal-A']

**問題**: 最上位判定 `modalStack[modalStack.length - 1] === uid` が **順序反転**する。

Escape キーが modal-A に飛ぶべきなのに modal-B に飛ぶ (or 逆)。

**影響**: dev モードで顕在化するが production では Strict Mode 無効なら発生しない。ただし React Server Component の再マウント時にも同様の順序反転リスク。

**修正方針**: uidRef を使わず、stack への push/splice を Set にする、または `useLayoutEffect` で確実な mount/unmount 順序を担保。

---

### B33. インライン fallback プロファイルオブジェクトが 3 コンポーネントで重複、毎レンダー新規生成

**ファイル**:
- `components/HomeInteractive.tsx` L34-37
- `components/ModsPageClient.tsx` L34-37
- `components/ModDetailModalShell.tsx` L69-72

```typescript
const profile = profileFromSelector ?? firstProfile ?? {
  id: 'empty', name: '(未初期化)', mcVersion: '1.20.1', loader: 'Fabric',
  description: '', mods: []
};
```

**問題**:

- **3 コンポーネント で 完全同一のリテラルが重複** (DRY 違反)
- profile が empty fallback に落ちる場合、**毎レンダーで新規 object 生成**
- ModCard に profile prop として渡されているが、ModCard は React.memo 化されていないので実害なし
- しかし Phase 10 で React.memo 化する際、この fallback が memo を破壊する

**再現確認 (2026-08-24)**:
```typescript
useProfilesStore.setState({ profiles: [], currentProfileId: 'missing' });
const { result, rerender } = renderHook(() => { /* fallback pattern */ });
const first = result.current;
rerender();
const second = result.current;
expect(first).toBe(second);  // ❌ FAILS
```

**修正方針**:
- 共通 hook (`useCurrentProfileWithFallback()`) に切り出し、`useMemo(() => fallback, [])` で参照安定化

---

## 🟢 Low

### B2. onToggleMod が useAppAction 経由の場合、DependencyCheckModal の useCallback deps に含まれるが影響は小さい

**ファイル**: `components/DependencyCheckModal.tsx` L383, 417

**現状**: DependencyCheckModal は AppShell から props で `onToggleMod={handleToggleMod}` を受け取る。この handleToggleMod は `useProfiles.handleToggleMod` (useCallback で stable) なので、通常は OK。ただし DepCheckModal が別ルート (useAppAction 経由) で参照するようになれば問題化。

**影響**: 現状無し、将来的リスク。

---

### B3. B10 の詳細な race window は 実際には Zustand の同期 subscribe で緩和される

B10 とほぼ同一。現状の Zustand の subscribeWithSelector + useSyncExternalStore は同期的に更新を通知するため、削除 setState → 次の render → Ref 更新の順で一貫性は保たれる。ただし React 19 concurrent rendering で微妙。

---

### B6. `setZipState` wrapper が実質的に不使用の可能性

**ファイル**: `hooks/useZipExport.ts` L219-229

**現状**: `setZipState` は宣言されているが `useZipExport` 内で `updateZipState`, `useZipExportStore.setState()` は使うが `setZipState` を経由する箇所は少ない。実装確認:

```bash
grep "setZipState" hooks/useZipExport.ts
```

= `setZipState` は `useCallback` で作られるが実際に呼ばれるのは初期化とごく一部 → 半 dead code の疑い。詳しく grep で確認要。

---

### B9. `handleDeleteProfile` の race: profilesRef.current でフィルタ後の残り profile の id を setCurrentProfileId するが、profiles state 反映との race

**ファイル**: `hooks/useProfiles.ts` L398-402

profilesRef.current は render 中同期更新されるので大丈夫だが、削除 setState 呼び出し → まだ反映される前に `profilesRef.current.filter(...)` で計算 → OK (削除前の配列で filter して該当 id 以外を取得)。実質バグ無し、正常動作。

---

### B14. `CacheStatusBadge` で dataUpdatedAt > now の場合 (server 時刻ずれ)

`Math.max(0, now - dataUpdatedAt)` で最低 0 秒に保護。表示は「1秒前」→ 実害なし。

---

### B15. `handlers.ts` の loaders/game_versions JSON.parse 失敗時のフォールバック

`__tests__/mocks/handlers.ts` L74-75: `gv ? (JSON.parse(gv) as string[]) : ['1.20.1']` で loaders/gv が JSON でない場合 (通常無いが) throw する。テスト mock なので実害なし。

---

### B17. `useConfirm` の cleanup deps に `cleanup` を含む

**ファイル**: `hooks/useConfirm.ts` L42-46

Zustand の action 参照は stable なので毎レンダーで cleanup が変わることは無い → OK。

---

### B20. `CustomDropdown` の options[0] fallback

`selectedOption` は optional chaining されているので safe。テストも OK。

---

### B21. `useDependencyCheck` の useEffect deps の記述

`runBackgroundDepCheck` は useCallback で stable、deps 変化は modsSignature / mcVersion / loader のみ → OK。

---

### B25. `fetchLatestMinecraftVersions` の catch は内部で処理されている

OK。

---

### B26. mrpack の loader 判定順序 (Fabric → Forge → NeoForge → Quilt 上書き)

複数 loader が同時にある mrpack は仕様外 → 通常ありえない。実害なし。

---

### B29. `handleDeleteProfile` の profilesRef.current.filter 挙動

profilesRef は render 中同期更新なので削除前配列。filter で削除対象を除いた配列 → `remaining[0]` で先頭を取得 → 正しい実装。

---

### B30. `handleImportZipInput` の e.target.value = '' 挙動

`handleImportZipFile(file)` は async fire-and-forget、`e.target.value = ''` は同期。fetch 中に同じファイル再選択したら inFlightRef で警告 → OK。

---

### B31. SSR で render された初期 24 件で CacheStatusBadge が非表示 (dataUpdatedAt=0)

**ファイル**: `components/HomeInteractive.tsx` L382-386

**問題**:

- SSR で fetchModrinthSearch を実行 → `initialHits` を HomeInteractive に渡す
- HomeInteractive の useInfiniteQuery は `initialData` を受け取る
- TSQ v5 の仕様上、initialData 使用時は `dataUpdatedAt` が **0 のまま** (実際に fetch した時刻ではない)
- CacheStatusBadge は `!dataUpdatedAt && !isFetching` で早期 return → **何も表示されない**

**影響**:

- ユーザーは初期 24 件が「サーバ側でフレッシュ取得された」か「キャッシュか」を区別できない
- キャッシュヒットバッジの本来の目的である「透明性」が損なわれる

**修正方針**:
- initialData を渡す際に `initialDataUpdatedAt: Date.now()` も設定 (TSQ v5 の API)
- または CacheStatusBadge に「SSR fetched」バッジを別途追加

---

### B34. `SettingsPageClient` の h2 だが h1 は Header にある

OK: `<h1>DropMod</h1>` は Header にあり、各ページ h1=1 の SEO 要件を満たす。

---

### B35. `__tests__/mocks/handlers.ts` の「登録順で matching」コメントは誤り

**ファイル**: `__tests__/mocks/handlers.ts` L65

```typescript
// NOTE: /project/:slug より先に登録 (msw の matching は登録順)
```

**問題**: 実は msw v2 は path-to-regexp で **specific path が自動優先**される。登録順は関係ない。

**再現確認 (2026-08-24)**:
```typescript
setupServer(
  http.get('/project/:slug', ...),          // slug のみ
  http.get('/project/:slug/version', ...)   // より specific
);
// → /project/sodium/version は必ず後者にマッチする
```

**影響**: コメント誤解を招く。動作は問題なし。

**修正方針**: コメント削除または「msw の path-to-regexp は specific path を自動優先する」に修正。

---

### B36. `__tests__/perf/rerender.test.tsx` の ESLint disable が広範

**ファイル**: `__tests__/perf/rerender.test.tsx` L1-10

```typescript
/* eslint-disable react-hooks/rules-of-hooks, react-hooks/immutability -- ... */
```

**問題**: ファイル全体で react-hooks 関連 rules を disable。将来 test を追加した際、hook rules 違反があっても検知されない。

**修正方針**: 個別行 (`// eslint-disable-next-line`) にする、または特定 line range のみ disable。

---

### B37. `ModDetailModalShell.handleClose` は page variant では動作しない

OK: `if (!isModal) return;` で早期 return。page variant で Escape は effective に無反応。ユーザーは browser back で戻る → 正しい挙動。

---

### B38. .mrpack ブランチで pendingImportData のクリア不要

OK: AppShell の NewProfileModal onClose で `setPendingImportData(null)` を必ず呼ぶので、次回モーダルオープン時にクリアされる。実害なし。

---

### B39. `useModalA11y` の `containerRef` deps

React.RefObject は参照 stable なので OK。onClose が親で useCallback されているなら OK、されていなくても keydown listener を毎回再登録するだけで機能は正常。

---

## 📋 補足: docs 更新推奨事項 (バグではないが不整合)

| No | ドキュメント | 現状 | 推奨 |
|---|---|---|---|
| DOC-1 | `docs/PHASE9_COMPLETE.md` | Coverage 91.34% と記載 | 91.5% に更新 (D17 参照) |
| DOC-2 | `docs/PHASE9_PLAN.md` §5.5 / §10.1 | 50 行 / 60 行の齟齬 | どちらかに統一 (D16 参照) |
| DOC-3 | `docs/PHASE9_PLAN.md` §6.2 (depCheck) | `markChecked: () => void` のみ | `markChecked` は lastCheckAt + isChecking=false と明記 (D7 参照) |
| DOC-4 | `docs/PHASE9_PLAN.md` §3.2 | 6 store のみ列挙 | appActions.ts を追加 (D14 参照) |
| DOC-5 | `docs/PHASE9_PLAN.md` §3.3 | `query/{client,hooks}.test.ts` | `hooks.test.tsx` のみ (D15 参照) |
| DOC-6 | `docs/PHASE9_PROFILER.md` | Scenario A/B/C は theme/toast/zip | 計画書 §8.3 のシナリオ (フィルタ/プロファイル切替/Mod 追加) との齟齬を明示 (D12/D13 参照) |
| DOC-7 | `hooks/useDependencyCheck.ts` L61 | 「前回の hasDepWarning を保持して無音失敗」 | 「前回値は保持されず false になる (仕様バグ、B22 参照)」に修正 |

---

## 🎯 修正推奨優先順位 (実装するとしたら)

1. **B24 (Critical)** — 幽霊 currentProfileId の存在チェック追加、実運用でプロファイル操作が silent 失敗するリスクを潰す
2. **B22 (High)** — `useDependencyCheck` の catch を早期 return に変更、前回警告状態を保持
3. **B19 (High)** — AppShell の register useEffect cleanup を撤廃、または NOOP 参照安定化 (B1 と組み合わせ)
4. **B7 (High)** — zipExport の cancelRequested を hook で活用する or store から削除 (dead code)
5. **B4 (High)** — transient-fallback を useMemo でメモ化
6. **B31 (Medium/UX)** — TSQ initialData に initialDataUpdatedAt を設定、キャッシュバッジが SSR 直後にも表示される
7. **B12/B13 (Medium)** — CacheStatusBadge の SSR mismatch 回避 + tick 短縮
8. **B32 (Medium)** — modalStack を Set か useLayoutEffect で管理
9. **B28 (Medium)** — JSZip generateAsync を Promise.race で abort 対応
10. **B33 (Medium)** — 3 コンポーネントの fallback を共通 hook 化

**低優先度**: B1, B5, B18, B23, B27, B36, B8, B10, B11, B16, B17, B26, B35, B37, DOC-1〜7

---

*本 issues/phase9.md は Phase 9 完了時点 (HEAD `5a3bde1`) の徹底監査結果です。以降修正した項目はこの表を更新して「対応済 (commit hash)」を追記してください。*
