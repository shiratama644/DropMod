# ARCH-3: Feature 直下を `index.ts` のみにし、実体を責務別スロットへ

> Date: 2026-09-01(JST) / Branch: `arena/01a0533e-dropmod` / 親計画: `docs/planning/FEATURE_FOLDER_PLAN.md`（ARCH-2 完了）

## 1. 指示内容 (Task Summary)

ユーザーが ARCH-3 を **Go 承認**（2026-09-01）。計画書 `docs/planning/ARCH3_FEATURE_SLOTS_PLAN.md`
に従い、Feature 直下を `index.ts` のみにし、実体を責務別スロット（`api/` `components/`
`hooks/` `services/` `utils/` `store/` `constants/`）へ配置する。

## 2. 調査結果: コード上の移動は Go 承認前に完了していた

- ARCH-3 計画書（`ARCH3_FEATURE_SLOTS_PLAN.md`）の移動表は「移動前」のパスを
  「現状」列に記載しているが、**実コードは既に「予定」列のスロット構造**。
- `git ls-tree 2d22083^ -- features/catalog` で確認: ORG-2a（`2d22083`, src/ 移行）の
  親時点で既に `features/catalog/api/loadDiscoverSearch.ts`（`search/` ではない）等の
  スロット構造。つまり ARCH-3 の移動は ORG 移行以前に確立されており、COV 作業
  （本ブランチのコミット）では Feature 構造に変更なし。
- 旧パス grep はソース / テスト / e2e / scripts で **0 件**（ヒットは計画書自身のみ）。

## 3. 完了条件の検証 (計画 §9)

| # | 条件 | 結果 |
|---|---|---|
| 1 | 全 Feature 直下 = `index.ts` のみ | ✅ 11 Feature すべて確認（catalog / dep-check / env-import / landing / modpack / profiles / project / seo / settings / sync / zip） |
| 2 | 空の `api/` `types/` 等を作らない | ✅ `find src/features -type d -empty` 0 件 |
| 3 | Zustand はすべて `store/` | ✅ `from 'zustand'` は profiles/store・zip/store ×2・dep-check/store のみ |
| 4 | 公開識別子の欠落なし（計画 §7） | ✅ `loadDiscoverSearch` / `ModCard` / `HomeInteractive` / `useProfiles` / `fetchLoaderVersions` / `buildDiscoverModalMetadata` / `JsonLd` / `staticSitemapEntries` / `popularDetailSitemapEntries` / `computeSyncPlan` / `executeSync` / `applySync` / `formatBytes` / `analyzeEnvironmentSource` / `pickMinecraftDirectory` / `generateProfileName` / `detectModpackFormat` / `ModrinthProvider` / `getProvider` すべて現存。`contentCategoryFrom*` = `contentCategoryOf` / `contentCategoryFromProject` / `contentCategoryFromPath`、`jsonld*` = `buildWebSiteJsonLd` 等（計画 §7 は例示のワイルドカード） |
| 5 | 深パス grep で旧パス 0 件 | ✅ 全ファイル（.archive 除く）で 0 件 |
| 6 | 4 検証 | ✅ typecheck / biome lint / `test:coverage` / `pnpm build` すべて PASS（下記） |
| 7 | `.archive` 無変更・`app/` `lib/db` `lib/platform` ロジック無変更・Route Handler は移さない | ✅ `.archive` clean。`src/app/api/` に health / loaders/versions / modrinth proxy の 3 Route Handler が据え置き。`src/features` に `route.ts` なし。`lib/env` の import 先は新パス（`@/features/sync/utils/diff` 等）でロジック不変 |

## 4. 4 検証の結果

| 検証 | 結果 |
|---|---|
| `pnpm typecheck` | ✅ PASS（tsc --noEmit ×2） |
| `pnpm lint`（biome） | ✅ PASS（364 files, 0 warnings） |
| `pnpm test:coverage` | ✅ PASS（123 files / 1603 tests / thresholds 90% で exit 0） |
| `pnpm build` | ✅ PASS（exit 0。Route 全認識） |

カバレッジ総計: **96.54 / 90.49 / 98.26 / 97.85**（st/br/fn/ln）— COV-5 完了時
（96.56/90.52/98.26/97.85）と同一水準で、ARCH-3 検証による回帰なし。

## 5. 計画書との表記差（パス名のみ。スロット分類は計画どおり）

| 計画 §5 | 計画の予定パス | 実装パス | 備考 |
|---|---|---|---|
| 5.5 profiles | `constants/loaderVersions.ts`（定数） | `constants/loaderVersionTables.ts` | 定数版のファイル名表記差。`utils/loaderVersions.ts`（parse/merge）は計画どおり |
| 5.7 seo | `utils/og-copy.ts` | `utils/ogCopy.ts` | ORG-1（camelCase 統一）による表記。`utils/jsonld.ts` 等は計画どおり |

いずれも「どのスロットに置くか」の分類は計画に一致しており、Public API（識別子）は
維持されている。

## 6. 対応

- task-list.md に ARCH-3A〜3K を登録し **完了** を記録（証拠: 本ログ + 既存コミット
  `2d22083` 以前に確立されたスロット構造 + 4 検証結果）。
- `ARCH3_FEATURE_SLOTS_PLAN.md` の §14「Go 待ち」を解除し、実績を追記。

## 7. 残事項

- 本番 HTML 目視・E2E の再実行は不要（コード変更なし。移動は既に確立済みで、
  COV-4 の E2E 全 green は本構造で検証済み）。
- 将来の Feature 追加時は本計画のスロット判定ルール（§3）に従う。
