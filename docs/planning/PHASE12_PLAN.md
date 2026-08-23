# Phase 12: ローカル Minecraft 環境 Sync & Modrinth Modpack (Read/Write)

**ステータス**: 計画中（仕様推敲済み、Phase 11 完了後に着手）
**優先度**: 🔴 最重要 — Phase 11 と合わせて DropMod の核心価値を実現
**見積工数**: 4〜5 週間（1 人フルタイム換算）
**着手前提**: Phase 11 (Read-only Import & Analysis) 完了
**Vercel デプロイとの関係**: Vercel 本番デプロイは **本 Phase 12 完了後**の最終ステップ (`docs/planning/PHASE10_CANDIDATES.md` 冒頭「【重要方針】」節参照)

---

## ⚠️ 【重要方針】Phase 12 は書き込み・削除を含む破壊的操作

> Phase 11 は Read-only で安全だったが、Phase 12 は **ユーザーの Minecraft 環境を
> 実際に変更する** ため、以下の 3 層の安全機構を全て実装してから初めて有効化する:
>
> 1. **SyncPlan の完全 Preview** (ユーザー承認前は実行しない、ChatGPT #6)
> 2. **fingerprint unchanged 必須の自動削除** (外部変更検知で保持、ChatGPT #12)
> 3. **Transaction Journal + Backup** (途中クラッシュから復旧可能、ChatGPT #7/#8)

### Phase 11 / 12 / 13 の分担 (再掲)

```
Phase 11: Read-only Import & Analysis (完了済み想定)
  └─ Local → Profile snapshot、書き込みなし

Phase 12 (本仕様書): Sync & Modrinth Modpack
  ├─ Diff Engine → SyncPlan → Preview → Executor
  ├─ Managed File Ownership Model (fingerprint 検証必須)
  ├─ Transaction Journal + Backup (Blob + OPFS)
  ├─ Direct Write (Chromium) + ZIP Export (Fallback)
  ├─ Modrinth .mrpack 対応 (Modpack Source)
  └─ Provider 抽象化準備 (CurseForge の入り口だけ)

Phase 13: CurseForge 完全対応
  └─ Murmur2 fingerprint + Modpack + 更新検知
```

---

## 1. 概要と目的

### 1.1 目的

Phase 11 で構築した Profile を SSOT として、**ローカル Minecraft 環境との差分を
安全に反映する** 機能を提供する。加えて **Modrinth Modpack (.mrpack)** の Import
と Sync による更新検知にも対応する。

Phase 12 のキーワードは **「安全性」と「復旧可能性」**:
- 書き込む前に必ず Preview
- 削除する前に必ず fingerprint 検証
- クラッシュしても Rollback で復旧

### 1.2 コアバリュー

- **差分同期**: 変更・追加されたファイルのみをローカルへ直接書き込み
- **安全な削除**: DropMod が管理していないファイル (Unknown) は絶対に消さない、
  管理下でも fingerprint が変わっていたら「外部変更あり」で保持
- **Rollback**: Sync 前にバックアップ、直近 3 回分の Sync を Undo 可能
- **Modrinth Modpack 統合**: `.mrpack` を丸ごと Import し、Profile として管理、
  Modpack 更新も検知
- **クロスデバイス**: モバイルで Profile 編集 → PC で Sync 実行

---

## 2. アーキテクチャ (ChatGPT #6 に基づく Plan/Execute 分離)

### 2.1 Sync パイプライン

**従来案** (Phase 11 元仕様): `Diff → Preview → Write`
**採用案** (ChatGPT #6): `Diff → SyncPlan → Preview → User Approval → Executor`

```text
Profile (SSOT)
  +
Local (EnvironmentSource, Phase 11 の抽象再利用)
       │
       ▼ ① Diff Engine
   カテゴリ別 diff (Mods / RP / Shader)
       │
       ▼ ② SyncPlan Builder
   構造化 Plan (additions / updates / deletions / unchanged / unmanaged)
       │
       ▼ ③ Preview UI
   ユーザーがカテゴリ別 diff を確認、キャンセル可
       │
       ▼ ④ User Approval (明示的な "Apply" ボタン)
       │
       ▼ ⑤ Transaction Journal 作成 + Backup
   IndexedDB に SyncTransaction レコード insert
   削除予定ファイルを Blob として OPFS に保存
       │
       ▼ ⑥ Executor (EnvironmentSink)
   Direct Write / ZIP Export の実装差し替え可能
       │
       ▼ ⑦ Transaction Commit
   全 operation 成功 → status: 'completed'
   途中失敗 → status: 'failed' → Rollback 可能
```

**利点** (ChatGPT #6 より):
- Preview で表示した内容 = 実行される内容 (完全一致保証)
- Executor を差し替えることで Chromium Direct Write / ZIP / Electron などに対応可能
- Transaction Journal で途中クラッシュ時も Resume / Rollback

### 2.2 EnvironmentSink 抽象化 (Phase 11 の EnvironmentSource と対)

```typescript
interface EnvironmentSink {
  kind: 'filesystem' | 'zip';
  writeFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  /** ZIP 版のみ、DL 用 Blob 生成 */
  finalize?(): Promise<Blob>;
}
```

- `FileSystemSink`: Chromium `showDirectoryPicker({ mode: 'readwrite' })` 経由
  - Phase 11 で `read` パーミッションだった handle を `requestPermission({ mode: 'readwrite' })` で昇格
- `ZipSink`: JSZip 経由でメモリ内 ZIP を構築 → ブラウザダウンロード

### 2.3 データモデル

#### 2.3.1 Managed File Ownership Model (ChatGPT #5 に基づく命名変更)

**「3 状態ポリシー」を廃止**、代わりに **ownership × source の 2 軸** で管理:

```typescript
type FileOwnership = 'unmanaged' | 'managed';
type ManagedFileSource = 'import' | 'dropmod' | 'modpack';

interface ManagedFileRecord {
  id: string;                      // 内部 UUID

  profileId: string;
  category: 'mod' | 'resourcepack' | 'shader';

  /** 相対パス (Diff の path キーとして使用、ChatGPT #4) */
  path: string;                    // 'mods/sodium-0.6.0.jar'
  filename: string;

  /** Managed の同一性判定に必須 (ChatGPT #4) */
  sha1: string;
  size: number;

  /** どの content を代表するか (ChatGPT #4) */
  contentId?: string;              // Profile.mods[].id
  versionId?: string;              // Modrinth version id

  /** 追加経路 (ChatGPT #5: ownership と source を分離) */
  source: ManagedFileSource;
  /** Modpack 由来なら、どの modpack version で入ったか (ChatGPT #4) */
  modpackVersionId?: string;

  createdAt: number;
  updatedAt: number;
}
```

**ownership × source のマトリクス** (削除挙動):

| ownership | source | Profile から削除された時 | 外部変更検知時 |
|---|---|---|---|
| unmanaged | — | 絶対削除しない | 該当なし |
| managed | `dropmod` | 自動削除 (**要: fingerprint unchanged**) | 削除保留 + ユーザー確認 |
| managed | `import` | ユーザー明示的確認 (confirm dialog) | 削除保留 + ユーザー確認 |
| managed | `modpack` | Modpack 更新時のみ自動削除 (**要: fingerprint unchanged**) | 削除保留 + ユーザー確認 |

#### 2.3.2 SyncPlan 型 (ChatGPT #6)

```typescript
interface SyncOperation {
  type: 'add' | 'update' | 'delete';
  category: 'mod' | 'resourcepack' | 'shader';
  path: string;                    // 'mods/sodium.jar'

  /** 現在のローカル fingerprint (delete/update 時) */
  before?: FileFingerprint;
  /** 適用後の期待 fingerprint (add/update 時) */
  after?: FileFingerprint;

  /** 削除判定の根拠 */
  reason?:
    | 'not-in-profile'
    | 'version-mismatch'
    | 'modpack-update-removed';

  /** サイズ (Preview の bytes 表示用) */
  sizeBytes?: number;
}

interface FileFingerprint {
  sha1: string;
  size: number;
}

interface SyncPlan {
  profileId: string;
  createdAt: number;
  additions: SyncOperation[];
  updates: SyncOperation[];
  deletions: SyncOperation[];
  unchanged: SyncOperation[];
  unmanaged: SyncOperation[];      // 表示のみ、実行対象外
  /** 集計 */
  totalSizeChangeBytes: number;
  /** ownership × source 別内訳 (UI で色分け表示) */
  breakdown: {
    dropmodDeletions: number;
    importedDeletions: number;
    modpackDeletions: number;
    unmanagedProtected: number;
  };
}
```

#### 2.3.3 Transaction Journal (ChatGPT #7)

```typescript
interface SyncTransaction {
  id: string;
  profileId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back';

  plan: SyncPlan;                  // 実行時に固定 (Preview と同一保証)
  operations: SyncOperation[];     // 実行順にソート済み

  /** どこまで完了したか (途中クラッシュ時の resume 起点) */
  completedOperationIds: string[];
  /** Backup 参照 (OPFS 内のパス) */
  backupRefs: string[];

  startedAt: number;
  completedAt?: number;
  failureReason?: string;
}
```

#### 2.3.4 Backup Storage (ChatGPT #8: Base64 → Blob + OPFS)

**旧案** (Phase 11 元仕様): `contentBase64: string` を IndexedDB に保存
→ 200 MB modpack で 267 MB に膨張 (不採用)

**採用案** (ChatGPT #8):
- **メタデータ** は IndexedDB (Dexie)
- **実ファイル** は OPFS (`navigator.storage.getDirectory()`)

```typescript
interface SyncBackupMetadata {
  id: string;
  syncTransactionId: string;
  path: string;                    // 'mods/sodium-0.5.9.jar'
  sha1: string;
  size: number;
  /** OPFS 内のパス (backups/{transactionId}/{sanitized-filename}) */
  opfsPath: string;
  createdAt: number;
}

// OPFS への保存例
async function backupFile(txId: string, path: string, data: Uint8Array) {
  const root = await navigator.storage.getDirectory();
  const backupDir = await root.getDirectoryHandle(`backups/${txId}`, {
    create: true
  });
  const sanitized = path.replace(/\//g, '__');
  const fh = await backupDir.getFileHandle(sanitized, { create: true });
  const writable = await fh.createWritable();
  await writable.write(data);
  await writable.close();
}
```

**OPFS の利点**:
- 大容量対応 (ブラウザ storage quota、通常 数 GB)
- Blob をそのまま扱えるので Base64 化不要
- ブラウザ間でストレージ独立 (Chrome / Edge 別々)

**保持ポリシー**: 直近 3 回分の Sync まで保持、それ以上は自動削除。

---

## 3. Sync 詳細仕様

### 3.1 Diff Engine

```typescript
async function computeSyncPlan(
  profile: Profile,
  local: EnvironmentSource,
  managed: ManagedFileRecord[]
): Promise<SyncPlan> {
  // 1. Local の全 file を列挙 + SHA-1 計算 (Web Worker 活用)
  const localFiles = await scanLocal(local);

  // 2. カテゴリ別に処理
  for (const cat of ['mod', 'resourcepack', 'shader']) {
    const profileItems = profile[cat + 's'];
    const localCatFiles = localFiles.filter(f => f.category === cat);
    const managedCatRecords = managed.filter(r => r.category === cat);

    // 2-1. Additions: Profile にあるが Local にない
    // 2-2. Updates: 両方にあるが sha1 が違う
    // 2-3. Deletions: Managed record にあるが Profile にない
    // 2-4. Unchanged: 一致
    // 2-5. Unmanaged: Local にあるが managed record にない
  }

  return plan;
}
```

**アルゴリズム** (カテゴリごとに独立実行):
1. **Additions**: `Profile.contentItem` の `artifact.sha1` が Local に存在しない → add
2. **Updates**: 同じ `contentId` で `artifact.sha1` が変わっている → update
3. **Deletions** (安全な削除条件、ChatGPT #12):
   ```
   ManagedFileRecord が存在
     AND
   現在の Local fingerprint == ManagedFileRecord.sha1  ← fingerprint unchanged 必須
     AND
   Profile.mods[].content が該当 contentId を持たない
   ```
   **fingerprint が変わっていたら** → deletion に含めず、`unchanged` + "外部変更検知" フラグ
4. **Unchanged**: profile と local と managed で全て sha1 一致
5. **Unmanaged**: local にあるが managed record が無い → 削除対象外 (表示のみ)

### 3.2 Sync Preview UI

Direct Write 実行前に必ず以下を表示。ユーザーが Apply ボタンを押すまで実行されない:

```text
┌──────────────────────────────────────────────────────────┐
│  Sync Preview                                            │
│                                                          │
│  Profile: 1.21.1 Fabric 軽量化                           │
│  Local:   C:\Users\...\.minecraft                        │
│                                                          │
│  ─── Mods ─────────────────────────────────────────────  │
│  🟢 追加 (2)                                             │
│  ✚ Sodium 0.5.9         (3.2 MB) [Modrinth]              │
│  ✚ Iris 1.8.0            (1.8 MB) [Modrinth]              │
│                                                          │
│  🟡 更新 (1)                                             │
│  ✎ Lithium 0.11.2 → 0.12.0                               │
│                                                          │
│  🔴 削除 (2)                                             │
│  ✖ Fabric API [DropMod 追加、自動削除]                   │
│  ⚠ Cloth Config [Import 由来、削除しますか?]             │
│    → [ 削除する ] [ 保持する ] (ユーザー選択)            │
│                                                          │
│  🔵 保持 (Unknown、絶対削除しません)                     │
│  ○ some-custom.jar                                       │
│                                                          │
│  ⚠️ 外部変更検知 (削除保留)                              │
│  ! Old-Mod.jar [DropMod 管理下だが sha1 が変化]          │
│    → 削除する予定でしたが、ユーザーが手動で更新した      │
│      可能性があるため、保持されます。                    │
│                                                          │
│  ─── Resource Packs ──────────────────────────────────   │
│  (変更なし)                                              │
│                                                          │
│  ─── Shaders ─────────────────────────────────────────   │
│  🟢 追加 (1)                                             │
│  ✚ ComplementaryShaders 5.3.0  (12 MB)                   │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│  合計サイズ変化: +14.2 MB                                │
│  Backup 対象: 3 files (合計 5.4 MB) → OPFS に保管       │
│                                                          │
│  [ キャンセル ]  [ Apply Sync ]                          │
└──────────────────────────────────────────────────────────┘
```

**重要な UI ルール** (ChatGPT #12 反映):
- 削除欄には必ず **source バッジ** ([DropMod 追加] / [Import 由来] / [Modpack 更新]) を表示
- 外部変更検知は独立セクションで警告
- Backup サイズを表示 (OPFS quota 意識)

### 3.3 Executor 実装

```typescript
async function executeSync(
  tx: SyncTransaction,
  sink: EnvironmentSink
): Promise<void> {
  await updateTxStatus(tx.id, 'running');

  for (const op of tx.operations) {
    try {
      // 1. Backup (delete/update 時)
      if (op.type === 'delete' || op.type === 'update') {
        await backupFile(tx.id, op.path, await readCurrentFile(op.path));
      }

      // 2. 実行
      if (op.type === 'add' || op.type === 'update') {
        await sink.writeFile(op.path, await downloadContent(op));
      } else if (op.type === 'delete') {
        // fingerprint 再検証 (実行直前、ChatGPT #12)
        const currentSha1 = await computeSha1(await readCurrentFile(op.path));
        if (currentSha1 !== op.before?.sha1) {
          throw new FingerprintChangedError(op.path);
        }
        await sink.deleteFile(op.path);
      }

      await markOperationCompleted(tx.id, op.id);
    } catch (e) {
      await updateTxStatus(tx.id, 'failed', String(e));
      throw e; // Rollback UI で処理
    }
  }

  await updateTxStatus(tx.id, 'completed');
}
```

**FingerprintChangedError**: Preview 表示から Apply までの間にユーザーが外部で
ファイルを書き換えた場合 → 削除中止、ユーザーに再 Sync を促す。

### 3.4 Rollback

失敗 or ユーザー要求時:

```typescript
async function rollbackSync(txId: string): Promise<void> {
  const tx = await getTx(txId);
  const backups = await getBackupsByTx(txId);

  // 1. Additions を削除
  for (const op of tx.operations.filter(o => o.type === 'add')) {
    if (tx.completedOperationIds.includes(op.id)) {
      await sink.deleteFile(op.path);
    }
  }

  // 2. Updates/Deletions を Backup から復元
  for (const backup of backups) {
    const data = await readFromOpfs(backup.opfsPath);
    await sink.writeFile(backup.path, data);
  }

  await updateTxStatus(txId, 'rolled-back');
}
```

Rollback UI (SettingsPageClient に追加予定):
```text
Recent Sync History:
  2026-08-24 10:35  Applied 4 ops  [ Rollback ]
  2026-08-23 14:12  Applied 2 ops  [ Rollback ]
  2026-08-22 09:01  Applied 8 ops  [ Rollback ]  ← 直近 3 回まで
```

---

## 4. Modrinth Modpack (.mrpack) 対応

### 4.1 データモデル拡張 (ChatGPT #9 準拠)

Profile 型に `modpackSource` を追加:

```typescript
interface Profile {
  // ... (Phase 11 で定義済み)

  /** Modpack 由来の Profile はここに source を記録 */
  modpackSource?: {
    provider: 'modrinth';           // Phase 13 で 'curseforge' 追加
    projectId: string;              // Modrinth の modpack project id
    versionId: string;              // 現在の modpack version
    packName: string;
    packVersion: string;            // '1.5.3' 等
    importedAt: number;
  };
}
```

**重要**: `modpackSource` は Profile 全体の由来を示すマーカー。
`mods[]` / `resourcepacks[]` / `shaderpacks[]` の中身は Phase 11 と同じ構造。
Modpack 由来のファイルは `ManagedFileRecord.source: 'modpack'` で管理。

### 4.2 .mrpack Import フロー (ChatGPT #10 準拠: Artifact-first)

```
.mrpack ファイル選択
     │
     ▼ JSZip でパース
modrinth.index.json 抽出
     │
     ▼ ChatGPT #10: URL を identity にしない、hash を中心に
{ files: [{ downloads: [url], hashes: {sha1}, path, ... }] }
     │
     ▼ Artifact-first: hash から Modrinth version を逆引き
POST /version_files with hashes[]
     │
     ▼ Metadata resolution (project 情報取得)
POST /projects?ids=[...]
     │
     ▼ ContentItem[] 生成 (Phase 11 と同じ形式)
     ▼ Profile.modpackSource セット
     ▼ ManagedFileRecord に source: 'modpack' 記録
     │
     ▼ Sync Preview へ (通常フローに合流)
```

**注**: `overrides/` フォルダは Phase 12 では **config/ のみ対応**、
他 (options.txt, servers.dat, saves 等) は Roadmap 2。

### 4.3 Modpack 更新検知

Analysis View に「Modpack 更新可能」バナーを追加:

```typescript
async function checkModpackUpdate(profile: Profile): Promise<ModpackUpdateInfo | null> {
  if (!profile.modpackSource) return null;

  const versions = await fetchModrinthProjectVersions(
    profile.modpackSource.projectId,
    { loader: profile.environment.loader, mcVersion: profile.environment.mcVersion }
  );
  const latest = versions[0];
  if (!latest || latest.id === profile.modpackSource.versionId) return null;

  return {
    currentVersion: profile.modpackSource.packVersion,
    latestVersion: latest.version_number,
    latestVersionId: latest.id,
    changelog: latest.changelog
  };
}
```

Analysis View:
```text
🎁 Modpack Update Available
   Fabulously Optimized: 5.7.0 → 5.9.0
   [ 詳細を見る ] [ 更新 (別 Preview 画面) ]
```

Modpack 更新実行時は **独立した Sync Preview** を表示 (差分が数十ファイル規模)。

### 4.4 Modpack と個別 Mod 追加の共存

ユーザーが Modpack Import 後に個別 Mod を追加した場合:

- 追加 Mod: `ManagedFileRecord.source: 'dropmod'`
- Modpack 更新時: Modpack が指定するファイルのみ差し替え、`dropmod` source のファイルは保持

これにより「Modpack ベース + カスタム追加」ワークフローに対応。

---

## 5. Provider 抽象化準備 (Phase 13 の下準備)

Phase 13 で CurseForge を追加できるよう、Phase 12 で以下の抽象を導入:

```typescript
// lib/env/provider/types.ts
type ProviderId = 'modrinth' | 'curseforge' | 'unknown';

interface Provider {
  id: ProviderId;
  /** hash から version を逆引き */
  resolveByHash(hashes: string[]): Promise<Map<string, ResolvedVersion>>;
  /** project id から metadata */
  getProjectMetadata(projectIds: string[]): Promise<Map<string, ResolvedProject>>;
  /** version id から更新可能性チェック */
  checkForUpdate?(projectId: string, currentVersionId: string): Promise<ResolvedVersion | null>;
}

interface ResolvedVersion {
  provider: ProviderId;
  projectId: string;
  versionId: string;
  versionNumber: string;
  files: Array<{ url: string; sha1: string; filename: string; primary: boolean }>;
}
```

**Phase 12 では `ModrinthProvider` のみ実装**。`CurseForgeProvider` は
Phase 13 で追加する空 stub を用意 (`throw new Error('Not implemented yet')`) して
UI で「未対応」表示に留める。

CurseForge `.zip` を Import しようとした場合:
```text
⚠️ CurseForge Modpack を検出しました
   このモッドパックは Phase 13 で対応予定です。
   現在は基本情報のみ表示できます:

   Name: All the Mods 9
   MC Version: 1.20.1
   Loader: Forge 47.2.0

   [ 詳細を見る ] [ キャンセル ]
```

---

## 6. UI / UX 仕様

### 5.1 予約 URL `/modpack`

`/modpack` は **Phase 12 の Modrinth Modpack ハブ** として予約済み
(`docs/planning/PHASE11_PLAN.md` §1.2.1)。

- **やってはいけない**: `/discover/modpack` へのリダイレクト、ルート削除
- **やること**: `.mrpack` Import、Modpack 更新検知、専用 UI をこの URL に載せる
- `/discover/modpack` は Modrinth 検索。`/modpack` は Phase 12 ハブとして分離する

### 6.1 Profile 作成モーダルの経路拡張

Phase 11 の 2 経路に **経路 C (Modpack)** を追加:

```text
[ フォルダから ] [ 個別ファイル ] [ Modpack ]
```

Modpack タブ:
```text
┌──────────────────────────────────────────────┐
│  Modpack から Profile を作成                 │
│                                              │
│  [ .mrpack ファイルを選択 ]                  │
│  対応形式: Modrinth .mrpack                  │
│  ⓘ CurseForge .zip は Phase 13 で対応予定    │
│                                              │
└──────────────────────────────────────────────┘
```

### 6.2 Profile 詳細画面のタブ拡張

Phase 11 の 3 タブに Modpack タブ (modpackSource がある Profile のみ) を追加:

```text
[ Mods (32) ] [ Resource Packs (8) ] [ Shaders (4) ] [ Modpack ]
                                                        ↑ Modpack 由来のみ
```

Modpack タブ内容:
- 現在の modpack version 表示
- 更新チェックボタン
- Modpack 説明・changelog
- 「Modpack を解除して自由編集する」オプション

### 6.3 Sync Preview + Apply UI

§3.2 で示した通り。**Apply ボタンは必ず末尾**、キャンセルは常に可能。

### 6.4 Sync History + Rollback UI

Settings ページに新セクション:

```text
Recent Sync Operations                      [ すべて表示 ]
─────────────────────────────────────────────
🟢 2026-08-24 10:35  4 ops applied (+3.2 MB)
   Profile: 1.21.1 Fabric 軽量化
   [ 詳細を見る ] [ Rollback ]

🟢 2026-08-23 14:12  2 ops applied (+800 KB)
   [ Rollback ]

🟢 2026-08-22 09:01  8 ops applied (-2.5 MB)
   [ Rollback ] ← 直近 3 回まで保持
```

---

## 7. 実装フェーズ分割 (Phase 12 内)

### Phase 12-A: 基盤 + Managed File + Diff Engine (2 週)

- [ ] `EnvironmentSink` 抽象 (`lib/env/sink.ts`)
- [ ] Chromium `FileSystemSink` (`lib/env/sink/filesystem.ts`)
  - Phase 11 handle を `requestPermission({ mode: 'readwrite' })` で昇格
- [ ] `ManagedFileRecord` の Dexie スキーマ + migration
- [ ] Phase 11 で残した Import snapshot を初期 `ManagedFileRecord` として展開
- [ ] `computeSyncPlan()` 実装 (Diff Engine)
- [ ] Unit tests (Diff の全 5 分類、fingerprint unchanged 検証含む)

**成果物**: Sync Plan が正しく計算される。UI / 実行はまだ。

### Phase 12-B: Preview UI + Transaction Journal + Executor (2 週)

- [ ] `SyncTransaction` の Dexie スキーマ
- [ ] Sync Preview UI 実装 (§3.2)
- [ ] `executeSync()` 実装 (§3.3)
- [ ] fingerprint 再検証 (実行直前)
- [ ] OPFS への Backup 実装 (`lib/env/backup.ts`)
- [ ] Rollback 実装
- [ ] Sync History UI (Settings ページ)

**成果物**: 実際に Chromium で Direct Write が動く。fallback とテストはまだ。

### Phase 12-C: ZIP Sink + Modrinth Modpack + Provider 抽象化 (1〜2 週)

- [ ] `ZipSink` 実装 (既存 `useZipExport` の拡張)
- [ ] `Provider` 抽象化 + `ModrinthProvider` 実装
- [ ] `.mrpack` パーサ + Import フロー (§4)
- [ ] Modpack 更新検知 + 独立 Preview UI (§4.3)
- [ ] Modpack タブ UI (§6.2)
- [ ] CurseForge `.zip` 検出 + 「未対応」表示 (§5)
- [ ] E2E テスト (mock handle 経由)

**成果物**: Phase 12 完成。Firefox/Safari でも ZIP 経由で Sync できる。

---

## 8. 実装上の注意点

### 8.1 Direct Write の非 atomic 性 (ChatGPT #7)

File System Access API では POSIX の rename atomic を期待できない。
**完全 atomic sync は諦めて Transaction Journal + Backup で復旧可能性を担保** する。

**やらないこと**:
- `.tmp` + rename パターンによる atomic 保証 (ブラウザ環境で信頼不可)

**やること**:
- 各 operation 前に Backup
- 各 operation 完了時に `completedOperationIds` に追加
- クラッシュ後の起動時: pending transaction を検出 → 「途中まで実行された Sync
  が存在します。Rollback しますか?」

### 8.2 Backup の quota 管理 (ChatGPT #8)

OPFS の quota は数 GB あるが、無限ではない:
- 各 SyncTransaction ごとに backup をまとめる (`backups/{txId}/`)
- 直近 3 transaction を超えたら古いものから自動削除
- Modpack 更新のような大量削除の場合、backup 総サイズが 500 MB を超えたら
  ユーザーに警告 + 「Backup なしで実行」オプション

### 8.3 Sync 中の UI ブロック

Sync 実行中は modal を表示 (ユーザーが誤って他操作しないよう):

```text
┌──────────────────────────────────────────────┐
│  ⚙️ Syncing...                                │
│                                              │
│  [██████████░░░░░░░░░] 5 / 8 files          │
│  Currently: Downloading sodium-0.6.0.jar     │
│                                              │
│  ⚠️ この操作は取り消せませんが、Rollback で   │
│    元に戻せます。                            │
│                                              │
└──────────────────────────────────────────────┘
```

キャンセルボタンは意図的に設けない (中途半端な状態を防ぐ)。ただし
FingerprintChangedError などの発生時は自動中断 + Rollback UI 提示。

### 8.4 【Phase 12 の絶対安全原則】

- **fingerprint unchanged チェックなしに delete しない** (ChatGPT #12)
- **Preview なしに execute しない** (ChatGPT #6)
- **Backup なしに execute しない** (ChatGPT #7/#8)
- **Unknown ファイルは絶対削除しない** (Phase 11 から継続)

### 8.5 テスト戦略

- **Unit**: Diff Engine の 5 分類、fingerprint 検証、Transaction 状態遷移、
  Backup 保存/復元、Rollback
- **Integration**: MSW で Modrinth API モック、SyncPlan → Preview → Execute の
  全経路
- **E2E**: `__e2e_mock_handle__` で FileSystemDirectoryHandle を stub 化、
  実際の write / delete 検証

---

## 9. 未解決の設計論点（実装前に確定すべき）

- [ ] Chromium: `read` handle を `readwrite` 昇格失敗時の UX
      (ユーザーが「読み取りのみ」に留めた場合、Phase 11 モードに fallback)
- [ ] Modpack 更新時にユーザーの追加 Mod (source: 'dropmod') と競合したら?
      (例: Modpack 新 version が同名 Mod を含む)
- [ ] Sync 実行中にブラウザタブを閉じられた場合の resume UX
- [ ] OPFS quota 逼迫時の LRU 削除順序 (古い順 or 大きい順)
- [ ] Modpack を「解除して自由編集」した場合、既存 `ManagedFileRecord.source: 'modpack'`
      をどう扱うか (全て 'import' に昇格? or そのまま残す?)

---

## 10. ChatGPT レビュー (2026-08-24) 反映状況

| # | 提案内容 | Phase 12 反映 |
|---|---|---|
| 1 | Import/Sync 分離 | ✅ Phase 11 完了前提 |
| 2 | ContentRef + Artifact 分離 | ✅ Phase 11 から継承 |
| 3 | UnknownFile.location | ✅ Phase 11 から継承 |
| 4 | ManagedFileRecord 拡張 | ✅ §2.3.1 |
| 5 | Ownership Model | ✅ §2.3.1 (ownership × source の 2 軸) |
| 6 | SyncPlan 分離 | ✅ §2.1 / §2.3.2 |
| 7 | Transaction Journal | ✅ §2.3.3 / §3.3 / §3.4 |
| 8 | Blob backup (OPFS) | ✅ §2.3.4 |
| 9 | Modpack は Source | ✅ §4.1 |
| 10 | .mrpack Artifact-first | ✅ §4.2 |
| 11 | CurseForge を外へ | ✅ Phase 13 に移動、§5 で入口のみ準備 |
| 12 | fingerprint 必須 | ✅ §3.1 削除条件 / §3.3 実行直前再検証 |
| 13 | Import 直後 snapshot | ✅ Phase 11-C で保存済み想定、§7 Phase 12-A で活用 |
| 14 | Detector Strategy | ✅ Phase 11 完了 |
| 15 | Web Worker SHA-1 | ✅ Phase 11 完了、Phase 12 でも活用 |
| 16 | Batch API + cache | ✅ Phase 11 完了、Phase 12 でも活用 |
| 17 | 見積り | ✅ Phase 12 は 4〜5 週 |
| 18 | Scope 縮小 | ✅ config は最小 (§4.2)、他は Roadmap 2 |
| 19 | Phase 細分 | ✅ 12-A/B/C の 3 段 |

---

**関連ドキュメント**:
- `docs/planning/PHASE10_CANDIDATES.md` — 現在進行中の Phase 10
- `docs/planning/PHASE11_PLAN.md` — Phase 11 (Read-only Import)
- `docs/planning/PHASE13_PLAN.md` — Phase 13 (CurseForge 完全対応)
- 既存資産: `hooks/useZipImport.ts`, `hooks/useZipExport.ts`,
  `hooks/useDependencyCheck.ts`, `lib/modrinth/client.ts`, `lib/utils/hash.ts`
