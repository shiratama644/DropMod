# ARCH-3: Feature 直下を `index.ts` のみにし、実体を責務別スロットへ

> 本計画は **コード変更を行わない**。Go 承認後に実装する。
> 親計画: `docs/planning/FEATURE_FOLDER_PLAN.md`（ARCH-2 完了、`fe1d919`）。

---

## 0. 概要

ARCH-1 で 11 Feature へファイルを移し、ARCH-2 で types / store / platform / Dexie 操作を整えた。現状、複数 Feature の直下に `index.ts` 以外のファイルと、許可スロット以外のディレクトリ（`search/` `loaders/` `detector/` `providers/` `sink/`）が残っている。

本タスクは **ディレクトリ再配置と import パス更新のみ**。ロジック変更・Public API の意味変更・空フォルダ作成はしない。

---

## 1. 目的

- 各 `features/<name>/` 直下は **`index.ts` のみ**（ファイル）。許可スロットのサブディレクトリは直下に置いてよい。
- 許可スロット: `api/` `components/` `hooks/` `services/` `utils/` `store/` `types/` `constants/`
- 空スロットは作らない。
- Zustand は `store/`（`hooks/` / `services/` に入れない）。既存 `__tests__/features/{profiles,zip}/store/` に合わせる。
- 共有型はルート `types/`（`@/types`）のまま。Feature `types/` は専用型があるときだけ。今回、Feature `types/` を新設する必要はない（detector / provider の型は既存ネストに残す）。
- 分類は **ディレクトリ名ではなく実装の責務**（外部データソースへのアクセス → `api/`、Feature 内の業務・副作用・オーケストレーション → `services/`、純粋関数 → `utils`、定数 → `constants`）。

---

## 2. 変更範囲

### 含む

- 対象 Feature 直下ファイルのスロットへの移動
- 許可外ディレクトリのスロット配下への移動（ネスト維持が指定されたもの）
- 移動に伴う相対 import / `@/features/...` 深パスの更新
- Feature `index.ts` の再構成（公開面の識別子は維持）
- `__tests__/features/` のミラー配置とテスト内 import
- vitest coverage / biome 制限パスがあれば追随

### 含まない（不変）

- `app/` `app/api/` `lib/db` `lib/platform` `lib/env`（KEEP）`lib/modrinth` `lib/constants`
- ルート `types/`
- `.archive/`（閲覧・変更禁止）
- ロジック・UI・挙動の変更
- 新規 Feature、空フォルダ、Storybook
- Playwright E2E の実行（Sandbox 不可）。unit / typecheck / biome / `pnpm build` は Go 後に実行

---

## 3. スロット判定ルール（実装時に再確認）

| 責務 | 置き場所 |
|---|---|
| 外部データソースとの通信・取得（Modrinth API 等。cookie 経由の検索含む） | Feature の `api/` |
| Next.js Route Handler（HTTP エンドポイントそのもの） | **`app/api/` 据え置き。Feature へ移さない** |
| Feature 内の業務処理・副作用・オーケストレーション（DOM / OPFS / File System Access / Dexie / 検出パイプライン等）。外部 API クライアントは置かない | Feature の `services/` |
| 純粋関数（入出力が引数と戻り値のみ） | `utils/` |
| リテラル・ID 表・フォールバック表 | `constants/` |
| Zustand `create(...)` | `store/` |
| React コンポーネント | `components/` |
| React hooks | `hooks/`（既存。今回は移動しないものが大半） |

境界の要約:

```
外部API・データソースへのアクセス → Feature の api/
Next.js Route Handler           → app/api/
Feature 内の業務・副作用・編成   → Feature の services/
```

`api/` は「HTTP という技術」ではなく **外部データソースへのアクセス** を表す。Route Handler を Feature の `api/` に移すことはしない。`services/` に Modrinth クライアントや検索フェッチを置かず、`api/` に業務オーケストレーション（Sync executor 等）を置かない。

同一ファイルに純関数と副作用が混在する場合は **ファイルを分割せず、主責務のスロットへ丸ごと移す**（例: `backup.ts`、`mrpack.ts`）。独立してテストされ、かつ主モジュールと責務が明らかに違う純関数だけ分割する（`buildDiscoverModalMetadata`、`staticSitemapEntries`、`versions.ts` の定数）。

---

## 4. タスク ID

親: **ARCH-3**（本計画）。実装は Feature 単位でコミットし、ID は再利用しない。

