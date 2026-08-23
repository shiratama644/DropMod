# Phase 11: DropMod ローカル Minecraft 環境連携

**ステータス**: 計画中（仕様推敲済み、実装未着手）
**優先度**: 🔴 最重要 — DropMod の核心価値の 10 倍化
**見積工数**: 7〜10 週間（1 人フルタイム換算）
**着手前提**: Phase 10 (Vercel 本番デプロイ) 完了

---

## 1. 概要と目的

### 1.1 目的

本機能は、DropMod の Profile を「単なるダウンロード対象の Mod リスト」から
**「ローカルの実際の Minecraft 環境と双方向に紐づく構成管理単位」** へと拡張する。

既存の Minecraft フォルダを取り込んで **Minecraft 本体・Loader のバージョン情報
および Mod 等を自動解析・プロファイル化（Import）** し、依存関係や互換性の検証を
行った上で、プロファイル編集時にはローカル環境との **差分のみを直接適用（Sync）**
する仕組みを提供する。

### 1.2 コアバリュー

- **環境情報の自動特定**: フォルダを選択するだけで Minecraft Version / Loader / Loader Version を自動判定
- **ワンクリック・インポート**: 既存環境の Mod / リソースパック / シェーダーをハッシュ値から自動識別
- **安全な互換性検証**: 依存関係の欠落やバージョン不整合を実行前に検知
- **高速な差分同期**: 変更・追加されたファイルのみをダイレクトにローカルへ書き込み
- **安全なファイル管理**: ユーザーが手動で入れた未管理ファイルを誤って削除しない安全設計

### 1.3 副次的に得られる価値

- **Profile Snapshot**: 現状の実 Minecraft 環境を「初期状態」として保存、後で戻せる
- **Multi-Instance Support**: 複数の `.minecraft` を切り替え管理
- **Backup / Restore**: Sync 前に既存 mods を zip でバックアップ
- **モバイル閲覧 + PC 同期**: モバイルで「これ入れたい」→ PC で同期実行（クロスデバイス UX）

---

## 2. 対応ブラウザとフォールバック方針

### 2.1 File System Access API の対応状況（2026 年時点）

| ブラウザ | `showDirectoryPicker()` | 本機能の対応 |
|---|---|---|
| Chrome / Edge / Opera / Brave / Arc (Desktop) | ✅ | フル機能 |
| Firefox (全プラットフォーム) | ❌ Mozilla が "harmful" 判定 | ZIP フォールバック |
| Safari (macOS / iOS / iPadOS) | ❌ OPFS のみ | ZIP フォールバック |
| モバイル Chrome (Android/iOS) | ❌ | ZIP フォールバック |

### 2.2 UX 分岐設計

Feature detection を最初に行い、UI を分岐する:

```typescript
const supportsFileSystemAccess =
  typeof window !== 'undefined' &&
  typeof window.showDirectoryPicker === 'function';
```

#### Chromium 系（フル機能モード）
- 「フォルダから取り込み」ボタン → `showDirectoryPicker({ mode: 'readwrite' })`
- Sync 実行 → Direct Write

#### 非対応ブラウザ（ZIP フォールバックモード）
- 「ZIP から取り込み」ボタン（既存の `hooks/useZipImport.ts` を流用）
  - 事前に「.minecraft を ZIP 化する手順」の説明を UI 内で提供
- Sync 実行 → ZIP ダウンロード（既存の `hooks/useZipExport.ts` を流用）
- 「フル機能を使うには Chrome/Edge をご利用ください」の情報バナー

### 2.3 実装上の統一

**Import と Sync の抽象化レイヤー** を用意し、Chromium と ZIP モードで共通の
インターフェースを提供:

```typescript
interface EnvironmentSource {
  kind: 'filesystem' | 'zip';
  root: FileSystemDirectoryHandle | JSZip;
  readFile(path: string): Promise<Uint8Array>;
  listFiles(subdir: string): Promise<string[]>;
}

interface EnvironmentSink {
  kind: 'filesystem' | 'zip';
  writeFile(path: string, data: Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  finalize?(): Promise<Blob>; // ZIP 側のみ、DL 用 Blob 生成
}
```

