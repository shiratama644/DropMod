# COV-90: テストカバレッジ 90% 化 + テスト / E2E 強化

> 対応 task-list ID: `COV-1`〜`COV-5` (docs/task-list.md)
> 計画書テンプレート: docs/planning/_TEMPLATE.md 準拠

## 1. 開始前確認

- 現在のブランチ / HEAD / `git status` を確認する (未コミット変更があれば停止)
- `docs/task-list.md` で依存タスクの完了を確認する
- 関連仕様 (AGENT.md §6 / .agent/skills/testing.md / .agent/skills/sandbox-constraints.md) を読む
- 本計画書の §5 (完了条件) と §7 (停止条件) を再読する

## 2. 目的 (Why)

**「テストカバレッジ目標すべて 90% 以上」** を実現し、今後のリファクタリング (src/ 移行・
命名規則統一・機能追加) で発生した回帰を、単体テスト + E2E の両輪で確実に捕捉できる
状態にする。

現状 (2026-09-01 実測、`pnpm test:coverage`):

| 指標 | 現状 | 目標 | 差分 |
|---|---|---|---|
| statements | 87.96% | 90% | +2.04pt (107 stmt) |
| branches | 78.20% | 90% | +11.80pt (423 br) |
| functions | 92.39% | 90% | ✅ 達成済み |
| lines | 89.72% | 90% | +0.28pt (13 行) |

90% 未満ファイルは **150 中 94**。ただし内訳は:
- **0% の barrel re-export `index.ts` 11 件** — 純粋な re-export でテスト価値なし (exclude 対象)
- **0% の型定義 / Next.js 生成画像 6 件** — 同様に exclude 対象
  (`app/opengraph-image.tsx` / `twitter-image.tsx` / `[projectType]/[slug]/opengraph-image.tsx` /
  `twitter-image.tsx` / `lib/db/types.ts` / `modpack/api/providers/types.ts`)
- **0% のロジック 7 件** — テスト追加 or exclude 判断
  (loadDiscoverSearch / projectDetail / siteUrl / hashWorker / sync db / sync sink / JsonLd)
- **90% 未満のロジック / コンポーネント ~70 件** — unit test 追加 (branches 優先)

さらに、2026-09-01 の UI 変更 (選択中一覧の削除ロジック 3 配列横断化・ギャラリー
タップ/スワイプ・バージョンフィルタ・discover スケルトン等) は E2E で未検証のまま
CI green になったため、**重要フローの E2E を追加して動作保証を固める**。

## 3. 変更範囲 (Scope)

変更対象:
- `vitest.config.ts` (coverage include / exclude / thresholds)
- `__tests__/**` の新規・既存テスト
- `e2e/**` の新規 spec
- `docs/task-list.md` / 本計画書 (進捗・証拠の記録)
- テスト容易性のための**最小限**のコード修正 (テスト可能な形への分離に留める)

変更しない (境界外):
- UI の見た目・機能そのもの (テスト対象として触るだけで、挙動は変えない)
- `src/app/**/page.tsx` / `layout.tsx` / `route.ts` 等の Server Components の exclude 方針
  (RSC 統合は E2E 担保の現行方針を維持)
- 大型 orchestrator Client Components (AppShell / HomeInteractive / ModsPageClient /
  ModDetailModalShell / ModDetailPageView / SettingsPageClient) の exclude 方針
  (単体テスト ROI 低・E2E 担保。ただし各々が依存するロジック層は COV-2/3 で厚くする)
- coverage threshold を「下げて」green にすること (禁止事項)

## 4. 禁止事項

- **テストを通すためだけに期待値を実装へ合わせない** / 実装をテストに合わせて
  弱めない (assertion の削除・threshold の引き下げ)
- **exclude の乱用** — テスト価値があるロジックを「楽だから」exclude しない。
  exclude に追加するのは barrel re-export / 純粋な型定義 / Next.js 生成ファイル /
  既存方針で E2E 担保と明記済みのもののみ
- 無関係なリファクタリング・デザイン変更を混ぜない
- `test:coverage` 実行が CI で遅延する場合の最適化 (並列化等) は、数値に影響が
  ないことを確認してから
- 不明点は推測で埋めず、§7 の停止条件に従って質問する

## 5. 完了条件 (DoD)

- [ ] `vitest.config.ts` のグローバル thresholds が **statements / branches / functions / lines すべて 90**
- [ ] `pnpm test:coverage` が **exit 0** (threshold 全 pass) で、実測値を記録
- [ ] 90% 未満ファイルが、テスト価値のない exclude 対象を除いて **0 件** になる
      (判定: `coverage/coverage-summary.json` をパース)
