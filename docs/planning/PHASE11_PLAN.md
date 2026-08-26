# Phase 11: ローカル Minecraft 環境 Import & Analysis (Read-only)

**ステータス**: 計画確定（2026-08-26 セッション合意により仕様確定。実装未着手）
**優先度**: 🔴 最重要 — DropMod の核心価値の 10 倍化
**見積工数**: 4〜6 週間（1 人フルタイム換算）
**着手前提**: Phase 10 の**開発項目** (bundle 削減 / AppContext 削除 / Markdown 画像最適化 / E2E 拡張 / shimmer skeleton) 完了
**Vercel デプロイとの関係**: Vercel 本番デプロイは **Phase 10 + Phase 11 + Phase 12 の全項目完了後**の最終ステップ (2026-08-24 決定、Hobby プランのリソース制約対策、詳細は `docs/planning/PHASE10_CANDIDATES.md` 冒頭「【重要方針】」節参照)

---

## 📌 2026-08-26 改定: セッション合意による確定事項

> 本セッションでのユーザー合意に基づき、データモデルと運用方針を改定した（本文にも反映済み）。

| # | 項目 | 改定内容 |
|---|---|---|
| 1 | **データモデル** | 旧案の `ContentItem`（ContentRef + ContentArtifact のネスト構造）は**不採用**。既存 `ModItem` を `ProjectItem` に改名・整理した **flat 型**で `mods / resourcepacks / shaderpacks` を扱う（§4.5）。既存コード（約 100 箇所）への影響を最小化 |
| 2 | **型の分離** | `ProjectType`（4値: mod/modpack/resourcepack/shader、Modrinth API/検索ドメイン）と `ContentCategory`（3値、Profile 内実体ファイル）は**意図的に分離**。`modpack` は Profile を構成する上位概念のため `ContentCategory` に含めない |
| 3 | **Profile.environment** | flat な `mcVersion / loader / loaderVersion` を `environment` サブオブジェクトに集約。Dexie schema v2 で既存データをマイグレーション |
| 4 | **linkedSource** | Profile への `linkedSource` / `dirHandles` テーブルは **Phase 12 へ延期**。Phase 11 ではフォルダ選択は都度使い捨て（恒久的な紐付けを持たない） |
| 5 | **Import 先** | **常に新規 Profile 作成のみ**（既存 Profile への再 Import / merge は不可）。§9.2 の「環境不一致ハンドリング」は不要となり破棄 |
| 6 | **プロファイル命名** | 自動生成: フォルダ名が妥当ならフォルダ名、不適切（`.minecraft` 等の特定名・一定以上長い）なら検出環境から生成、検出失敗なら空欄。**すべてユーザー編集可**（§6.1） |
| 7 | **artifact** | `ProjectItem.artifact`（sha1 / path / size）として Phase 11 から保持。Phase 12 の Sync / Backup / Rollback で再利用。旧案の「Import 直後 snapshot を別途保存」（11-C）は本フィールドに吸収され**廃止** |
| 8 | **技術検証 (2026-08-26 実施)** | File System Access API は 2026 年時点でも **Chromium 系のみ**（Firefox/Safari/モバイル不可）→ ZIP フォールバック方針を継続。Modrinth `/version_files` は SHA-1/SHA-512、レート制限 300 req/min |

---

## ⚠️ 【重要方針】Phase 11 は Read-only、Sync は Phase 12 で分離

> **Phase 11 の絶対原則**: ローカル Minecraft 環境への**書き込み・削除は一切行わない**。
> ユーザーの環境を破壊するリスクがある処理は全て Phase 12 に隔離する。
>
> **Phase 分割の背景**: ChatGPT (2026-08-24) からの詳細レビューを受け、
> Import (Read-only、安全) と Sync (Read/Write、破壊的) を Phase 単位で分離する
> 決定 (ユーザー確定)。これにより Phase 11 完了時点で安全にリリースできる。

### Phase 11 / 12 / 13 の分担

```
Phase 11 (本仕様書): Read-only Import & Analysis
  ├─ 公式ランチャー + Prism/MultiMC のフォルダ検出
  ├─ 3 カテゴリ (Mods / ResourcePacks / Shaders) の SHA-1 解析
  ├─ Modrinth API での Metadata 解決
  ├─ Profile 生成 + Analysis View
  └─ 【禁止】書き込み・削除・Sync

Phase 12 (別仕様書 PHASE12_PLAN.md): Sync & Modrinth Modpack
  ├─ Diff Engine + SyncPlan
  ├─ Sync Preview UI
  ├─ Direct Write + Transaction Journal
  ├─ Managed File Ownership Model (fingerprint 検証必須)
  ├─ Backup / Rollback (Blob + OPFS)
  ├─ Modrinth .mrpack 対応
  └─ Provider 抽象化 (CurseForge の入り口だけ)

Phase 13 (別仕様書 PHASE13_PLAN.md): CurseForge 完全対応
  ├─ CurseForge API 統合 (Murmur2 fingerprint)
  ├─ CurseForge Modpack (.zip) の完全 Import
  └─ CurseForge Modpack 更新検知 + Sync
```

