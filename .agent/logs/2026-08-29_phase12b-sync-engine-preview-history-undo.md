# Phase 12-B: Sync Engine + Preview + History + Undo + D-4

> Date: 2026-08-29 (JST) / Branch: `arena/01a04363-dropmod`

## 1. 指示内容 (Task Summary)

「次は Phase 12-B に進んでください。」

`PHASE12_PLAN.md` §9 の P12-B スコープ = Preview UI + Transaction + Executor + Rollback。
成果物 = `SyncTransaction` / `executeSync` / OPFS Backup / History UI。Dexie v4。
DoD (§5) = 「Chromium で Direct Write が Transaction + Backup + Rollback 付きで動作」。

UI 方針 (ユーザー指定): 「元々ある zip ダウンロードボタン」を、**フォルダ設定済み
Profile のときだけ**「Sync ボタン／Sync アイコン」に置き換える。**Profile ごとに独立** —
フォルダ未設定の Profile に切り替えたら ZIP保存 に戻る。

## 2. 実行内容 (Executed Actions)

11 commits (`61b210d` → `4886245`)。

| commit | 内容 |
| :--- | :--- |
| `61b210d` | `createContentResolver` (SyncPlanEntry → 実体) + `lib/utils/downloadFile.ts` に DL 共通処理を切り出し |
| `33039cf` | `applyJournalToLedger` — Sync 完了後の台帳更新 |
| `6283484` | `prepareSync` (D-1→権限→scan→diff) / `applySync` / `useSync` |
| `d9fae20` | `SyncPreviewModal` (6 セクション) + `SyncButton` (D-9 / D-10) + `excludeDeletions` |
| `f8abebf` | **D-8** ZIP保存 → Sync 置換 5 箇所 + `useFolderLinked` |
| `845faf4` | `undoSync` + `ledgerBefore` スナップショット |
| `d30db1c` | Sync History + Undo UI (D-9) |
| `4886245` | **D-4** 中断 Sync の検出と復旧 |

### 新規ファイル

`lib/utils/downloadFile.ts` / `lib/utils/format.ts` / `lib/env/resolve.ts` /
`lib/env/syncPrep.ts` / `lib/env/applySync.ts` / `lib/env/undo.ts` / `lib/env/recovery.ts` /
`hooks/useSync.ts` / `hooks/useFolderLinked.ts` / `hooks/useSyncHistory.ts` /
`hooks/useInterruptedSync.ts` / `components/SyncButton.tsx` /
`components/SyncPreviewModal.tsx` / `components/SyncHistorySection.tsx` /
`components/InterruptedSyncDialog.tsx`

### 修正した既存ファイル

`lib/env/executor.ts` (書き込み実体の sha1 / size を Journal に記録) /
`lib/env/diff.ts` (`excludeDeletions`・`CATEGORY_DIR_KEY`・`buildTargetPath` を export) /
`lib/env/managed.ts` (`applyJournalToLedger` + 構造型 `LedgerJournalOperation`) /
`lib/env/link.ts` (`OpenedLinkedFolder` を抽象型で公開) / `lib/db/dexie.ts`
(`SyncOperationPatch.sha1|size`・`ledgerBefore`・`setSyncTransactionLedgerBefore`・
`findInterruptedSyncTransactions` が `pending` も拾う) / `hooks/useZipExport.ts`
(DL 共通化) / `components/AppShell.tsx` / `components/SettingsPageClient.tsx` /
`components/Header.tsx` / `components/DesktopSidebar.tsx` / `components/MenuBottomSheet.tsx` /
`components/ModsPageClient.tsx`

検証: `pnpm typecheck` clean / biome `Checked 282 files. No fixes applied.` /
`pnpm test:unit` **100 files 995 tests** 全 pass / `pnpm build` exit 0 /
`git diff --stat -- .archive/vite/` 空。
テスト総数は 808 → **995** (+187)。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **🐛 `classifyProfileItem` の addition は `path: item.filename ?? ''` (bare filename)** —
  `mods/` プレフィックスが無い。`executeSync` に渡すと**環境ルート直下**に書いてしまう。
  `computeSyncPlan` は書き込み先ディレクトリを知れないため、`contentDirs` を引数に追加した。
