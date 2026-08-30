# コードベース整理: ファイル命名規則統一 + src/ 移行

> 対応 task-list ID: `ORG-1` / `ORG-2` / `ORG-3` (docs/task-list.md)
> 計画書テンプレート: docs/planning/_TEMPLATE.md 準拠
> 作成日: 2026-08-31（ユーザー指示: 「ファイル命名規則として統一(ReactやNextのRouterに関するもの以外)」「フォルダで分けることもあまりしてなくて目を通しにくい」「src/配下にコードなどを置くことでdocsなどとの区切りがわかりやすくなる」）

## 1. 開始前確認

- 現在のブランチ / HEAD / `git status` を確認する（未コミット変更があれば停止）
- `docs/task-list.md` の ORG-1〜ORG-3 行と依存を確認する
- 関連仕様 (AGENT.md §6.5/§6.8 / .agent/skills/) を読む
- 本計画書の §5 (完了条件) と §7 (停止条件) を再読する

## 2. 目的 (Why)

- **命名規則の混在解消**: 非コンポーネントの `.ts` ファイルに kebab-case
  (`rate-limit.ts` / `site-url.ts` / `og-copy.ts` / `build-env.ts`) と camelCase
  (`downloadFile.ts` / `nextDuplicateName.ts`) が混在しており、どちらを基準に
  書けばよいかがコードから読み取れない。
- **意味のないドットの排除**: テストファイル名に `dexie.v4.test.ts` /
  `dexie.migration.test.ts` / `db.managed.test.ts` /
  `NewProfileModal.folderImport.test.tsx` のような「対象名内ドット」が残っており、
  命名規則として統一されていない（ユーザーが明示的に嫌がる点）。
- **src/ によるルート整理**: ルート直下に app / components / features / hooks /
  lib / types / styles / __tests__ / e2e / scripts / public / docs / .agent /
  .archive と 14 個のコード系フォルダが散在し、プロジェクト全体に目を通しにくい。
  アプリコードを `src/` に集約することで、ルートは「設定ファイル + docs + public」
  だけになり、「どこがコードか」が一目で分かるようになる。

## 3. 変更範囲 (Scope)

変更対象:

- **ORG-1 (リネーム)**: §10.2 のリネーム対象 24 件 + それらを参照する import 文
  （`@/lib/platform/rate-limit` → `@/lib/platform/rateLimit` 等）
- **ORG-2 (src/ 移行)**: `app` / `components` / `features` / `hooks` / `lib` /
  `types` / `styles` を `src/` へ `git mv` で移動
  - `tsconfig.json` の `paths` (`"@/*": ["./*"]` → `["./src/*"]`)
  - `vitest.config.ts` の alias / include / coverage include / exclude /
    per-module thresholds の glob パス（`src/` プレフィックス追加）
  - `tsconfig.test.json` の include（`src/` プレフィックス追加）
  - `app/globals.css` → `src/app/globals.css` の `@source not` 相対パス
    （`../.archive` → `../../.archive`、`../.agent` → `../../.agent`）
  - `package.json` の `build:fa-subset` スクリプト（`build-fontawesome-subset.mjs`
    リネームに伴うパス更新）
- **ORG-3 (ドキュメント)**: `AGENT.md` / `.agent/skills/*` / `README.md` /
  `docs/task-list.md` / 計画書内のパス表記の整合
- `docs/task-list.md` の ORG-1〜ORG-3 の状態・進捗・証拠更新

変更しない (境界外):

- `.archive/vite/`（§4.5 絶対不変）
- `.agent/logs/`（§8.5 過去ログは時点記録。置換対象外）
- `__tests__` / `e2e` / `scripts` / `public` の配置（**ルート残置**）
- React コンポーネントの PascalCase ファイル名（`ModCard.tsx` 等）と
  export 名・public API（ファイル名と import パスのみ変更）
- Next.js ルーティング/特別ファイル名（`page.tsx` / `layout.tsx` / `route.ts` /
  `not-found.tsx` / `error.tsx` / `global-error.tsx` / `loading.tsx` /
  `default.tsx` / `template.tsx` / `opengraph-image.tsx` / `twitter-image.tsx` /
  `icon.tsx` / `apple-icon.tsx` / `sitemap.ts` / `robots.ts` / `manifest.ts`）