上位ロジック（Analysis / Diff Engine / Sync）はこの抽象を通じて動作し、
下位実装のみブラウザ対応で分岐する。

---

## 3. 全体フローとアーキテクチャ

### 3.1 全体処理フロー

```text
[ ユーザー ]
     │
     ▼ ① Minecraftフォルダ選択
       (Chromium: showDirectoryPicker / 非対応: ZIP アップロード)
┌────────────────────────────────────────────────────────┐
│ ルート判定 & フォルダ構造検出                          │
│  - 公式ランチャー: versions/ を持つ .minecraft         │
│  - Prism/MultiMC:  mmc-pack.json を持つ instance root  │
│  - フォールバック: 全て空 → ユーザー手動入力           │
└───────────────────────────┬────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
【 環境情報の解析 】                     【 ファイルの解析 】
・versions/*.json や                    ・各ファイルの SHA-1 算出
  mmc-pack.json を解析                   (Modrinth API 仕様に合わせて)
・Minecraft Version / Loader特定        ・Modrinth /version_files で照合
・Loader Version 特定                   ・メタデータ取得
        │                                       │
        └───────────────────┬───────────────────┘
                            ▼ ② Profile 自動生成 (Import)
┌────────────────────────────────────────────────────────┐
│ Profile Analysis (自動検証)                            │
│  - 依存関係 / MCバージョン / Loader互換性              │
│  - 競合 / 未知ファイル (Unknown)                       │
└───────────────────────────┬────────────────────────────┘
                            ▼ ③ 結果確認 & Profile編集 (UI)
[ ユーザー: ダウンロード / 同期実行 ]
                            │
                            ▼ ④ 差分計算 (Profile vs ローカル環境)
                ┌───────────┼───────────┐
                ▼           ▼           ▼
           【 変更なし 】 【 追 加 】 【 削除/更新 】
             (Skip)      (Download)  (3 状態ポリシーに基づき処理)
                            │
                            ▼ ⑤ Sync Preview UI で確認
                            ▼ ⑥ ローカルフォルダへ直接反映
                              (Direct Write / ZIP DL)
```

### 3.2 アーキテクチャ原則（Import と Sync の完全分離）

| 処理区分 | 方向 | 役割 |
|---|---|---|
| **Import** | `Local Folder` → `Profile` | 既存環境のバージョン情報・ファイルを解析し、Profile を構築・初期入力する |
| **Sync** | `Profile` ⇄ `Local Folder` | Profile を正 (SSOT) とし、ローカル環境との差分を計算して直接書き込む |

---

## 4. インポート仕様（Local → Profile）

### 4.1 フォルダ選択とルート判定

#### Chromium 系
```typescript
const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
// IndexedDB に永続化して次回起動時に requestPermission で復元
await dexie.dirHandles.put({ profileId, handle, addedAt: Date.now() });
```

#### 非対応ブラウザ
既存の `hooks/useZipImport.ts` を拡張して `.minecraft` 全体 ZIP を受け入れる。

### 4.2 ルート種別判定（多段 fallback）

```
1. mmc-pack.json があれば → Prism / MultiMC / PolyMC
2. modrinth_profile.json があれば → Modrinth App (Phase 11-D)
3. versions/ ディレクトリがあれば → 公式ランチャー
4. mods/ など個別ディレクトリのみ → シンプル extract として処理
5. 全て失敗 → ユーザー手動選択 (Minecraft Version / Loader 手入力)
```

### 4.3 対象ディレクトリ

- `versions/` — バージョン JSON・メタデータ（公式ランチャー）
- `mmc-pack.json` — インスタンス定義（Prism/MultiMC）
- `mods/` — Mod ファイル (`.jar`)
- `resourcepacks/` — リソースパック (`.zip`)
- `shaderpacks/` — シェーダーパック (`.zip`)

対象ディレクトリが存在しない場合はエラーとせず、「空」として安全に処理を継続。
将来的に `config/` や `saves/` 等への拡張が可能な構造とする。

### 4.4 Minecraft 環境情報の自動検出

