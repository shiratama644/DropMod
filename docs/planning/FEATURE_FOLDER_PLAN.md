# Feature フォルダ構造への移行

> 対応 task-list ID: `ARCH-1`（実施は `ARCH-1A`〜。本ファイルは計画のみ）
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 計画済み・未着手** (2026-08-30。コード移動はしない。Go 待ち)
>
> 進捗の正本は [docs/task-list.md](../task-list.md)。

## 1. 開始前確認

- ブランチ `arena/01a04e55-dropmod`。本セッションで別ブランチは作らない
- SEO-1 / SEO-2 はローカル検証済み。本計画はディレクトリ移動のみで挙動を変えない
- `.archive/vite/` 不変。`.archive/` は PHASE13 退避以外閲覧しない
- 現行: `components/` 直下に LP・検索・プロファイル・設定・共通 UI が混在
- Vitest は `__tests__/` ミラー配置。カバレッジ include は `vitest.config.ts`

## 2. 目的 (Why)

機能ドメイン（landing / mods / profiles / settings）の境界がディレクトリに現れず、
変更影響の見積もりとテストの置き場が曖昧になっている。
`features/<domain>` に UI・フック・ドメインロジックを集め、外部は `index.ts` 経由だけにする。
共通は `components/{ui,layout,feedback}` に限定する。**挙動・URL・API は変えない。**

## 3. 変更範囲 (Scope)

変更対象（実施時）:

- `components/` `hooks/` の再配置
- `lib/env/` `lib/search/` の profiles / mods への移動
- `__tests__/` の追従（または colocation。§10.4）
- `app/` の import パス（ルートファイルは App Router のため移動しない）
- `tsconfig.json` / `tsconfig.test.json` / `vitest.config.ts` の paths・coverage
- `docs/task-list.md` / 本書 §12 / `docs/README.md`

変更しない (境界外):

- `app/` の URL・セグメント設定・Route Handlers
- `lib/db/` `lib/store/` `lib/modrinth/` `lib/query/` `lib/server/` `lib/seo/` `lib/utils/` `lib/constants/`（横断インフラ）
- `.archive/vite/`
- 機能追加・SEO 本番目視・CurseForge
- 本計画書作成時点のコード移動（計画のみ）

## 4. 禁止事項

- 1 コミットで全ファイルを動かさない
- Feature 間の深い import（`features/mods/components/Foo` を profiles から直接）
- `index.ts` の `export *` 乱用（明示 named export）
- テストを通すためだけの期待値改変
- パスだけ変えてカバレッジ include を忘れる
- 推測でドメインを増やさない（4 Feature 固定。迷ったら共通へ）

## 5. 完了条件 (DoD) — 計画書タスク `ARCH-1`

- [x] 本計画がユーザー指定アウトライン 1〜8 を含む
- [x] Before/After が現行ツリー（2026-08-30）に対応
- [x] `docs/task-list.md` に `ARCH-1` と実施サブ ID を登録
- [ ] コード移動は **ARCH-1A 以降の Go** まで行わない

実施完了時（ARCH-1H）の DoD は §16。

## 6. テスト方法（実施フェーズ）

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit | 各フェーズ必須 | `pnpm test:unit` 件数減少なし |
| typecheck | 必須 | `pnpm typecheck` |
| lint | 必須 | `pnpm exec biome lint .` |
| build | フェーズ末必須 | `pnpm build` |
| E2E | ARCH-1H と profiles 切り出し後 | CI。Sandbox では必須にしない |
| 実環境 | しない | リファクタのみ |

## 7. 停止条件

- Feature 境界がユーザー指定 4 つと衝突する（例: modpack を第 5 Feature にしたくなる）
- `lib/store` や Dexie スキーマまで Feature に割る必要が出た
- カバレッジ threshold 割れを「閾値下げ」で逃げる判断
- 作業ツリーが未コミットのまま大規模 `git mv` が必要

## 8. 完了時に行うこと（ARCH-1 = 計画）