- フォルダの機能的分割（`lib/` の 8 サブフォルダ・`features/` の 11 ドメイン・
  `components/` の ui/layout/feedback は**現状維持**。ユーザー確認済み）
- ビジネスロジック・UI・DB スキーマ・環境変数の変更
- `next.config.mjs` / `biome.json` / `playwright.config.ts` / `vitest.setup.ts`
  （src/ 移行の影響を受けないことを §10.3 で確認済み）

## 4. 禁止事項

- `.archive/vite/` を一切変更しない（§4.5）
- `.agent/logs/` の過去ログを書き換えない（§8.5。パス表記の更新は当日の新規ログに記録）
- リネーム・移動以外のリファクタリングを混ぜない（1 サブタスク = 1 論理単位）
- コンポーネント名・関数名・export 名・データ構造は変えない（**ファイル名と import パスのみ**）
- `public/` を `src/` へ移さない（Next.js 公式: `/public` はルート必須）
- `app/` と `src/app/` を同時に存在させない（公式: ルートの `app` があると
  `src/app` は無視される。完全に移動してから `src/app` を有効化する）
- テストの期待値・検証内容を変えない（リネームのみ）
- 不明点は推測で埋めず、§7 の停止条件に従って質問する

## 5. 完了条件 (DoD)

- [ ] 非コンポーネントの `.ts` / `.tsx` / `.mjs` ファイル名が camelCase に統一され、
      ドットは `.test.` / `.spec.` / `.d.ts` の区切りのみ（対象名内ドット 0 件）
- [ ] 意味のないドット付きテストファイル 6 件（§10.2 のリスト）が解消
- [ ] `app` / `components` / `features` / `hooks` / `lib` / `types` / `styles` が
      `src/` 配下に移動し、ルートの `app` が存在しない
- [ ] `@/*` エイリアスが `./src/*` を指す（tsconfig paths + vitest alias の両方）
- [ ] vitest coverage の include / exclude / per-module thresholds パスが
      `src/` を指し、coverage が崩れない（threshold 全 pass）
- [ ] `src/app/globals.css` の `@source not` が `.archive` / `.agent` を正しく除外
- [ ] `pnpm typecheck` / `pnpm exec biome lint .` / `pnpm test:unit` /
      `pnpm build` の 4 検証がすべて PASS
- [ ] `pnpm build` で `src/app` が認識され、ルーティングが従来と同一
      （ビルドログのページ一覧が移動前と一致）
- [ ] `.archive/vite/` 無変更（`git diff --stat <前回>..HEAD -- .archive/vite/` が空）
- [ ] `docs/task-list.md` の ORG-1〜ORG-3 の状態・進捗・証拠 (コミット SHA) を更新

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | ✅ | リネーム後も `pnpm test:unit` 全 pass（テストファイル名変更の影響なし = include パターンは `*.test.{ts,tsx}` のまま） |
| Component (testing-library) | ✅ | 同上（コンポーネントテストの import パス更新を確認） |
| E2E (Playwright / CI) | CI のみ | e2e spec のリネームはローカル実行不可（§6.2）。CI の `workflow_dispatch` で全 spec green を確認（ユーザーまたは CI で） |
| 実環境 (実機・本番 build) | ✅ | `pnpm build && pnpm start` で HTTP 200（Next.js が src/app を認識していることの確認） |

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:

- 仕様書 (計画書・AGENT.md・skills) 同士に矛盾がある
- task-list.md 記載の変更範囲を超える変更が必要
- 破壊的変更 (既存データ・公開 API 互換性) が必要
- ユーザー判断が必要な設計論点に到達した（例: `.test.` / `.spec.` の廃止、
  `__tests__` の src/ 移行、コンポーネント名自体の変更 等）
- 開始時点で作業ツリーに未確認の変更がある

## 8. 完了時に行うこと

1. 差分を自己レビュー（対象外の変更が混ざっていないか。特に `.archive/` と `.agent/logs/`）
2. 4 検証 (typecheck / lint / test:unit / build) を実行
3. `docs/task-list.md` の状態・進捗・証拠を更新
4. タスク ID を含むコミット（例: `refactor(ORG-1): …`）を作成
5. 証拠中心の完了報告（結果 / テスト件数 / Git SHA / 残事項）

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 |
|---|---|---|---|
| ORG-1 | ファイル命名規則統一（camelCase 化 + 意味のないドット排除） | リネーム 24 件 + import 参照更新 + 4 検証 | - |
| ORG-2 | src/ 移行（7 ディレクトリ移動 + 設定更新） | `src/` 配下にコード・エイリアス/coverage/@source 整合・4 検証 | ORG-1 |
| ORG-3 | ドキュメント更新（AGENT.md / skills / README / task-list） | パス表記の整合・4 検証 | ORG-2 |