- [ ] 新規 E2E spec (COV-4) が既存 65 passed を維持した上で CI green
- [ ] 4 検証 (`pnpm typecheck` / `pnpm lint` / `pnpm test:unit` / `pnpm build`) 全 pass
- [ ] `docs/task-list.md` の状態・進捗・証拠を更新
- [ ] `.archive/vite/` 無変更

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | 実施 | 各ファイルの 4 指標 (st/br/fn/ln) が 90% 以上。`test:coverage` の json-summary で実測 |
| Component (testing-library) | 実施 | BottomSheet / ModCard / ScreenshotGalleryModal 等の UI 状態遷移 |
| E2E (Playwright / CI) | 実施 | COV-4 の新規 spec。**ローカル実行は不可** (chromium バイナリ取得不可) のため CI (workflow_dispatch) で検証 |
| 実環境 (実機・本番 build) | 実施しない | 今回の変更はテストのみ・挙動変更なし。実機検証は不要 |

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:
- 仕様書 (計画書・AGENT.md・skills) 同士に矛盾がある
- task-list.md 記載の変更範囲を超える変更が必要
- 破壊的変更 (既存データ・公開 API 互換性) が必要
- ユーザー判断が必要な設計論点に到達した (例: 「per-file 90%」を全ファイルに
  要求するのか、グローバル 90% + per-module 90% なのかの解釈)
- 開始時点で作業ツリーに未確認の変更がある

## 8. 完了時に行うこと

1. 差分を自己レビュー (対象外の変更が混ざっていないか)
2. 4 検証 (typecheck / lint / test:unit / build) を実行
3. `pnpm test:coverage` を実行し実測値を記録
4. `docs/task-list.md` の状態・進捗・証拠を更新
5. タスク ID を含むコミット (例: `feat(COV-2): …`) を作成
6. 証拠中心の完了報告 (結果 / テスト件数 / Git SHA / 残事項)

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 |
|---|---|---|---|
| COV-1 | coverage 境界の適正化 | `vitest.config.ts` の exclude 見直し + 全体数値の再計測 | - |
| COV-2 | ロジック層 unit test | `__tests__/` に server API / lib/env / lib/platform / lib/modrinth / sync / profiles 系のテスト追加 | COV-1 |
| COV-3 | コンポーネント層 unit test | BottomSheet / ModCard / ScreenshotGalleryModal / その他 90% 未満コンポーネント | COV-1 |
| COV-4 | E2E 追加 | 選択中一覧の削除/全削除・ギャラリータップ/スワイプ・バージョンフィルタ・discover スケルトン等の spec | COV-2/3 |
| COV-5 | thresholds 90% 化 + 最終確認 | `vitest.config.ts` thresholds 90 + CI 全 green | COV-2/3/4 |

## 10. 設計詳細・仕様

### 10.1 COV-1: coverage 境界の適正化

現状の include は `src/**` 全体で、以下の「テスト価値なし」が分母に含まれる:

**exclude に追加する候補 (テスト価値なし):**
- `src/features/*/index.ts` — barrel re-export のみ (11 件)
- `src/types/**` — 既に exclude 済み (`src/types/**` は include 側に書かれているが
  exclude にも `'src/types/**'` がある。実測で 0% の `lib/db/types.ts` と
  `features/modpack/api/providers/types.ts` が残っている → `**/types.ts` パターンで
  純粋な型定義ファイルを除外)
- `src/app/**/opengraph-image.tsx` / `twitter-image.tsx` — Next.js が動的画像生成
  (該当 4 ファイル: `src/app/opengraph-image.tsx` / `twitter-image.tsx` /
  `src/app/[projectType]/[slug]/opengraph-image.tsx` / `twitter-image.tsx`)。
  単体テストは Next.js 内部に依存しすぎる
- 既存 exclude コメント群 (AppShell 等 6 件の大型 orchestrator / presentational 6 件 /
  Providers / WebVitalsReporter / shim hooks / lib/query/client / download / constants)
  は**現行方針を維持** (E2E 担保と明記)