| ID | 対象 | 依存 |
|---|---|---|
| ARCH-3A | catalog（`search/`） | Go |
| ARCH-3B | dep-check（`store.ts`） | Go |
| ARCH-3C | env-import（analyzer / picker / profileName / `detector/`） | Go |
| ARCH-3D | modpack（modpack*.ts / mrpack / `providers/`） | Go |
| ARCH-3E | profiles（store / contentCategory / `loaders/`） | Go |
| ARCH-3F | project（`server.ts`） | Go |
| ARCH-3G | seo | Go |
| ARCH-3H | sync（直下 `.ts` + `sink/`） | Go |
| ARCH-3I | zip（zipExport / zipImport） | Go |
| ARCH-3J | landing / settings 確認のみ（直下は既に `index.ts` のみ） | 3A〜I |
| ARCH-3K | 掃除・coverage/biome・4 検証 | 3J |

Go までコード変更しない。task-list への行追加は Go 承認と同時でよい。

---

## 5. 移動表（現状 → 予定）

パスはリポジトリルート相対。`index.ts` は移動しない。

### 5.1 catalog — ARCH-3A

| 現状 | 予定 | 理由 |
|---|---|---|
| `features/catalog/search/loadDiscoverSearch.ts` | `features/catalog/api/loadDiscoverSearch.ts` | cookie + `fetchModrinthSearch`。RSC 利用だからではなく **フェッチがあるから** `api/` |
| `features/catalog/search/` | 削除（空にしない。中身移動後にディレクトリ消滅） | 許可外名 |
| `features/catalog/components/` `constants/` | 据え置き | 既にスロット |
| `features/catalog/constants/categories.ts` | 据え置き | 定数が主。ヘルパ関数は同一モジュール。分割は範囲外 |

`app/discover/[type]/page.tsx` の `@/features/catalog/search/loadDiscoverSearch` を新パスへ。

### 5.2 dep-check — ARCH-3B

| 現状 | 予定 | 理由 |
|---|---|---|
| `features/dep-check/store.ts` | `features/dep-check/store/store.ts` | Zustand |

テスト `__tests__/features/dep-check/store.test.ts` → `__tests__/features/dep-check/store/store.test.ts`（既存 zip/profiles の `store/` ミラーに合わせる）。

### 5.3 env-import — ARCH-3C

| 現状 | 予定 | 理由 |
|---|---|---|
| `analyzer.ts` | `services/analyzer.ts` | ファイル読取・hash・Modrinth 照合の副作用パイプライン |
| `picker.ts` | `services/picker.ts` | Directory picker（ブラウザ API） |
| `profileName.ts` | `utils/profileName.ts` | 純粋 |
| `detector/`（ネスト一式） | `services/detector/`（ネスト維持。平坦化しない） | `canDetect` がソースを読む。純 utils ではない |
| `detector/types.ts` | `services/detector/types.ts` | Feature `types/` 新設しない |

### 5.4 modpack — ARCH-3D

| 現状 | 予定 | 理由 |
|---|---|---|
| `providers/` | `api/providers/`（ネスト維持） | `lib/modrinth/client` 経由の HTTP。抽象インターフェースでも実装が通信なら `api/` |
| `modpack.ts` | `services/modpack.ts` | ZIP を読んで形式判定（I/O） |
| `mrpack.ts` | `services/mrpack.ts` | parse + `expandMrpackFiles` の HTTP。純ヘルパは同一ファイルに残す |
| `modpackAdd.ts` | `utils/modpackAdd.ts` | **実装確認済み（2026-08-30）**。export は `buildModpackAddPlan` / `applyModpackAddPlan` / `applyLockedVersionsToProfile` と型のみ。ファイル先頭コメントどおり pure。DB・React・Provider・fetch なし。I/O は呼び出し側 `hooks/useModpackAdd.ts`。`Date.now()` は引数 `now` の既定値のみで、本体は引数と戻り値の変換。よって `utils/`（`services/` ではない） |
| `modpackUpdate.ts` | `services/modpackUpdate.ts` | provider 経由の更新検知が主。`updateIssueFromReport` は同居 |

### 5.5 profiles — ARCH-3E

| 現状 | 予定 | 理由 |
|---|---|---|
| `store.ts` | `store/store.ts` | Zustand。テストは既に `__tests__/features/profiles/store/` |
| `contentCategory.ts` | `utils/contentCategory.ts` | 純粋 |
| `loaders/fetch.ts` | `api/fetchLoaderVersions.ts`（ファイル名は実装の関数名に合わせる。中身は `/api/loaders/versions` fetch） | フェッチ |
| `loaders/versions.ts` の定数・`LoaderId` | `constants/loaderVersions.ts` | `FALLBACK_*` `LOADER_IDS` `LOADER_DROPDOWN_OPTIONS` |
| `loaders/versions.ts` の parse/merge 関数 | `utils/loaderVersions.ts` | 純粋。constants を import |
| `loaders/loaderVersions.ts` | 削除（barrel。`index.ts` が再エクスポート） | 直下許可外の中継 |