#### 公式ランチャー: `versions/*.json` パーサ

想定バージョン JSON 例:

```json
// versions/fabric-loader-0.16.0-1.21.1/fabric-loader-0.16.0-1.21.1.json
{
  "id": "fabric-loader-0.16.0-1.21.1",
  "inheritsFrom": "1.21.1",
  "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
  "libraries": [
    { "name": "net.fabricmc:fabric-loader:0.16.0", ... }
  ]
}
```

判定ロジック:

| Loader | 判定条件 | Version 抽出 |
|---|---|---|
| **Fabric** | `mainClass` 先頭が `net.fabricmc.loader` | `libraries` から `net.fabricmc:fabric-loader:X.Y.Z` |
| **Quilt** | `mainClass` 先頭が `org.quiltmc.loader` | `libraries` から `org.quiltmc:quilt-loader:X.Y.Z` |
| **Forge** | `mainClass` 先頭が `cpw.mods.bootstraplauncher` かつ library に `net.minecraftforge:forge` | `libraries` から抽出 |
| **NeoForge** | `mainClass` 先頭が `cpw.mods.bootstraplauncher` かつ library に `net.neoforged:neoforge` | 同上 |
| **Vanilla** | `mainClass` 先頭が `net.minecraft` | Loader なし |

**MC Version 抽出**:
- `inheritsFrom` フィールドが最優先（"1.21.1" 形式）
- 無ければ `id` からパース（"fabric-loader-0.16.0-1.21.1" → "1.21.1"）
- 完全失敗時は Analysis View で警告

#### Prism/MultiMC: `mmc-pack.json` パーサ

想定 JSON 例:

```json
{
  "formatVersion": 1,
  "components": [
    { "uid": "net.minecraft", "version": "1.21.1" },
    { "uid": "net.fabricmc.fabric-loader", "version": "0.16.0" }
  ]
}
```

判定ロジック（`components[].uid` の prefix マッチ）:

| uid prefix | Loader |
|---|---|
| `net.minecraft` | Minecraft Version |
| `net.fabricmc.fabric-loader` | Fabric |
| `org.quiltmc.quilt-loader` | Quilt |
| `net.minecraftforge` | Forge |
| `net.neoforged` | NeoForge |

**注意**: Prism/MultiMC は `.minecraft` サブフォルダを持たない場合が多く、
`mods/` は instance root 直下 or `.minecraft/mods/`。両方確認する必要あり。

#### 手動フォールバック UI

自動検出失敗時 or ユーザーが上書きしたい場合、既存の Profile 作成モーダルの
ドロップダウンを再利用（Minecraft Version / Loader / Loader Version）。

### 4.5 Profile への保持イメージ

```typescript
interface Profile {
  // 既存フィールド
  id: string;
  name: string;
  mcVersion: string;
  loader: 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt';
  description: string;
  mods: ModItem[];

  // Phase 11 追加フィールド
  loaderVersion?: string;                    // 0.16.0 (Fabric)
  linkedDirHandle?: FileSystemDirectoryHandle; // Chromium 版のみ
  linkedRootType?: 'official' | 'prism' | 'modrinth-app' | 'manual';
  resourcepacks?: FileItem[];
  shaderpacks?: FileItem[];
  unknownFiles?: UnknownFile[];
}

interface UnknownFile {
  category: 'mod' | 'resourcepack' | 'shaderpack';
  filename: string;
  sha1: string;
  size: number;
  addedToProfileAt: number;
}
```

### 4.6 ファイル解析

1. **ハッシュ計算**: 各ファイルの `SHA-1` を算出
   - **理由**: Modrinth API (`/version_files`) が SHA-1 と SHA-512 のみ対応。
     既存の `lib/utils/hash.ts` に SHA-1 実装あり、再利用可能
   - SHA-256 で照合するには他 API（CurseForge 等）が必要 → Roadmap 2
2. **メタデータ取得**: パス、ファイル名、サイズ、SHA-1、種別
3. **API 照合**: `POST /version_files` にハッシュ配列を送信、Modrinth 側で該当プロジェクト特定
4. **Unknown File 記録**: 特定不可なファイルは `unknownFiles[]` に永続化