---

## 1. 概要と目的

### 1.1 目的

本 Phase は、DropMod の Profile を「単なるダウンロード対象の Mod リスト」から
**「ローカルの実際の Minecraft 環境を構造的に理解できる構成管理単位」** へと拡張する第一歩。

既存の Minecraft フォルダ (`.minecraft` または Prism instance) を選択するだけで、
**Minecraft 本体・Loader のバージョン情報および Mod/RP/Shader を自動解析・
プロファイル化 (Import)** し、依存関係や互換性の検証 (Analysis) を行う。

**書き込みは一切行わない** — ローカル環境は完全に読み取り専用のソースとして扱う。
双方向 Sync は Phase 12 の責任範囲。

### 1.2 対応する 3 カテゴリ (Phase 11)

Phase 11 は以下 3 カテゴリの Import + Analysis のみ対応:

| カテゴリ | 実体 | 検出ディレクトリ | Modrinth 種別 |
|---|---|---|---|
| **Mods** | 個別 `.jar` ファイル | `mods/` | `mod` |
| **ResourcePacks** | `.zip` (テクスチャ) | `resourcepacks/` | `resourcepack` |
| **Shaders** | `.zip` (OptiFine/Iris シェーダー) | `shaderpacks/` | `shader` |

**Modpack は Phase 12 で対応** (Modrinth .mrpack 経路)。CurseForge は Phase 13。

**注**: ChatGPT レビュー提案 #9 に基づき、**Modpack はカテゴリではなく Profile の Source
として扱う**。Profile の 3 カテゴリ (Mods/RP/Shader) は独立してリスト化される。

### 1.2.1 予約 URL (実装必須)

以下のルートは **Phase 11 / 12 の専用ハブ** として予約する。検索 URL へ
リダイレクトしてはならない (検索入口と専用ハブを分離するため)。

| URL | 担当 Phase | 役割 |
|---|---|---|
| `/resourcepack` | **11** | Resource Pack の閲覧・Import ハブ (`resourcepacks/` 解析結果の入口) |
| `/shader` | **11** | Shader の閲覧・Import ハブ (`shaderpacks/` 解析結果の入口) |
| `/modpack` | **12** | Modrinth Modpack (`.mrpack`) の Import / 更新ハブ |
| `/discover/mods` | 現行 | Modrinth 検索 (Mods) |
| `/discover/resourcepacks` | 現行 | Modrinth 検索 (Resource Packs) |
| `/discover/shaders` | 現行 | Modrinth 検索 (Shaders) |
| `/discover/modpacks` | 現行 | Modrinth 検索 (Modpacks) |

現状は予約ページ (Coming Soon + 「Modrinth で探す」→ `/discover/*`) を置き、404 にしない。
BrowseBottomSheet の「探す」は `/discover/*`。予約ハブはルート直下のまま。

### 1.3 コアバリュー

- **環境情報の自動特定**: フォルダを選択するだけで Minecraft Version / Loader / Loader Version を自動判定
- **ワンクリック・インポート**: 既存環境の Mods / ResourcePacks / Shaders を SHA-1 ハッシュから自動識別
- **安全な互換性検証**: 依存関係の欠落やバージョン不整合を検知 (Analysis View)
- **【Phase 11 の絶対保証】書き込みなし**: ユーザーの Minecraft 環境は 100% 保護される

### 1.4 副次的に得られる価値 (Phase 12 以降含む)

- **Profile Snapshot**: 現状の実 Minecraft 環境を「初期状態」として保存
- **Multi-Instance Support**: 複数の `.minecraft` を切り替え管理
- **モバイル閲覧 + PC 同期**: モバイルで「これ入れたい」→ PC (Phase 12) で同期実行

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
- 「フォルダから取り込み」ボタン → `showDirectoryPicker({ mode: 'read' })`
  - **Phase 11 は Read-only なので `'read'` のみ** (Phase 12 で `'readwrite'` に昇格)

#### 非対応ブラウザ（ZIP フォールバックモード）
- 「ZIP から取り込み」ボタン (`.minecraft` を ZIP 化してアップロード)
- 事前に「.minecraft を ZIP 化する手順」の説明を UI 内で提供
- 「フル機能を使うには Chrome/Edge をご利用ください」の情報バナー

### 2.3 EnvironmentSource 抽象レイヤー

