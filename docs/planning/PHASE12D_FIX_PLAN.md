# Phase 12-D: ユーザー報告バグ 3 件修正 — フォルダ自動紐付け + Modpack 内容展開/競合解決

> 対応 task-list ID: `P12-D1` 〜 `P12-D3` (docs/task-list.md)
> 計画書テンプレート: docs/planning/_TEMPLATE.md 準拠
> 状態: 実装中 (2026-08-29 作成)

## 1. 開始前確認

- ブランチ / HEAD / `git status` clean を確認 (未コミット変更があれば停止)
- 関連仕様: `PHASE12_PLAN.md` §10.5・§12 (D-3, D-7, D-8) / AGENT.md §5〜§7
- 本計画書の §5 (完了条件) と §7 (停止条件) を再読

## 2. 目的 (Why)

ユーザー報告の 3 バグ:

1. 新規プロファイル作成モーダルでフォルダを選択してもボタンが Sync に変わらない
2. そのボタンを押すと ZIP 保存されるだけ (ファイルは書き込まれない)
3. Discover から Modpack を追加しても、プロファイルに元々ある Mod
   (例: Sodium) と Modpack 内の別バージョンが競合するはずなのに警告されない

**原因 (調査確定)**:

- 1/2: フォルダ選択の入口は 2 つある。ユーザーが使う「新規プロファイル作成モーダル」
  (`NewProfileModal.handlePickFolder`) は Import 専用で `linkedSource`/`dirHandles` を
  一切保存しない。D-8 のボタン置換は `Profile.linkedSource` の有無
  (`hooks/useFolderLinked.ts`) で判定するため、ZIP 保存ボタンのまま。
- 3: (a) D-3 (Sync Preview の競合セクション) はまだ未実装。
  (b) さらに Discover からの Modpack 追加 (`ModDetailModalShell.handleProfileToggle` →
  `handleToggleMod`) は Modpack **を projectId トグルの 1 アイテムとして mods[] に入れる
  だけ**で、modrinth.index.json の files[] (= 中身の Mod) を一切展開しない。
  したがって Sodium の projectId が Profile に現れず、競合の判定自体が不可能。

**2026-08-29 ユーザー確定 (ask_user)**:

- フォルダ選択の入口 = 新規プロファイル作成モーダル
- Import 時に選んだフォルダを **自動で linkedSource + dirHandles に紐付け**
  (read モードのまま、書込権限は Sync 実行時 = D-7 維持)
- 競合解決 UI = **「両方」(インポート時 + Sync Preview)** の予定だったが、
  Sync 側は以下に変更:
  - **今回のスコープはインポート時まで**。Sync Preview の D-3 検出・適用は
    **別タスク (P12-D3)** とする。
  - ただし **データ構造「導入時の指定バージョン (ロック情報)」のみ先行して仕込む**。
    (`ModpackSource.lockedVersions` — P12-D3 が「Profile の現在値」と「導入時の指定」を
    突き合わせて競合を検出するための基準)
- 補足コメント (ユーザー): 「discoverからModpackを入れた。プロファイルに元々ある
  Sodium も Modpack に入っているので競合するはずが競合しなかった。つまり Modpack の
  中身を解析するシステムがない」
- `modpackSource.projectId` / `versionId` は Discover 追加時に**設定する** (Modpack 本体の
  更新検知が可能になる)。(ask_user 2 問目 = 「設定する(推奨)」)

## 3. 変更範囲 (Scope)

### P12-D1 (bug 1/2)

変更対象:
- `lib/env/link.ts` — `linkPickedDirectory(profileId, picked, detected)` 追加
  (saveDirHandle + buildLinkedSource の合成)
- `components/NewProfileModal.tsx` — 選択 handle を state 保持、onCreate へ渡す
- `hooks/useProfiles.ts` — `handleCreateProfile` に link 引数追加。紐付け時に
  §10.5 の artifact 台帳 seed (`expandProfileToManaged` + `mergeManagedRecords` +
  `syncManagedFiles`) も実施