**実施順序の理由**: リネーム（ORG-1）を先に行い import 参照をすべて更新してから
ディレクトリ移動（ORG-2）を行うと、移動は「設定変更 + 物理移動」のみになり、
2 種類の変更が分離されて検証しやすい。逆順（移動 → リネーム）でも機能するが、
リネーム時の import 更新に移動後のパスが混ざりレビューが煩雑になる。

## 10. 設計詳細・仕様

### 10.1 命名規則の定義（ユーザー合意済み 2026-08-31）

| カテゴリ | 規則 | 例 |
|---|---|---|
| 非コンポーネント `.ts` / `.mjs` | **camelCase** | `rateLimit.ts` / `siteUrl.ts` / `ogCopy.ts` / `buildEnv.ts` / `annotationReporter.ts` / `buildFontawesomeSubset.mjs` |
| React コンポーネント `.tsx` | PascalCase（**対象外・維持**） | `ModCard.tsx` / `AppShell.tsx` |
| Next.js ルーティング/特別ファイル | 固定名（**対象外・維持**） | `page.tsx` / `layout.tsx` / `route.ts` / `opengraph-image.tsx` 等（§3 参照） |
| テストファイル | `<camelCase>.test.ts(x)` / `<camelCase>.spec.ts`。ドットは **`.test.` / `.spec.` の 1 つのみ**（対象名内にドット禁止）。**バージョン番号を名前に含めない**（例: `dexieV4` は NG → `dexieUpgrade`） | `rateLimit.test.ts` / `dexieUpgrade.test.ts` / `modDetailModal.spec.ts` |
| 型定義 | `<camelCase>.d.ts` | `fsAccess.d.ts` |
| ツール設定 | 固定名（**対象外**） | `vitest.config.ts` / `playwright.config.ts` / `next.config.mjs` / `postcss.config.mjs` / `vitest.setup.ts` / `next-env.d.ts` |
| Web Worker | camelCase（ドット廃止） | `hash.worker.ts` → `hashWorker.ts` |

#### ファイル名が長くなる場合のチェックポイント（2026-08-31 ユーザー指摘を反映）

ドット区切りや長い連結名 (`NewProfileModal.folderImport.test.tsx` 等) は、
**情報をフォルダ階層で表現すれば省略できる**ことが多い。リネーム時に以下を確認する:

1. **コンポーネント/モジュールの責務が多すぎないか（一番重要）**:
   1 ファイルが複数の役割を担っている場合、長い名前は責務過大のサイン。
   `NewProfileModal.tsx` (637 行) はフォルダ解析・AnalysisSection・自動紐付けを
   内包しており責務が大きい。**ファイル整理では分割せず**、テスト側をフォルダで
   集約して対処し、本体の責務分割は別タスク (ORG-4 候補, §10.2.1) に切り出す。
2. **フォルダ構造で親情報を表現できるか**:
   `db.managed.test.ts` → `db/managed.test.ts` のように、ドット区切りの情報を
   フォルダ階層に置き換えるとファイル名が短くなる。実コード側に対応フォルダが
   ある場合は**必ずミラーする** (`features/sync/services/db/managed.ts` ↔
   `__tests__/features/sync/services/db/managed.test.ts`)。
3. **実コード側の構造とミラーが保てるか**:
   実コードが単一ファイル (例: `lib/db/dexie.ts`, ルート `next.config.mjs`) の場合は
   テスト側だけフォルダ化せず、フラット連結 (`dexieMigration.test.ts`) に留める
   (ミラー構造が崩れると ARCH-1N の「テスト配置ミラー」ルールと矛盾する)。
4. **バージョン番号など可変情報を名前に含めない**:
   `dexieV4` は Dexie v5 昇格時に再リネームが必要になるため NG。
   バージョン固有の情報は describe 名・コメントに書く (`dexieUpgrade.test.ts`)。

### 10.2 リネーム対象一覧（全 25 件 + 付随移動 1 件 + 参照更新）

**非テスト (8 件):**