- **🐛 `expandProfileToManaged` は artifact 無しのアイテムを展開しない。** Sync で新規に
  書く `source:'dropmod'` のファイルは artifact を持たないので、Profile から再導出すると
  台帳に乗らず**次回 Sync で削除対象外**になる。→ Journal を更新元に。
- **🐛 `findInterruptedSyncTransactions` が `running` だけを見ていた。**
  `createSyncTransaction` は `pending` で作り `executeSync` が `running` にするので、
  その間で閉じると `pending` のまま残り**二度と検出されず行が永久に溜まる**。
- **Undo の台帳復元は Journal を逆にたどれない** (`update` の元 fingerprint や `delete` の
  元レコードが残らない)。→ Sync 前のスナップショット `ledgerBefore` を保存する方式に。
  **Dexie のスキーマはインデックスだけを宣言するので、非インデックスのフィールド追加に
  マイグレーションは不要** (v4 のまま据え置き)。
- **状態を途中で変えないことが安全側に効く**: 復旧/Undo が一部失敗したら
  `failed` にして**台帳もバックアップも触らない**。実体と食い違う台帳を作ると
  §10.2 の削除判定が壊れる。`rollbackSync` は冪等なので再試行できる。
- **`excludeDeletions` は容量の合計も減らす**。実態と食い違った `backupBytes` を
  `executeSync` に渡すと D-5 の空き容量判定が過大評価になる。
- **`DOMException` は Node/jsdom で `Error` を継承しない** (Chromium では継承する)。
  `error instanceof Error && error.name === 'AbortError'` は**中断を検出できず
  リトライを続ける**。`typeof e === 'object' && 'name' in e` で判定する。
  抽出元の `useZipExport.ts` に元からあった潜在バグ。
- **ref はレンダー時代に入しない**。`outcomeRef.current = outcome` をレンダー中にやると
  `prepare()` と `apply()` を同じ tick で呼んだ場合に再レンダーが間に合わず stale な null を掴む。
- **抽象 (interface) を公開する**。`OpenedLinkedFolder.source` が具体クラス
  `FileSystemSource` を露出していたため、呼び出し側の差し替えができず typecheck で落ちた。
- **Zustand v5 の selector はプリミティブを返す**。オブジェクトを返すと
  `useSyncExternalStore` が参照変化を毎回検知して無限ループになる。
- **`createSyncTransaction` は全操作を `done: false` で作る** (Journal は実行結果を後から埋める)。
  テストで適用済み状態を作るには `markOperationDone` を使う。
- **`BackupStore.listTransactions()` は `{txId, bytes, savedAt}[]`** を返す (`string[]` ではない)。
- `biome-ignore` は**対象要素の直前**に置く。JSX の属性リストの中に置くと
  `suppressions/unused` になる。不要な suppression も warning になる。
- `autoFocus` は biome の a11y error。`useModalA11y` が最初の focusable に
  フォーカスするので不要。

## 4. 未解決・次アクション (Next Steps)

- **P12-B の DoD は未達**: §6 の「E2E (CI) 必須」「実環境 必須」が残っている。
  Sandbox には Playwright のブラウザが未インストールのため E2E は実行できない。
  → `P12-E2E` として task-list に追加済み。実機 Chromium での Direct Write 確認はユーザー。
- D-3 の「競合」セクションは Modpack 更新 (P12-C) で追加する。P12-B 時点で
  modpack 紐付けは存在しないため常に空になる。
- GitHub トークンが一度失効し push が失敗した (コミット自体は成功)。再接続後に push 済み。
  **Sandbox 再構築で失われる前に push する**という AGENT.md §4.3.1 の理由が実証された。