1. task-list 更新
2. docs/README に計画書を載せる
3. `docs(ARCH-1): …` でコミット。コードは動かさない

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 |
|---|---|---|---|
| ARCH-1 | 本計画書 | `FEATURE_FOLDER_PLAN.md` | なし |
| ARCH-1A | 共通 UI 三分（ui/layout/feedback）+ 旧パス re-export | `components/{ui,layout,feedback}` | ARCH-1 Go |
| ARCH-1B | landing Feature | `features/landing` | ARCH-1A |
| ARCH-1C | settings Feature | `features/settings` | ARCH-1A |
| ARCH-1D | mods Feature（検索・詳細・discover） | `features/mods` | ARCH-1A |
| ARCH-1E | profiles Feature（env/sync/zip/modpack） | `features/profiles` | ARCH-1D（Mod 追加 UI 依存） |
| ARCH-1F | 旧パス shim 削除 + Public API 強制 | barrel のみ公開 | ARCH-1E |
| ARCH-1G | テスト配置の最終形（ミラー維持 or colocation） | `__tests__` or `*.test.ts` 隣 | ARCH-1F |
| ARCH-1H | 掃除・coverage paths・完了チェック | vitest.config / skills | ARCH-1G |

---

## 10. 設計詳細

### 10.1 新ディレクトリ構造（目標）

```
.
├── app/                          # App Router のみ（移動しない）
├── features/
│   ├── landing/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── index.ts
│   ├── mods/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── search/               # 旧 lib/search
│   │   ├── server/               # project-detail の UI 近傍が必要なら。既定は lib/server 据置
│   │   └── index.ts
│   ├── profiles/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── env/                  # 旧 lib/env 一式
│   │   └── index.ts
│   └── settings/
│       ├── components/
│       └── index.ts
├── components/
│   ├── ui/                       # 純粋プリミティブ
│   ├── layout/                   # シェル・ナビ
│   └── feedback/                 # toast / confirm / offline / progress
├── hooks/                        # ドメイン非依存フックのみ残す
├── lib/                          # 横断インフラ（db/store/modrinth/query/server/seo/utils/constants）
├── __tests__/                    # ARCH-1G まで現行ミラー。以降は §10.4
└── e2e/                          # パス文字列以外は触らない
```

`lib/providers/` は Modrinth プロバイダ抽象で profiles の sync が使う → **ARCH-1E で `features/profiles/providers` へ**。横断 API クライアント `lib/modrinth` は残す。

### 10.2 完全ファイル移行対応表 (Before / After)

凡例: **共通** = `components/{ui,layout,feedback}` または `hooks/` / `lib/`。**L/M/P/S** = landing/mods/profiles/settings。

#### components/

