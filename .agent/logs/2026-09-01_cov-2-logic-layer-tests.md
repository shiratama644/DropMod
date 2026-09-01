# COV-2: ロジック層 unit test 追加 (第 1 弾)

> Date: 2026-09-01(JST) / Commit: `015c6d1` + `e561f72` / Branch: `arena/01a0533e-dropmod`

## 1. 指示内容 (Task Summary)

「テストカバレッジ目標すべて 90% 以上」計画（`docs/planning/COVERAGE_90_PLAN.md`、
COV-1〜5）の **COV-2（ロジック層 unit test、branches 優先）**。計画 §10.2 の優先度
上位 4 件（computeHashes / useProfiles / useModpackAdd / useZipImport）+ §10.1 の
0% ロジック 3 件（loadDiscoverSearch / projectDetail / siteUrl）+ hashCore を対象に
テストを追加し、各ファイルの 4 指標を 90% 以上にする。

## 2. 実行内容 (Executed Actions)

| # | 内容 | 結果 |
|---|---|---|
| 1 | siteUrl.ts / loadDiscoverSearch.ts / projectDetail.ts / computeHashes.ts のテスト追加 | `015c6d1` / 34 tests 全 PASS |
| 2 | hashCore.test.ts に Worker 成功 / ok:false / onerror / data 無し の 4 分岐テスト追加 | `015c6d1` / hashCore・computeHashes 100% |
| 3 | useModpackAdd.test.tsx を 3 → 26 tests に拡充 | `e561f72` / **100/100/100/100** |
| 4 | useZipImport.test.tsx を 16 → 31 tests に拡充 | `e561f72` / **99.18/98.66/100/100** (br のみ 98.66) |
| 5 | useProfiles.test.tsx を 17 → 95 tests に拡充 | `e561f72` / **99.69/96.74/98.64/100** |
| 6 | 到達不能デッドコードの除去 (useModpackAdd `if(!primaryFile)` / useZipImport 二重 `!mrpackFile` ガード / useProfiles 同様) | `e561f72` / 挙動不変 (files 空チェックは直上で return 済み) |
| 7 | typecheck / biome lint (0 warnings) / build / test:coverage (1413 tests) | 全 pass / exit 0 |

## 3. 実測値

| ファイル | st | br | fn | ln |
|---|---|---|---|---|
| lib/platform/siteUrl.ts | 100 | 100 | 100 | 100 |
| features/catalog/api/loadDiscoverSearch.ts | 100 | 100 | 100 | 100 |
| features/project/api/projectDetail.ts | 100 | 100 | 100 | 100 |
| lib/env/computeHashes.ts | 100 | 100 | 100 | 100 |
| lib/env/hashCore.ts | 100 | 100 | 100 | 100 |
| features/modpack/hooks/useModpackAdd.ts | 100 | 100 | 100 | 100 |
| features/zip/hooks/useZipImport.ts | 99.18 | 98.66 | 100 | 100 |
| features/profiles/hooks/useProfiles.ts | 99.69 | 96.74 | 98.64 | 100 |
| **全体 (1413 tests)** | **92.24** | **83.72** | **95.12** | **94.01** |

## 4. useProfiles の残り未カバー分岐 (いずれも到達不能コード)

- L63: SSR ガード (`typeof window === 'undefined'`) — jsdom では window 常に存在
- L227/231/232: `sanitizeLoadedState` が currentProfileId を正規化済みのため、hook 側の再検証は通らない
- L311: debounce cleanup の「タイマー未セット」分岐 — ref を null に戻す箇所が無く到達不能
- L637: 削除時 `remaining[0]` フォールバック — `length <= 1` ガードで必ず残る

## 5. 残事項 (COV-2 第 2 弾) — 完了 (commit `1a38bf4`)

- features/sync/services/backup.ts → **100** (InMemoryBackupStore を単一 Map に統合、デッドガード除去)
- features/env-import/services/analyzer.ts → **100** (contents Map 廃止・readableScanned に data 保持)
- lib/modrinth/server.ts → **100** (Retry-After 無効値/HTTP-date・role なし member・VITEST なし本番パス)
- lib/modrinth/client.ts → **95.53** (到達不能ガード 3 箇所除去 + ネットワークエラー/429 詳細/キャッシュ上限テスト)
- features/sync/hooks/useSync.ts → **97.87** / useSyncHistory.ts → **90.9** (失敗系・既定文言・対象外プロファイル保持)
- features/profiles/store/store.ts → **95.74** (find+map パターン化。残りは slug 重複判定の右辺)

全体 (1481 tests): **93.41 / 86.47 / 95.42 / 94.9** (st/br/fn/ln)。COV-2 完了。

## 6. 備考

- cookie テストは document.cookie の descriptor を prototype チェーンまで保存し
  finally で restore する方式に変更 (jsdom の cookie は自身プロパティでないことがある)
- 期限切れバックアップの debounce テストは、migrateFromLocalStorage が新規でも
  期限を未来に設定する仕様のため「hydrate 後に過去へ書換」する形で実装