```text
[ mods/sodium-custom.jar ]
       │ (SHA-1: e3b0c442...)
       ▼
 [ Modrinth /version_files ]
       │
 ┌─────┴────────────────────────────────┐
 │ Project: Sodium                      │
 │ Version: 0.5.8                       │
 │ Loader : Fabric                      │
 │ MC Ver : 1.21.1                      │
 └──────────────────────────────────────┘
```

---

## 5. 自動検証仕様（Profile Analysis）

Profile インポート完了時および編集時に、検出された「Minecraft Version / Loader」を基準として以下の検証エンジンを自動実行する。

| 検証項目 | 内容 | 判定基準 |
|---|---|---|
| **依存関係 (Dependencies)** | 必須 Mod（例: Fabric API, Cloth Config 等）が含まれているか | 欠落時は `MISSING` 警告 |
| **MC 互換性 (MC Version)** | Profile で検出/指定された MC バージョンに対応しているか | バージョン不一致を警告 |
| **Loader 互換性 (Loader)** | Profile で検出/指定された Loader と一致しているか | Loader 不一致をエラー提示 |
| **競合検出 (Conflicts)** | 同時導入が不可とされている Mod 同士が存在しないか | 競合警告を提示 |
| **未識別 (Unknown Files)** | ハッシュ照合できなかったファイルの有無 | 注意喚起（手動確認用） |

**既存の `hooks/useDependencyCheck.ts` を再利用可能**。unknownFiles だけ追加検証が必要。

---

## 6. 同期・反映仕様（Profile → Local）

### 6.1 差分同期エンジン（Diff Engine）

「同期」実行時、Profile とローカル環境を突き合わせ、3 つのステータスに分類する。

```text
Profile構成:   [ Mod A ] [ Mod B ] [ Mod C ]
ローカル環境:  [ Mod A ] [ Mod B ] [ Mod D (未管理) ]

    ▼ 差分計算結果
    ・Mod A : 変更なし ───> スキップ
    ・Mod B : 変更なし ───> スキップ
    ・Mod C : 追加 ───────> ダウンロードしてローカルへ直接配置
    ・Mod D : 未管理 ─────> 保持（削除しない）
```

### 6.2 3 状態ファイル管理ポリシー（Managed 3-State）

Dexie にファイル origin を永続化して 3 状態を厳格化する:

```typescript
interface ManagedFileRecord {
  profileId: string;
  category: 'mod' | 'resourcepack' | 'shaderpack';
  filename: string;
  sha1: string;
  addedAt: number;
  source: 'dropmod-download' | 'imported-from-existing';
}
```

| 状態 | 定義 | Sync 時の挙動 |
|---|---|---|
| **Unmanaged (Unknown)** | ユーザーが手動でフォルダに入れた、DropMod 側の記録なし | **絶対に削除しない**。UI 上は「未管理」バッジ表示 |
| **Imported-Managed** | Import 時に取り込み、`source: 'imported-from-existing'` | Profile から削除された場合、**確認ダイアログを表示してからオプトイン削除** |
| **DropMod-Downloaded** | DropMod が追加した、`source: 'dropmod-download'` | Profile から削除された場合、**自動削除**（DropMod が入れたものなので責任範囲） |

### 6.3 Sync Preview UI

Direct Write 実行前に必ず以下の Preview 画面を表示（**Dry Run**）:

```text
┌──────────────────────────────────────────────┐
│  Sync Preview                                │
│                                              │
│  🟢 追加 (2)                                 │
│  ✚ Sodium 0.5.9         (3.2 MB)             │
│  ✚ Iris 1.8.0            (1.8 MB)            │
│                                              │
│  🟡 更新 (1)                                 │
│  ✎ Lithium 0.11.2 → 0.12.0                   │
│                                              │
│  🔴 削除 (1)                                 │
│  ✖ Fabric API [DropMod 追加、自動削除]       │
│                                              │
│  🔵 保持 (Unknown)                           │
│  ○ some-custom.jar (未管理、削除しません)    │
│                                              │
│  ⚠️ 削除確認 (Imported-Managed)              │
│  ? Cloth Config [Import 由来、削除しますか?] │
│    [ 削除する ] [ 保持する ]                 │
│                                              │
│  合計サイズ変化: +3.4 MB                     │
│                                              │
│  [ キャンセル ]  [ 4 件を適用 ]              │
└──────────────────────────────────────────────┘
```