Chromium と ZIP モードで共通のインターフェースを提供 (ChatGPT #14):

```typescript
interface EnvironmentSource {
  kind: 'filesystem' | 'zip';
  root: FileSystemDirectoryHandle | JSZip;
  readFile(path: string): Promise<Uint8Array>;
  listFiles(subdir: string): Promise<string[]>;
  listDirectories(subdir: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}
```

**注**: Phase 11 は Sink (書き込み) を持たない。Phase 12 で `EnvironmentSink` を追加。

上位ロジック (Detector / Analyzer / Profile Builder) はこの抽象を通じて動作し、
下位実装のみブラウザ対応で分岐する。

---

## 3. 全体フローとアーキテクチャ

### 3.1 全体処理フロー (Phase 11: Read-only)

```text
[ ユーザー ]
     │
     ▼ ① Minecraftフォルダ選択 or ZIP アップロード
       (Chromium: showDirectoryPicker / 非対応: ZIP)
┌────────────────────────────────────────────────────────┐
│ EnvironmentSource 生成                                 │
│  - filesystem: FileSystemDirectoryHandle wrapper       │
│  - zip:        JSZip wrapper                           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ ② EnvironmentDetector.detect()
┌────────────────────────────────────────────────────────┐
│ ルート種別判定 (Strategy Pattern、ChatGPT #14)         │
│  - OfficialLauncherDetector: versions/*.json あり      │
│  - PrismDetector:            mmc-pack.json あり        │
│  - GenericDetector:          mods/ など個別あり        │
│  - fallback:                 ユーザー手動選択          │
└───────────────────────────┬────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
【 環境情報の解析 】                     【 ファイル解析 】(Web Worker、ChatGPT #15)
・DetectedEnvironment 生成              ・各ファイル列挙 (main)
  - mcVersion                            ・SHA-1 並列計算 (worker)
  - loader                               ・{ path, filename, size, sha1 }
  - loaderVersion                            を返却
  - rootType                                 │
        │                                     ▼
        │                              【 API 解決 】(ChatGPT #16)
        │                              ・SHA-1 を batch (100 個ずつ)
        │                              ・POST /version_files で照合
        │                              ・Dexie apiCache で hash → version キャッシュ
        │                              ・unique version/project ID のみ
        │                                project metadata 取得
        └───────────────────┬───────────────────┘
                            ▼ ③ Profile Builder
┌────────────────────────────────────────────────────────┐
│ Profile 生成 (常に新規 — 既存 Profile への merge なし) │
│  - environment (mcVersion / loader / loaderVersion)   │
│  - ProjectItem[] ×3 (mods / resourcepacks / shaders)  │
│  - unknownFiles[] (照合不可、ChatGPT #3 で location 化)│
└───────────────────────────┬────────────────────────────┘
                            ▼ ④ Analysis View (Read-only)
[ ユーザー: 結果確認 → Profile 保存 or 破棄 ]
                            │
                            ▼ 【Phase 11 完了、書き込みなし】
                            ▼ Sync は Phase 12 で
```

### 3.2 アーキテクチャ原則（Import と Sync の完全分離）

Phase 11 は **Local → Profile 方向のみ**。Sync (Profile ⇄ Local) は Phase 12。

| 処理区分 | 方向 | Phase | 役割 |
|---|---|---|---|
| **Import** | `Local Folder` → `Profile` | **11** (本仕様) | 既存環境を解析、Profile を構築 |
| **Sync** | `Profile` ⇄ `Local Folder` | 12 | 差分計算 + 直接書き込み |

### 3.3 SSOT (Single Source of Truth) の位置付け

- **Phase 11 完了時点**: Local = Profile (Import 直後の snapshot)
- **Phase 12 以降**: Profile を正 (SSOT) として Local に反映

Phase 11 の Import 直後、**将来の Phase 12 実装に備えて** 各ファイルの
fingerprint (SHA-1) を Dexie に snapshot として保存する (ChatGPT #13)。

---

## 4. インポート仕様（Local → Profile）

### 4.1 フォルダ選択とルート判定

#### Chromium 系
```typescript
// Phase 11 は 'read' のみ (書き込み権限は求めない)
const handle = await window.showDirectoryPicker({ mode: 'read' });
// ※ハンドルの IndexedDB 永続化 (dirHandles) と Profile.linkedSource は
//   Phase 12 (Sync) に延期 (2026-08-26 改定)。Phase 11 では
//   「選択 → 解析 → Profile 生成」の都度使い捨てで、
//   フォルダとの恒久的な紐付けは持たない。
```

#### 非対応ブラウザ
既存の `hooks/useZipImport.ts` を拡張して `.minecraft` 全体 ZIP を受け入れる。

### 4.2 EnvironmentDetector (Strategy Pattern、ChatGPT #14)

複数のランチャー構造に対応するため、Detector を Strategy パターンで抽象化:

```typescript
interface EnvironmentDetector {
  /** このソースが自分の担当形式か判定 (軽量チェック) */
  canDetect(source: EnvironmentSource): Promise<boolean>;
  /** 実際に解析して DetectedEnvironment を返す */
  detect(source: EnvironmentSource): Promise<DetectedEnvironment>;
}

interface DetectedEnvironment {
  rootType: 'official' | 'prism' | 'multimc' | 'generic' | 'unknown';
  mcVersion?: string;              // 検出できなければ undefined
  loader?: 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt' | 'Vanilla';
  loaderVersion?: string;
  contentDirs: {
    mods?: string;                  // 相対パス 'mods' or '.minecraft/mods'
    resourcepacks?: string;
    shaderpacks?: string;
  };
}
```

**Phase 11 で実装する Detector**:
1. `OfficialLauncherDetector` — 公式 Minecraft Launcher (`.minecraft/versions/*.json`)
2. `PrismDetector` — Prism / MultiMC / PolyMC (`mmc-pack.json`)
3. `GenericDetector` — `mods/` 等が直接あるだけの fallback

**Phase 12 以降で追加予定** (計画のみ):
- `ModrinthAppDetector` (Phase 13 検討)
- `GDLauncherDetector`, `ATLauncherDetector` (Phase 13 検討)

### 4.3 対象ディレクトリ・ファイル

Phase 11 で読み取る対象:

- `versions/` — バージョン JSON・メタデータ（公式ランチャー）
- `mmc-pack.json` — インスタンス定義（Prism/MultiMC）
- `mods/` — Mod ファイル (`.jar`)
- `resourcepacks/` — リソースパック (`.zip`)
- `shaderpacks/` — シェーダーパック (`.zip`)

**Phase 11 で読み取らない** (Phase 12 以降):
- `config/` — Roadmap 2
- `saves/` — Roadmap 2
- `.mrpack` — Phase 12

対象ディレクトリが存在しない場合はエラーとせず、「空」として安全に処理を継続。

### 4.4 Minecraft 環境情報の自動検出

#### 4.4.1 公式ランチャー: `versions/*.json` パーサ

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

#### 4.4.2 Prism/MultiMC: `mmc-pack.json` パーサ

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
`contentDirs` に検出したパスを記録する。

#### 4.4.3 手動フォールバック UI

自動検出失敗時 or ユーザーが上書きしたい場合、既存の Profile 作成モーダルの
ドロップダウンを再利用（Minecraft Version / Loader / Loader Version）。

### 4.5 データモデル（2026-08-26 改定: ProjectItem 方式）

> **旧案の `ContentItem`（ContentRef + ContentArtifact のネスト構造）は不採用**。
> 既存 `ModItem` を `ProjectItem` に改名・整理した **flat 型**を採用。理由: 既存コード
> （useProfiles / ModsPageClient / ZIP / 依存チェック / UI / テスト、約 100 箇所）への
> 影響を最小化しつつ、Import 情報（provider / artifact）を持たせるため。

Phase 11 で Dexie に永続化するモデル:

```typescript
// -----------------------------------------------------------
// コンテンツ分類 (Profile 内の実体ファイル。modpack は含まない)
// ※ Modrinth API / 検索ドメインの ProjectType (4値) とは意図的に分離。
//   modpack は Profile を構成する上位概念 (Phase 12 の modpackSource)。
// -----------------------------------------------------------
type ContentCategory = 'mod' | 'resourcepack' | 'shader';

// -----------------------------------------------------------
// ProjectItem (旧 ModItem を改名・整理。3 カテゴリ共通の flat 型)
// -----------------------------------------------------------
interface ProjectItem {
  /** Modrinth project ID (旧: id) */
  projectId: string;
  /** 選択中の Modrinth version ID。未設定 = 最新安定版扱い (旧: selectedVersionId) */
  versionId?: string;
  versionNumber?: string;          // (旧: selectedVersionNumber)
  /** 表示名 (旧: title) */
  name: string;
  /** コンテンツ分類 (旧: projectType? を必須化。取りこぼしを型で検出) */
  type: ContentCategory;

  // ---- 既存フィールドは維持 ----
  slug?: string;
  description?: string;
  icon_url?: string;
  author?: string;
  category?: string;
  versionType?: string;
  fileUrl?: string;
  filename?: string;

  // ---- Phase 11 追加 ----
  /** Import 由来の provider。未設定 = 従来の手動追加 ('modrinth' 扱い) */
  provider?: 'modrinth' | 'curseforge' | 'unknown';
  /** ローカルファイルの実体情報 (Import 由来のみ設定。Phase 12 の Sync/Backup で再利用) */
  artifact?: {
    sha1: string;
    /** ルートからの相対パス (例: 'mods/sodium-fabric-0.6.0.jar') */
    path: string;
    size: number;
  };
}

// -----------------------------------------------------------
// Unknown File (Modrinth 照合不可。ChatGPT #3: location で記録)
// -----------------------------------------------------------
interface UnknownFile {
  id: string;
  /** どのディレクトリで見つかったか (category は確定できないため location) */
  location: 'mods' | 'resourcepacks' | 'shaderpacks';
  filename: string;
  path: string;                    // 'mods/some-custom.jar'
  sha1: string;
  size: number;
  discoveredAt: number;
}

// -----------------------------------------------------------
// Profile (Phase 11 拡張)
// -----------------------------------------------------------
interface Profile {
  id: string;
  name: string;
  description?: string;

  /** 環境情報 (旧: flat な mcVersion / loader / loaderVersion を集約) */
  environment: {
    mcVersion: string;
    loader: 'Fabric' | 'Forge' | 'NeoForge' | 'Quilt' | 'Vanilla';
    loaderVersion?: string;
  };

  /** 3 カテゴリ (modpack はカテゴリではない = ChatGPT #9) */
  mods: ProjectItem[];
  resourcepacks?: ProjectItem[];   // 既存 Profile は未設定で OK (optional)
  shaderpacks?: ProjectItem[];
  unknownFiles?: UnknownFile[];

  // linkedSource (フォルダ紐付け) / modpackSource は Phase 12 で追加
}
```

**旧 `ModItem` / flat `Profile` からのマイグレーション**（Dexie schema v2 で一括変換）:

| 変換 | 内容 |
|---|---|
| Profile | `mcVersion / loader / loaderVersion` → `environment` に集約（loader の不正値は `'Fabric'` に正規化） |
| ModItem → ProjectItem | `id`→`projectId`、`title`→`name`、`projectType?`→`type`（未設定は `'mod'`）、`selectedVersionId`→`versionId`、`selectedVersionNumber`→`versionNumber` |
| 新配列 | `resourcepacks / shaderpacks / unknownFiles` は optional のため既存データはそのまま互換 |

### 4.6 ファイル解析 (Web Worker、ChatGPT #15)

#### 4.6.1 SHA-1 計算の並列化

大規模環境 (200+ Mods) でメインスレッド固まりを回避:

```typescript
// worker (lib/env/hash.worker.ts)
self.onmessage = async (e: MessageEvent<{ files: FileEntry[] }>) => {
  const results = await Promise.all(
    e.data.files.map(async (f) => ({
      path: f.path,
      sha1: await calculateSha1(f.data),
      size: f.data.byteLength
    }))
  );
  self.postMessage({ results });
};

// main (lib/env/analyzer.ts)
const worker = new Worker(new URL('./hash.worker.ts', import.meta.url));
```

#### 4.6.2 API 解決の効率化 (ChatGPT #16)

```
200 local files
      ↓
SHA-1 × 200 (Worker で並列)
      ↓
POST /version_files (100 個ずつ batch = 2 requests)
      ↓
unique project IDs 抽出 (e.g. 180 unique)
      ↓
POST /projects?ids=[...] (100 個ずつ batch = 2 requests)
      ↓
Dexie apiCache に {hash → version} と {project_id → project} を保存
      ↓
再 Import 時は cache hit で即座に完了
```

**目標**: 200 Mods の Import が 5 秒以内に完了 (キャッシュヒット時 < 1 秒)。

#### 4.6.3 Unknown File 記録

Modrinth API で照合できなかったファイルは `unknownFiles[]` に永続化。
Phase 11 では単に「認識できませんでした」表示のみ、削除・移動は一切しない。

Phase 12 の Sync 時に「Unknown → 保持 (absolute)」ルールの根拠となる。

---

## 5. 自動検証仕様（Profile Analysis）

Profile インポート完了時に、以下の検証エンジンを自動実行:

| 検証項目 | 内容 | 判定基準 |
|---|---|---|
| **依存関係 (Dependencies)** | 必須 Mod（例: Fabric API, Cloth Config 等）が含まれているか | 欠落時は `MISSING` 警告 |
| **MC 互換性 (MC Version)** | Profile で検出された MC バージョンに対応しているか | バージョン不一致を警告 |
| **Loader 互換性 (Loader)** | Profile で検出された Loader と一致しているか | Loader 不一致をエラー提示 |
| **競合検出 (Conflicts)** | 同時導入が不可とされている Mod 同士が存在しないか | 競合警告を提示 |
| **未識別 (Unknown Files)** | ハッシュ照合できなかったファイルの有無 | 注意喚起（手動確認用） |
| **Shader 前提** | shaderpacks が存在するのに Iris/OptiFine が Mods に無い | 警告 (Iris 追加推奨) |

**既存の `hooks/useDependencyCheck.ts` を再利用可能**。Analysis View も既存の
`components/DependencyCheckModal.tsx` の UI パターンを流用。

**Phase 12 で追加予定**: Modpack Update 検知 (現状より新しい version が
Modrinth に存在するか)。

---

## 6. UI / UX 仕様

### 6.1 Profile 作成モーダル (Phase 11 は 2 経路)

Phase 11 では以下 2 経路のみ (Modpack は Phase 12 で追加):
- **経路 A**: Minecraft フォルダ丸ごと選択 (フル機能)
- **経路 B**: 個別 `.jar` / `.zip` ファイル (既存 `useZipImport` の拡張)

Chromium 版 UI:
```text
┌──────────────────────────────────────────────┐
│  Create Profile                              │
│                                              │
│  [ フォルダから ] [ 個別ファイル ]           │
│                                              │
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
│  ⓘ このモードは Read-only です。ローカル環境 │
│    への書き込みは Phase 12 で実装予定。      │
│                                              │
│              [ キャンセル ] [ Create Profile ] │
└──────────────────────────────────────────────┘
```

非対応ブラウザ版:
- 「.minecraft.zip をアップロード」ボタン + 手順説明

**プロファイル名の自動生成ルール (2026-08-26 確定)**:

| 条件 | デフォルト値 |
|---|---|
| フォルダ名が妥当（特定名でない・一定長以下） | フォルダ名 |
| フォルダ名が不適切（`.minecraft` 等の特定名・一定以上長い） | 検出環境から生成（例: `Fabric 1.21.1`） |
| 環境検出に失敗 | 空欄 |

※「特定名」「一定長」の閾値は実装時に確定。**すべてユーザーが編集可能**（自動生成はあくまでデフォルト値）。

### 6.2 インポート・解析結果画面 (Analysis View)

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
│  ⓘ Phase 11 は Read-only。実際の同期は       │
│    Phase 12 で対応予定。                     │
│                                              │
│          [ View Details ] [ Save Profile ]   │
└──────────────────────────────────────────────┘
```

### 6.3 Profile 詳細画面のタブ構成 (Phase 11)

Phase 11 は 3 タブ (Mods / RP / Shader)。Modpack タブは Phase 12 で追加:

```text
[ Mods (32) ]  [ Resource Packs (8) ]  [ Shaders (4) ]
```

### 6.4 パーミッション再要求 UX

> **2026-08-26 改定**: ハンドル永続化（`dirHandles` / `linkedSource`）は Phase 12 に延期したため、
> **Phase 11 では「再許可」は発生しない**（毎回フォルダを選択し直す）。本 UX は Phase 12 で実装する。

Phase 11 は Read-only なので `read` パーミッションのみ:

```text
┌──────────────────────────────────────────────┐
│  🔒 Minecraft フォルダへのアクセス            │
│                                              │
│  以前選択された .minecraft フォルダの読み取り │
│  を再度許可してください (書き込みは行いません)│
│                                              │
│  Path: C:\Users\...\.minecraft               │
│                                              │
│  [ 別のフォルダを選び直す ] [ 許可する ]      │
└──────────────────────────────────────────────┘
```

Phase 12 で `readwrite` に昇格する UX は Phase 12 で別途設計。

---

## 7. 実装フェーズ分割 (Phase 11 内、ChatGPT #19 の細分に基づく)

Phase 11 を 3 サブフェーズに分割:

### Phase 11-A: 基盤 + 公式ランチャー + Read-only MVP (2〜3 週)

- [ ] **データモデル基盤 (最初のコミット)**: `ModItem`→`ProjectItem` リネーム ＋ `Profile.environment` 化 ＋ `resourcepacks / shaderpacks / unknownFiles` 追加 ＋ Dexie v2 migration ＋ sanitize 更新 ＋ 既存アクセス全書き換え（約 14 ファイル）＋ テスト更新
- [ ] Feature detection ユーティリティ (`lib/env/capabilities.ts`)
- [ ] `EnvironmentSource` 抽象レイヤー (`lib/env/source.ts`)
- [ ] ~~`FileSystemDirectoryHandle` の Dexie 永続化~~ → **Phase 12 へ延期**（`linkedSource` と共に）
- [ ] `showDirectoryPicker({ mode: 'read' })` ラッパー (`lib/env/picker.ts`、ハンドル永続化なし)
- [ ] `EnvironmentDetector` interface + `OfficialLauncherDetector` (`lib/env/detector/official.ts`)
- [ ] `GenericDetector` (fallback)
- [ ] Web Worker で SHA-1 並列計算 (`lib/env/hash.worker.ts`)
- [ ] Modrinth API 解決 (既存 `fetchModrinthVersionFilesBatch` + `fetchModrinthBatch` 再利用)
- [ ] 新規 Profile 作成モーダルの「フォルダから」タブ追加（プロファイル名自動生成ルール込み）
- [ ] Read-only モードで 3 カテゴリ Import が動く MVP

**成果物**: 公式 `.minecraft` を選択 → 3 カテゴリを Modrinth と照合 → Profile 作成
の一連が動く。**Analysis / Prism 対応は次サブフェーズ**。

### Phase 11-B: Prism/MultiMC 対応 + Analysis View (1〜2 週)

- [ ] `PrismDetector` (`lib/env/detector/prism.ts`, `mmc-pack.json` パーサ)
- [ ] Detector Strategy の chain (`OfficialLauncher` → `Prism` → `Generic`)
- [ ] 既存 `useDependencyCheck` を再利用した Analysis View 実装
- [ ] Unknown Files 表示画面
- [ ] Shader 前提チェック (Iris/OptiFine 未導入警告)
- [ ] Profile 詳細画面の 3 タブ (Mods / RP / Shader)

**成果物**: 公式 + Prism 両対応、Analysis 結果画面完成。

### Phase 11-C: ZIP フォールバック + 仕上げ (1 週)

- [ ] ZIP フォールバック実装 (既存 `hooks/useZipImport.ts` 拡張)
- [ ] EnvironmentSource の ZIP 実装
- [ ] ~~Import 直後の fingerprint snapshot を Dexie に保存~~ → **廃止 (2026-08-26 改定)**:
      `ProjectItem.artifact`（sha1/path/size）として Profile 内に保持されるため別途 snapshot は不要。
      Phase 12-A で `ManagedFileRecord` へ展開する
- [ ] E2E テスト (Chromium 環境で `__e2e_mock_handle__` 検討)
- [ ] ドキュメント整備 + Analysis レポート

**成果物**: Phase 11 完成。Firefox/Safari でも ZIP 経由で使える。

---

## 8. 実装上の注意点（Gotchas）

### 8.1 Loader 判定の落とし穴

- **NeoForge vs Forge**: 両方 `cpw.mods.bootstraplauncher.BootstrapLauncher` を使う。
  必ず `libraries` の namespace で区別する
- **Old Forge (1.12.x 以下)**: `mainClass: "net.minecraft.launchwrapper.Launch"` で別扱い
  → **1.13+ のみサポートを明示** (README に注記推奨)
- **Fabric + Quilt 共存インストール**: 稀だが複数ローダーが同居する可能性 → 検出順位定義

### 8.2 SHA アルゴリズム統一

- **Modrinth `/version_files` は SHA-1 か SHA-512**
- 既存 `lib/utils/hash.ts` に `calculateSha1` あり → **これを使う**
- Web Worker 化する際、`calculateSha1` を worker-safe に確認 (Web Crypto API は
  worker 環境でも使える)

### 8.3 パーミッション UX

- Chrome 122+ でパーミッション persist が改善したが、**タブを閉じると失われる**
- **2026-08-26 改定**: handle の Dexie 保存（→ 次回起動時の再許可フロー）は **Phase 12 へ延期**。Phase 11 では毎回フォルダを選択し直す
- **失敗時のフォールバック**: `queryPermission()` が `denied` を返したら、
  ユーザーに「別のフォルダを選び直す」オプションを提示

### 8.4 【Phase 11 の絶対原則】書き込み禁止

- `showDirectoryPicker` は `{ mode: 'read' }` 固定
- `FileSystemFileHandle.createWritable()` は Phase 11 コードベースに**一切登場させない**
- ESLint / Biome ルールとして (`lib/env/**` に限定) `createWritable` を検知したら error
  にする lint rule を検討 (Phase 12 で解除)

### 8.5 モバイル UX

モバイル（Android/iOS）は File System Access API が使えないので、
「モバイル閲覧 + PC 同期」パターンを積極的に打ち出す:

- モバイルで Mod を検索 → Profile に追加 (既存機能)
- PC で「フォルダから取り込み」 → Analysis (Phase 11)
- PC で「Sync」ボタンを押すと Direct Write (Phase 12)

このパターンは **DropMod 独自の強み** になる。

### 8.6 テスト戦略

- **Unit**: パーサ (公式 / Prism) の JSON パース、SHA-1 計算、Detector chain
- **Integration**: MSW で Modrinth `/version_files` モック、SHA-1 バッチ照合
- **E2E**: Playwright で `showDirectoryPicker` を実行できないため、
  **試験モードで `__e2e_mock_handle__` を用意する等の工夫が必要**

---

## 9. 設計論点（2026-08-26 すべて解決済み）

- [x] `.minecraft` ではなく Prism instance root (`instances/<name>/`) を選ばれた場合の
      「保存フォルダ表示ラベル」の UX → **検出した `rootType`（'prism'）とフォルダパスをそのまま表示**
      （実装詳細として確定）
- [x] Profile が指定する mcVersion / loader と、Import 元の環境の mcVersion / loader が
      **不一致** な場合の警告レベル → **発生しない**（Import は常に新規 Profile 作成のみで、
      `environment` はフォルダから検出した値そのもののため）。**ハンドリング不要・破棄**
- [x] ZIP フォールバックで .minecraft 全体を扱う場合の **メモリ制約** → **Stream 処理で対応**
      （実装時、jszip の stream 系 API を検討）
- [x] Web Worker のロード失敗時のフォールバック → **main thread へフォールバック**
      （性能は低下するが機能は維持）
- [x] 既存 Profile に「フォルダから追加取り込み」した場合の merge 挙動 → **不可**
      （Import は常に新規 Profile 作成のみ。merge 自体が存在しない）

---

## 10. Roadmap（Phase 11 以降）

- **Phase 12**: Sync + Modrinth Modpack + Backup/Rollback + Provider 抽象化準備
  (`docs/planning/PHASE12_PLAN.md` 参照)
- **Phase 13**: CurseForge 完全対応 (Murmur2 fingerprint + Modpack)
  (`docs/planning/PHASE13_PLAN.md` 参照)
- **Roadmap 2**:
  - `config/` 同期
  - `saves/` 同期
  - GDLauncher / ATLauncher / Modrinth App 対応
  - 複数 Modpack 同居

---

## 11. ChatGPT レビュー (2026-08-24) 反映状況

本仕様書は ChatGPT の詳細レビュー 19 項目を反映済み。Phase 分担:

| # | 提案内容 | Phase 11 反映 | Phase 12/13 で反映予定 |
|---|---|---|---|
| 1 | Import/Sync 分離 | ✅ Phase 分割で分離 | Phase 12 で Sync |
| 2 | ContentRef + Artifact 分離 | ✅ §4.5 | — |
| 3 | UnknownFile.location | ✅ §4.5 | — |
| 4 | ManagedFileRecord 拡張 | — | Phase 12 (Sync) |
| 5 | Ownership Model | — | Phase 12 (Sync) |
| 6 | SyncPlan 分離 | — | Phase 12 (Sync) |
| 7 | Transaction Journal | — | Phase 12 (Sync) |
| 8 | Blob backup (OPFS) | — | Phase 12 (Sync) |
| 9 | Modpack は Source | ✅ Profile 型で明示 | Phase 12 で活用 |
| 10 | .mrpack Artifact-first | — | Phase 12 (Modpack) |
| 11 | CurseForge を外へ | ✅ Phase 13 移動 | Phase 13 で対応 |
| 12 | fingerprint 必須 | — | Phase 12 (Sync 削除時) |
| 13 | Import 直後 snapshot | ✅ §7 Phase 11-C | Phase 12 で活用 |
| 14 | Detector Strategy | ✅ §4.2 | — |
| 15 | Web Worker SHA-1 | ✅ §4.6.1 | — |
| 16 | Batch API + cache | ✅ §4.6.2 | — |
| 17 | 見積り 10〜14週 | ✅ Phase 11 のみ 4〜6 週 | Phase 12: 4〜5 週、Phase 13: 2〜3 週 |
| 18 | Scope 縮小 | ✅ CurseForge/config/saves 除外 | — |
| 19 | Phase 細分 | ✅ 11-A/B/C の 3 段 | Phase 12 も細分予定 |

> **2026-08-26 改定注記**: #2 の「ContentRef + Artifact 分離」は実装簡素化のため
> **`ProjectItem` の flat 型 + `artifact?` フィールドに統合**（fingerprint 必須 [#12] は
> `ProjectItem.artifact` が担う）。#13 の「Import 直後 snapshot」は `ProjectItem.artifact`
> として Profile 内に保持される形に簡素化（別途 snapshot テーブルは作らない）。

---

**関連ドキュメント**:
- `docs/planning/PHASE10_CANDIDATES.md` — 現在進行中の Phase 10
- `docs/planning/PHASE12_PLAN.md` — Sync + Modrinth Modpack (Phase 12)
- `docs/planning/PHASE13_PLAN.md` — CurseForge 完全対応 (Phase 13)
- `docs/audit/issues-legacy.md` — 過去の設計判断の履歴
- 既存資産: `hooks/useZipImport.ts`, `hooks/useDependencyCheck.ts`,
  `lib/modrinth/client.ts`, `lib/utils/hash.ts`
