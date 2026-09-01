# State & Storage — Zustand + Dexie + cookie

> プロファイル/Toast/Confirm/ZIP/依存チェック/テーマ の状態と永続化を触る時に読む。

## Zustand 7 store（`src/features/*/store/` と `src/components/{feedback,layout}/` に分散）

| store | ファイル | 役割 |
| :--- | :--- | :--- |
| profiles | `src/features/profiles/store/store.ts` | profiles / currentProfileId / hasHydrated / **theme** + 純粋 updater（addModToProfile 等） |
| toast | `src/components/feedback/toastStore.ts` | toasts + showToast/dismissToast（MAX_VISIBLE 上限あり） |
| confirm | `src/components/feedback/confirmStore.ts` | confirm dialog + Promise resolver + owner ID（直前 pending を false で上書きする仕様） |
| zipExport | `src/features/zip/store/zipExport.ts` | ZIP 進捪 state + cancel（注: cancel 系は dead code の懸念あり issues-phase9 B7） |
| zipImport | `src/features/zip/store/zipImport.ts` | pendingImportData のみ（Modal open state は AppShell 局所 useState） |
| depCheck | `src/features/dep-check/store/store.ts` | hasDepWarning / lastCheckAt / isChecking + markChecked/reset |
| appActions | `src/components/layout/appActions.ts` | **Server→Client 境界越えの action 登録/購読** |

- ミドルウェア: `subscribeWithSelector`（全 store）+ `devtools`（dev のみ, production は zero-cost）。
- **store は副作用を持たない**（API/cookie/Toast は hooks 側）。テストしやすさ優先。

### appActionsStore（重要パターン）

Server Component → Client Component へ**関数 props を渡せない** Next.js 仕様への解。
AppShell（Client 側の唯一の親）が hook 由来 action を `registerAppActions({...})` で登録。
下流 Client Component は `useAppAction('handleToggleMod')` 等で取得（未登録時は no-op）。
> AppShell の register useEffect は cleanup で unregister しない（B19 修正: window を無くすため unmount 時のみ unregister）。

### 共通 fallback hook

`useCurrentProfileWithFallback`（`src/features/profiles/hooks/useCurrentProfileWithFallback.ts`）: currentProfile 取得の DRY 化（B33）。3 コンポーネント（Home/Mods/ModDetail）で使用。

## hooks（業務ロジック層, `src/hooks/`）

- `useProfiles(theme, setThemeState, showToast, confirm)` — 最大(818行)。hydrate(Dexie)→save 効果・CRUD・toggleMod・updateModVersion 等。
- `useZipExport` / `useZipImport` / `useDependencyCheck` — 内部 state は各 store の shim。
- `useToasts` / `useConfirm` / `useModalA11y` — store shim / a11y。

> ⚠ 既知バグ（`docs/audit/issues-phase9.md`）: B24(幽霊 currentProfileId)は修正済。B7(zipExport cancel dead code)・B22(depCheck catch)等の Low 残件あり。プロファイル系を触る場合は同 issues を一読。

## データモデル（Phase 11-A, 2026-08-26 変更）

- **`ModItem` は廃止 → `ProjectItem`**（`types.ts`）。flat 型のままリネーム・整理:
  `id→projectId` / `title→name` / `projectType?→type`（必須化）/ `selectedVersionId→versionId` / `selectedVersionNumber→versionNumber`。
  Phase 11 追加: `provider?` ('modrinth'|'curseforge'|'unknown') / `artifact?` (sha1/path/size)。
- **`Profile.environment`** に mcVersion / loader（`ProfileLoader` 5 値 union, 不正値は 'Fabric' 正規化）/ loaderVersion を集約。旧 flat フィールドは廃止。
- `Profile.resourcepacks?` / `shaderpacks?` / `unknownFiles?`（`UnknownFile`: location/filename/path/sha1/size/discoveredAt）追加。linkedSource/modpackSource は Phase 12。
- **ContentCategory (3値) と ProjectType (4値, lib/constants/search.ts) は意図的に分離**（modpack は Profile を構成する上位概念）。
- 変換ロジックは `src/lib/state/sanitize.ts` の **`normalizeProfileForV2` / `normalizeProjectItem` / `normalizeLoader`**（pure, Dexie v2 upgrade と LocalStorage 経路で共用）。