- `lib/store/appActions.ts` — `AppActions.handleCreateProfile` の型更新
- テスト: `__tests__/lib/env/link.test.ts` / `__tests__/hooks/useProfiles.test.tsx` /
  `__tests__/components/NewProfileModal.folderImport.test.tsx`

### P12-D2 (bug 3)

変更対象:
- `types.ts` — `ModpackSource.lockedVersions` 追加 (`projectId → {versionId, versionNumber}`)
- `lib/env/mrpack.ts` — `expandMrpackFiles(zip, deps?)` を追加 (useZipImport 内の
  files[] → ProjectItem[] マッピングを抽出・共有。fetch は deps 注入可)
- `hooks/useZipImport.ts` — 抽出した `expandMrpackFiles` を使う + `lockedVersions` を記録
  (.mrpack Import でも構造を先行保持)
- `lib/env/modpackAdd.ts` (新規) — `buildModpackAddPlan` (競合検出, pure) /
  `applyModpackAddPlan` (選択結果の Profile 反映 + ロック情報, pure)
- `hooks/useModpackAdd.ts` (新規) — .mrpack ダウンロード→解析→plan→(競合時)モーダル→
  適用。overrides は source:'modpack' で既存台帳にマージ
- `components/ModpackImportModal.tsx` (新規) — 競合一覧 + 「ユーザー版を残す」/
  「Modpack 版に置換」(既定 = ユーザー版, D-3)
- `components/ModDetailModalShell.tsx` / `components/ModDetailPageView.tsx` —
  project_type === 'modpack' の追加ボタンを専用フローへ分岐。導入済み判定に
  `modpackSource.projectId` を含める
- テスト: `__tests__/lib/env/modpackAdd.test.ts` / `__tests__/components/ModpackImportModal.test.tsx` /
  mrpack.test.ts 追記

### 変更しない (境界外)

- `components/SyncPreviewModal.tsx` / `lib/env/diff.ts` — **D-3 の Sync 側は P12-D3**
  (今回は一切触らない)
- `hooks/useEnvironmentLink.ts` / `EnvironmentSyncSection` — 設定ページの既存紐付けは不変
- `lib/env/link.ts` の `createFolderLink` (Settings 用) — 既存のまま
- CurseForge / `.archive/vite/` 不変

## 4. 禁止事項

- 推測で仕様を補完しない (D-3 Sync 側を今回実装しない / ロック情報の形式は §10 の決定)
- `useZipImport` の既存挙動 (テスト 12 件) を壊さない — 抽出は挙動同一のリファクタ
- 既存 Profile の `mods[]` に誤って Modpack (`.mrpack`) を ProjectItem として追加しない
  (現行不具合の再現) — Modpack は `modpackSource` + 展開後の files[] で持つ
- 競合で「Modpack 版に置換」しても**ローカルファイルへは書き込まない** (Sync は別工程)
- Modpack 追加時に profile の既存台帳 (ledger) を**全置換しない** — overrides はマージ
- 不明点は推測で埋めず、§7 の停止条件に従って質問する

## 5. 完了条件 (DoD)

- [ ] P12-D1: フォルダ選択 → 作成した Profile に `linkedSource` が入り、
      `dirHandles` に handle が永続化される (mode:'read' のまま / 昇格は Sync 実行時)
- [ ] P12-D1: 紐付け済み Profile では既存 D-8 ロジックにより Sync ボタンに置換される
      (NewProfileModal 経由で作成しても `useFolderLinked()` が true)
- [ ] P12-D1: 作成時に §10.5 の artifact 台帳 seed が走る (`expandProfileToManaged` +
      既存レコードの source/managedAt は merge で引き継ぐ)
- [ ] P12-D2: Discover から Modpack 追加で modrinth.index.json files[] が ProjectItem 展開され、
      `profile.mods[]`(= 又は resourcepacks/shaderpacks) に入る (`.mrpack` 自体は入らない)
- [ ] P12-D2: 同一 projectId・別バージョンの競合がある場合のみ競合解決モーダルが出て、
      既定 = ユーザー版保持。競合なしなら即追加
- [ ] P12-D2: `modpackSource` に provider/projectId/slug/versionId/versionNumber/
      lockedVersions が入る。overrides は台帳へ source:'modpack' でマージ