| 現パス | 新パス | 参照数 |
|---|---|---|
| `lib/platform/rate-limit.ts` | `lib/platform/rateLimit.ts` | 5 ファイル |
| `lib/platform/site-url.ts` | `lib/platform/siteUrl.ts` | 3 |
| `features/seo/utils/og-copy.ts` | `features/seo/utils/ogCopy.ts` | 1 |
| `scripts/build-env.ts` | `scripts/buildEnv.ts` | 1 |
| `lib/env/hash.worker.ts` | `lib/env/hashWorker.ts` | 2 |
| `lib/env/fs-access.d.ts` | `lib/env/fsAccess.d.ts` | 0（型のみ） |
| `e2e/helpers/annotation-reporter.ts` | `e2e/helpers/annotationReporter.ts` | 1 |
| `scripts/build-fontawesome-subset.mjs` | `scripts/buildFontawesomeSubset.mjs` | package.json + コメント |

**「意味のないドット」を持つテスト (6 件 + 付随移動 1 件):** ※ 2026-08-31 ユーザー指摘によりフォルダ化を判断

| 現パス | 新パス | 方式 | 根拠 |
|---|---|---|---|
| `__tests__/features/profiles/components/NewProfileModal.folderImport.test.tsx` | `__tests__/features/profiles/components/NewProfileModal/FolderImport.test.tsx` | **フォルダ化** | `NewProfileModal.tsx` は 637 行で責務過大（フォルダ解析・AnalysisSection・自動紐付けを内包）。テスト側を `NewProfileModal/` フォルダに集約し、ファイル名は `FolderImport.test.tsx` だけで意味が通る |
| `__tests__/features/profiles/components/NewProfileModal.test.tsx` | `__tests__/features/profiles/components/NewProfileModal/NewProfileModal.test.tsx` | 付随移動 | 同コンポーネントのテストをフォルダに集約（ドットなしだがフォルダ化に伴い移動） |
| `__tests__/features/sync/services/db.managed.test.ts` | `__tests__/features/sync/services/db/managed.test.ts` | **フォルダ化** | 実コード `features/sync/services/db/managed.ts` が既に `db/` フォルダ内に存在 → テストも移動してミラー完成。`db` を省略し `managed.test.ts` に |
| `__tests__/features/sync/services/db.syncTransactions.test.ts` | `__tests__/features/sync/services/db/transactions.test.ts` | **フォルダ化** | 実コード `features/sync/services/db/transactions.ts` とミラー（上と同様） |
| `__tests__/lib/db/dexie.v4.test.ts` | `__tests__/lib/db/dexieUpgrade.test.ts` | フラット連結 | 内容 = schema v3→v4 upgrade。**バージョン番号を名前に含めない**（v5 昇格時に再リネーム不要）。`lib/db` はフラット実体のためフォルダ化せず |
| `__tests__/lib/db/dexie.migration.test.ts` | `__tests__/lib/db/dexieMigration.test.ts` | フラット連結 | 内容 = v1→v2 migration。バージョン非依存。`lib/db` フラットに合わせる |
| `__tests__/next-config.security.test.ts` | `__tests__/nextConfigSecurity.test.ts` | フラット連結 | 実コード `next.config.mjs` はルートの単一ファイル。`__tests__/` 直下もフラットのためフォルダ化せず |

**kebab-case のテスト (4 件):** ※ camelCase 化のみ（ドット 1 つの慣習内）

| 現パス | 新パス |
|---|---|
| `__tests__/features/project/utils/discover-modal-metadata.test.ts` | `discoverModalMetadata.test.ts` |
| `__tests__/lib/platform/og-copy.test.ts` | `ogCopy.test.ts` |
| `__tests__/lib/platform/rate-limit.test.ts` | `rateLimit.test.ts` |
| `__tests__/scripts/build-env.test.ts` | `buildEnv.test.ts` |

**E2E (7 件):** ※ `dep-check` / `offline` / `smoke` / `sync` は 1 語のため変更なし

| 現パス | 新パス |
|---|---|
| `e2e/folder-import.spec.ts` | `folderImport.spec.ts` |
| `e2e/mod-detail-modal.spec.ts` | `modDetailModal.spec.ts` |
| `e2e/mods-page.spec.ts` | `modsPage.spec.ts` |
| `e2e/theme-persistence.spec.ts` | `themePersistence.spec.ts` |
| `e2e/zip-env-import.spec.ts` | `zipEnvImport.spec.ts` |
| `e2e/zip-export.spec.ts` | `zipExport.spec.ts` |
| `e2e/zip-import.spec.ts` | `zipImport.spec.ts` |

