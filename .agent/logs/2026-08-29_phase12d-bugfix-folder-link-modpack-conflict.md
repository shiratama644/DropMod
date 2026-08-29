# Phase 12-D: ユーザー報告バグ 3 件修正 — フォルダ自動紐付け + Modpack 内容展開/競合解決

> Date: 2026-08-29(JST) / Commit: `1709704`, `ac26e29` / Branch: `arena/01a04b59-dropmod`

## 1. 指示内容 (Task Summary)

ユーザー報告の 3 バグ修正:
1. 新規プロファイル作成モーダルでフォルダ選択してもボタンが Sync に変わらない
2. そのボタンを押すと ZIP 保存されるだけ
3. Discover から Modpack を追加しても、プロファイルに元々ある Sodium と
   Modpack 内の別バージョンが競合するはずが競合しない

`ask_user` で確定済みの方針:
- フォルダ選択入口 = 新規プロファイル作成モーダル / Import 時に**自動で**
  `linkedSource` + `dirHandles` に紐付け (read モード、書込権限は Sync 実行時 = D-7)
- 競合解決 UI = 「両方」の予定だったが、**Sync 側 (D-3) は別タスク**に変更 (ユーザー再回答)。
  データ構造「導入時の指定バージョン (ロック情報)」のみ先行して仕込む。
- Discover 追加時は `modpackSource.projectId` / `versionId` を**設定する** (本体更新検知のため)

## 2. 実行内容 (Executed Actions)

### P12-D1 (`1709704`): フォルダ自動紐付け (bug 1/2)

- `lib/env/link.ts`: `linkPickedDirectory(profileId, picked, detected)` 追加
  (NewProfileModal の解析済み環境を再利用し `detectEnvironment` を二重実行しない)
- `hooks/useProfiles.ts`: `handleCreateProfile` を async 化し 8 番目引数 `link` を受領。
  紐付け時に §10.5 の artifact 台帳 seed (`expandProfileToManaged` + `mergeManagedRecords`
  + `syncManagedFiles`) を実施。保存失敗時はプロファイルを作らない (中途半端な紐付け防止)
- `components/NewProfileModal.tsx`: 解析成功時のみ `pickedFolder` を保持し onCreate へ
- `lib/store/appActions.ts`: `AppActions.handleCreateProfile` 型更新
- テスト: link.test (linkPickedDirectory) / useProfiles.test (link 付き作成
  → linkedSource + dirHandles + 台帳 seed) / NewProfileModal.folderImport.test (link 引数)

### P12-D2 (`ac26e29`): Modpack 中身展開 + インポート時競合解決 (bug 3)

- `lib/env/mrpack.ts`: `expandMrpackFiles(index, deps?)` を追加 (useZipImport 内の
  files[] → ProjectItem[] マッピングを抽出・共有。deps 注入でテスト可能) /
  `modpackLocksFromItems` (D-3 ロック情報)
- `hooks/useZipImport.ts`: 抽出関数へリファクタ + `lockedVersions` 記録 (挙動同一)
- `lib/env/modpackAdd.ts`: `buildModpackAddPlan` (競合検出) / `applyModpackAddPlan`
  (keep 既定 / replace 置換 / カテゴリ別マージ / modpackSource + locks)
- `hooks/useModpackAdd.ts`: .mrpack DL → JSZip 解析 → 競合 → 適用。
  overrides は source:'modpack' で**既存台帳とマージ** (syncManagedFiles は差分同期のため全量)
- `components/ModpackImportModal.tsx`: 競合一覧 + ユーザー版/Modpack 版 (既定=ユーザー版)
- `ModDetailModalShell` / `ModDetailPageView`: project_type === 'modpack' を専用フローへ分岐。
  導入済みは modpackSource でも判定し「導入済み」ボタン (削除 = D-6 はハブ担当)
- `types.ts`: `ModpackSource.lockedVersions` 追加
- テスト: mrpack (expand/locks) / modpackAdd (9 tests) / ModpackImportModal (4 tests) /
  useModpackAdd (3 tests) / useZipImport 回帰 (16 tests)

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **Modpack は mods[] に入れない。** 従来の `handleToggleMod` は .mrpack を
  ProjectItem (type:'mod') として追加するため、Sync が .mrpack を mods/ に
  ダウンロードしてしまう。Modpack は `modpackSource` + 展開後の files[] で持つ。
- **fake-indexeddb は構造化クローンで prototype を落とす** — 保存したハンドルの
  `toBe(picked.handle)` identity 検証は不可能。既存 link.test 同様 name で検証する。
- **`syncManagedFiles` は部分配列を渡すと既存台帳を消す** (差分同期)。
  既存 Profile への overrides 追加は `getManagedFiles` + 新規レコードの**全量**を渡す。
- **Biome の useExhaustiveDependencies は「dep にあるのに本文で未使用」も警告する。**
  リセット用 effect は `if (plan) setChoices(...)` のように本文で plan を参照する。
- D-3 ロック情報 (`lockedVersions`) は keep を選んだ項目も「導入時の指定」として
  記録する — Sync 側 (P12-D3) は「導入時の指定」と「Profile の現在値」を比較するため。
- 競合モーダルは詳細モーダル (z-70) の**内側**に置くが、position: fixed + z-60 の
  子要素は親のスタッキングコンテキスト内でカードより上に描画される (z-60 → 有効)。

## 4. 次にすべきこと (Next Actions)

- **P12-D3**: Sync Preview の競合 (D-3) 検出・適用。`lockedVersions` (導入時の指定) と
  Profile の現在値を突き合わせ、`SyncPreviewModal` に競合セクションを追加。
  適用時は P12-D2 と同じ「ユーザー版 / Modpack 版」選択 + 既定 = ユーザー版。
  実機 Chromium での確認 (フォルダ選択 → Sync ボタン → 差分 → 競合選択)。
- Docs 原文どおり、Modpack ハブの「更新を確認」は報告のみ。D-3 適用フロー実装時に
  `ModpackHubClient` の文言と整合を取る。
- `expandProfileToManaged` が P12-D1 で初めて呼び出された
  (それまで定義のみ・未使用)。設定ページの「紐付け」(`useEnvironmentLink`) 経路では
  まだ台帳 seed されない点は既知 (次タスク候補)。