- [ ] P12-D2: `.mrpack` (ZIP) Import にも `lockedVersions` が入る (構造の先行確保)
- [ ] P12-D3 は**対象外**であることを task-list に明記 (Sync 側は未実装のまま)
- [ ] 4 検証 (typecheck / biome lint / test:unit / build) 全 pass
- [ ] `docs/task-list.md` の状態・進捗・証拠を更新
- [ ] `.archive/vite/` 無変更

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | 必須 | `linkPickedDirectory` / `expandMrpackFiles` / `buildModpackAddPlan` (競合判定) / `applyModpackAddPlan` (keep/replace/ロック) |
| Component (RTL) | 必須 | `ModpackImportModal` (既定=ユーザー版・切替・確定) / NewProfileModal フォルダ選択→link 引数 |
| Hook 統合 | 必須 | useProfiles: link 付き作成 → linkedSource + dirHandles + ledger / useModpackAdd: msw で mrpack 展開 → 競合 → 適用 |
| E2E (Playwright / CI) | CI のみ | 既存 spec の回帰確認 (Sandbox 実行不可) |
| 実環境 (実機・本番 build) | ユーザー | フォルダ選択→Sync、実機 Chromium での確認 |

## 7. 停止条件

次の場合は作業を停止し、変更せず報告する:
- 仕様書 (計画書・AGENT.md・skills) 同士に矛盾がある
- task-list.md 記載の変更範囲を超える変更が必要
- 破壊的変更 (既存データ・公開 API 互換性) が必要
- ユーザー判断が必要な設計論点に到達した (例: Sync 側 D-3 の検出方式)
- 開始時点で作業ツリーに未確認の変更がある

## 8. 完了時に行うこと

1. 差分を自己レビュー (対象外の変更が混ざっていないか)
2. 4 検証 (typecheck / lint / test:unit / build) を実行し出力を読む
3. `docs/task-list.md` の状態・進捗・証拠を更新
4. タスク ID を含むコミット (`fix(P12-D1): …` / `feat(P12-D2): …`)
5. 証拠中心の完了報告 (結果 / テスト件数 / Git SHA / 残事項 = P12-D3)

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 |
|---|---|---|---|
| P12-D1 | フォルダ自動紐付け + 台帳 seed | linkPickedDirectory / handleCreateProfile 拡張 / NewProfileModal | P12-B |
| P12-D2 | Modpack 内容展開 + インポート時競合 UI + ロック構造 | expandMrpackFiles / modpackAdd / ModpackImportModal / モーダル分岐 | P12-D1 |
| P12-D3 | Sync Preview の競合 (D-3) | **別タスク (今回はデータ構造のみ)** | P12-D2 |

## 10. 設計詳細・仕様

### 10.1 P12-D1: フォルダ自動紐付け

- `NewProfileModal.handlePickFolder` は解析成功時に `picked: PickedDirectory` を state に保持。
  `handleSubmit` で `onCreate(name, ..., extras, { picked, detected: folderAnalysis.environment })`
  を渡す (解析失敗時は null)。
- `hooks/useProfiles.handleCreateProfile` は 8 番目の引数 `link` を受け取り:
  1. `newId` を生成
  2. `linkPickedDirectory(newId, link.picked, link.detected)` → `LinkedSource` (read mode)
  3. `newProfile` に `linkedSource` を入れ、`expandProfileToManaged` + getManagedFiles の
     merge (source/managedAt/syncedAt 引き継ぎ) を `syncManagedFiles` で保存 (**§10.5**)
  4. `setProfiles` / `setCurrentProfileId` / toast
- IndexedDB 書き込み失敗時は profile を作らずエラー toast (中途半端な紐付けを残さない)。
- `useFolderLinked` は変更不要 (linkedSource 有無で判定するため、D-8 の置換が自動で効く)。

### 10.2 P12-D2: Modpack 内容展開

- `expandMrpackFiles(zip, deps?)`: `modrinth.index.json` の `files[]` を
  sha1 → `/version_files` → projectId → `/projects` でメタ解決し `ProjectItem[]` を返す
  (useZipImport の 103〜165 行と**同一ロジック**。deps 注入でテスト可能)。
