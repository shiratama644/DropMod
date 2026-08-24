# State & Storage — Zustand + Dexie + cookie

> プロファイル/Toast/Confirm/ZIP/依存チェック/テーマ の状態と永続化を触る時に読む。

## Zustand 7 store（`lib/store/`）

| store | ファイル | 役割 |
| :--- | :--- | :--- |
| profiles | `profiles.ts` | profiles / currentProfileId / hasHydrated / **theme** + 純粋 updater（addModToProfile 等） |
| toast | `toast.ts` | toasts + showToast/dismissToast（MAX_VISIBLE 上限あり） |
| confirm | `confirm.ts` | confirm dialog + Promise resolver + owner ID（直前 pending を false で上書きする仕様） |
| zipExport | `zipExport.ts` | ZIP 進捪 state + cancel（注: cancel 系は dead code の懸念あり issues-phase9 B7） |
| zipImport | `zipImport.ts` | pendingImportData のみ（Modal open state は AppShell 局所 useState） |
| depCheck | `depCheck.ts` | hasDepWarning / lastCheckAt / isChecking + markChecked/reset |
| appActions | `appActions.ts` | **Server→Client 境界越えの action 登録/購読** |

- ミドルウェア: `subscribeWithSelector`（全 store）+ `devtools`（dev のみ, production は zero-cost）。
- **store は副作用を持たない**（API/cookie/Toast は hooks 側）。テストしやすさ優先。

### appActionsStore（重要パターン）

Server Component → Client Component へ**関数 props を渡せない** Next.js 仕様への解。
AppShell（Client 側の唯一の親）が hook 由来 action を `registerAppActions({...})` で登録。
下流 Client Component は `useAppAction('handleToggleMod')` 等で取得（未登録時は no-op）。
> AppShell の register useEffect は cleanup で unregister しない（B19 修正: window を無くすため unmount 時のみ unregister）。

### 共通 fallback hook

`useCurrentProfileWithFallback`（`lib/store/useCurrentProfileWithFallback.ts`）: currentProfile 取得の DRY 化（B33）。3 コンポーネント（Home/Mods/ModDetail）で使用。

## hooks（業務ロジック層, `hooks/`）

- `useProfiles(theme, setThemeState, showToast, confirm)` — 最大(818行)。hydrate(Dexie)→save 効果・CRUD・toggleMod・updateModVersion 等。
- `useZipExport` / `useZipImport` / `useDependencyCheck` — 内部 state は各 store の shim。
- `useToasts` / `useConfirm` / `useModalA11y` — store shim / a11y。

> ⚠ 既知バグ（`docs/audit/issues-phase9.md`）: B24(幽霊 currentProfileId)は修正済。B7(zipExport cancel dead code)・B22(depCheck catch)等の Low 残件あり。プロファイル系を触る場合は同 issues を一読。

## Dexie（IndexedDB, `lib/db/dexie.ts`）

3 テーブル（DB 名 `DropModDB`, schema v1）:

| テーブル | PK / Index | 用途 |
| :--- | :--- | :--- |
| `profiles` | `id`, `updatedAt` | プロファイル本体（`ProfileRow extends Profile + updatedAt`） |
| `apiCache` | `key`, `expiresAt` | TSQ persister 用（`data` は **string** 保持, H7-1 で二重 JSON 解消） |
| `meta` | `key` | key-value（下記） |

`meta` の key: `schemaVersion` / `theme` / `currentProfileId` / `migratedAt` / `localStorageBackupExpiresAt`。

ヘルパ: `putProfile` / `bulkPutProfiles` / `syncProfiles`（diff 同期, 単一 tx） / `getMeta/setMeta/deleteMeta` / `getAllProfiles` / `_clearAllForTesting`。
> SSR では触らない（IndexedDB はブラウザ API）。全呼び出しは Client の useEffect/handler 経由。

## LocalStorage → Dexie 移行（`lib/db/migrate.ts`）

- 初回起動で `migrateFromLocalStorage()`（`meta.migratedAt` 無ければ 1 回だけ, 冪等）。
- 元キー: `dropmod_state_v2` / 旧 `craftforge_state_v2`（自動吸収）。
- **LocalStorage は 7 日間バックアップ保持**（`localStorageBackupExpiresAt`）→ 期限後 `cleanupExpiredBackup` で削除。
- `restoreFromLocalStorageBackup()` あり（緊急復旧用, UI ボタンは未実装 = diff-phase8 D4）。
- 破損データ防御: `lib/state/sanitize.ts`（pure function, 100% カバレッジ）。

## cookie（SSR 用）

- `dropmod_theme` — テーマ FOUC 対策（layout.tsx の inline script が読む）。
- `dropmod_active_profile` — Home SSR 用に mcVersion/loader を保持（profile 依存の初期 24 件）。Secure フラグ付き（localhost では無視）。
- データ初期化（`handleResetData`）で Dexie 削除 + LocalStorage 削除 + 両 cookie 削除 → reload。

## 関連

- [architecture-and-data-flow.md](./architecture-and-data-flow.md) / [modrinth-integration.md](./modrinth-integration.md)
