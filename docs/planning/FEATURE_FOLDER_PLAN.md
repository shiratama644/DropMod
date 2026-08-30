# Feature フォルダ構造への移行（再構築）

> 対応 task-list ID: `ARCH-1`（実施は `ARCH-1A`〜。本ファイルは計画）
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: ARCH-1A〜1F 実施済み。1G〜 未着手** (2026-08-30)
>
> 初版は landing / mods / profiles / settings の 4 分割だった。
> **コードベース全体（app / components / hooks / lib / store）を再監査**し、
> 実際の境界に合わせて Feature を増やした。4 つでは `lib/env`（P11 検出と
> P12 Sync と Modpack と ZIP）が profiles に潰れ、当初の課題（混在）が残る。

## 1. 開始前確認

- ブランチ `arena/01a04e55-dropmod`。実施までコード移動しない
- `.archive/vite/` 不変
- 現行の混在: `components/` 直下 35 + `landing/` 6。`hooks/` 20。`lib/env/` は
  検出・差分・Executor・mrpack・ZIP sink が同一フォルダ
- AppShell が profiles / dep-check / zip / グローバルモーダルを一箇所で配線

## 2. 目的 (Why)

ディレクトリが **プロダクトの境界** を表すようにする。
「プロファイル」と「ローカルへ書く Sync」と「Modrinth 検索」は別変更理由なので
別 Feature にする。外部は各 `index.ts` のみ。挙動・URL・API は変えない。

## 3. 変更範囲 / 4. 禁止 / 5. DoD（計画）

変更対象: `components/` `hooks/` `lib/env/` `lib/search/` `lib/seo/` `lib/providers/`
`lib/loaders/`、`lib/constants/categories.ts` `loaderVersions.ts`、
`lib/server/project-detail.ts` `sitemap-entries.ts`、`lib/utils/format.ts`
`contentCategory.ts`、`__tests__/` の追従、`app/` の import、vitest coverage
paths、本書と task-list。

残す（横断インフラ）: `app/` ルート（api / opengraph-image 含む）、`lib/db/`
`lib/modrinth/` `lib/query/` `lib/store/`（第 1 波）`lib/state/`、
`lib/utils/`（id/hash/image/download。format/contentCategory 以外）、
`lib/constants/search.ts`、`lib/server/` の logger / rate-limit / profile /
site-url（第 1 波はパス変更しない。リネームは ARCH-2C）。

禁止: 全ファイル一括移動 / Feature 間の深い import / `export *` /
カバレッジ閾値下げ / 4 Feature に無理に戻す / 第 12 Feature / 第 5 の「misc」。
`types.ts` 分割・store slice 移動は第 1 波禁止（ARCH-2）。

計画 DoD: 11 Feature + §10.5 対応表が §10.13.A の寄せを含む + 依存グラフ +
フェーズ ID。コード移動は Go までしない。

## 6. テスト / 7. 停止 / 8. 完了時

各実施フェーズ: `pnpm typecheck` / `biome lint` / `pnpm test:unit` / `pnpm build`。
E2E は sync・zip・modpack 切り出し後と最終（CI）。Sandbox では E2E 必須にしない。

停止: Feature 間循環が index だけでは解けない / Dexie スキーマ分割が必要 /
store を第 1 波で動かさないと進まない、と判断したとき。

ARCH-1（計画）は docs コミットのみ。

## 9. サブタスク

| ID | テーマ | 依存 |
|---|---|---|
| ARCH-1 | 本計画（再構築 + 再監査） | — |
| ARCH-1A | 共通 `ui` / `layout` / `feedback` | Go |
| ARCH-1B | `landing` | 1A |
| ARCH-1C | `settings` | 1A |
| ARCH-1D | `seo` + `sitemap-entries` | 1A |
| ARCH-1E | `catalog` + `categories.ts` | 1A |
| ARCH-1F | `project` + `project-detail.ts` | 1E |
| ARCH-1G | `profiles` + loaders + `contentCategory` | 1A |
| ARCH-1H | `zip`（プロファイル ZIP 入出力） | 1G |
| ARCH-1I | `dep-check` | 1G |
| ARCH-1J | `env-import`（検出・解析・picker・profileName） | 1G |
| ARCH-1K | `sync` + `formatBytes` | 1J |
| ARCH-1L | `modpack` | 1J + 1E |
| ARCH-1M | shim 削除 | 1B–1L |
| ARCH-1N | テスト配置 | 1M |
| ARCH-1O | coverage / skills / チェックリスト | 1N |