- 競合判定 (`buildModpackAddPlan`):
  - 同一 projectId かつ **versionId 同一** → 追加せず `skipped` (既にあるので保持)
  - 同一 projectId かつ **versionId 相違 (または片方未設定)** → `conflicts`
    (sha1 比較は versionId が両方未設定のときのみフォールバック)
  - それ以外 → `additions`
- 適用 (`applyModpackAddPlan`):
  - `keep` (既定) → ユーザー版を保持、pack 版は追加しない
  - `replace` → Profile 内の該当 ProjectItem を pack 版 (versionId/versionNumber/
    fileUrl/filename 等) に置き換え
  - `additions` はカテゴリ配列へ append
  - `modpackSource` = `{ provider:'modrinth', projectId, slug, name, versionId:
    targetVersion.id, versionNumber, importedAt, lockedVersions }`
- モーダル UI は D-3 の決定を踏襲: 競合 1 件ごとに無線 (既定 = ユーザー版)。
  競合 0 件ならモーダルを出さず即適用。
- overrides (`parseMrpackOverrides`) は `source:'modpack'` で**既存台帳へマージ**
  (syncManagedFiles は差分同期のため、`getManagedFiles` + 新規 record の全量を渡す)。

### 10.3 ロック情報 (P12-D3 の土台)

```ts
export interface ModpackSource {
  provider: 'modrinth' | 'curseforge';
  projectId?: string;      // Discover 追加時に設定 (要確認で確定)
  slug?: string;
  name: string;
  versionId?: string;
  versionNumber?: string;
  importedAt: number;
  /** 導入時点で Modpack が指定していた収録物 (projectId → version)。
   *  P12-D3 (Sync 側競合検出) が「導入時の指定」と「Profile の現在値」を比較する基準。 */
  lockedVersions?: Record<string, { versionId?: string; versionNumber?: string }>;
}
```

### 10.4 何もしないこと (今回)

- SyncPreviewModal / diff.ts は無変更。競合セクション (D-3) の UI 追加・検出・適用は
  全て P12-D3。
- Modpack の「削除 (導入済み)」ボタンは D-6 のハブ導線が担当。モーダルでは
  導入済み (modpackSource.projectId 一致) のときは「導入済み」無効表示 +
  Modpack ハブへの案内 (削除操作は実装しない)。

## 11. リスク・Gotchas

- `expandMrpackFiles` 抽出時、useZipImport の既存テスト 12 件が回帰検知の網。
  `fetchModrinthVersionFilesBatch`/`fetchModrinthBatch` の失敗フォールバック
  (versionByHash={} / projectMap 空でも fileUrl で継続) を**維持**すること。
- useZipImport は `.mrpack` を**読み込んだ JSZip** をそのまま使う。Discover は
  **ダウンロードした Blob** を `JSZip.loadAsync` する (別経路)。.mrpack でない
  (modrinth.index.json が無い) 場合はエラー toast で中断。
- `syncManagedFiles` は「records 以外を削除する」差分同期。**部分配列を渡すと既存台帳が消える**。
  Discover 追加では必ず全量 (existing + overrides) を渡す。
- `handleCreateProfile` を async にするため、既存テストは `act` 内で await されていれば
  安全 (実測で確認)。AppActions 型は `void | Promise<void>` に揃える。
- FileSystemDirectoryHandle を React state に保持してよい (構造化クローン可能)。
  モーダル再オープン時は必ず null リセット。

## 12. 実績と証拠 (実装後に記入)

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| P12-D1 | `1709704` | 1176 passed (4 検証 pass) | linkPickedDirectory + handleCreateProfile 拡張 + NewProfileModal 連携 + §10.5 台帳 seed |
| P12-D2 | `ac26e29` | 1196 passed (4 検証 pass) | expandMrpackFiles 抽出 (useZipImport 既存 16 tests 回帰なし) / 競合検出・適用 / モーダル / D-3 ロック情報 (lockedVersions) 先行 |