## Dexie（IndexedDB, `src/lib/db/dexie.ts`）

5 テーブル（DB 名 `DropModDB`, **schema v3**）:

| テーブル | PK / Index | 用途 |
| :--- | :--- | :--- |
| `profiles` | `id`, `updatedAt` | プロファイル本体（`ProfileRow extends Profile + updatedAt`） |
| `apiCache` | `key`, `expiresAt` | TSQ persister 用（`data` は **string** 保持, H7-1 で二重 JSON 解消） |
| `meta` | `key` | key-value（下記） |
| `managedFiles` | `id`, `profileId`, `category`, `projectId`, `sha1` | **Phase 12-A**: 管理下ファイルの台帳（`ManagedFileRecord`）。Sync の削除可否判定に使用 |
| `dirHandles` | `id`, `profileId` | **Phase 12-A**: `FileSystemDirectoryHandle` の永続化（structured clone で保存可・JSON 化不可なため `Profile` から分離） |

`meta` の key: `schemaVersion` / `theme` / `currentProfileId` / `migratedAt` / `localStorageBackupExpiresAt`。

ヘルパ: `putProfile` / `bulkPutProfiles` / `syncProfiles`（diff 同期, 単一 tx） / `getMeta/setMeta/deleteMeta` / `getAllProfiles` / `_clearAllForTesting`。
**Phase 12-A 追加**: `syncManagedFiles`（台帳の diff 同期, 単一 tx） / `getManagedFiles`（path 昇順） / `deleteManagedFilesForProfile` / `saveDirHandle`（id を返す） / `getDirHandle` / `deleteDirHandle`。
> SSR では触らない（IndexedDB はブラウザ API）。全呼び出しは Client の useEffect/handler 経由。

**schema v2 migration（Phase 11-A）**: v1 DB を開いた時点で upgrade が走り、
保存済み row を `normalizeProfileForV2` で新形状に一括変換（flat→environment、ModItem→ProjectItem、loader 正規化、updatedAt 保持）。
テストは `__tests__/lib/db/dexieMigration.test.ts`（v1 DB を作ってから app db を開く手法）。

**schema v3 migration（Phase 12-A）**: `managedFiles` / `dirHandles` の**新規テーブル追加のみ**。
既存テーブルの index は不変・**upgrade 関数なし**なので既存データは無変換。旧 DB を開いたユーザーは
「空の台帳」から始まる = 紐付け直後の初回 Sync では deletion が 1 件も出ない
（§10.2 の「台帳に存在する」条件を満たさないため）。**安全側の意図した挙動**。
テストは `__tests__/features/sync/services/db/managed.test.ts`。
※ `SyncTransaction` テーブルは P12-B（Executor / Rollback）で **v4** として追加する。

## LocalStorage → Dexie 移行（`src/lib/db/migrate.ts`）

- 初回起動で `migrateFromLocalStorage()`（`meta.migratedAt` 無ければ 1 回だけ, 冪等）。
- 元キー: `dropmod_state_v2` / 旧 `craftforge_state_v2`（自動吸収）。
- **LocalStorage は 7 日間バックアップ保持**（`localStorageBackupExpiresAt`）→ 期限後 `cleanupExpiredBackup` で削除。
- `restoreFromLocalStorageBackup()` あり（緊急復旧用, UI ボタンは未実装 = diff-phase8 D4）。
- 破損データ防御: `src/lib/state/sanitize.ts`（pure function。旧 flat 形状の入力も新形状に変換して返す）→ LocalStorage 旧バックアップ流入も v2 形状で書き込まれる。

## cookie（SSR 用）

- `dropmod_theme` — テーマ FOUC 対策（layout.tsx の inline script が読む）。
- `dropmod_active_profile` — Home SSR 用に mcVersion/loader を保持（profile 依存の初期 24 件）。Secure フラグ付き（localhost では無視）。
- データ初期化（`handleResetData`）で Dexie 削除 + LocalStorage 削除 + 両 cookie 削除 → reload。

## 関連

- [architecture-and-data-flow.md](./architecture-and-data-flow.md) / [modrinth-integration.md](./modrinth-integration.md)
