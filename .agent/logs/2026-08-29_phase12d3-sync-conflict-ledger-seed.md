# Phase 12-D3 / P12-D1B 実行ログ (2026-08-29)

## 1. タスク

- **P12-D3**: Sync Preview の競合 (D-3) 検出・適用 (計画書 §10.4)
- **P12-D1B**: 設定ページ「環境との同期」紐付け時の台帳 seed (計画書 §10.5)

ブランチ: `arena/01a04b59-dropmod` (セッション固定)

## 2. 実行内容 (Executed Actions)

### P12-D3-A: 検出側

- `types.ts`: `ModpackLockedVersion` を
  `versionId / versionNumber / fileUrl / filename / sha1 / size / path` に拡張。
  `ModrinthVersionFile.hashes?` (sha1/sha512) 追加。
- `lib/env/mrpack.ts`: `expandMrpackFiles` が artifact を設定
  (`f.hashes.sha1` / `primaryFile.hashes.sha1` から sha1、path/size は files[].path/fileSize)。
  `modpackLocksFromItems` が fileUrl / filename / sha1 / size / path も出力。
- `lib/env/diff.ts`: `SyncEntryKind` に `'conflict'` /
  `SyncPlan.conflicts: SyncConflictEntry[]` / `totals.counts.conflict` を追加。
  判定: `lock.versionId` 無 → 非競合 / `item.versionId === lock.versionId` → 非競合 /
  それ以外 → 競合。mods / resourcepacks / shaderpacks 横断。
- `lib/env/syncPrep.ts` (and `zipSync.ts`): ready outcome に
  `localEntries` / `managed` を追加 (replace 選択後の plan 再計算用・再スキャンしない)。

### P12-D3-B: UI・適用側

- `lib/env/modpackAdd.ts`: `applyLockedVersionsToProfile(profile, choices)` (pure)。
  replace 対象をロック実体 (versionId / versionNumber / fileUrl / filename /
  artifact.sha1/path/size) で復元。3 項目揃わないときは artifact を維持。
  keep は不変・ロック無き projectId は変更しない (安全側)。
- `hooks/useSync.ts` 拡張: `apply(excludedDeletionPaths, conflictChoices)`。
  replace あり → 更新後 Profile で `computeSyncPlan` 再計算 → `applySync` →
  **completed のときだけ** Zustand の Profile へ反映 (rolled-back / aborted は不変)。
- `components/SyncPreviewModal.tsx`: 競合セクションを「更新」の直下に追加。
  項目ごとに「ユーザー版を残す」(既定) /「Modpack 版に置換」の select。
  `onApply(excluded, conflictChoices)` に変更。
- `components/SyncButton.tsx`: onApply の第 2 引数を受け渡し。

### P12-D1B: 紐付け時台帳 seed

- `hooks/useEnvironmentLink.ts`: `link()` 成功後、
  `expandProfileToManaged` + `mergeManagedRecords` (source/managedAt/syncedAt 保護)
  + `syncManagedFiles` を実行。失敗は toast warning のみ (紐付けは成功扱い = 安全側)。

### テスト

- diff.test: 競合検出 5 件 (一致/ロック無/実体込み/カテゴリ横断/versionId 無)
- modpackAdd.test: applyLockedVersionsToProfile 4 件
- useSync.test: replace replan / completed 反映 / rolled-back 不変 / keep 不変 4 件
- SyncPreviewModal.test: 競合 UI 4 件 (既定 keep / replace / 複数独立 / 0 件でも見出し)
- useEnvironmentLink.test: 台帳 seed 3 件 (success / artifact 無し / seed 失敗 warning)
- syncPrep.test: ready の localEntries / managed 検証

## 3. 検証結果

| 検証 | 結果 |
|---|---|
| pnpm typecheck | pass |
| pnpm exec biome lint . | pass |
| pnpm test:unit | 111 files / **1216 passed** (1196 → 1216) |
| pnpm build | exit 0 |
| .archive/vite/ | 変更なし |

## 4. 知見 (Insights)

- **TS の union 型 narrow は map コールバック内で効かない。** Section 型を
  union にして `section.key === 'conflicts'` で分岐すると、`entries.map` の
  コールバック内では section が narrow されない。→ Section に
  `conflicts?: SyncConflictEntry[]` の別フィールドを持たせる形にした。
- **トップレベル describe には外側 describe の beforeEach が適用されない。**
  useSync.test のネスト describe を外側の閉じ括弧の後に置いたため、
  `vi.clearAllMocks()` が効かず呼び出し履歴が前テストから残った。
- **replace 後の plan 再計算では conflicts は 0 になる** (versionId が一致に戻るため)。
  conflicts セクションは「検出 → 選択 → 適用」の一巡で解消される。
- `useEffect(() => setChoices(new Map()), [plan])` は Biome の
  useExhaustiveDependencies で「本文で未使用の dep」エラーになる。
  モーダルは開くたび再マウントされる (SyncButton が prepared を null にする) ため
  リセット effect 自体が不要だった。

## 5. コミット

- `df13972` — P12-D3 + P12-D1B 実装 (25 files)
- `560244f` — docs/task-list に完了記録 (df13972)

## 6. 次のアクション

- **push**: `git push origin arena/01a04b59-dropmod` — 現在 GH_TOKEN 無効で認証失敗。
  Arena 側で GitHub 接続の再設定が必要。再接続後に push する。
- (任意) 実機 Chromium での確認: フォルダ選択 → Sync プレビュー → 競合選択 →
  適用 → 完了後に Profile がロック版へ更新されること。