**ARCH-1P は採番しない。** types 分割・`lib/platform` リネーム・store は ARCH-2（§10.13.F）。

---

## 10. 設計

### 10.1 なぜ 4 つでは足りないか（監査結果）

| 塊 | 根拠（コード） | 4 分割での問題 |
|---|---|---|
| Discover 検索 | `HomeInteractive` `lib/search` `ModCard` | 「mods」に詳細も入り肥大 |
| プロジェクト詳細 | `ModDetailPageView` `ModDetailModalShell` ISR | 検索と ISR/JSON-LD の変更理由が違う |
| プロファイル CRUD | `useProfiles` `NewProfileModal` `ModsPageClient` | 妥当 |
| フォルダ検出 P11 | `lib/env/detector/*` `analyzer` `picker` | profiles に入れると Sync と混ざる |
| Sync 書き込み P12 | `diff` `executor` `backup` `SyncPreviewModal` | 最大ドメイン。別 Feature |
| Modpack | `mrpack` `ModpackHubClient` `useModpackAdd` | Discover 起点だが env 依存。第 3 軸 |
| ZIP 配布 | `useZipExport/Import` `ZipProgressModal` | Zip**Sink**（Sync）と別物 |
| 依存チェック | `useDependencyCheck` `DependencyCheckModal` | 独立フック + 専用 store slice |
| SEO | `lib/seo` `JsonLd` `opengraph-image` | ページ横断だがドメインは明確 |
| LP | `components/landing/*` | 妥当 |
| 設定 | `SettingsPageClient` | 妥当・小さい |

`lib/store` は profiles / zip / depCheck / ui / toast が **1 パッケージの
複数 slice**。移動は第 2 波（循環と AppShell 登録の難度が高い）。

### 10.2 Feature 一覧（11）と依存

```
catalog ──► project
    │           │
    │           ▼
    └──────► profiles ◄── zip
                 ▲         dep-check
                 │
            env-import
                 ▲
            sync    modpack ──► catalog（追加 UI）/ env-import（展開）

landing / settings / seo  は他 Feature に依存しない（seo は lib/server のみ）
```

許可する Feature→Feature: **index.ts のみ**。  
禁止: `sync` → `catalog`、`profiles` → `sync` のコンポーネント深い import。
profiles は sync を知らない（Settings の EnvironmentSyncSection は **sync** Feature）。

### 10.3 目標ツリー

```
features/
  landing/          catalog/         project/
  profiles/         env-import/      sync/
  modpack/          zip/             dep-check/
  settings/         seo/
components/
  ui/               layout/          feedback/
hooks/              # 非ドメインのみ
lib/
  db/  modrinth/  query/  server/  store/  utils/  constants/  state/
  # server = logger/rate-limit/profile/site-url のみ（ARCH-2C で platform へ）
  # constants = search.ts のみ。loaders は profiles へ移して削除
```

### 10.4 共通（Feature ではない）

| After | Before |
|---|---|
| `components/ui/CustomDropdown.tsx` | `components/CustomDropdown.tsx` |
| `components/ui/BottomSheet.tsx` | `components/BottomSheet.tsx` |
| `components/ui/MarkdownRenderer.tsx` | `components/MarkdownRenderer.tsx` |
| `components/layout/AppShell.tsx` | `components/AppShell.tsx` |
| `components/layout/Header.tsx` | `components/Header.tsx` |
| `components/layout/BottomNav.tsx` | `components/BottomNav.tsx` |
| `components/layout/DesktopSidebar.tsx` | `components/DesktopSidebar.tsx` |
| `components/layout/MenuBottomSheet.tsx` | `components/MenuBottomSheet.tsx` |
| `components/layout/Providers.tsx` | `components/Providers.tsx` |
| `components/layout/WebVitalsReporter.tsx` | `components/WebVitalsReporter.tsx` |
| `components/feedback/ConfirmDialog.tsx` | `components/ConfirmDialog.tsx` |
| `components/feedback/ToastContainer.tsx` | `components/ToastContainer.tsx` |
| `components/feedback/OfflineBanner.tsx` | `components/OfflineBanner.tsx` |
| `components/feedback/CacheStatusBadge.tsx` | `components/CacheStatusBadge.tsx` |
| `hooks/useConfirm.ts` `useToasts.ts` `useMediaQuery.ts` `useModalA11y.ts` `useModalUi.ts` `useScrollDirection.ts` | 同左（残置） |