| Before | After | ドメイン |
|---|---|---|
| `components/landing/AnimatedStats.tsx` | `features/landing/components/AnimatedStats.tsx` | L |
| `components/landing/HeroRotator.tsx` | `features/landing/components/HeroRotator.tsx` | L |
| `components/landing/LandingSearchForm.tsx` | `features/landing/components/LandingSearchForm.tsx` | L |
| `components/landing/PopularMarquee.tsx` | `features/landing/components/PopularMarquee.tsx` | L |
| `components/landing/PreviewCard.tsx` | `features/landing/components/PreviewCard.tsx` | L |
| `components/landing/RevealSection.tsx` | `features/landing/components/RevealSection.tsx` | L |
| `components/HomeInteractive.tsx` | `features/mods/components/HomeInteractive.tsx` | M |
| `components/ModCard.tsx` | `features/mods/components/ModCard.tsx` | M |
| `components/ModDetailModalShell.tsx` | `features/mods/components/ModDetailModalShell.tsx` | M |
| `components/ModDetailPageView.tsx` | `features/mods/components/ModDetailPageView.tsx` | M |
| `components/ScreenshotGalleryModal.tsx` | `features/mods/components/ScreenshotGalleryModal.tsx` | M |
| `components/ReservedCategoryPage.tsx` | `features/mods/components/ReservedCategoryPage.tsx` | M |
| `components/BrowseBottomSheet.tsx` | `features/mods/components/BrowseBottomSheet.tsx` | M（探すシート） |
| `components/ModsPageClient.tsx` | `features/profiles/components/ModsPageClient.tsx` | P（プロファイル Mod 一覧） |
| `components/EditProfileModal.tsx` | `features/profiles/components/EditProfileModal.tsx` | P |
| `components/NewProfileModal.tsx` | `features/profiles/components/NewProfileModal.tsx` | P |
| `components/DependencyCheckModal.tsx` | `features/profiles/components/DependencyCheckModal.tsx` | P |
| `components/EnvironmentSyncSection.tsx` | `features/profiles/components/EnvironmentSyncSection.tsx` | P |
| `components/InterruptedSyncDialog.tsx` | `features/profiles/components/InterruptedSyncDialog.tsx` | P |
| `components/SyncButton.tsx` | `features/profiles/components/SyncButton.tsx` | P |
| `components/SyncHistorySection.tsx` | `features/profiles/components/SyncHistorySection.tsx` | P |
| `components/SyncPreviewModal.tsx` | `features/profiles/components/SyncPreviewModal.tsx` | P |
| `components/ModpackHubClient.tsx` | `features/profiles/components/ModpackHubClient.tsx` | P |
| `components/ModpackImportModal.tsx` | `features/profiles/components/ModpackImportModal.tsx` | P |
| `components/SettingsPageClient.tsx` | `features/settings/components/SettingsPageClient.tsx` | S |
| `components/CustomDropdown.tsx` | `components/ui/CustomDropdown.tsx` | 共通 |
| `components/BottomSheet.tsx` | `components/ui/BottomSheet.tsx` | 共通 |
| `components/MarkdownRenderer.tsx` | `components/ui/MarkdownRenderer.tsx` | 共通 |
| `components/AppShell.tsx` | `components/layout/AppShell.tsx` | 共通 |
| `components/Header.tsx` | `components/layout/Header.tsx` | 共通 |
| `components/BottomNav.tsx` | `components/layout/BottomNav.tsx` | 共通 |
| `components/DesktopSidebar.tsx` | `components/layout/DesktopSidebar.tsx` | 共通 |
| `components/MenuBottomSheet.tsx` | `components/layout/MenuBottomSheet.tsx` | 共通 |
| `components/Providers.tsx` | `components/layout/Providers.tsx` | 共通 |
| `components/JsonLd.tsx` | `components/layout/JsonLd.tsx` | 共通（SEO 描画） |
| `components/WebVitalsReporter.tsx` | `components/layout/WebVitalsReporter.tsx` | 共通 |
| `components/ConfirmDialog.tsx` | `components/feedback/ConfirmDialog.tsx` | 共通 |
| `components/ToastContainer.tsx` | `components/feedback/ToastContainer.tsx` | 共通 |
| `components/OfflineBanner.tsx` | `components/feedback/OfflineBanner.tsx` | 共通 |
| `components/CacheStatusBadge.tsx` | `components/feedback/CacheStatusBadge.tsx` | 共通 |
| `components/ZipProgressModal.tsx` | `components/feedback/ZipProgressModal.tsx` | 共通（ZIP は profiles だが進捗 UI は横断） |

ARCH-1A では **旧パスに 1 行 re-export** を残し、app を一度に書き換えない。

#### hooks/