**参照更新の手順**: リネーム後に `grep -rn "旧名" app components features hooks lib
types scripts __tests__ e2e` で残存 0 件を確認してから次のファイルへ進む。

#### 10.2.1 将来タスク候補: NewProfileModal の責務分割（ORG-4 候補・本計画の範囲外）

`features/profiles/components/NewProfileModal.tsx` は **637 行**で、以下を 1 ファイルに
内包しており責務が大きい（2026-08-31 ユーザー指摘）:

- フォーム本体（名前・環境入力・作成ボタン）
- フォルダ選択 → 解析（Phase 11）→ 自動紐付け（P12-D1）
- ZIP / .mrpack 取り込みデータの表示
- `AnalysisSection`（解析結果の Read-only 表示、同ファイル内の内部コンポーネント）

本計画 (ORG-1〜3) は「ファイル名・配置の整理」が目的であり、**コンポーネント分割は
スコープ外**。本計画完了後に、以下を ORG-4 として計画・実施することを提案する:

- `NewProfileModal/` フォルダ化（`index.tsx` + `FolderImportSection.tsx` +
  `AnalysisSection.tsx` 等への分割。`index.tsx` から既存 import パス
  `@/features/profiles/components/NewProfileModal` を維持）
- 分割後は本計画で移動したテスト
  `__tests__/features/profiles/components/NewProfileModal/FolderImport.test.tsx` が
  そのまま分割コンポーネントのテストとして機能する
- 分割は「設計 → 基盤 → 機能 A → 機能 B」と段階的に行う（AGENT.md §1.2）

→ 2026-08-31 ユーザー Go により **ORG-4 として採番済み**（docs/task-list.md 参照）。

### 10.3 src/ 移行（ORG-2）

**Next.js 公式仕様（実測・確認済み）** — https://nextjs.org/docs/app/api-reference/file-conventions/src-folder :
- `app` を `src/app` へ移すことで src フォルダが有効になる
- `/public` は**ルート必須**（src/public は不可）
- 設定ファイル（`package.json` / `next.config.mjs` / `tsconfig.json`）と `.env.*` は**ルート必須**
- **ルートに `app` が存在すると `src/app` は無視される** → `app` を完全に移動すること
- TypeScript paths (`@/*`) に `src/` を追加する必要がある

**移動対象**: `app` / `components` / `features` / `hooks` / `lib` / `types` / `styles`
**ルート残置**: `__tests__` / `e2e` / `scripts` / `public` / `docs` / `.agent` /
`.archive` / `AGENT.md` / `README.md` / 全設定ファイル / `.env.example`

**設定変更ポイント（調査済み）:**

| ファイル | 変更内容 |
|---|---|
| `tsconfig.json` | `"paths": {"@/*": ["./*"]}` → `["./src/*"]` |
| `vitest.config.ts` | alias: `path.resolve(import.meta.dirname, '.')` → `'./src'`。coverage include/exclude と per-module thresholds の glob に `src/` プレフィックス（例: `'lib/state/**/*.ts'` → `'src/lib/state/**/*.ts'`、`'app/**/route.ts'` → `'src/app/**/route.ts'` 等 20 箇所程度）。test include は `__tests__` 基準なので変更不要 |
| `tsconfig.test.json` | include の `app/**` / `components/**` / `hooks/**` / `lib/**` / `types/**` / `features/**` に `src/` プレフィックス（`__tests__` / `e2e` / `scripts` は残置のためそのまま） |
| `src/app/globals.css` | `@source not "../.archive"` → `@source not "../../.archive"`、`../.agent` → `../../.agent`（src/ で 1 階層深くなるため） |
| `package.json` | `build:fa-subset` の `scripts/build-fontawesome-subset.mjs` → `scripts/buildFontawesomeSubset.mjs`（ORG-1 でリネーム済み） |
| 変更不要 | `next.config.mjs`（src 自動認識）/ `biome.json`（files.includes は `**` ベース）/ `playwright.config.ts`（testDir `./e2e` 残置）/ `vitest.setup.ts`（`./__tests__/mocks/server` 残置）/ `public/` |