### 6.4 Direct Write（Chromium 系）

```typescript
async function writeFileToDir(
  dir: FileSystemDirectoryHandle,
  path: string, // 'mods/sodium.jar'
  data: Uint8Array
) {
  const [subdir, filename] = path.split('/');
  const subdirHandle = await dir.getDirectoryHandle(subdir, { create: true });
  const fileHandle = await subdirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}
```

**配置先**:
- Mod → `mods/<filename>.jar`
- Resource Pack → `resourcepacks/<filename>.zip`
- Shader Pack → `shaderpacks/<filename>.zip`

### 6.5 パーミッション永続化

セッション間で `FileSystemDirectoryHandle` を保持する:

```typescript
// 保存 (Dexie)
await dexie.dirHandles.put({
  profileId,
  handle, // FileSystemHandle は structured clone 可能
  savedAt: Date.now()
});

// 復元時 (次回起動)
const { handle } = await dexie.dirHandles.get(profileId);
const perm = await handle.queryPermission({ mode: 'readwrite' });
if (perm === 'granted') {
  // 即使用可能
} else if (perm === 'prompt') {
  // ユーザーに再許可要求
  await handle.requestPermission({ mode: 'readwrite' });
}
```

### 6.6 Rollback / Undo（推奨）

Sync 前に「削除される予定のファイル」を Dexie の `syncBackups` テーブルに
ZIP 化して保管し、直近 3 回分の Sync を Undo 可能にする。

```typescript
interface SyncBackup {
  profileId: string;
  syncedAt: number;
  removedFiles: Array<{ path: string; contentBase64: string }>;
  addedFiles: string[]; // Undo 時に削除する
}
```

---

## 7. UI / UX 仕様

### 7.1 Profile 作成モーダル（自動検出 & 手動編集対応）

Chromium 版:
```text
┌──────────────────────────────────────────────┐
│  Create Profile                              │
│                                              │
│  Profile Name                                │
│  [ My Fabric Instance                      ] │
│                                              │
│  Minecraft Folder (Optional)                 │
│  [ C:\Users\...\.minecraft ] [ フォルダ選択 ]│
│                                              │
│  ─────────────────────────────────────────── │
│  Environment Settings (自動検出 / 編集可)    │
│                                              │
│  Minecraft Version   Loader       Version    │
│  [ 1.21.1        ▼] [ Fabric  ▼] [ 0.16.0 ▼] │
│   ✓ .minecraft/versions から自動検出         │
│                                              │
│              [ キャンセル ] [ Create Profile ] │
└──────────────────────────────────────────────┘
```

非対応ブラウザ版:
```text
┌──────────────────────────────────────────────┐
│  Create Profile                              │
│                                              │
│  Profile Name                                │
│  [ My Fabric Instance                      ] │
│                                              │
│  ℹ️ .minecraft から取り込むには Chrome/Edge を│
│    ご利用ください。それ以外の場合は ZIP を    │
│    アップロードしてください。                 │
│  [ .minecraft.zip をアップロード ]           │
│                                              │
│  ─────────────────────────────────────────── │
│  Environment Settings                        │
│                                              │
│  Minecraft Version   Loader       Version    │
│  [ 1.21.1        ▼] [ Fabric  ▼] [ 0.16.0 ▼] │
│                                              │
│              [ キャンセル ] [ Create Profile ] │
└──────────────────────────────────────────────┘
```

### 7.2 インポート・解析結果画面（Analysis View）