| Before | After | ドメイン |
|---|---|---|
| `hooks/useCountUp.ts` | `features/landing/hooks/useCountUp.ts` | L |
| `hooks/useScrollReveal.ts` | `features/landing/hooks/useScrollReveal.ts` | L |
| `hooks/useModpackAdd.ts` | `features/mods/hooks/useModpackAdd.ts` | M（Discover から追加。実装は profiles env を呼ぶ） |
| `hooks/useProfiles.ts` | `features/profiles/hooks/useProfiles.ts` | P |
| `hooks/useDependencyCheck.ts` | `features/profiles/hooks/useDependencyCheck.ts` | P |
| `hooks/useEnvironmentLink.ts` | `features/profiles/hooks/useEnvironmentLink.ts` | P |
| `hooks/useFolderLinked.ts` | `features/profiles/hooks/useFolderLinked.ts` | P |
| `hooks/useInterruptedSync.ts` | `features/profiles/hooks/useInterruptedSync.ts` | P |
| `hooks/useSync.ts` | `features/profiles/hooks/useSync.ts` | P |
| `hooks/useSyncHistory.ts` | `features/profiles/hooks/useSyncHistory.ts` | P |
| `hooks/useZipExport.ts` | `features/profiles/hooks/useZipExport.ts` | P |
| `hooks/useZipImport.ts` | `features/profiles/hooks/useZipImport.ts` | P |
| `hooks/useZipSync.ts` | `features/profiles/hooks/useZipSync.ts` | P |
| `hooks/useLoaderVersionOptions.ts` | `features/profiles/hooks/useLoaderVersionOptions.ts` | P |
| `hooks/useConfirm.ts` | `hooks/useConfirm.ts` | 共通（残置） |
| `hooks/useToasts.ts` | `hooks/useToasts.ts` | 共通 |
| `hooks/useMediaQuery.ts` | `hooks/useMediaQuery.ts` | 共通 |
| `hooks/useModalA11y.ts` | `hooks/useModalA11y.ts` | 共通 |
| `hooks/useModalUi.ts` | `hooks/useModalUi.ts` | 共通 |
| `hooks/useScrollDirection.ts` | `hooks/useScrollDirection.ts` | 共通 |

`useModpackAdd` は Discover（mods）起点だが `lib/env/modpackAdd` に依存。ARCH-1D では mods の Public API から出し、中身は profiles の env を **profiles の index 経由** で呼ぶ（ARCH-1E 後）。ARCH-1D 時点ではまだ `lib/env` 直 import を許可する。

#### lib/env/ と lib/search/

| Before | After |
|---|---|
| `lib/env/**`（detector / sink / hash worker 含む全ファイル） | `features/profiles/env/**`（相対構造維持） |
| `lib/search/loadDiscoverSearch.ts` | `features/mods/search/loadDiscoverSearch.ts` |
| `lib/providers/index.ts` `modrinth.ts` `types.ts` | `features/profiles/providers/` |

`lib/env/hash.worker.ts` の Worker URL は移動後に import パスを 1 箇所直す。テストの worker 参照も同時。

#### lib/ で動かさないもの

`constants/` `db/` `loaders/` `modrinth/` `query/` `seo/` `server/` `state/` `store/` `utils/` — 横断。`lib/server/project-detail.ts` は App Router の generateMetadata が使うため **lib/server 据置**。

#### app/

移動しない。import だけ `features/*/index` と `components/{ui,layout,feedback}` に付け替える（ARCH-1F）。

| app ファイル | 主に import する Feature |
|---|---|
| `app/page.tsx` | landing |
| `app/discover/**` | mods |
| `app/[projectType]/[slug]/**` | mods |
| `app/profile/page.tsx` | profiles |
| `app/modpack/page.tsx` | profiles |
| `app/settings/page.tsx` | settings |
| `app/resourcepack/page.tsx` `shader/page.tsx` | mods (`ReservedCategoryPage`) |
| `app/layout.tsx` | layout + JsonLd |

#### __tests__/（ARCH-1G までミラー）

テストファイルはソースと同じ相対パスを `__tests__/` 配下に維持する。

| Before | After（ミラー方針） |
|---|---|
| `__tests__/components/landing/*.test.tsx` および LP 個別 | `__tests__/features/landing/components/` |
| `__tests__/components/ModCard.test.tsx` 等 mods | `__tests__/features/mods/components/` |
| `__tests__/components/NewProfileModal*.tsx` 等 | `__tests__/features/profiles/components/` |
| `__tests__/components/Settings*` なし（Settings は薄い） | 追加しない |
| `__tests__/hooks/useZip*.tsx` 等 | `__tests__/features/profiles/hooks/` |
| `__tests__/hooks/useCountUp.test.tsx` 等 | `__tests__/features/landing/hooks/` |
| `__tests__/lib/env/**` | `__tests__/features/profiles/env/` |
| `__tests__/components/{Confirm,Toast,Header,BottomNav,...}` | `__tests__/components/{feedback,layout,ui}/` |

