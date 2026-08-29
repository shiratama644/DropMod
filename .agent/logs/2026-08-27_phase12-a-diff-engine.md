# 2026-08-27 Phase 12-A 実装: Managed File 台帳 + Diff Engine (computeSyncPlan)

- 対応 task: `P12-A`（`docs/task-list.md`）
- ブランチ: `arena/01a04363-dropmod`
- 計画書: `docs/planning/PHASE12_PLAN.md`（§12 の D-1〜D-6 は確定済み）

## 1. 指示内容 (Task Summary)

ユーザー指示: 「次は Phase 12 に移りたい」→ 概要説明と設計論点 6 件の確定を経て、
「はい。丁寧に着々と進めてください。」で P12-A の実装を開始。

**P12-A の DoD**（計画書 §5）:
> `computeSyncPlan()` の unit test が Diff 全 5 分類（Additions / Updates / Deletions /
> Unchanged / Unmanaged）+ fingerprint unchanged 検証を cover

**スコープ**（§9）: `linkedSource` / `dirHandles` / `ManagedFileRecord` / `computeSyncPlan`

## 2. 実行内容 (Executed Actions)

### 2.1 `types.ts`

| 追加 | 内容 |
|---|---|
| `ManagedFileSource` | `'dropmod'`（DropMod の検索から追加）/ `'import'`（Import 由来）/ `'modpack'`（.mrpack 由来） |
| `ManagedFileRecord` | 管理下ファイル 1 件の台帳。`id` = `${profileId}::${path}`、`sha1`（fingerprint）、`source`、`managedAt` / `syncedAt` |
| `LinkedSource` | Profile とローカル環境の紐付け。`kind` / `rootName` / `handleId` / `environment` / `contentDirs` / `linkedAt` |
| `Profile.linkedSource?` | 予約コメントを実フィールドに置換 |

**設計判断**: `FileSystemDirectoryHandle` は structured clone で IndexedDB に保存できるが
**JSON 直列化できない**ため、`Profile` 本体には持たせず `dirHandles` テーブルへ分離し、
`LinkedSource.handleId` で参照する（Profile は JSON 直列化可能なまま）。

### 2.2 `lib/db/dexie.ts` — schema v3

```
managedFiles: 'id, profileId, category, projectId, sha1'
dirHandles:   'id, profileId'
```

- **新規テーブル追加のみ。既存テーブルの index は不変・upgrade 関数なし** → 既存データは無変換。
- 旧 DB を開いたユーザーは「空の台帳」から始まる = **紐付け直後の初回 Sync では deletion が
  1 件も発生しない**（§10.2 の「台帳に存在する」条件を満たさないため）。安全側の意図した挙動。
- ヘルパ 6 種を追加: `syncManagedFiles`（diff 同期・単一 tx）/ `getManagedFiles`（path 昇順）/
  `deleteManagedFilesForProfile` / `saveDirHandle`（id を返す）/ `getDirHandle` / `deleteDirHandle`
- `_clearAllForTesting` に新テーブルを追加
- **`SyncTransaction` は v3 に含めず P12-B で v4 として追加**（§9 の P12-A スコープに絞る）

### 2.3 `lib/env/managed.ts`（新規・pure function）

- `buildManagedFileId` / `parseManagedFileId`（`::` 区切り。path に `::` が含まれても最初の区切りで分解）
- `itemsOfCategory` / `MANAGED_CATEGORIES`
- `deriveManagedSource`: `artifact` あり → `'import'`、なし → `'dropmod'`
  （`'modpack'` は P12-C が明示設定するためここからは導出しない）
- `expandProfileToManaged`: **`artifact` を持つ ProjectItem のみ**台帳化。
  `sha1`/`path` が欠けた artifact は除外（防御）。同一 path 重複は projectId 昇順の 1 件採用。path 昇順ソート。
- `mergeManagedRecords`: 既存台帳の **`source` / `managedAt` / `syncedAt` を保護**し、
  `sha1` / `size` は候補（Profile の artifact）を正とする。
  → Profile から再導出すると `source` が `'import'` に戻ってしまうため、
    **D-6（modpack 解除で `'import'` へ昇格）の結果を守るには既存値の引き継ぎが必須**。

### 2.4 `lib/env/diff.ts`（新規・**P12-A の DoD 本体**）

`computeSyncPlan({ profile, managed, local, now })` — **pure function。書き込み・削除は一切行わない**。

カテゴリ（mod / resourcepack / shader）ごとに独立実行し、2 段で走査:

1. **Profile 側** → addition / update / unchanged
   - `artifact` あり・local 実体なし → `addition` + `needsDownload`
   - `artifact` あり・local あり・sha1 一致 → `unchanged`
   - `artifact` あり・local あり・sha1 相違 → `update`
   - `artifact` なし → 台帳に同 project があれば unchanged、無ければ `addition` + `source: 'dropmod'`
2. **Local 側**（未処理 path のみ）→ deletion / unmanaged
   - 台帳に無い → `unmanaged`（**表示のみ・削除対象外**、source バッジなし）
   - 台帳にあり **fingerprint 一致** → `deletion`
   - 台帳にあり **fingerprint 相違** → `unchanged` + `externallyModified: true`（**削除しない**）

