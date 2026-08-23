# Phase 11: DropMod ローカル Minecraft 環境連携

**ステータス**: 計画中（仕様推敲済み、実装未着手）
**優先度**: 🔴 最重要 — DropMod の核心価値の 10 倍化
**見積工数**: 7〜10 週間（1 人フルタイム換算）
**着手前提**: Phase 10 の**開発項目** (bundle 削減 / AppContext 削除 / Markdown 画像最適化 / E2E 拡張 / shimmer skeleton) 完了
**Vercel デプロイとの関係**: Vercel 本番デプロイは Phase 10 + **本 Phase 11 の全項目完了後**の最終ステップに変更 (2026-08-24 決定、Hobby プランのリソース制約対策、詳細は `docs/planning/PHASE10_CANDIDATES.md` 冒頭「【重要方針】」節参照)

---

## 1. 概要と目的

### 1.1 目的

本機能は、DropMod の Profile を「単なるダウンロード対象の Mod リスト」から
**「ローカルの実際の Minecraft 環境と双方向に紐づく構成管理単位」** へと拡張する。

既存の Minecraft フォルダを取り込んで **Minecraft 本体・Loader のバージョン情報
および 4 カテゴリ (Mods / ResourcePacks / Shaders / Modpack) を自動解析・
プロファイル化（Import）** し、依存関係や互換性の検証を行った上で、プロファイル
編集時にはローカル環境との **差分のみを直接適用（Sync）** する仕組みを提供する。

### 1.2 対応する 4 カテゴリ

DropMod は以下 4 カテゴリを**同等の第一級市民**として扱う。UI/内部モデル/
Sync ロジックいずれもこの 4 分類を軸に設計する:

| カテゴリ | 実体 | 配置先 | 主なソース | Modrinth 種別 |
|---|---|---|---|---|
| **Mods** | 個別 `.jar` ファイル | `mods/` | Modrinth `/project?facets=[["project_type:mod"]]` | `mod` |
| **ResourcePacks** | `.zip` (テクスチャ) | `resourcepacks/` | Modrinth 同上 `resourcepack` | `resourcepack` |
| **Shaders** | `.zip` (`OptiFine/Iris` シェーダー) | `shaderpacks/` | Modrinth 同上 `shader` | `shader` |
| **Modpack** | `.mrpack` / `.zip` (パッケージ全体) | Profile 全体を丸ごと構築 | Modrinth 同上 `modpack`、CurseForge | `modpack` |

**Modpack の特殊性**:
- 単一ファイルではなく、Mod / ResourcePack / Shader / Config の**集合体**
- Import 挙動: modpack ファイル 1 個を選ぶと Profile が丸ごと構築される
- Sync 挙動: modpack version 自体が更新される（内部の 3 カテゴリの完全差し替え）
- 形式: `.mrpack` (Modrinth Index)、`.zip` (CurseForge Manifest)、他ランチャー独自

### 1.3 コアバリュー

- **環境情報の自動特定**: フォルダを選択するだけで Minecraft Version / Loader / Loader Version を自動判定
- **ワンクリック・インポート**: 既存環境の Mods / ResourcePacks / Shaders / Modpack をハッシュ値または manifest から自動識別
- **Modpack 統合**: `.mrpack` / CurseForge zip を丸ごと import し、Profile として管理
- **安全な互換性検証**: 依存関係の欠落やバージョン不整合を実行前に検知
- **高速な差分同期**: 変更・追加されたファイルのみをダイレクトにローカルへ書き込み
- **安全なファイル管理**: ユーザーが手動で入れた未管理ファイルを誤って削除しない安全設計

### 1.4 副次的に得られる価値

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
// カテゴリ型 (Phase 11 全体で統一)
type ContentCategory = 'mod' | 'resourcepack' | 'shader' | 'modpack';

// カテゴリ → 配置サブディレクトリのマッピング
const CATEGORY_DIR: Record<Exclude<ContentCategory, 'modpack'>, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
};
// modpack は Profile 全体に展開されるので単一ディレクトリを持たない

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

// Modpack 専用: 単一ファイル (.mrpack / CurseForge zip) から Profile を丸ごと構築
interface ModpackImporter {
  kind: 'mrpack' | 'curseforge-zip';
  parse(file: File | Uint8Array): Promise<ParsedModpack>;
}

