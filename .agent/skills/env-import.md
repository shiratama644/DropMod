# Env Import — Phase 11 のフォルダ/ZIP 取り込み基盤

> `.minecraft` / Prism インスタンスの解析・Import (Read-only) を触る時に読む。
> PHASE11_PLAN.md §2〜§6 の実装。**Phase 11 は絶対に Read-only** (書き込み=Sync は Phase 12)。

## モジュール構成 (`lib/env/`)

| ファイル | 役割 |
| :--- | :--- |
| `capabilities.ts` | `supportsDirectoryPicker()` (Chromium 判定) |
| `source.ts` | **EnvironmentSource** interface + `FileSystemSource` (handle ラッパ)。`rootName` は Profile 名自動生成に使う (計画書の `root` は公開しない方針変更) |
| `picker.ts` | `pickMinecraftDirectory()`: `showDirectoryPicker({mode:'read'})`。キャンセル (AbortError) は null。**ハンドル永続化は Phase 12 延期** |
| `zipSource.ts` | `ZipSource` (JSZip 実装・Firefox/Safari フォールバック) + `isMinecraftFolderZip()` (経路分岐判定) |
| `detector/` | Strategy: `OfficialLauncherDetector` (versions/*.json) → `PrismDetector` (mmc-pack.json) → `GenericDetector` (fallback)。`detectEnvironment()` が chain entry |
| `hashCore.ts` / `hash.worker.ts` / `hashWorker.ts` | SHA-1 一括計算。**Worker→メインスレッド自動 fallback** (jsdom・Worker 失敗時)。コアは hashCore (pure) |
| `analyzer.ts` | `analyzeEnvironmentSource()`: 検出→列挙 (mods/*.jar, RP/shader/*.zip)→ハッシュ→`/version_files` (100 個 batch)→`/projects`→**ImportAnalysis** (ProjectItem[] ×3 + UnknownFile[] + versionsByProject) |
| `analysis.ts` | `analyzeImportHealth()`: §5 の検証 (MC/Loader 互換・依存・競合・未識別・Shader 前提)。pure |
| `profileName.ts` | §6.1 の名前自動生成: 妥当フォルダ名→そのまま / 不適切→`Fabric 1.21.1` / 検出失敗→空欄 |

## データフロー

```
[Chromium] pickMinecraftDirectory() ─┐
                                     ├→ EnvironmentSource ─→ detectEnvironment()
[Firefox/Safari] .minecraft ZIP ─────┘        (Detector chain)      │
                                                                      ▼
                                              analyzeEnvironmentSource() (進捗 callback あり)
                                                      │
                                       ImportAnalysis (mods/RP/shader + unknownFiles + issues)
                                                      │
                            NewProfileModal: 自動入力 (名前/環境) + Analysis View 表示
                                                      │
                                    handleCreateProfile(..., extras) → 新規 Profile (merge なし)
```

- **useZipImport の経路分岐**: .mrpack → (1) 直接作成 / **isMinecraftFolderZip → (1.5) 解析→pendingImportData→モーダル** / .jar ZIP → (2) 従来どおり。`.minecraft/` サブフォルダ入り ZIP は `zip.folder('.minecraft')` で re-root。
- **PendingImportData** (store/zipImport.ts) に `resourcepacks/shaderpacks/unknownFiles/analysisIssues/rootType` を追加 (Phase 11)。
- **handleCreateProfile** の第 7 引数 `extras?: ProfileContentExtras` で RP/shader/unknown を Profile に反映 (空配列は設定しない)。

## 重要な設計判断

- **検出の決定論**: versions/ に複数バージョン → Loader 付き (Vanilla 以外) の最初のもの。UI で上書き可能。
- **extractMcVersionFromId は '-' パート分割** (`fabric-loader-0.16.0-1.21.1` → 最後の version 様パート)。正規表現の `\b` トークン化は `0.16.0-1.21.1` を誤分割するので使わない。
- **hash→version の永続キャッシュは未実装** (apiCache 流用でなく専用設計が必要なため。将来改善)。
- Modrinth `/version_files` は POST (client.ts `fetchModrinthVersionFilesBatch`、`noCache: true`)。テストの msw override は **path-only pattern** `/api/modrinth/version_files` (**/v2 無し**・client は `/api/modrinth${endpoint}` プロキシを最初に試すため)。

## テスト

- `__tests__/test-utils/fakeFs.ts`: File System Access API の Fake。`createFakeFileSystem(Record<path, content>)`。**jsdom の File は arrayBuffer() 未実装** → getFile は arrayBuffer 付き File 互換を返す。
- Detector / Analyzer は Fake FS + msw で統合テスト。analysis.ts は pure fixture。
- Worker は jsdom に無いため `computeHashes` は自動でメインスレッド経路になり、その経路をテストする。

## Phase 12 で追加するもの (ここにはまだ無い)

- `EnvironmentSink` (書き込み) / `readwrite` picker / dirHandles の Dexie 永続化 / `Profile.linkedSource` / `.mrpack` 取り込み / ManagedFileRecord。