**テスト追加 or exclude の判断が必要な 0% ロジック:**
- `src/features/catalog/api/loadDiscoverSearch.ts` — fetch モックでテスト可能 → COV-2 で追加
- `src/features/project/api/projectDetail.ts` — fetch モックでテスト可能 → COV-2 で追加
- `src/features/seo/components/JsonLd.tsx` — 純粋な script タグ描画 (JSON-LD)。render テスト可能 → COV-3 で追加
- `src/lib/platform/siteUrl.ts` — env / headers 依存。テスト可能なら COV-2、難しければ exclude
- `src/lib/env/hashWorker.ts` — Web Worker 本体。`computeHashes` 経由の統合テストで担保
  (worker 生成は jsdom 不可のため、computeHashes の fallback 分岐をテスト) 
- `src/features/sync/services/db.ts` / `sink.ts` — re-export barrel に近い → 中身を確認して判断

### 10.2 COV-2: ロジック層の unit test 追加 (branches 優先)

branches が 90% 未満のロジックファイル (実測 2026-09-01) のうち、優先度の高い順:

| ファイル | branches | 対策 |
|---|---|---|
| `lib/env/computeHashes.ts` | 10.0 | Worker 生成失敗→メインスレッド fallback 分岐をテスト |
| `features/profiles/hooks/useProfiles.ts` | 57.6 | handleToggleMod の追加/削除/重複/エラー分岐 (3 配列横断化後) |
| `features/modpack/hooks/useModpackAdd.ts` | 54.8 | plan 生成 / 競合 / キャンセル分岐 |
| `features/zip/hooks/useZipImport.ts` | 60.8 | Import 成功/失敗/進行分岐 |
| `features/sync/services/backup.ts` | 67.3 | Backup load/save / 失われた backup 分岐 |
| `features/env-import/services/analyzer.ts` | 72.2 | 照合成功/失敗/unknownFiles 分岐 |
| `lib/modrinth/client.ts` | 73.3 | レート制限 / エラー分岐 |
| `lib/modrinth/server.ts` | 77.2 | fetch 失敗フォールバック分岐 |
| `features/sync/hooks/useSync.ts` ほか sync hooks | 78.7 | prepare 各 outcome 分岐 |
| `features/profiles/store/store.ts` | 84.3 | 既存 threshold 85 を 90 に引き上げる分の追加 |

※ テスト追加は各関数の公開 API 経由 (React コンポーネントを render せず hooks の
戻り値を検証する形) で行う。既存テストパターン (`__tests__/features/profiles/store/` 等) を踏襲。

### 10.3 COV-3: コンポーネント層の unit test 追加

| ファイル | branches | 対策 |
|---|---|---|
| `components/ui/BottomSheet.tsx` | 43.8 | open/close / アニメ完了コールバック / 高さクラス分岐 |
| `features/project/components/ScreenshotGalleryModal.tsx` | 57.5 | スワイプ (ポインターイベント) / キーボード / サムネイル / 高さプローブ (2026-09-01 に大きく変更したため要テスト) |
| `features/catalog/components/ModCard.tsx` | 78.8 (fn 66.7) | 追加/削除トグル / レイアウト 3 種 / 画像なし分岐 (functions が最低) |
| `features/profiles/components/NewProfileModal/*` | FolderImportSection 62.5 / index 77.1 / AnalysisSection 78.6 | フォルダ選択 / 解析 / 作成フロー分岐 (ORG-4 分割後) |
| `components/ui/CustomDropdown.tsx` | 71.4 | 開閉 / 選択 / キーボード |
| `features/seo/components/JsonLd.tsx` | 0 | JSON-LD script 描画 (型ごとの props 分岐) |

※ 大型 orchestrator (AppShell 等 6 件) は現行 exclude 維持。ただし E2E で
モーダル操作・Sync フローを追加して補完する (COV-4)。

**実績 (commit `667d25a`)**: フルスイート計測で 8 対象中 7 つが br 90% 以上
(ModCard 100 / FolderImportSection 100 / ScreenshotGalleryModal 96.55 / index 96.33 /
AnalysisSection 96.42 / CustomDropdown 93.75 / JsonLd・ProfileFormFields fn 100)。
**BottomSheet のみ 86.51%** — 残り 12 分岐はすべて到達不能な防御ガード
(ref null・`typeof window/document`・stopPropagation 後方・cancelled 先行 return 等。
fn は 32/32 = 100%) のため打ち切り。全体 **96.5 / 90.27 / 98.16 / 97.85** で
**branches 90% 到達**。詳細は `.agent/logs/2026-09-01_cov-3-component-tests.md`。

### 10.4 COV-4: E2E 追加

2026-09-01 の UI 変更に対する動作保証 (既存 65 passed を維持した上で追加):