**削除の 3 条件（§10.2）をそのまま実装**:
```
ManagedFileRecord が存在する
  AND local.sha1 === record.sha1              ← unchanged 必須
  AND Profile が該当 projectId を持たない
```

追加した UI 用セレクタ:
- `selectExternallyModified(plan)` — §10.3 の独立警告セクション用（実体は §10.2 どおり `unchanged` に格納）
- `selectDeletionsRequiringConfirm(plan)` — `source !== 'dropmod'` の削除のみ（§10.3 の追加確認対象）

`totals`: `counts` 5 種 / `writeBytes` / `removeBytes` / `backupBytes`
（backupBytes = update の現ファイル + deletion の実体。D-5 の quota 判定に使う）

### 2.5 テスト（3 ファイル 47 tests 新規）

| ファイル | 件数 | 対象 |
|---|---|---|
| `__tests__/lib/env/diff.test.ts` | 18 | **5 分類すべて + fingerprint unchanged 検証**、パス移動、カテゴリ分離、totals、セレクタ |
| `__tests__/lib/env/managed.test.ts` | 19 | 台帳導出・マージ・id 生成/分解 |
| `__tests__/lib/db/dexie.managed.test.ts` | 10 | v3 スキーマ、v2→v3 で既存 profiles 保持、台帳 diff 同期、handle 保存/取得/削除 |

### 2.6 ドキュメント反映

- `docs/task-list.md`: P12-A → **完了 100%**
- `docs/planning/PHASE12_PLAN.md`: 状態行を「実装中（P12-A 完了）」に、**§13 実績と証拠**を新設し
  P12-A の実装上の決定 6 件を記録
- `.agent/skills/state-and-storage.md`: Dexie **v3**（5 テーブル）+ 新ヘルパ + v3 migration の説明
- `.agent/skills/env-import.md`: 「Phase 12 で追加するもの」→「Phase 12 の進捗」（P12-A 実装済み / 残作業）
- `.agent/skills/index.md`: 2 skill の説明・最終更新日、読み方ガイドのトリガーに「Sync・Diff Engine」を追加

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **fingerprint 検証は「削除の 3 条件」に集約される**という計画書の設計は、実装すると
  非常に素直だった。逆に言うと、**台帳が無いと Phase 12 の安全性は成立しない**。
  旧 DB ユーザーが空の台帳から始まる挙動は「不具合」ではなく安全性の帰結である。
- **`source` は Profile から再導出できない**。`ProjectItem` には modpack 由来の印が無いため、
  `expandProfileToManaged` だけでは `'modpack'` → `'import'` に退化する。
  **台帳は「導出」ではなく「導出 + 既存とのマージ」で更新しなければならない**
  （`mergeManagedRecords` の存在理由）。P12-B 以降で台帳更新を書くときは必ずこれを通すこと。
- **到達不能な防御コードは削除すべき**。当初「Profile が同じ project を同じパスで要求しているのに
  local ループに到達する」分岐を書いたが、`handledPaths` により構造的に到達不能だった。
  カバレッジが 95.55% で頭打ちになったのをきっかけに気づき、削除して **lines 100%** になった。
  未テストの死んだコードは「守り」ではなく「誤解の種」になる。
- **自分のテストフィクスチャの誤りで 2 件落ちた**（実装は正しかった）:
  1. deletion テストで local の sha1 を台帳と違う値にしていた → 正しくは `externallyModified` になる
  2. `unmanaged` は走査順でソートされないのに index で参照していた
  どちらも **§10.2 の仕様を読み直してフィクスチャを直した**（実装を合わせにいかなかった）。
- `lib/env/` は **18 ファイル / 約 1,700 行**になった。Diff Engine は
  `EnvironmentSource`（read 系）と対になる `EnvironmentSink`（write 系）を P12-B で追加する前提で、
  `SyncPlanEntry` に `path` / `targetSha1` / `size` を持たせてある。

## 4. 次にすべきこと (Next Actions)

1. **P12-B**: `EnvironmentSink` 抽象 + `FileSystemSink`（Chromium Direct Write）、
   `SyncTransaction` テーブル（Dexie **v4**）、`executeSync` + Transaction Journal、
   OPFS Backup、Rollback（D-4: 起動時に未完了 Journal を検出して確認 → 既定 Rollback）、
   Sync Preview UI（**6 セクション**: 5 分類 + D-3 の競合 + D-1 の環境不一致ブロック表示）、Sync History UI。
   - **D-1（環境不一致はブロック）は Preview に到達する前のゲート**として実装する
   - D-5（OPFS quota）は「古い順・ただし直近 3 回は絶対残す」で、足らなければ Sync を中断
2. **P12-C**: `ZipSink` / `.mrpack` パーサ / `ModrinthProvider` / Modpack UI / CurseForge 検出表示。
   D-6（unbind で `'modpack'` → `'import'` 昇格）はここに含める。
3. **P12-B / P12-C は Sandbox で実機検証不可**（Chromium インストール不可）。
   E2E は CI、Direct Write の実機確認はユーザー依頼になる。
4. `実環境検証待ち` の 3 件（`UIP-5` / `SEC-1` / `VER-2`）は引き続きユーザー実機・本番での確認が残る。