**import への影響**: コード内の `@/` import（app/components/features/hooks/lib/types
内 344 箇所 + __tests__ 内 311 箇所）はすべてエイリアス経由のため、エイリアス変更のみで
対応可能（import 文の書き換え不要）。相対 import は `app/` 内 `./` 2 件
（`./globals.css` 等、同階層移動のため維持）と `vitest.setup.ts` の `./__tests__/` のみ。

### 10.4 移行後の想定ルート構造

```text
DropMod/
├── src/                  # アプリコード（ここだけが「コード」）
│   ├── app/              # Next.js App Router（ルーティングのみ）
│   ├── components/       # ui / layout / feedback
│   ├── features/         # 11 ドメイン（catalog / dep-check / env-import / ...）
│   ├── hooks/
│   ├── lib/              # constants / db / env / modrinth / platform / query / state / utils
│   ├── types/
│   └── styles/           # fontawesome-subset.css
├── __tests__/            # ユニットテスト（src/ のミラー）
├── e2e/                  # Playwright E2E
├── scripts/              # ビルド・ツールスクリプト
├── public/               # 静的アセット（ルート必須）
├── docs/                 # ドキュメント
├── .agent/               # エージェント記憶
├── .archive/             # 旧 Vite 版アーカイブ（絶対不変）
├── AGENT.md / README.md
├── next.config.mjs / tsconfig.json / vitest.config.ts / playwright.config.ts / ...
```

## 11. リスク・Gotchas

- **`.test.` / `.spec.` のドットは残す**: Vitest の include パターン
  `'__tests__/**/*.test.{ts,tsx}'` と Playwright の `*.spec.ts` 検出はドット形式に
  依存している。ドットを完全廃止する案（`-test.ts` 等）はユーザー選択肢に含めたが、
  現状維持（対象名内のドットのみ排除）で合意済み。
- **coverage thresholds の glob は文字列**: `vitest.config.ts` 内の
  `'lib/state/**/*.ts'` 等は src/ プレフィックスを付けないと coverage が 0 になり
  threshold 失敗で `pnpm test:coverage` が落ちる。ORG-2 で**全 glob を漏れなく**更新する。
- **`@source not` は CSS からの相対パス**: `src/app/globals.css` からは 1 階層深くなる。
  忘れると旧 Vite のクラス名が dead CSS として本番 CSS に再流出する（UIP-5 の教訓）。
- **`src/app` とルート `app` の共存禁止**: 移動漏れがあると Next.js が静かに
  `src/app` を無視する。ORG-2 完了時にルートの `app` が存在しないことを確認する。
- **大量リネームの merge 競合**: リネームは 1 コミットずつ（ORG-1 内でも 論理単位で
  分割可）行い、各コミットで 4 検証を通す。未コミットのまま大量リネームしない。
- **`hash.worker.ts` → `hashWorker.ts`**: Vite/Next の worker 規約のドット形式だが、
  import は通常の named import のためリネーム可能。`new Worker(new URL(...))` の
  参照元で worker であることが分かるため、命名上の情報は失われない。
- **`.mjs` スクリプトも camelCase 化**: `build-fontawesome-subset.mjs` →
  `buildFontawesomeSubset.mjs`。package.json のスクリプト参照と layout.tsx のコメント
  参照も更新する（`build:fa-subset` コマンド名は変更しない）。
- **`.agent/logs/` は置換しない**: 過去ログに旧パスが残るのは正しい状態（§8.5）。
  本計画の実行ログは当日の新規ログに記録する。
- **E2E はローカル実行不可**: e2e spec のリネーム後の動作確認は CI の
  `workflow_dispatch` で行う（§6.2）。ローカルで実行を試みない。
- **バージョン番号をファイル名に入れない（2026-08-31 ユーザー指摘）**:
  `dexie.v4.test.ts` の camelCase 化として `dexieV4.test.ts` を当初案としたが、
  Dexie を v5 に昇格した際にまたリネームが必要になるため不適切。ファイル名は
  実装バージョンではなく**内容の役割**を表す汎用名にする
  （v3→v4 upgrade テスト → `dexieUpgrade.test.ts`）。バージョン固有の情報は
  describe 名・コメントに書く。

## 12. 実績と証拠 (実装後に記入)

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| ORG-1 | （未実装） | | |
| ORG-2 | （未実装） | | |
| ORG-3 | （未実装） | | |