```text
┌──────────────────────────────────────────────┐
│  Profile Imported Successfully               │
│                                              │
│  Target: Minecraft 1.21.1 (Fabric 0.16.0)    │
│  Root  : 公式ランチャー (.minecraft)         │
│  Files : 32 Mods / 8 Resource Packs / 4 Shaders │
│                                              │
│  Analysis Result:                            │
│  ✓ Minecraft Compatibility                   │
│  ✓ Loader Compatibility                      │
│  ⚠ 2 Warnings (1 Unrecognized Mod)           │
│  ✗ 1 Dependency Missing: Requires [Cloth API]│
│                                              │
│          [ View Details ] [ Continue (完了) ] │
└──────────────────────────────────────────────┘
```

### 7.3 Sync Preview 画面

前述 §6.3 参照。

### 7.4 パーミッション再要求 UX

次回起動時に自動で `requestPermission` を叩いてスムーズに再開:

```text
┌──────────────────────────────────────────────┐
│  🔒 Minecraft フォルダへのアクセス            │
│                                              │
│  以前選択された .minecraft フォルダへの        │
│  アクセスを再度許可してください。             │
│                                              │
│  Path: C:\Users\...\.minecraft               │
│                                              │
│  [ 別のフォルダを選び直す ] [ 許可する ]      │
└──────────────────────────────────────────────┘
```

---

## 8. 実装フェーズ分割

### Phase 11-A: 基盤 (2〜3 週)

- [ ] Feature detection ユーティリティ (`lib/env/capabilities.ts`)
- [ ] `FileSystemDirectoryHandle` の Dexie 永続化 (`lib/db/dexie.ts` に `dirHandles` テーブル追加)
- [ ] `EnvironmentSource` / `EnvironmentSink` 抽象レイヤー (`lib/env/source.ts`, `lib/env/sink.ts`)
- [ ] `showDirectoryPicker` ラッパー + パーミッション管理 (`lib/env/picker.ts`)
- [ ] 公式ランチャー用 `versions/*.json` パーサ (`lib/env/parser/official.ts`)
- [ ] ルート判定ロジック (`lib/env/detect-root.ts`)
- [ ] SHA-1 でのファイル解析 + Modrinth 照合 (既存 `lib/utils/hash.ts` + `fetchModrinthVersionFilesBatch` 再利用)
- [ ] Read-only モードで Import だけ動く MVP

**成果物**: `showDirectoryPicker → 公式 .minecraft を解析 → Profile 作成` の一連が動く。
Sync はまだ。

### Phase 11-B: Analysis + Prism 対応 (2 週)

- [ ] Prism/MultiMC の `mmc-pack.json` パーサ (`lib/env/parser/prism.ts`)
- [ ] ルート判定に Prism 分岐を追加
- [ ] 既存 `useDependencyCheck` を再利用した Analysis View 実装
- [ ] Unknown Files 永続化 (`profiles.unknownFiles`)
- [ ] Analysis 結果画面 (§7.2)

**成果物**: Import → Analysis の全フロー完成、公式 + Prism 両対応。

### Phase 11-C: Sync (2〜3 週)

- [ ] Diff Engine (`lib/env/diff.ts`)
- [ ] ManagedFileRecord テーブル (Dexie)
- [ ] 3 状態管理ロジック（Unmanaged / Imported-Managed / DropMod-Downloaded）
- [ ] Sync Preview UI (§6.3)
- [ ] Direct Write 実装 (`lib/env/writer.ts`)
- [ ] Rollback / Undo (Dexie `syncBackups` テーブル)
- [ ] ZIP フォールバック実装（既存 `hooks/useZipExport.ts` 拡張）

**成果物**: フル機能の双方向 Sync 完成。

### Phase 11-D (任意): 追加ランチャー対応 (1〜2 週)

- [ ] Modrinth App の `modrinth_profile.json` パーサ
- [ ] CurseForge の `minecraftinstance.json` パーサ（要調査）
- [ ] Roadmap 2 の対応

---

## 9. 実装上の注意点（Gotchas）

### 9.1 Loader 判定の落とし穴

- **NeoForge vs Forge**: 両方 `cpw.mods.bootstraplauncher.BootstrapLauncher` を使う。
  必ず `libraries` の namespace で区別する