`app/api/loaders/versions/route.ts` は `versions` の parse 系を使う → `@/features/profiles/utils/loaderVersions` 等へ。

### 5.6 project — ARCH-3F

| 現状 | 予定 | 理由 |
|---|---|---|
| `server.ts` の fetch 群（`fetchProjectDetailData` `generateDetailStaticParams` `buildDetailMetadata` `DETAIL_REVALIDATE`） | `api/projectDetail.ts` | Modrinth 取得 + metadata（取得あり） |
| `buildDiscoverModalMetadata` | `utils/discoverModalMetadata.ts` | 純粋。独立テストあり |

`index.ts` に `'use client'` を付けない（現状維持）。RSC は `@/features/project/api/projectDetail` または barrel からサーバー専用 export。barrel にクライアントコンポーネントとサーバー関数を混ぜない現行方針を維持する。

### 5.7 seo — ARCH-3G

| 現状 | 予定 | 理由 |
|---|---|---|
| `JsonLd.tsx` | `components/JsonLd.tsx` | React コンポーネント |
| `jsonld.ts` | `utils/jsonld.ts` | 純粋 JSON-LD 構築 |
| `og-copy.ts` | `utils/og-copy.ts` | 純粋 |
| `staticSitemapEntries` | `utils/staticSitemapEntries.ts`（または `utils/sitemap-entries.ts` の静的側） | フェッチなし。RSC から使うことだけでは `api/` にしない |
| `popularDetailSitemapEntries` | `api/popularSitemapEntries.ts` | `fetchModrinthSearch` あり |

現状 1 ファイル `sitemap-entries.ts` を責務で分割する。

### 5.8 sync — ARCH-3H

実装確認済み。ユーザー案（副作用→services、純→utils）を採用。

| 現状 | 予定 | 理由 |
|---|---|---|
| `applySync.ts` `backup.ts` `executor.ts` `link.ts` `recovery.ts` `syncPrep.ts` `undo.ts` `zipSync.ts` `db.ts` | `services/` 同名 | 副作用（Dexie / OPFS / FS / オーケストレーション）。`syncPrep` はコメントに純とあっても scan / openLinkedFolder を呼ぶ |
| `diff.ts` `managed.ts` `format.ts` `environmentCheck.ts` | `utils/` 同名 | 純粋 |
| `sink.ts` | `services/sink.ts` | インターフェース。実装と隣接 |
| `sink/` | `services/sink/`（ネスト維持） | FileSystem / Zip 実装 |
| `components/` `hooks/` | 据え置き | |

`lib/env/{scan,resolve}.ts` の `@/features/sync/diff` 等は新パスへ（`lib/env` のロジックは不変）。

### 5.9 zip — ARCH-3I

| 現状 | 予定 | 理由 |
|---|---|---|
| `zipExport.ts` `zipImport.ts` | `store/zipExport.ts` `store/zipImport.ts` | Zustand。テストは既に `__tests__/features/zip/store/` |

### 5.10 landing / settings — ARCH-3J

直下は既に `index.ts` のみ。スロット追加なし。確認コミットまたは 3K に含めて差分ゼロでよい。

---

## 6. Feature `index.ts` 再構成

- 公開識別子（名前）は維持。パスだけ変わる。
- `'use client'` がある barrel（catalog / profiles / zip / dep-check / env-import / modpack / sync 等）から **サーバー専用モジュールを re-export しない**（現行どおり deep import）。
- `'use client'` が無い barrel（seo / project / landing / settings）は従来どおりクライアント境界を壊さない範囲で re-export。
- 内部同士は相対パス（`../utils/...`）。Feature 跨ぎは `@/features/<other>/...`（必要なら深パス）。

---

## 7. Public API（維持する識別子）

変更しない名前の例（網羅ではなく契約）:

- catalog: `loadDiscoverSearch`, `ModCard`, `HomeInteractive`, `CATEGORIES*`
- profiles: `useProfiles`, store hooks, `contentCategoryFrom*`, `fetchLoaderVersions`, `LOADER_*`, parse/merge
- project: `fetchProjectDetailData`, `buildDetailMetadata`, `buildDiscoverModalMetadata`, `generateDetailStaticParams`
- seo: `JsonLd`, `jsonld*` builders, `og-copy`, `staticSitemapEntries`, `popularDetailSitemapEntries`
- sync: `computeSyncPlan`, `executeSync`, `applySync`, `formatBytes`, sink 実装, db helpers
- zip / dep-check stores
- env-import: `analyzeEnvironmentSource`, `pickMinecraftDirectory`, `generateProfileName`, detector chain
- modpack: `detectModpackFormat`, mrpack helpers, `ModrinthProvider`, `getProvider`, add/update

呼び出し側が深パスを使っている箇所は **すべて新パスへ置換**（grep で 0 件にする）。エイリアス互換レイヤは作らない（ARCH-1M 方針）。