colocation を選ぶ場合の配置は §10.4。

### 10.3 Public API (`index.ts`)

外部（`app/`・他 Feature・テスト）は次だけから import する。

**`features/landing/index.ts`**

- コンポーネント: `AnimatedStats` `HeroRotator` `LandingSearchForm` `PopularMarquee` `PreviewCard` `RevealSection`
- フック: `useCountUp` `useScrollReveal`
- 出さない: 内部定数、LP 専用 style helper

**`features/mods/index.ts`**

- `HomeInteractive` `ModCard` `ModDetailModalShell` `ModDetailPageView` `ScreenshotGalleryModal` `ReservedCategoryPage` `BrowseBottomSheet`
- `useModpackAdd`
- `loadDiscoverSearch`
- 出さない: 検索内部 facet 組み立て、モーダル内部 helper

**`features/profiles/index.ts`**

- ページクライアント: `ModsPageClient` `ModpackHubClient`
- モーダル/セクション: `NewProfileModal` `EditProfileModal` `DependencyCheckModal` `EnvironmentSyncSection` `SyncPreviewModal` `SyncButton` `SyncHistorySection` `InterruptedSyncDialog` `ModpackImportModal`
- フック: `useProfiles` `useSync` `useZipImport` `useZipExport` `useZipSync` `useEnvironmentLink` `useFolderLinked` `useDependencyCheck` `useInterruptedSync` `useSyncHistory` `useLoaderVersionOptions`
- env: 他 Feature が必要とする最小（`useModpackAdd` 向け `addModpackToProfile` 相当）。原則 env ファイルは profiles 内 private
- 出さない: detector 内部、sink 実装、hash worker

**`features/settings/index.ts`**

- `SettingsPageClient` のみ

**共通 components** は barrel 任意。`@/components/ui/CustomDropdown` の直接 import を許可（プリミティブに Public API 強制は過剰）。Feature 同士は禁止。

### 10.4 テスト方針

**既定（ARCH-1G まで）: `__tests__` ミラー**

- vitest include が `__tests__/**` 前提
- カバレッジ `include` を `features/**` `components/**` に更新（ARCH-1A から逐次）

**ARCH-1G の選択肢（Go 時に 1 つ）**

| 案 | 内容 | 採用条件 |
|---|---|---|
| A ミラー維持 | `__tests__/features/...` | 差分が小さく既定 |
| B colocation | `features/mods/components/ModCard.test.tsx` | vitest include 変更 + AGENT.md 追記が必要。ユーザー確認 |

計画時点の推奨は **A**。B は別確認。

### 10.5 インポートパスと tsconfig

現行: `"@/*": ["./*"]` のみ。追加は必須ではない（`@/features/mods` は既に解決する）。

任意の明示（可読性。ARCH-1A で入れてよい）:

```json
"paths": {
  "@/*": ["./*"],
  "@/features/*": ["./features/*"],
  "@/components/*": ["./components/*"]
}
```

ルール:

1. Feature 外 → `@/features/<name>`（index のみ）
2. Feature 内 → 相対パスまたは `@/features/<name>/...`（同一 Feature の深いパスは可）
3. 共通 UI → `@/components/ui/...` 等
4. インフラ → `@/lib/...` `@/hooks/...`
5. ARCH-1A〜E の shim 期間のみ `@/components/ModCard` を許可

`tsconfig.test.json` も同様。Biome の `noRestrictedImports` は ARCH-1F で導入を検討（最初からだと shim と衝突）。

### 10.6 段階的フェーズ

**ARCH-1A 共通三分**  
`git mv` で ui/layout/feedback へ。旧パスに `export { X } from './ui/X'`。4 検証。

