# Phase 11-A: ProjectItem データモデル基盤 + Dexie v2 migration

> Date: 2026-08-26 (JST) / Branch: `arena/01a0337c-dropmod`

## 1. 指示内容 (Task Summary)

PHASE11_PLAN.md §4.5 の確定仕様（2026-08-26 改定）に従い、Phase 11 のデータモデル基盤を実装する:
`ModItem → ProjectItem` リネーム + `Profile.environment` 集約 + `resourcepacks/shaderpacks/unknownFiles` 追加 + Dexie schema v2 migration + 全利用箇所の書き換え。
「一つずつ丁寧にしっかり実装して」の指示どおり、型変更 → typecheck 駆動で全箇所機械的に洗い出す手順で実施。

## 2. 実行内容 (Executed Actions)

| 変更 | 内容 |
| :--- | :--- |
| `types.ts` | `ModItem` 廃止 → **`ProjectItem`**（id→projectId / title→name / projectType?→type 必須化 / selectedVersionId→versionId / selectedVersionNumber→versionNumber + provider? / artifact?）。`Profile.environment`（mcVersion / `ProfileLoader` union loader / loaderVersion?）+ `resourcepacks?` / `shaderpacks?` / `unknownFiles?` + `UnknownFile` 型。`DependencyCheckData` も新型に |
| `lib/state/sanitize.ts` | **`normalizeProfileForV2` / `normalizeProjectItem` / `normalizeLoader` / `normalizeUnknownFile`**（pure, export）。旧 flat 形状の入力も新形状に変換。sanitizeLoadedState はこれを利用 |
| `lib/db/dexie.ts` | **schema v2** 追加（index は v1 と同一、upgrade で `normalizeProfileForV2` により保存済み row を一括変換、updatedAt 保持）。LocalStorage 旧データ経路（migrate.ts）も sanitize 経由で v2 形状化 |
| `lib/store/profiles.ts` 他 lib 6 ファイル | DEFAULT_PROFILE / EMPTY_PROFILE の environment 化、updater の projectId 参照、contentCategoryOf の `type` 参照 |
| hooks 4 ファイル | useProfiles（Profile 構築箇所で `normalizeLoader`、cookie 参照、modObj、toggle/update/remove 全て projectId 化）/ useZipExport / useZipImport / useDependencyCheck |
| components 10 ファイル | AppShell / HomeInteractive / ModsPageClient / SettingsPageClient / NewProfileModal / EditProfileModal / ModCard / ModDetailModalShell / ModDetailPageView / DependencyCheckModal（conflicts の targetMod fallback も `{name, projectId}` に） |
| `fetchStableModVersion` 呼び出し | `Profile` をそのまま渡す箇所は `{ loader, mcVersion }` を明示渡しに変更（client.ts の構造型は不変） |
| テスト | 14 ファイルの fixture を新形状に更新 + **`dexie.migration.test.ts` 新規 4 tests**（v1 DB 作成 → v2 open で upgrade 検証）+ sanitize 正規化 5 tests 追加 |

検証: typecheck 0 error / biome 0 warning (185 files) / **test:unit 470 passed / 56 files** / build exit 0 / **coverage exit 0（全 threshold green、総計 stmt 82.43 / br 70.75）**。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **typecheck 駆動の機械的リネームが有効**: 型を `ModItem` → `ProjectItem` に壊した直後 134 エラーで全利用箇所が洗い出され、フィールドリネームも含めて取りこぼしゼロで完了した。「丁寧に一つずつ」の実体は「型システムに検証させる」こと。
- **Dexie v2 migration のテスト手法**: upgrade は「v1 DB に対して v2 の db を開いた時」にしか走らないため、テストでは (1) `db.close()` + `Dexie.delete()`、(2) v1 スキーマの別インスタンスで旧 row を投入、(3) app db を open — の手順で毎回 DB を作り直す。同一テストファイル内で v1 を 2 回開こうとすると 2 回目は既に upgrade 済み DB になるので注意。
- **upgrage と sanitize の変換ロジックは必ず共用**（`normalizeProfileForV2`）: Dexie 経路と LocalStorage 経路で semantics がずれると片方だけ変換漏れが起きる。
- **`profile.loader` の union 化**は UI 入力境界（EditProfileModal の dropdown state 等）では `string` のままにし、Profile 構築点（useProfiles の create/save）で `normalizeLoader` で正規化する構成が壊れない（dropdown の onChange 型との衝突を避けられる）。
- Profile を構造型引数 (`{loader, mcVersion}`) に渡していた箇所は `p.environment.loader` の明示渡しに変更 — 構造型依存の API は影響を局所化できていた。

## 4. 次にすべきこと (Next Actions)

1. **Phase 11-B**: EnvironmentSource 抽象 + EnvironmentDetector（`lib/env/capabilities.ts` の Feature detection、versions/*.json / mmc-pack.json パーサ）。
2. **Phase 11-C**: Web Worker SHA-1 + NewProfileModal「フォルダから」タブ。
3. E2E の CI green 確認（vitest 4 + Phase 10.5 + 11-A の大規模リネーム後、E2E spec の DOM 参照が壊れていないか要確認 — ユーザー側 CI）。