ZipProgressModal は **zip** Feature（共通 feedback にしない。Sync の ZipSink と混ぜない）。

### 10.5 Feature ごとの Before / After と Public API

#### landing

| Before | After |
|---|---|
| `components/landing/*.tsx`（6） | `features/landing/components/` |
| `hooks/useCountUp.ts` `useScrollReveal.ts` | `features/landing/hooks/` |

公開: LP 用 6 コンポーネント + 2 フック。`app/page.tsx` が消費。

#### catalog（Modrinth 検索・一覧）

| Before | After |
|---|---|
| `HomeInteractive.tsx` `ModCard.tsx` `BrowseBottomSheet.tsx` | `features/catalog/components/` |
| `lib/search/loadDiscoverSearch.ts` | `features/catalog/search/` |
| `lib/constants/categories.ts` | `features/catalog/constants/categories.ts` |
| `lib/constants/search.ts` の **URL ヘルパ** | **第 1 波は lib/constants 据置**（app・SEO・catalog・project が共有） |

公開: `HomeInteractive` `ModCard` `BrowseBottomSheet` `loadDiscoverSearch` `categories`。  
`app/discover/[type]/page.tsx`。

#### project（詳細フルページ + プレビューモーダル）

| Before | After |
|---|---|
| `ModDetailPageView.tsx` `ModDetailModalShell.tsx` `ScreenshotGalleryModal.tsx` `ReservedCategoryPage.tsx` | `features/project/components/` |
| `lib/server/project-detail.ts` | `features/project/server.ts` |

RSC / generateMetadata / OG は `@/features/project` から server 関数を取る。
**index.ts に `'use client'` を置かない**（client コンポーネントは `components/` 側）。
公開: 上記 4 コンポーネント + `loadProjectDetail` 等。`app/[projectType]/[slug]` と discover slug / 予約ページ。

#### profiles

| Before | After |
|---|---|
| `ModsPageClient.tsx` `EditProfileModal.tsx` `NewProfileModal.tsx` | `features/profiles/components/` |
| `hooks/useProfiles.ts` `useLoaderVersionOptions.ts` | `features/profiles/hooks/` |
| `lib/constants/loaderVersions.ts` `lib/loaders/*` | `features/profiles/loaders/` |
| `lib/utils/contentCategory.ts` | `features/profiles/contentCategory.ts` |

NewProfileModal は env-import の解析 UI を **env-import の index** から使う（ARCH-1J 後）。
1G 時点では `lib/env` 直 import を暫定許可。

公開: ページクライアント、作成/編集モーダル、`useProfiles`、loader 定数、`contentCategory`。
`app/profile/page.tsx`。`app/api/loaders` は薄いプロキシのまま app に残し、実装は profiles を呼ぶ。
zip / modpack のカテゴリ判定は **profiles の index** 経由。

#### env-import（P11 Read-only）

| Before | After |
|---|---|
| `lib/env/detector/**` `analyzer.ts` `analysis.ts` `hash*.ts` `picker.ts` `scan.ts` `source.ts` `capabilities.ts` `resolve.ts` `profileName.ts` `zipSource.ts` | `features/env-import/` に同じ相対構造 |

公開: `pickDirectory` `detectEnvironment` `analyzeEnvironment` など UI が要る最小。
detector 内部・hash worker は private。Worker URL をこのフェーズで直す。

#### sync（P12 書き込み）

| Before | After |
|---|---|
| `diff.ts` `managed.ts` `executor.ts` `applySync.ts` `backup.ts` `recovery.ts` `undo.ts` `syncPrep.ts` `link.ts` `environmentCheck.ts` `sink.ts` `sink/**` `zipSync.ts` | `features/sync/` |
| `EnvironmentSyncSection` `SyncButton` `SyncPreviewModal` `SyncHistorySection` `InterruptedSyncDialog` | `features/sync/components/` |
| `useSync` `useSyncHistory` `useInterruptedSync` `useEnvironmentLink` `useFolderLinked` `useZipSync` | `features/sync/hooks/` |
| `lib/utils/format.ts`（`formatBytes`） | `features/sync/format.ts` |

公開: セクション/モーダル/フック。profiles は import しない（設定ページが sync を載せる）。

#### modpack

| Before | After |
|---|---|
| `lib/env/mrpack.ts` `modpack.ts` `modpackAdd.ts` `modpackUpdate.ts` | `features/modpack/` |
| `ModpackHubClient` `ModpackImportModal` | `features/modpack/components/` |
| `useModpackAdd` | `features/modpack/hooks/` |
| `lib/providers/*` | `features/modpack/providers/` |