| spec | 検証フロー |
|---|---|
| `profileMods.spec.ts` (新規) | 選択中一覧で チェックボックス選択 → 削除 / 全削除 ボタン → 項目が消える (Mods + Resource Packs + Shaders タブ) |
| `modDetailGallery.spec.ts` (新規) | 詳細ページでギャラリー画像タップ → モーダルがその画像から開く / スワイプ (pointer イベント注入) で前後移動 / 高さが一定 |
| `versionFilter.spec.ts` (新規 or 統合) | 詳細ページの対応バージョン一覧がプロファイル環境 (MC/ローダー) に一致するもののみ表示される |
| `discoverSkeleton.spec.ts` (新規) | /discover/mods でスケルトン → 結果表示への遷移 (route 遅延モック) |
| `folderImportCopy.spec.ts` (新規 or 統合) | フォルダ選択モーダルの文言更新 (「などを選ぶと…」「解析結果」) が表示される |

※ E2E は実 Modrinth API / CDN に依存する既存 spec のパターン (installModrinthApiMock /
page.route) を踏襲する。CI (workflow_dispatch) で検証。ローカルは chromium バイナリが
取得できないため不可。

**実績 (commit `44a90c4` + `9527e46`)**: 5 spec 追加後、CI (workflow_dispatch run
`33469737443`) で **Type/Lint/Unit・Build・E2E すべて green**。初回 run (`33467761928`)
の失敗 3 件 (profileMods ×2 は DesktopTable/MobileList 同名 aria-label の strict mode
violation → `:visible` で絞る / folderImportCopy は環境行を既存 spec と同一の文字列一致
+ DIAG 出力に変更) を修正して全 green。詳細は
`.agent/logs/2026-09-01_cov-4-e2e.md`。

### 10.5 COV-5: thresholds 90% 化

- グローバル: `statements: 90, branches: 90, functions: 90, lines: 90`
  (現状 60/60/60/60)
- per-module は 90 未満のものを 90 に引き上げ、90 以上のものは現状維持:

| 現行 glob | 現行 thresholds | 対応 |
|---|---|---|
| `src/lib/state/**/*.ts` | 95/90/95/95 | 現状維持 (90 超) |
| profiles/zip 各 store・feedback *Store・uiState・appActions (7 glob) | 85/80/90/85 | **90/90/90/90 に引き上げ** |
| `src/lib/db/**/*.ts` | 75/70/75/75 | **90/90/90/90 に引き上げ** |
| `src/lib/query/**/*.ts` | 70/60/70/70 | **90/90/90/90 に引き上げ** |
| `src/lib/modrinth/**/*.ts` | 65/55/65/65 | **90/90/90/90 に引き上げ** |
| `src/lib/utils/**/*.ts` | 60/60/60/60 | **90/90/90/90 に引き上げ** |
| `src/hooks/**/*.ts` | 70/60/70/70 | **90/90/90/90 に引き上げ** |
| `src/components/**/*.tsx` | 50/45/50/50 | **90/90/90/90 に引き上げ** |

- CI の Type / Lint / Unit ジョブで `pnpm test:coverage` を実行するかは現行ワークフローを確認して判断

**実績 (commit `95e2c4a`)**: グローバル thresholds を 90/90/90/90 に引き上げ、
per-module も 90 未満を 90/90/90/90 に統一 (lib/state は 95/90/95/95 維持)。
90% 化に失敗していた 2 glob (lib/query br 86.21 / hooks br 87.32) はテスト追加 +
デッドコード除去 (hooks.ts の `?? 0`) で解消。フルスイート **96.56 / 90.52 / 98.26 /
97.85** (st/br/fn/ln)、123 files / 1603 tests、`pnpm test:coverage` **exit 0**。
残存の未カバー分岐はすべて到達不能ガード (useModalA11y の 5 分岐等)。詳細は
`.agent/logs/2026-09-01_cov-5-thresholds.md`。

## 11. リスク・Gotchas

- **branches が最も遠い** (+11.8pt)。分岐の多い hooks (useProfiles / useModpackAdd /
  useZipImport) の網羅はテスト数が膨れやすい。**1 関数ずつ** 進め、途中で
  json-summary を確認しながら進める
- `test:coverage` は ~2.5 分かかる。都度実行せず、対象ファイルの unit test は
  `vitest run <file>` で回し、区切りで `test:coverage` を実行する