interface ParsedModpack {
  name: string;
  version: string;
  minecraftVersion: string;
  loader: 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt';
  loaderVersion?: string;
  entries: Array<{
    category: 'mod' | 'resourcepack' | 'shader';
    filename: string;
    sha1?: string;
    downloadUrl?: string; // Modrinth の場合は事前解決済み URL
    size?: number;
  }>;
  overrides?: Map<string, Uint8Array>; // config/ 等の生ファイル
  source: {
    projectId?: string;   // Modrinth modpack project id (更新検知用)
    versionId?: string;   // Modrinth modpack version id
    originalFile: 'mrpack' | 'curseforge-zip';
  };
}
```

上位ロジック（Analysis / Diff Engine / Sync）はこの抽象を通じて動作し、
下位実装のみブラウザ対応で分岐する。Modpack は独自の入力経路
(`ModpackImporter`) を持ち、`ParsedModpack` を経由して既存の 3 カテゴリ
処理フローに合流する。

---

## 3. 全体フローとアーキテクチャ

### 3.1 全体処理フロー

Import には **3 つの入力経路** がある:

```text
[ ユーザー ]
     │
     ├─ 経路 A: Minecraft フォルダを丸ごと選択
     │     (Chromium: showDirectoryPicker / 非対応: .minecraft.zip アップロード)
     │     → mods/ resourcepacks/ shaderpacks/ を個別 hash 照合
     │
     ├─ 経路 B: 個別ファイルをアップロード
     │     .jar / .zip 単体を Modrinth 検索 or hash 照合
     │
     └─ 経路 C: Modpack ファイルを選択
           .mrpack (Modrinth) / .zip (CurseForge Manifest)
           → Profile を丸ごと構築 (内部で経路 A の解析ロジックに合流)
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ ルート判定 & 構造検出                                  │
│  - [経路 A] 公式ランチャー: versions/ を持つ .minecraft │
│  - [経路 A] Prism/MultiMC:  mmc-pack.json を持つ       │
│  - [経路 C] .mrpack:        modrinth.index.json を持つ │
│  - [経路 C] CurseForge zip: manifest.json を持つ       │
│  - フォールバック: 全て失敗 → ユーザー手動入力         │
└───────────────────────────┬────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
【 環境情報の解析 】                     【 ファイルの解析 】
・versions/*.json /                     ・各ファイルの SHA-1 算出
  mmc-pack.json /                        (Modrinth API 仕様に合わせて)
  modpack manifest を解析               ・Modrinth /version_files で照合
・Minecraft Version / Loader特定        ・Modrinth /project_type で
・Loader Version 特定                     category 判定 (mod / rp / shader)
・Modpack の場合: 内部 entries を       ・メタデータ取得
  4 カテゴリに振り分け
        │                                       │
        └───────────────────┬───────────────────┘
                            ▼ ② Profile 自動生成 (Import)
┌────────────────────────────────────────────────────────┐
│ Profile Analysis (自動検証)                            │
│  - 依存関係 / MCバージョン / Loader互換性              │
│  - 競合 / 未知ファイル (Unknown)                       │
│  - Modpack の場合: 新バージョン検知                    │
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

**入力が単一 modpack ファイル (経路 C) か、ディレクトリ (経路 A) かで
分岐する:**

```
[単一ファイル入力 (経路 C: Modpack)]
1. .mrpack か .zip の拡張子で分岐
2. .mrpack → modrinth.index.json をパース → Modrinth Modpack
3. .zip → manifest.json をパース
   - manifestType: 'minecraftModpack' なら CurseForge Modpack
   - modrinth.index.json も含んでいれば Modrinth Modpack (稀な case)
4. どちらでもなければ「一般 zip」として個別ファイル解析 (経路 B へ fallback)

[ディレクトリ入力 (経路 A: Instance Root)]
1. mmc-pack.json があれば → Prism / MultiMC / PolyMC
2. modrinth_profile.json があれば → Modrinth App (Phase 11-D)
3. versions/ ディレクトリがあれば → 公式ランチャー
4. mods/ など個別ディレクトリのみ → シンプル extract として処理
5. 全て失敗 → ユーザー手動選択 (Minecraft Version / Loader 手入力)
```

### 4.3 対象ディレクトリ・ファイル

**経路 A / B (ディレクトリまたは個別ファイル)**:
- `versions/` — バージョン JSON・メタデータ（公式ランチャー）
- `mmc-pack.json` — インスタンス定義（Prism/MultiMC）
- `mods/` — Mod ファイル (`.jar`)
- `resourcepacks/` — リソースパック (`.zip`)
- `shaderpacks/` — シェーダーパック (`.zip`)

**経路 C (Modpack ファイル)**:
- `.mrpack` — Modrinth Modpack (中身は zip で、`modrinth.index.json` を持つ)
- `.zip` (CurseForge) — `manifest.json` + `overrides/` を持つ CurseForge 形式

対象ディレクトリ / ファイルが存在しない or 空の場合はエラーとせず、
安全に処理を継続。将来的に `config/` や `saves/` 等への拡張が可能な構造とする。

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

Profile は 4 カテゴリを**同等の第一級市民**として保持する:

```typescript
interface Profile {
  // 既存フィールド
  id: string;
  name: string;
  mcVersion: string;
  loader: 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt';
  description: string;
  mods: ModItem[];

  // Phase 11 追加フィールド (基本)
  loaderVersion?: string;                    // 0.16.0 (Fabric)
  linkedDirHandle?: FileSystemDirectoryHandle; // Chromium 版のみ
  linkedRootType?: 'official' | 'prism' | 'modrinth-app' | 'manual';

  // Phase 11: 4 カテゴリ対応
  resourcepacks?: ContentItem[];             // 独立管理
  shaderpacks?: ContentItem[];               // 独立管理
  modpackSource?: ModpackSource;             // modpack から派生した場合のみ

  // Unknown files (どのカテゴリでも該当なしだったファイル)
  unknownFiles?: UnknownFile[];
}

// 共通コンテンツ型 (mod / resourcepack / shader 共通)
// 既存の ModItem を拡張 or 汎用化する形で導入
interface ContentItem {
  id: string;                                // Modrinth project id
  slug?: string;
  title: string;
  filename: string;
  fileUrl?: string;
  sha1?: string;
  category: 'mod' | 'resourcepack' | 'shader';
  selectedVersionId?: string;
  selectedVersionNumber?: string;
  versionType?: 'release' | 'beta' | 'alpha';
  size?: number;
  icon_url?: string | null;
  author?: string;
  description?: string;
}

// Modpack 由来の Profile であることを示すメタデータ
// modpack を丸ごと import すると Profile.modpackSource がセットされ、
// 以降 modpack 全体のバージョン更新チェックが可能になる
interface ModpackSource {
  kind: 'mrpack' | 'curseforge-zip';
  projectId?: string;                        // Modrinth modpack project id
  versionId?: string;                        // Modrinth modpack version id (更新検知用)
  name: string;                              // "Better MC" 等
  version: string;                           // "1.21.1-4.15"
  importedAt: number;
}

interface UnknownFile {
  category: 'mod' | 'resourcepack' | 'shader';
  filename: string;
  sha1: string;
  size: number;
  addedToProfileAt: number;
}
```

**設計判断**:
- `mods` は既存フィールドを維持 (breaking change 回避)
- `resourcepacks` / `shaderpacks` は新規追加、`ContentItem` 型で統一
- `modpack` はカテゴリではなく **Profile の "由来"** を表す `modpackSource` として保持
  - モーダル UI 上の 4 タブとしては表示するが、Profile 内部には
    「Mods (3 個) / RP (1 個) / Shader (0 個) / Modpack (Better MC 4.15 由来)」
    の形で表現される

### 4.6 ファイル・Manifest 解析

#### 4.6.1 個別ファイル解析 (経路 A / B、既存 3 カテゴリ)

1. **ハッシュ計算**: 各ファイルの `SHA-1` を算出
   - **理由**: Modrinth API (`/version_files`) が SHA-1 と SHA-512 のみ対応。
     既存の `lib/utils/hash.ts` に SHA-1 実装あり、再利用可能
   - SHA-256 で照合するには他 API（CurseForge 等）が必要 → Roadmap 2
2. **メタデータ取得**: パス、ファイル名、サイズ、SHA-1、種別
3. **API 照合**: `POST /version_files` にハッシュ配列を送信、Modrinth 側で該当プロジェクト特定
4. **カテゴリ振り分け**: Modrinth 側から返却される `project.project_type` を
   `'mod' | 'resourcepack' | 'shader'` にマッピングして Profile の適切な
   フィールド (`mods` / `resourcepacks` / `shaderpacks`) に格納
5. **Unknown File 記録**: 特定不可なファイルは `unknownFiles[]` に永続化
   (どのカテゴリのフォルダに置かれていたかも記録)

```text
[ mods/sodium-custom.jar ]
       │ (SHA-1: e3b0c442...)
       ▼
 [ Modrinth /version_files ]
       │
 ┌─────┴────────────────────────────────┐
 │ Project: Sodium                      │
 │ project_type: mod                    │
 │ Version: 0.5.8                       │
 │ Loader : Fabric                      │
 │ MC Ver : 1.21.1                      │
 └─────────────┬────────────────────────┘
               ▼
     Profile.mods[] に追加
```

#### 4.6.2 Modpack Manifest 解析 (経路 C、新規)

**Modrinth Modpack (`.mrpack`)**:

`.mrpack` は zip 形式で、ルートに `modrinth.index.json` を持つ。既存の
`hooks/useZipImport.ts` に部分実装あり、これを **Phase 11 用に拡張** する。

```json
// modrinth.index.json 例
{
  "formatVersion": 1,
  "game": "minecraft",
  "versionId": "1.21.1-4.15",
  "name": "Better MC Fabric",
  "summary": "A curated Fabric modpack",
  "dependencies": {
    "minecraft": "1.21.1",
    "fabric-loader": "0.16.0"
  },
  "files": [
    {
      "path": "mods/sodium-fabric-0.6.0.jar",
      "hashes": { "sha1": "...", "sha512": "..." },
      "downloads": ["https://cdn.modrinth.com/data/AANobbMI/versions/.../sodium.jar"],
      "fileSize": 3200000,
      "env": { "client": "required", "server": "required" }
    }
  ]
}
```

パース手順:
1. zip を展開して `modrinth.index.json` を読む
2. `dependencies.minecraft` / `dependencies.fabric-loader` (or `forge`,
   `neoforge`, `quilt-loader`) から MC バージョン / Loader を確定
3. `files[]` の各エントリを `path` から category を判定
   (`mods/` → mod, `resourcepacks/` → resourcepack, `shaderpacks/` → shader)
4. `hashes.sha1` を優先して Modrinth `/version_files` で project 情報を取得
   (downloads URL は Modrinth CDN なので、ここから project/version id を逆引きも可能)
5. `overrides/` フォルダ内の config 等は Phase 11 スコープでは保持のみ
   (実際の書き込みは Phase 11-C の Sync で対応)
6. Profile 全体を構築、`modpackSource` に version 情報を記録

**CurseForge Modpack (`.zip`)**:

CurseForge modpack は `manifest.json` + `overrides/` を持つ zip。
Modrinth と異なりファイル hash を持たず、**CurseForge project id + file id**
の組み合わせでダウンロード URL を解決する必要がある。

```json
// manifest.json 例
{
  "minecraft": {
    "version": "1.21.1",
    "modLoaders": [{ "id": "fabric-0.16.0", "primary": true }]
  },
  "manifestType": "minecraftModpack",
  "name": "Better MC Fabric",
  "version": "4.15",
  "files": [
    { "projectID": 306612, "fileID": 4123456, "required": true }
  ]
}
```

パース手順:
1. `manifest.json` から MC バージョン / Loader を確定
2. `files[]` の `projectID` / `fileID` を CurseForge API で解決
   - **注意**: CurseForge API は API key が必要 (第三者アプリ用)
   - **代替策**: 各 project を Modrinth で name 検索して同名プロジェクトを見つける
     (完全ではないが、Modrinth と CurseForge 両方に置いてある人気 mod は
      名前一致でヒットする)
   - **Phase 11-C 判断事項**: CurseForge API 直接統合 vs Modrinth 名前解決
     どちらを採用するかは実装時に決定 (Roadmap 2 で API 統合が濃厚)
3. Profile 全体を構築、`modpackSource.kind: 'curseforge-zip'` を記録

**設計注記**: 経路 A/B の解析結果と経路 C の `ParsedModpack` は共通の
`Profile` 型に集約されるため、以降の Analysis / Diff Engine / Sync
ロジックは経路の違いを意識しなくて済む。

---

## 5. 自動検証仕様（Profile Analysis）

Profile インポート完了時および編集時に、検出された「Minecraft Version / Loader」を基準として以下の検証エンジンを自動実行する。

| 検証項目 | 内容 | 判定基準 | 対象カテゴリ |
|---|---|---|---|
| **依存関係 (Dependencies)** | 必須 Mod（例: Fabric API, Cloth Config 等）が含まれているか | 欠落時は `MISSING` 警告 | Mods |
| **MC 互換性 (MC Version)** | Profile で検出/指定された MC バージョンに対応しているか | バージョン不一致を警告 | Mods / RP / Shader |
| **Loader 互換性 (Loader)** | Profile で検出/指定された Loader と一致しているか | Loader 不一致をエラー提示 | Mods |
| **競合検出 (Conflicts)** | 同時導入が不可とされている Mod 同士が存在しないか | 競合警告を提示 | Mods |
| **未識別 (Unknown Files)** | ハッシュ照合できなかったファイルの有無 | 注意喚起（手動確認用） | 全カテゴリ |
| **Shader Loader 前提** | Iris / OptiFine 等の shader loader が Mods に含まれているか | Shader 使用時に必須 loader 欠落を警告 | Shaders |
| **Modpack 更新** | Modpack 由来 Profile の場合、より新しい modpack version が Modrinth に存在するか | 新版検知時に info 通知 | Modpack |

**既存の `hooks/useDependencyCheck.ts` を再利用可能**。以下の追加検証を Phase 11-B で実装:
- unknownFiles カウント表示
- Shader 使用時の Iris/OptiFine 前提チェック (`mods[]` を scan)
- Modpack update checker: `modpackSource.projectId` から Modrinth `/project/{id}/version` を取得し、`versionId` と比較

---

## 6. 同期・反映仕様（Profile → Local）

### 6.1 差分同期エンジン（Diff Engine）

「同期」実行時、Profile とローカル環境を **カテゴリごとに** 突き合わせ、
3 つのステータスに分類する。Diff Engine は Mods / ResourcePacks / Shaders の
3 サブディレクトリを独立して評価し、Modpack 更新は特殊経路として扱う。

```text
[ Mods セクション ]
Profile構成:   [ Sodium ] [ Iris ] [ Cloth Config ]
ローカル環境:  [ Sodium ] [ Iris ] [ 未知の.jar (unmanaged) ]

    ▼ 差分計算結果
    ・Sodium         : 変更なし ────> スキップ
    ・Iris           : 変更なし ────> スキップ
    ・Cloth Config   : 追加     ────> ダウンロードして mods/ へ直接配置
    ・未知の.jar     : 未管理   ────> 保持（削除しない）

[ ResourcePacks セクション ]
Profile構成:   [ Faithful ] [ Vanilla Tweaks ]
ローカル環境:  [ Faithful ]

    ▼ 差分計算結果
    ・Faithful       : 変更なし ────> スキップ
    ・Vanilla Tweaks : 追加     ────> ダウンロードして resourcepacks/ へ直接配置

[ Shaders セクション ]
Profile構成:   [ ComplementaryShaders ]
ローカル環境:  (空)

    ▼ 差分計算結果
    ・ComplementaryShaders : 追加 ──> ダウンロードして shaderpacks/ へ直接配置

[ Modpack 更新チェック (Modpack 由来 Profile のみ) ]
現在の modpackSource.versionId: "AbCdEf12"
Modrinth 上の latest versionId : "XyZ00001"

    ▼ 「新バージョン利用可能」通知
    → ユーザーが「Modpack を更新」ボタン押下時に、
      新 modpack を再パース → 4 カテゴリの完全差し替えを Diff Engine に流す
```

### 6.2 3 状態ファイル管理ポリシー（Managed 3-State）

Dexie にファイル origin を永続化して 3 状態を厳格化する。**Modpack 由来のファイル
も独立した source 値で区別する** ため、Profile 全体を modpack で更新した際に
「以前の modpack で入れたが新 modpack には無い」ファイルを自動削除できる:

```typescript
interface ManagedFileRecord {
  profileId: string;
  category: 'mod' | 'resourcepack' | 'shader';
  filename: string;
  sha1: string;
  addedAt: number;
  source:
    | 'dropmod-download'          // 個別に DropMod で追加
    | 'imported-from-existing'    // Import 時に取り込み (経路 A/B)
    | 'modpack-download';         // Modpack 経由で入った (経路 C)
  // Modpack 由来の場合、どの version の modpack で入れられたか記録
  modpackVersionId?: string;      // source='modpack-download' 時のみ
}
```

| 状態 | 定義 | Sync 時の挙動 |
|---|---|---|
| **Unmanaged (Unknown)** | ユーザーが手動でフォルダに入れた、DropMod 側の記録なし | **絶対に削除しない**。UI 上は「未管理」バッジ表示 |
| **Imported-Managed** | Import 時に取り込み、`source: 'imported-from-existing'` | Profile から削除された場合、**確認ダイアログを表示してからオプトイン削除** |
| **DropMod-Downloaded** | DropMod が個別に追加した、`source: 'dropmod-download'` | Profile から削除された場合、**自動削除**（DropMod が入れたものなので責任範囲） |
| **Modpack-Managed** | Modpack 経由で入った、`source: 'modpack-download'` | Modpack 更新で **新 modpack version に存在しないファイルは自動削除**、Profile 個別編集で削除された場合は Imported-Managed と同じ扱い (confirm) |

### 6.3 Sync Preview UI

Direct Write 実行前に必ず以下の Preview 画面を表示（**Dry Run**）。
カテゴリごとにセクション化し、Modpack 更新は特別セクションで表示:

```text
┌──────────────────────────────────────────────┐
│  Sync Preview                                │
│                                              │
│ ┌── 📦 Mods (5 件変更) ────────────────────┐│
│ │  🟢 追加 (2)                              ││
│ │  ✚ Sodium 0.5.9         (3.2 MB)         ││
│ │  ✚ Cloth Config 15.0.0  (0.5 MB)         ││
│ │                                           ││
│ │  🟡 更新 (1)                              ││
│ │  ✎ Lithium 0.11.2 → 0.12.0                ││
│ │                                           ││
│ │  🔴 削除 (1)                              ││
│ │  ✖ Fabric API [DropMod 追加、自動削除]   ││
│ │                                           ││
│ │  🔵 保持 (1、Unknown)                     ││
│ │  ○ some-custom.jar (未管理、削除しません)││
│ └──────────────────────────────────────────┘│
│                                              │
│ ┌── 🎨 Resource Packs (1 件変更) ─────────┐│
│ │  🟢 追加 (1)                              ││
│ │  ✚ Vanilla Tweaks 1.21   (2.1 MB)        ││
│ └──────────────────────────────────────────┘│
│                                              │
│ ┌── ✨ Shaders (1 件変更) ────────────────┐│
│ │  🟢 追加 (1)                              ││
│ │  ✚ Complementary 4.7    (1.9 MB)         ││
│ └──────────────────────────────────────────┘│
│                                              │
│ ┌── 📚 Modpack (更新可能) ────────────────┐│
│ │  💡 Better MC 4.15 → 4.16 が利用可能    ││
│ │  [ Modpack を更新 (別途 Preview 表示) ]  ││
│ └──────────────────────────────────────────┘│
│                                              │
│  ⚠️ 削除確認が必要な項目 (1)                │
│  ? Cloth Config [Import 由来、削除しますか?] │
│    [ 削除する ] [ 保持する ]                 │
│                                              │
│  合計サイズ変化: +7.7 MB                     │
│                                              │
│  [ キャンセル ]  [ 7 件を適用 ]              │
└──────────────────────────────────────────────┘
```

**Modpack 更新** ボタンを押した場合の別 Preview:

```text
┌──────────────────────────────────────────────┐
│  Modpack Update Preview                      │
│  Better MC Fabric: 4.15 → 4.16               │
│                                              │
│  🟢 新規に追加される (12)                    │
│    ✚ NewMod A, NewMod B, ...                 │
│                                              │
│  🟡 バージョン更新される (23)                │
│    ✎ Sodium 0.5.9 → 0.6.0                    │
│    ✎ Iris 1.8.0 → 1.8.2                      │
│    ...                                       │
│                                              │
│  🔴 削除される (5、以前の modpack 由来)     │
│    ✖ Old Feature Mod (旧 modpack 由来のため  │
│      自動削除)                               │
│    ...                                       │
│                                              │
│  🔵 保持される (2、Unknown)                  │
│    ○ your-custom-mod.jar                     │
│                                              │
│  [ キャンセル ]  [ 40 件を適用 ]             │
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

### 7.1 Profile 作成モーダル（3 経路 × ブラウザ 2 対応）

作成モーダルは 3 つの入力経路を **タブ UI** で切り替える:

```text
┌──────────────────────────────────────────────┐
│  Create Profile                              │
│                                              │
│  [ 🗂️ フォルダ ] [ 📄 個別ファイル ] [ 📚 Modpack ]│
│  ─────────────────────────────────────────── │
```

#### 経路 A タブ: フォルダから取り込み (Chromium 版)

```text
│  Profile Name                                │
│  [ My Fabric Instance                      ] │
│                                              │
│  Minecraft Folder                            │
│  [ C:\Users\...\.minecraft ] [ フォルダ選択 ]│
│                                              │
│  ─────────────────────────────────────────── │
│  Environment Settings (自動検出 / 編集可)    │
│                                              │
│  Minecraft Version   Loader       Version    │
│  [ 1.21.1        ▼] [ Fabric  ▼] [ 0.16.0 ▼] │
│   ✓ .minecraft/versions から自動検出         │
│                                              │
│  Detected: 32 Mods / 8 RP / 4 Shaders        │
│                                              │
│              [ キャンセル ] [ Create Profile ]│
```

#### 経路 A タブ: フォルダから取り込み (非対応ブラウザ)

```text
│  ℹ️ .minecraft から取り込むには Chrome/Edge を│
│    ご利用ください。それ以外の場合は ZIP を    │
│    アップロードしてください。                 │
│  [ .minecraft.zip をアップロード ]           │
```

#### 経路 B タブ: 個別ファイル

```text
│  Profile Name                                │
│  [ Empty Profile                           ] │
│                                              │
│  Files (drag & drop or click)                │
│  ┌──────────────────────────────────────┐   │
│  │  .jar / .zip をここにドロップ         │   │
│  │  ─────────────────────────────       │   │
│  │  検出中: sodium.jar → Modrinth: Sodium│   │
│  └──────────────────────────────────────┘   │
│                                              │
│  Environment Settings (手動)                 │
│  [ 1.21.1        ▼] [ Fabric  ▼] [ 0.16.0 ▼] │
│                                              │
│              [ キャンセル ] [ Create Profile ]│
```

#### 経路 C タブ: Modpack (Phase 11 の目玉機能)

```text
│  Profile Name                                │
│  [ Better MC Fabric (v4.15)                ] │
│    ↑ modpack から自動入力                    │
│                                              │
│  Modpack File                                │
│  [ .mrpack か CurseForge zip を選択 ]        │
│    ✓ Better MC Fabric v4.15 を検出           │
│    ✓ 内容: 82 Mods / 3 RP / 2 Shaders        │
│    ✓ ソース: Modrinth                        │
│                                              │
│  ─────────────────────────────────────────── │
│  Environment Settings (Modpack から自動抽出) │
│  Minecraft Version   Loader       Version    │
│  [ 1.21.1        ▼] [ Fabric  ▼] [ 0.16.0 ▼] │
│                                              │
│  ⚠️ Modpack 由来の Profile として登録され、  │
│     以降 Modrinth 上の更新を自動追跡します。 │
│                                              │
│              [ キャンセル ] [ Import Modpack ]│
```

### 7.2 インポート・解析結果画面（Analysis View）

```text
┌──────────────────────────────────────────────┐
│  Profile Imported Successfully               │
│                                              │
│  Target: Minecraft 1.21.1 (Fabric 0.16.0)    │
│  Root  : 公式ランチャー (.minecraft)         │
│  Source: Modpack "Better MC" v4.15 (Modrinth)│
│                                              │
│  Content Summary:                            │
│    📦 Mods           : 82 個                  │
│    🎨 ResourcePacks  : 3 個                   │
│    ✨ Shaders        : 2 個                   │
│    ❓ Unknown Files  : 1 個                   │
│                                              │
│  Analysis Result:                            │
│  ✓ Minecraft Compatibility                   │
│  ✓ Loader Compatibility                      │
│  ✓ Shader Loader (Iris) 検出                 │
│  ⚠ 1 Unrecognized Mod (手動確認推奨)         │
│  ✗ 1 Dependency Missing: Requires [Cloth API]│
│  💡 Modpack 更新可能: v4.16 が存在            │
│                                              │
│          [ View Details ] [ Continue (完了) ] │
└──────────────────────────────────────────────┘
```

### 7.3 Profile 詳細画面のタブ構成

既存の Profile 詳細画面（`/profile`）に **4 タブ** を導入:

```text
┌──────────────────────────────────────────────┐
│  Better MC Fabric (v4.15) — 1.21.1 Fabric    │
│  💡 Modpack v4.16 が利用可能 [ 更新 ]        │
│  ─────────────────────────────────────────── │
│  [ 📦 Mods (82) ] [ 🎨 RP (3) ] [ ✨ Shader (2) ] [ 📚 Modpack ]│
│  ─────────────────────────────────────────── │
│                                              │
│  (選択タブの内容を表示、Modpack タブは       │
│   modpackSource メタデータと "更新" ボタン)  │
│                                              │
│  [ + 追加 ] [ ZIP エクスポート ] [ Sync ]    │
└──────────────────────────────────────────────┘
```

- **Modpack タブ** は modpackSource が存在する Profile のみ表示
- 個別に追加した Profile (Modpack 由来でない) では 3 タブのみ
- 各タブ内で個別に Mod / RP / Shader を追加・削除可能

### 7.4 Sync Preview 画面

前述 §6.3 参照。

### 7.5 パーミッション再要求 UX

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

Modpack 対応を独立フェーズ (11-D) として位置付け、他 3 カテゴリの基盤が
固まってから合流させる方針。ただし ResourcePacks / Shaders は Mods と
ほぼ同じ処理なので 11-A で並行実装する。

### Phase 11-A: 基盤 + 3 カテゴリ (Mods / RP / Shader) 対応 (3〜4 週)

- [ ] Feature detection ユーティリティ (`lib/env/capabilities.ts`)
- [ ] `FileSystemDirectoryHandle` の Dexie 永続化 (`lib/db/dexie.ts` に `dirHandles` テーブル追加)
- [ ] `EnvironmentSource` / `EnvironmentSink` 抽象レイヤー (`lib/env/source.ts`, `lib/env/sink.ts`)
- [ ] `ContentCategory` 型と `CATEGORY_DIR` マッピングの導入
- [ ] `ContentItem` 汎用型の導入 (`types.ts`)
- [ ] Profile 型拡張: `resourcepacks` / `shaderpacks` フィールド追加
- [ ] `showDirectoryPicker` ラッパー + パーミッション管理 (`lib/env/picker.ts`)
- [ ] 公式ランチャー用 `versions/*.json` パーサ (`lib/env/parser/official.ts`)
- [ ] ルート判定ロジック (`lib/env/detect-root.ts`)
- [ ] SHA-1 で 3 カテゴリの並列ファイル解析 (`mods/`, `resourcepacks/`, `shaderpacks/`)
- [ ] Modrinth `project_type` からのカテゴリ振り分けロジック
- [ ] Read-only モードで Import だけ動く MVP (Mods + RP + Shader)

**成果物**: `showDirectoryPicker → 公式 .minecraft を解析 → 3 カテゴリの
Profile 作成` の一連が動く。Sync とModpack はまだ。

### Phase 11-B: Analysis + Prism 対応 + Profile UI 4 タブ化 (2〜3 週)

- [ ] Prism/MultiMC の `mmc-pack.json` パーサ (`lib/env/parser/prism.ts`)
- [ ] ルート判定に Prism 分岐を追加
- [ ] 既存 `useDependencyCheck` を再利用した Analysis View 実装
- [ ] Shader 使用時の Iris/OptiFine 前提チェック
- [ ] Unknown Files 永続化 (`profiles.unknownFiles`)
- [ ] Analysis 結果画面 (§7.2)
- [ ] Profile 詳細画面の 3 タブ化 (Mods / RP / Shader、§7.3)
- [ ] 各タブでの個別追加・削除フロー

**成果物**: Import → Analysis の全フロー完成、公式 + Prism 両対応、
3 カテゴリを Profile UI で個別管理可能。

### Phase 11-C: Sync (双方向同期) (2〜3 週)

- [ ] Diff Engine (`lib/env/diff.ts`) — 3 カテゴリの並列 diff
- [ ] ManagedFileRecord テーブル (Dexie) — 3 状態 (Unmanaged /
      Imported-Managed / DropMod-Downloaded) を category ごとに管理
- [ ] Sync Preview UI (§6.3) — カテゴリセクション分割
- [ ] Direct Write 実装 (`lib/env/writer.ts`) — 各カテゴリの適切なサブ
      ディレクトリへの書き込み
- [ ] Rollback / Undo (Dexie `syncBackups` テーブル)
- [ ] ZIP フォールバック実装（既存 `hooks/useZipExport.ts` を 3 カテゴリ対応に拡張）

**成果物**: 3 カテゴリのフル機能双方向 Sync 完成。

### Phase 11-D: Modpack 対応 (経路 C) (2〜3 週)

Modpack は独立した入力経路であり、既存の 3 カテゴリ処理フローに合流する形。
Phase 11-A/B/C の基盤ができた後、これに乗せる形で実装。

- [ ] `ModpackImporter` / `ParsedModpack` 型定義
- [ ] `.mrpack` パーサ (`lib/env/modpack/mrpack.ts`)
  - 既存の `hooks/useZipImport.ts` の mrpack 対応を再構成・拡張
  - overrides/ フォルダ内の config 読み取り
  - dependencies から MC ver / loader 抽出
- [ ] CurseForge zip パーサ (`lib/env/modpack/curseforge.ts`)
  - manifest.json パース
  - project ID → Modrinth 名前解決フォールバック (CurseForge API 非統合版)
  - **判断保留**: CurseForge API 直接統合は Roadmap 2 に持ち越し可能
- [ ] Modpack source 追跡: `ManagedFileRecord.source: 'modpack-download'`
- [ ] 4 状態管理化: Modpack-Managed 状態の追加 (§6.2 表)
- [ ] Modpack 更新検知: Modrinth `/project/{id}/version` 定期チェック
- [ ] Modpack 更新 Preview UI (§6.3 の別 Preview)
- [ ] Profile 詳細画面に Modpack タブ追加 (§7.3)
- [ ] 経路 C タブ (§7.1 の Modpack タブ) の実装

**成果物**: 4 カテゴリすべて対応の完成形。`.mrpack` / CurseForge modpack を
丸ごと import → 内部の Mods/RP/Shader が各カテゴリに振り分けられ、
以降は既存の Analysis / Sync ロジックで管理される。

### Phase 11-E (任意): 追加ランチャー対応 (1〜2 週)

- [ ] Modrinth App の `modrinth_profile.json` パーサ
- [ ] GDLauncher / ATLauncher の manifest 対応（要調査）
- [ ] Roadmap 2 の CurseForge API 直接統合

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

### 9.6 Modpack 固有の Gotchas

#### 9.6.1 CurseForge API の壁

- **API key が必要**: CurseForge の公式 API は Core / Overwolf 経由でしか
  取得できず、Consumer product 用途には制限がある
- **Phase 11-D では 3 択**:
  1. **CurseForge API 統合 (Phase 11-E / Roadmap 2)**: API key 取得後に統合
  2. **Modrinth 名前解決 fallback (Phase 11-D 推奨)**: `manifest.json` の
     project ID → CurseForge project page URL → project name → Modrinth
     で同名検索 → 完全一致しないケースあり
  3. **エラー表示のみ (Phase 11-D の暫定案)**: CurseForge zip を検出したら
     「Modrinth 版に切り替えて再 import してください」と案内

#### 9.6.2 Modpack version tracking の難しさ

- Modrinth の modpack `versionId` は不変だが、**modpack project 側で
  新 version が公開されても自動で通知されない**
- 対策: Profile.modpackSource.versionId と Modrinth の latest version を
  定期比較する背景 hook が必要 (dependency check hook と同構造)

#### 9.6.3 overrides/ の扱い

- `.mrpack` は `overrides/` フォルダ内に config / options.txt / servers.dat 等の
  生ファイルを持てる。これらは hash 照合対象外で、そのまま .minecraft へ
  コピーする必要がある
- **Phase 11-D スコープ**: config/ のみ対応 (options.txt / servers.dat 等の
  ユーザーデータへの書き込みは高リスク、Roadmap 2)
- overrides の書き込みは 3 状態管理の対象外 (常に Unmanaged 扱い)

#### 9.6.4 Modpack 内 Mod の "元 project" 特定

- Modrinth modpack の `files[]` は downloads URL に project/version の
  slug/id が含まれる (`cdn.modrinth.com/data/{projectId}/versions/{versionId}/...`)
- ここから逆引きで Modrinth project 情報を取得可能 → 個別 Mod と同じ
  Analysis / Sync フローに乗せられる
- CurseForge modpack の場合は §9.6.1 の問題

#### 9.6.5 大規模 modpack のパフォーマンス

- 200+ Mods を含む modpack ("Better MC" 等) は Modrinth API に 200+ 回の
  version 情報照会が必要 → 既存の `fetchModrinthVersionFilesBatch` で
  100 件 / batch の制約に従う
- Phase 11-C の Sync 実行時、全 files を同時 download すると Modrinth の
  rate limit (300 req/min) に触れる可能性 → **concurrent download 数を制限**
  (既存の `hooks/computeConcurrency.ts` を再利用)

### 9.7 テスト戦略

- **Unit**: パーサ (公式 / Prism / mrpack / CurseForge) の JSON パース、Diff Engine の状態遷移、4 状態管理ロジック、Modpack カテゴリ振り分け
- **Integration**: MSW で Modrinth `/version_files`, `/project/{id}/version` モック、実際の `.mrpack` fixture ファイルで parse → Profile 生成テスト
- **E2E**: Playwright で `showDirectoryPicker` を実行できないため、**Chromium バイナリの限定的な API に頼るしかない**（実際は E2E 難しい、`__e2e_mock_handle__` を試験モードで用意する等の工夫が必要）
- **Modpack fixture**: 実際の `.mrpack` を `__tests__/fixtures/modpacks/` に配置 (小さい modpack を用意)

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

### 11.1 汎用論点

- [ ] `.minecraft` ではなく Prism instance root (`instances/<name>/`) を選ばれた場合の
      「保存フォルダ表示ラベル」の UX
- [ ] Profile が指定する mcVersion / loader と、Import 元の環境の mcVersion / loader が
      **不一致** な場合の警告レベル (error / warning / info)
- [ ] Direct Write でクラッシュ (書き込み途中で中断) した場合の recovery
      （partial write 対応、`.tmp` + rename パターンなど）
- [ ] ZIP フォールバックで .minecraft 全体を扱う場合の **メモリ制約** (数百 MB になる可能性)
      → Stream 処理必須、jszip の `generateAsync({ streamFiles: true })` 検討

### 11.2 Modpack 関連論点

- [ ] CurseForge modpack 対応の実装方式選択 (§9.6.1)
      → Phase 11-D では Modrinth 名前解決 fallback、Phase 11-E で API 統合が第一案
- [ ] Modpack 更新時に **ユーザーが個別追加した Mod** をどう扱うか
      (Modpack 由来 = 削除、個別追加 = 保持、で正しいか)
- [ ] Modpack を "解体" して 4 タブで自由編集する場合、`modpackSource` を
      どこかで消すべきか？消さないなら「解体済み Modpack」の状態表示が必要
- [ ] Multiple modpack 同居: 1 Profile に複数 modpack を統合したい要望への対応
      → Phase 11-D スコープ外、Roadmap 2 (難易度高、conflict 解決必要)
- [ ] `.mrpack` の `env.client / env.server` フィールドで client 専用 mod を判別、
      DropMod は client 用のみ書き込むべきか？(現状仕様では区別なし)

---

**関連ドキュメント**:
- `docs/planning/PHASE10_CANDIDATES.md` — 現在進行中の Phase 10
- `docs/audit/issues-legacy.md` — 過去の設計判断の履歴
- 既存資産: `hooks/useZipImport.ts`, `hooks/useZipExport.ts`, `hooks/useDependencyCheck.ts`,
  `lib/modrinth/client.ts`, `lib/utils/hash.ts`