公開: Hub、Import モーダル、`useModpackAdd`。Discover 詳細はこれを呼ぶ。
`app/modpack/page.tsx`。

#### zip（プロファイルの配布 ZIP。Sync の ZipSink ではない）

| Before | After |
|---|---|
| `useZipExport.ts` `useZipImport.ts` | `features/zip/hooks/` |
| `ZipProgressModal.tsx` | `features/zip/components/` |

公開: 2 フック + 進捗モーダル。AppShell / Header / Sidebar が消費。

#### dep-check

| Before | After |
|---|---|
| `useDependencyCheck.ts` | `features/dep-check/hooks/` |
| `DependencyCheckModal.tsx` | `features/dep-check/components/` |

`lib/store/depCheck.ts` は第 1 波据置。公開: フック + モーダル。

#### settings

| Before | After |
|---|---|
| `SettingsPageClient.tsx` | `features/settings/components/` |

公開: `SettingsPageClient`。中で `features/sync` の EnvironmentSyncSection を index 経由。

#### seo

| Before | After |
|---|---|
| `lib/seo/jsonld.ts` `og-copy.ts` | `features/seo/` |
| `lib/server/sitemap-entries.ts` | `features/seo/sitemap-entries.ts` |
| `components/JsonLd.tsx` | `features/seo/JsonLd.tsx` |

`app/**/opengraph-image.tsx` は App Router 制約で **app に残す**。コピー関数だけ Feature。
公開: builders + `JsonLd`。

### 10.6 動かさない lib（第 1 波）

`db/`（Dexie）`modrinth/` `query/` `store/`（第 2 波）`state/sanitize.ts`。
`utils/` の id/hash/image/download（format / contentCategory は移す）。
`constants/search.ts`。`server/` の logger / rate-limit / profile / site-url。
`loaders/` は 1G で空にして削除。

### 10.7 app の消費先

| app | Feature |
|---|---|
| `app/page.tsx` | landing |
| `app/discover/[type]/page.tsx` | catalog |
| `app/discover/**/[slug]` | project |
| `app/[projectType]/[slug]` | project + seo |
| `app/profile/page.tsx` | profiles |
| `app/modpack/page.tsx` | modpack |
| `app/settings/page.tsx` | settings（内部で sync） |
| `app/resourcepack` `shader` | project (`ReservedCategoryPage`) |
| `app/layout.tsx` | layout + seo |

### 10.8 テスト

第 1 波: `__tests__/features/<name>/` ミラー。  
ARCH-1N 既定はミラー維持。colocation は確認待ち。

`__tests__/lib/env/*` → env-import / sync / modpack に分割（ファイル単位で §10.5 に追随）。

### 10.9 tsconfig

`@/*` で足りる。ルールは Feature 外→`@/features/<name>`（index）。
ARCH-1M で深い import を `rg` ゼロに。Biome noRestrictedImports は 1M 以降。

### 10.10 フェーズ手順（壊れない順）

1A 共通三分 + 旧 re-export → 1B LP → 1C settings → 1D seo（小さい・独立）→
1E catalog（categories 含む）→ 1F project（project-detail 含む）→
1G profiles（loaders / contentCategory）→ 1H zip / 1I dep-check（AppShell が両方使うので
連続）→ 1J env-import（`git mv lib/env/detector` 等。sync/modpack がまだ lib/env の
残りを参照できるよう **1J では detector/analyzer/picker だけ移し、残りは 1K/1L**）→
1K 残り env の sync 系 → 1L modpack 系 → 1M shim 削除 → 1N テスト → 1O。

`lib/env` を一度に全部移さない。1J と 1K/1L でフォルダが空になったら削除。

各フェーズ末: 4 検証。1K と 1H のあと E2E（CI）。

### 10.11 Git

同一ブランチ。コミットは ID 単位。`lib/env` 分割は中間 typecheck が通る単位。
revert はフェーズ SHA。force push しない。1J 前に任意 tag `arch-1j-pre`。

### 10.12 コマンド

```bash
pnpm typecheck
pnpm exec biome lint .
pnpm test:unit
pnpm build
# 1H / 1K / 1O かつ CI
pnpm test:e2e
```

### 10.13 再監査（11 Feature のあと、まだまとめられるもの）