- ScreenshotGalleryModal の pointer イベント (スワイプ) は jsdom で
  PointerEvent の clientX を注入して検証する。既存テストに同パターンが
  あれば踏襲、無ければ最小の dispatchEvent ヘルパーをテスト側に用意する
- hashWorker / siteUrl は環境依存が強く、テスト不能なら **exclude の正当な理由を
  コメントで残して** 除外する (禁止事項の「exclude の乱用」に該当しないよう明文化)
- CI で E2E が増えると実行時間が伸びる (現状 55.5s → 新規 5 spec で +30s 程度)。
  ワークフローのタイムアウトを確認
- ローカル E2E は実行不可 (chromium 取得不可)。E2E spec は必ず CI で検証し、
  push 前に typecheck / lint / build / test:coverage で静的整合を確認する

## 12. 実績と証拠 (実装後に記入)

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| COV-1 | `6abdddf` | 117 files / 1266 tests pass + `test:coverage` exit 0 | exclude 21 件追加 (barrel 11 / types.ts 3 / Next.js 生成画像 4 / hashWorker・sync db・sync sink 3。理由コメント付き)。0% ファイル 24→4 件 (残り = loadDiscoverSearch / projectDetail / JsonLd / siteUrl → COV-2/3)。全体 **88.56 / 78.55 / 92.64 / 90.41** (st/br/fn/ln、lines 90% 達成)。branches は COV-2/3 で 90% へ |
| COV-2 | `015c6d1` + `e561f72` + `1a38bf4` | 1481 tests pass + `test:coverage` exit 0 | **完了**。§10.2 の全 10 対象が branches 90% 以上: 上位 4 件 + 0% ロジック 3 件 (siteUrl / loadDiscoverSearch / projectDetail / computeHashes / hashCore / useModpackAdd / useZipImport / useProfiles) に加え、backup / analyzer / server **100/100/100/100**、client **100/95.53/100/100**、useSync **100/97.87/100/100**、useSyncHistory **98/90.9/100/97.87**、profiles store **100/95.74/100/100** (残り分岐は到達不能ガード: client の `err.message` falsy・direct 429 の proxy 側・`?? new Map()` 等)。全体 **93.41 / 86.47 / 95.42 / 94.9** (st/br/fn/ln、COV-1 比 br +7.9pt)。branches 86.47% は COV-3/4/5 で 90% へ |
| COV-3 | `667d25a` | 122 files / 1590 tests pass + `test:coverage` exit 0 | **完了**。§10.3 の対象 9 件にテスト追加 (ログ: `.agent/logs/2026-09-01_cov-3-component-tests.md`)。フルスイート計測で ModCard・FolderImportSection br **100**、ScreenshotGalleryModal **96.55** / NewProfileModal index **96.33** / AnalysisSection **96.42** / CustomDropdown **93.75** (fn 25/26、残 1 は ref null guard)、JsonLd・ProfileFormFields fn **100**。**BottomSheet のみ br 86.51** (残 12 分岐はすべて到達不能ガード: ref null・SSR `typeof window/document`・stopPropagation 後方・cancelled 先行 return。fn 32/32)。全体 **96.5 / 90.27 / 98.16 / 97.85** → **branches 90% 到達** |
| COV-4 | `44a90c4` + `9527e46` | CI (workflow_dispatch `33469737443`) で Type/Lint/Unit・Build・**E2E 全 green** | **完了**。§10.4 の 5 spec 追加 (profileMods / modDetailGallery / versionFilter / discoverSkeleton / folderImportCopy。ログ: `.agent/logs/2026-09-01_cov-4-e2e.md`)。初回 run の失敗 3 件を修正 (profileMods: DesktopTable/MobileList 同名 aria-label → `:visible` で絞る。folderImportCopy: 環境行を既存 spec と同一の文字列一致 + DIAG 出力)。既存 65 passed を維持し E2E green |
| COV-5 | `95e2c4a` | 123 files / 1603 tests pass + `test:coverage` exit 0 (thresholds 90%) | **完了**。グローバル thresholds 90/90/90/90 + per-module 統一 (lib/state 95/90/95/95 維持)。90% 未達だった lib/query (br 86.21)・hooks (br 87.32) はテスト追加 (hooks 3 / useModalA11y 5 / useMediaQuery 5) + `?? 0` デッドコード除去で解消。全体 **96.56 / 90.52 / 98.26 / 97.85**。残存分岐は到達不能ガード (ログ: `.agent/logs/2026-09-01_cov-5-thresholds.md`) |
| COV-4 | | | |
| COV-5 | | | |