**ARCH-1B landing**  
`components/landing/*` と LP フックを移動。`app/page.tsx` を `@/features/landing` に。テスト移動。4 検証。

**ARCH-1C settings**  
ファイルが少ない。`app/settings/page.tsx` のみ。

**ARCH-1D mods**  
検索・詳細・discover。`lib/search` を移す。`useModpackAdd` は暫定 `lib/env` 直 import。

**ARCH-1E profiles**  
最大。`lib/env` を丸ごと `git mv`。Worker・テスト・coverage を同じコミット塊で（env を分割コミットすると中間が壊れる）。内部相対 import を一括修正。

**ARCH-1F shim 削除**  
`rg "@/components/ModCard"` 等が 0。app と features 間は index のみ。

**ARCH-1G テスト最終形**  
案 A ならパスずれの修正のみ。

**ARCH-1H**  
coverage include、`.agent/skills` のパス、完了チェックリスト。

各フェーズ終了条件: `pnpm typecheck` && `pnpm exec biome lint .` && `pnpm test:unit` && `pnpm build`。E2E は 1E と 1H（CI）。

### 10.7 テスト・CI コマンド

```bash
pnpm typecheck
pnpm exec biome lint .
pnpm test:unit
pnpm build
# ARCH-1E / 1H かつ CI またはローカル Playwright があるとき
pnpm test:e2e
```

Sandbox では E2E を必須にしない（既存方針）。カバレッジ閾値は下げない。

### 10.8 Git 運用・ロールバック

- **ブランチ**: 本セッションは `arena/01a04e55-dropmod` 固定。計画も実施もこのブランチ
- **コミット粒度**: サブ ID ごと。ARCH-1E は `git mv` と import 修正を分けず 1 論理単位（中間で typecheck が落ちるため）
- **メッセージ**: `refactor(ARCH-1A): …` 形式
- **ロールバック**: フェーズ単位で `git revert <sha>`。1E が大きいので env 移動前に tag `arch-1e-pre` を任意で打つ
- **force push しない**
- 失敗したらそのフェーズのコミットだけ戻し、shim を復活させる

---

## 11. リスク・Gotchas

- `ModsPageClient` は名前が mods だが中身はプロファイル → **profiles**
- `BrowseBottomSheet` は探す UI → **mods**。MenuBottomSheet はシェル → **layout**
- `useModpackAdd` は mods と profiles の境界。循環 import 禁止（profiles は mods のコンポーネントを import しない）
- hash Worker の new URL はファイル移動で壊れる
- Next の `opengraph-image` は app に残す
- coverage `include` を更新しないと閾値割れ
- re-export shim を残したまま ARCH-1H すると「移行完了」に見えて未完了

## 12. 実績と証拠

| ID | コミット | テスト | 備考 |
|---|---|---|---|
| ARCH-1 | (本コミット) | docs のみ | 計画。コード未移動 |

---

## 13. 移行完了チェックリスト（ARCH-1H）

- [ ] `components/` 直下にドメインコンポーネントが 0（`ui/` `layout/` `feedback/` のみ）
- [ ] `hooks/` にドメインフックが 0
- [ ] `lib/env/` `lib/search/` が存在しない（または deprecated re-export なし）
- [ ] `app/` の Feature import が `@/features/<name>` のみ
- [ ] Feature 間の深い import が `rg` で 0
- [ ] 各 Feature の `index.ts` が named export のみ
- [ ] `__tests__` または colocation がソースと 1:1
- [ ] `pnpm typecheck` / biome / `test:unit` / `build` pass。件数減少なし
- [ ] vitest coverage include が新パス。閾値維持
- [ ] `.archive/vite/` 無変更
- [ ] task-list ARCH-1A〜H をローカル検証済みに更新
- [ ] skills / AGENT のパス例を更新

## 16. 実施 Go の条件

ユーザーが「ARCH-1A から Go」と指示するまでコードを動かさない。
Go 時に ARCH-1G のテスト配置（A ミラー / B colocation）を確認する。未指定なら A。