- **Old Forge (1.12.x 以下)**: `mainClass: "net.minecraft.launchwrapper.Launch"` で別扱い
  → **1.13+ のみサポートを明示** (`docs/planning/PHASE11_PLAN.md` 冒頭に注記推奨)
- **Fabric + Quilt 共存インストール**: 稀だが複数ローダーが同居する可能性 → 検出順位定義

### 9.2 SHA アルゴリズム統一

- **Modrinth `/version_files` は SHA-1 か SHA-512**
- 既存 `lib/utils/hash.ts` に `calculateSha1` あり → **これを使う**
- 仕様書初版の "SHA-256" は誤り、SHA-1 に修正済み

### 9.3 パーミッション UX

- Chrome 122+ でパーミッション persist が改善したが、**タブを閉じると失われる**
- Dexie に handle 保存 → 次回起動時に `requestPermission()` を叩いて再有効化
- **失敗時のフォールバック**: `queryPermission()` が `denied` を返したら、
  ユーザーに「別のフォルダを選び直す」オプションを提示

### 9.4 削除の絶対安全原則

**絶対に守るルール** (仕様書再掲):

> **「Profile に存在しない」という理由だけで、未管理（Unknown）ファイルを勝手に削除してはならない。**
> 削除対象とするのは、以前 DropMod が管理対象として追加し、その後 Profile から明示的に削除されたファイルのみとする。

**追加ルール** (3 状態化に合わせて):
> Imported-Managed ファイルを削除する際は **必ずユーザーの明示的な確認** を経る。
> Sync Preview で赤バッジ + confirm dialog で二重確認。

### 9.5 モバイル UX

モバイル（Android/iOS）は File System Access API が使えないので、
「モバイル閲覧 + PC 同期」パターンを積極的に打ち出す:

- モバイルで Mod を検索 → Profile に追加
- PC で「Sync」ボタンを押すと Direct Write

このパターンは **DropMod 独自の強み** になる。

### 9.6 テスト戦略

- **Unit**: パーサ (公式 / Prism) の JSON パース、Diff Engine の状態遷移、3 状態管理ロジック
- **Integration**: MSW で Modrinth `/version_files` モック、msw で SHA-1 バッチ照合
- **E2E**: Playwright で `showDirectoryPicker` を実行できないため、**Chromium バイナリの限定的な API に頼るしかない**（実際は E2E 難しい、`__e2e_mock_handle__` を試験モードで用意する等の工夫が必要）

---

## 10. Roadmap（Phase 11 以降）

1. **Config・Save データの同期拡張** (Phase 11-E?)
   - `config/` フォルダの設定ファイル同期やバックアップ機能
2. **他プラットフォーム対応** (Phase 11-F?)
   - CurseForge へのマルチソースハッシュ検索の拡張
   - `POST /minecraft/mod/description/fingerprint` (CurseForge API) で Murmur2 照合
3. **ランチャー連携拡張** (Phase 11-G?)
   - GDLauncher / ATLauncher などのランチャーインスタンス構造

---

## 11. 未解決の設計論点（実装前に確定すべき）

- [ ] `.minecraft` ではなく Prism instance root (`instances/<name>/`) を選ばれた場合の
      「保存フォルダ表示ラベル」の UX
- [ ] Profile が指定する mcVersion / loader と、Import 元の環境の mcVersion / loader が
      **不一致** な場合の警告レベル (error / warning / info)
- [ ] Direct Write でクラッシュ (書き込み途中で中断) した場合の recovery
      （partial write 対応、`.tmp` + rename パターンなど）
- [ ] ZIP フォールバックで .minecraft 全体を扱う場合の **メモリ制約** (数百 MB になる可能性)
      → Stream 処理必須、jszip の `generateAsync({ streamFiles: true })` 検討

---

**関連ドキュメント**:
- `docs/planning/PHASE10_CANDIDATES.md` — 現在進行中の Phase 10
- `docs/audit/issues-legacy.md` — 過去の設計判断の履歴
- 既存資産: `hooks/useZipImport.ts`, `hooks/useZipExport.ts`, `hooks/useDependencyCheck.ts`,
  `lib/modrinth/client.ts`, `lib/utils/hash.ts`