---

## 8. テスト配置

原則: `__tests__/features/<name>/` のディレクトリ構造だけ Feature に合わせる。colocation しない。

| テスト現状 | 予定 |
|---|---|
| `dep-check/store.test.ts` | `dep-check/store/store.test.ts` |
| `env-import/{analyzer,picker,profileName,detector}.test.ts` | `env-import/services/...` または `utils/profileName.test.ts` 等、ソースミラー |
| `modpack/{modpack,mrpack,modpackAdd,modpackUpdate}.test.ts` | `services/` または `utils/` ミラー |
| `modpack/providers/modrinth.test.ts` | `modpack/api/providers/modrinth.test.ts` |
| `profiles/loaders/*` | `profiles/api/fetchLoaderVersions.test.ts` + `utils`/`constants` |
| `profiles/contentCategory.test.ts` | `profiles/utils/contentCategory.test.ts` |
| `project/discover-modal-metadata.test.ts` | `project/utils/discover-modal-metadata.test.ts` |
| `seo/{jsonld,og-copy,sitemap-entries}.test.ts` | `seo/utils/...`（sitemap 静的テストは utils） |
| `sync/*.test.ts`（直下） | `sync/services/` または `sync/utils/` |
| `sync/sink.*.test.ts` | `sync/services/sink/...` またはファイル名維持で `services/` 直下 |
| `zip/store/*` | 据え置き（ソースが `store/` に入るだけ） |
| `env-import/{hashCore,scan,source,zipSource,analysis,resolve}.test.ts` | **移動しない**（対象ソースは `lib/env` KEEP） |

import は `@/features/...` の新パス。

---

## 9. 完了条件

1. 全 Feature 直下のファイルが `index.ts` のみ。許可外ディレクトリが Feature 直下に無い。
2. 空の `api/` `types/` 等を作っていない。
3. Zustand がすべて `store/` にある。
4. 公開識別子の削除・リネームが無い（パスのみ）。ARCH-3 開始前後で各 Feature の `index.ts` の named export / re-export を比較し、**意図しない export の削除・追加・変更が無い**こと。配置変更であり Public API の意味・公開範囲は変えない。`'use client'` barrel はサーバー専用モジュールを誤って再 export しない制約を維持しつつ、必要な公開識別子が欠落しないこと。
5. 深パス grep で旧パス 0 件。
6. 4 検証: typecheck / biome / `pnpm test:coverage` / `pnpm build`（build は ECONNRESET でも exit 0 なら成功）。
7. `.archive/` 無変更。`app/` `lib/db` `lib/platform` のロジック無変更（import パス以外）。`app/api/` の Route Handler は移さない。

---

## 10. テスト方法（Go 後）

各 ARCH-3A〜I の末:

1. `pnpm typecheck`
2. `pnpm exec biome check .`
3. `pnpm test:coverage`
4. `pnpm build`（時間都合でスキップしない）

ARCH-3K で再度 4 検証。E2E は走らせない。

停止条件: 公開識別子の欠落、`'use client'` barrel からサーバー専用を誤 re-export、空フォルダ、`lib/env` KEEP へのロジック侵入、coverage glob ずれ。

---

## 11. 検証チェックリスト（実装時）

- [ ] Feature 直下 = `index.ts` のみ（ファイル）
- [ ] 許可スロット以外のディレクトリが Feature 直下に無い
- [ ] 空フォルダ 0
- [ ] Zustand → `store/`
- [ ] `detector/` ネスト維持（`services/detector/`）
- [ ] `providers/` は Feature 直下に無い（`api/providers/`）
- [ ] sitemap 静的は `utils/`、fetch 側だけ `api/`
- [ ] 共有型は `@/types` のまま
- [ ] テストは `__tests__` のみ
- [ ] 4 検証
- [ ] `.archive` 不変

---

## 12. リスクと回避

| リスク | 回避 |
|---|---|
| `'use client'` barrel がサーバーモジュールを巻き込む | catalog/project の RSC は深パス。index に載せない |
| ディレクトリ名だけで一括 `git mv` | 本表の責務列に従う。Go 後もファイル先頭を再読 |
| coverage include が旧パス | vitest 設定を 3K で確認 |
| `backup.ts` 内の純関数を無理分割 | 主責務（OPFS）で `services/` に丸ごと |

---

## 13. この計画でやらないこと

- コード移動・リネーム・import 変更（Go まで禁止）
- Feature 間の依存逆転の解消（別タスク）
- `lib/env` KEEP の再配置
- CurseForge / PHASE13 実装
- 本番 HTML 目視

---

## 14. Go 待ち

ユーザーが本計画を承認したら ARCH-3A から順に実装する。差し戻し時は本ファイルを直して再承認。