`types.ts` / `lib/{utils,constants,server,query,loaders,store,db}` / `app/api` /
重複ヘルパまで import 元を辿った。結論: **第 12 Feature は増やさない**。
代わりに **Feature 以外のフォルダ整理** と **既存 11 への追加移動** がある。

#### A. 既存 Feature へ寄せてよい（第 1 波に含める）

| Before | 寄せ先 | 理由 |
|---|---|---|
| `lib/constants/categories.ts` | `features/catalog/constants/categories.ts` | 消費は HomeInteractive / ModCard が主。facet ラベル |
| `lib/server/project-detail.ts` | `features/project/server.ts` | RSC でも Feature 配下でよい。`'use client'` ではない。discover slug と詳細 page だけが本番 import（profile/settings はコメント参照のみ） |
| `lib/server/sitemap-entries.ts` | `features/seo/sitemap-entries.ts` | sitemap.ts と SEO 専用 |
| `lib/seo/*` に加えて上記 | seo | 既定どおり |
| `lib/constants/loaderVersions.ts` + `lib/loaders/*` | `features/profiles/loaders/` | `useLoaderVersionOptions` と New/Edit Profile。API route は薄いプロキシのまま `app/api/loaders` |
| `lib/utils/format.ts` (`formatBytes`) | `features/sync/format.ts` | 消費は `SyncPreviewModal` のみ |
| `lib/env/profileName.ts` | env-import（既定） | フォルダ名デフォルト。`lib/utils/profileName.ts`（複製名）とは別関数。**統合しない** |
| `lib/utils/contentCategory.ts` | `features/profiles/contentCategory.ts` | Profile の 3 カテゴリ。zip/modpack は profiles index 経由 |

`lib/constants/search.ts`（URL ヘルパ）は **引き続き lib 据置**。app / seo / catalog / project / sitemap が同じモジュールを必要とし、catalog に移すと seo が catalog に依存する。

#### B. Feature にしない。別フォルダ（第 1 波ではやらない。ARCH-2）

| 塊 | 提案 | 第 1 波でやらない理由 |
|---|---|---|
| ルート `types.ts` (432 行) | `types/profile.ts` `modrinth.ts` `sync.ts` `modpack.ts` `ui.ts` に分割し `types/index.ts` で再 export | 全 Feature が `@/types` 依存。分割は機械的だが衝突しやすい。**フォルダ `types/` であり Feature ではない** |
| `lib/db/` | 残置。必要なら `lib/platform/db` | Dexie スキーマは profiles+sync+query の共有永続化 |
| `lib/modrinth/` | 残置（HTTP クライアント） | catalog/project/dep-check/seo のインフラ |
| `lib/query/` | 残置 | `useProjectQuery` は profiles、無限検索は catalog。データ層 |
| `lib/server/logger.ts` `rate-limit.ts` `profile.ts` (APP_PROFILE) | `lib/platform/` にリネーム可 | セキュリティと API。Feature にすると settings と混同 |
| `lib/server/site-url.ts` | seo に寄せてもよいが layout と sitemap と jsonld が共有 → **`lib/platform/site-url.ts`** が適切 |
| `lib/store/*` | 第 2 波で slice を Feature へ | AppShell が全 slice を登録。先に移すと循環 |
| `lib/state/sanitize.ts` | db マイグレーションと共有 | profiles 専用に見えて Dexie v2 が依存 |
| `lib/utils/{id,hash,image,download,downloadFile}` | `lib/utils` 残置 | id/hash は db+env+toast。image は landing/catalog/project。download は project+zip |
| `app/api/**` | App Router 残置 | Feature に Route Handler を埋め込まない（現行規約） |
| `app/**/opengraph-image.tsx` | app 残置 | Next のファイルコンベンション |
| `hooks/useModalUi.ts` 等 | `hooks/` 残置 | シェル横断 |
| `e2e/` | 残置。spec 名は Feature に対応済み | ヘルパだけ `e2e/helpers` |
| `scripts/` `styles/` | 残置 | ビルド資産 |

**theme を Feature にしない。** `theme` は `lib/store/profiles.ts` に乗っている。settings と Header が読む。独立 Feature にすると store 分割が前提。

**modrinth を Feature にしない。** API ラッパであり UI ドメインではない。

#### C. 増やすべきでない第 12 Feature

| 候補 | 不採用理由 |
|---|---|
| `theme` | store に同居。UI は layout |
| `search`（catalog と別） | HomeInteractive と loadDiscoverSearch は一体 |
| `gallery` | project の一部 |
| `shell` | `components/layout` で足りる |
| `platform` as Feature | インフラ。`lib/` が正しい |
| ZIP と ZipSink の統合 | 変更理由が配布 vs ローカル同期で逆 |

#### D. 重複・ドリフト（移動時に直す。別タスクにしない）

- `formatDownloads` が `ModDetailPageView` / `ModDetailModalShell` / `og-copy` に三重。seo の `formatOgDownloads` に寄せるか `lib/utils/format.ts` へ（第 1 波のついでで可。新規 ID 不要）
- `profileName` が utils（複製）と env（フォルダ名）で別物。名前を `nextDuplicateName` / `generateProfileName` のまま別ディレクトリ
- `robots.ts` が独自 `resolveBaseUrl`。`site-url.ts` に統一（seo/platform 寄せのとき）

#### E. 第 1 波のあとに残る `lib/` 目標

```
lib/
  db/           Dexie
  modrinth/     HTTP
  query/        TSQ
  platform/     logger, rate-limit, APP_PROFILE, site-url  （任意リネーム）
  store/        第 2 波まで
  state/        sanitize
  utils/        id hash image download
  constants/    search.ts のみ
```

`lib/env` `search` `seo` `providers` `loaders` は空にして削除。

#### F. 第 2 波（ARCH-2、本計画の範囲外・採番のみ）

| 候補 | 内容 |
|---|---|
| ARCH-2A | `types.ts` → `types/*` |
| ARCH-2B | store slice を Feature（profiles/zip/dep-check/ui/toast） |
| ARCH-2C | `lib/server` → `lib/platform` リネーム |
| ARCH-2D | Dexie sync ヘルパを `features/sync/db.ts`（スキーマ宣言は db に残す） |

Go は ARCH-1O のあと別判断。

---

## 11. リスク

- AppShell が多数 Feature のフックを束ねる。layout が Feature を index で import するのは可
- `useModpackAdd` を catalog に置くと env が逆流する → **modpack** に置く
- ZIP export と ZipSink の名前衝突。フォルダを `zip` vs `sync/sink/zip`
- constants/search を catalog に移すと seo/app が catalog 依存 → 据置
- store 第 1 波据置。無理に移すと profiles store を zip が import する循環
- **第 2 波（範囲外）**: §10.13.F（types 分割 / store / platform リネーム）
- `project-detail` を Feature に移すと app の RSC import が `@/features/project` になる。index から server 関数を出してよい（`'use client'` を index に置かない）

## 12. 実績

| ID | コミット | 備考 |
|---|---|---|
| ARCH-1 初版 | `5a9e92c` | 4 Feature。不十分 |
| ARCH-1 再構築 | `12821ca` | 11 Feature |
| 再監査 | `d0c1d6a` | 第 12 Feature なし。types/ と lib/platform と既存 11 への追加寄せ |
| 計画整合 | `db6222c` | §9/§10.5 に寄せを反映。ARCH-1P 不採番 |
| ARCH-1A | `8561047` | ui / layout / feedback + 旧パス re-export |
| ARCH-1B | `45ba247` | features/landing + 旧パス re-export |
| ARCH-1C | `14fddb0` | features/settings + 旧パス re-export |
| ARCH-1D | `d5ba1b4` | features/seo + sitemap-entries。opengraph は app 残置 |
| ARCH-1E | (本コミット) | features/catalog。loadDiscoverSearch は barrel 外（RSC） |

## 13. 完了チェック（ARCH-1O）

- [ ] `components/` 直下ゼロ（ui/layout/feedback のみ）
- [ ] `lib/env/` `lib/search/` `lib/seo/` `lib/providers/` `lib/loaders/` 削除（shim なし）
- [ ] `lib/constants/` は `search.ts` のみ。`categories.ts` `loaderVersions.ts` は Feature へ
- [ ] `project-detail.ts` `sitemap-entries.ts` `format.ts` `contentCategory.ts` が対応 Feature にある
- [ ] 11 Feature 各 `index.ts` が named export（project の index に `'use client'` なし）
- [ ] Feature 間の深い import 0
- [ ] ZIP（配布）と ZipSink（sync）が別ディレクトリ
- [ ] 4 検証 pass・件数減なし・coverage 閾値維持
- [ ] `.archive/vite/` 無変更
- [ ] task-list 更新

## 14. Go

「ARCH-1A から Go」までコードを動かさない。
1N のテスト配置は未指定ならミラー。
