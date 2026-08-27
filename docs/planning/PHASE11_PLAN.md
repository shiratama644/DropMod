# Phase 11: ローカル Minecraft 環境 Import & Analysis (Read-only)

> 対応 task-list ID: `P11-FIX` / `P11-A` / `P11-B1`〜`B3` / `P11-C1`〜`C2` / `P11-E2E`
> ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 完了** (2026-08-26 改定・実施 / P11-E2E の CI green 確認のみ `実環境検証待ち`)

## 1. 開始前確認

- Phase 10 / 10.5 完了・`git status` clean
- 2026-08-26 セッション合意の確定事項 (本書 §10.1) を読む
- AGENT.md §6.4 (React 実装ルール)・skills/env-import.md を読む

## 2. 目的 (Why)

Profile を「ダウンロード対象の Mod リスト」から**「ローカルの実際の Minecraft 環境を
構造的に理解できる構成管理単位」**へ拡張する第一歩。

- `.minecraft` / Prism instance を選択するだけで MC バージョン・Loader・Mod/RP/Shader を
  自動解析してプロファイル化 (Import)
- 依存・互換性を検証 (Analysis) して**安全に取り込みミスを防ぐ**
- **書き込みは一切行わない** (絶対保証。双方向 Sync は Phase 12 の責務)

## 3. 変更範囲 (Scope)

変更対象:
- `types.ts` (ProjectItem モデル) / `lib/db/dexie.ts` (v2 migration) / `lib/state/sanitize.ts`
- `lib/env/` (source / picker / zipSource / detector/ / analyzer / hashCore / hash.worker /
  capabilities / profileName / analysis)
- `components/NewProfileModal.tsx` (フォルダ解析タブ + Analysis View)
- `hooks/useZipImport.ts` (.minecraft ZIP 分岐) / `e2e/` (spec 2 種)
- 予約ルート `/resourcepack` `/shader` (Coming Soon ページ)

変更しない (境界外):
- **ローカル環境への書き込み** (一切禁止)
- `FileSystemDirectoryHandle` の Dexie 永続化 / `linkedSource` → **Phase 12 へ延期**
- Import 直後の fingerprint snapshot → **廃止決定** (ProjectItem.artifact が Profile 内に保持)
- Modpack (.mrpack) → Phase 12 / CurseForge → Phase 13

## 4. 禁止事項

- `showDirectoryPicker` は `{ mode: 'read' }` 固定。`createWritable()` を Phase 11 の
  コードベースに一切登場させない
- SHA-1 計算をメインスレッドで大量に実行しない (Web Worker 必須)
- ZIP 内 `.minecraft` の re-root を `zip.folder()` で実装しない (pathPrefix 方式 — §11)
- 検出を推測で補完しない (不明は unknownFiles 行き)

## 5. 完了条件 (DoD)

- [x] ProjectItem データモデル + Dexie v2 migration + sanitize + 全アクセス置換 + テスト (`547f40c`)
- [x] 公式 `.minecraft` 選択 → 3 カテゴリを SHA-1 で Modrinth 照合 → Profile 作成が動作
- [x] Prism (mmc-pack.json) 検出 + Detector chain (Official → Prism → Generic)
- [x] Analysis 6 項目 (依存 / MC 互換 / Loader 互換 / 競合 / 未識別 / Shader 前提)
- [x] Firefox / Safari / モバイルで `.minecraft` ZIP 取り込みが動作
- [x] プロファイル名の自動生成ルール
- [ ] **E2E 2 spec が CI 上で green** (`実環境検証待ち` — VER-1)
- [x] 4 検証全 pass・`.archive/vite/` 無変更

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | ✅ | detector / analyzer / zipSource / profileName / analysis / dexie migration |
| Component (RTL) | ✅ | NewProfileModal.folderImport |
| E2E (CI) | 🟡 | folder-import / zip-env-import spec (CI 実行待ち VER-1) |
| 実環境 (実機) | 🟡 | ユーザー実環境でのフォルダ取り込み (ユーザー確認) |

## 7. 停止条件

- ローカル環境への書き込みが必要になる設計に到達した場合 (Phase 12 スコープ)
- Modrinth API の 429 が継続し解析が不可能な場合 (P11-FIX の対策範囲を超える場合)
- File System Access API の挙動が仕様と異なる場合

## 8. 完了時に行うこと

各サブフェーズ: 4 検証 → コミット (`feat(P11-B2): …`) → task-list 更新 → skills/env-import.md 反映。

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 状態 |
|---|---|---|---|---|
| P11-FIX | build 時 429 フラッド対策 | 事前生成削減 + backoff + breaker | - | 完了 `c47b3db` |
| P11-A | ProjectItem モデル + Dexie v2 | 型・sanitize・14 ファイル置換 | - | 完了 `547f40c` |
| P11-B1 | EnvironmentSource + picker | FileSystemSource / read モード | P11-A | 完了 `1c43693` |
| P11-B2 | Detector chain | Official / Prism / Generic | P11-B1 | 完了 `b3f8d40` |
| P11-B3 | Analyzer + SHA-1 Worker | 照合 + 検証エンジン | P11-B2 | 完了 `a2f44ba` |
| P11-C1 | Import UI 統合 | Analysis View + 名前自動生成 | P11-B3 | 完了 `b6a5a54` |
| P11-C2 | ZIP フォールバック | .minecraft ZIP / pathPrefix | P11-C1 | 完了 `b6a5a54` |
| P11-E2E | E2E spec 2 種 + docs | folder-import / zip-env-import | P11-C2 | 実環境検証待ち `c0d13f8` |

## 10. 設計詳細・仕様 (継承)

### 10.1 2026-08-26 セッション合意 (確定事項)

- Read-only を徹底 (Sync は Phase 12 で分離)
- `ModItem` → `ProjectItem` リネーム + `Profile.environment` 化 +
  `resourcepacks / shaderpacks / unknownFiles` 追加
- handle 永続化・`linkedSource` は Phase 12-A へ延期。Phase 11 では毎回フォルダ選択
- fingerprint snapshot は廃止 (`ProjectItem.artifact` = sha1/path/size を Profile 内保持。
  Phase 12-A で ManagedFileRecord へ展開)
- 予約 URL: `/resourcepack` `/shader` (Phase 11) / `/modpack` (Phase 12)。
  検索 (`/discover/*`) へリダイレクトせず専用ハブとして予約 (現状 Coming Soon ページ)

### 10.2 対応 3 カテゴリ

| カテゴリ | 実体 | 検出ディレクトリ | Modrinth 種別 |
|---|---|---|---|
| Mods | `.jar` | `mods/` | `mod` |
| ResourcePacks | `.zip` | `resourcepacks/` | `resourcepack` |
| Shaders | `.zip` | `shaderpacks/` | `shader` |

Modpack は「カテゴリ」ではなく Profile の Source として扱う (Phase 12)。

### 10.3 アーキテクチャ

`EnvironmentSource` (抽象: FileSystemSource / ZipSource) → `EnvironmentDetector` chain
(Official: `versions/*.json` / Prism: `mmc-pack.json` / Generic fallback) →
`Analyzer` (Web Worker で SHA-1 → Modrinth `/version_files` バッチ照合 → ProjectItem 化)
→ `analyzeImportHealth` (検証 6 項目) → NewProfileModal の Analysis View。

### 10.4 Analysis 検証 6 項目

依存関係 (MISSING 警告) / MC 互換 / Loader 互換 / 競合 / 未識別ファイル /
Shader 前提 (Iris/OptiFine 未導入警告)。既存 `useDependencyCheck` と
`DependencyCheckModal` の UI パターンを再利用。

### 10.5 ブラウザ対応

| 環境 | 手段 |
|---|---|
| Chrome / Edge (Desktop) | File System Access API (`mode: 'read'`) |
| Firefox / Safari / モバイル | `.minecraft` を ZIP 化して取り込み |

## 11. リスク・Gotchas (継承)

- **Loader 判定**: NeoForge と Forge は mainClass が同一 → `libraries` の namespace で区別。
  Old Forge (1.12.x 以下, launchwrapper) は対象外 (1.13+ のみ)
- **SHA**: Modrinth `/version_files` は SHA-1 / SHA-512。既存 `calculateSha1` を worker-safe に使用
- **ZipSource の pathPrefix 方式**: JSZip の `folder()` は `files` の key がフルパスのまま
  → **`folder()` を使わず元 zip を接頭辞走査** (2026-08-27 バグハントで修正済みの重要知見)
- **パーミッション**: handle はタブを閉じると失われる (Phase 11 は毎回選択で解決)
- **429 対策**: build 時の事前生成 (generateStaticParams) がバーストする →
  PREBUILD_LIMIT 15 + Retry-After 最小 1s クランプ + サーキットブレーカー (連続 3 失敗で 60s fail-fast)

## 12. 実績と証拠

| ID | コミット | テスト | 備考 |
|---|---|---|---|
| P11-FIX | `c47b3db` | 全 pass | build 429 解消 |
| P11-A | `547f40c` | dexie.migration.test 等 | ProjectItem |
| P11-B1 | `1c43693` | source.test / picker.test | |
| P11-B2 | `b3f8d40` | detector.test | mmc-pack.json 解析 |
| P11-B3 | `a2f44ba` | analyzer / hashCore / analysis test | SHA-1 Worker |
| P11-C1/C2 | `b6a5a54` | NewProfileModal.folderImport.test | Analysis View + ZIP |
| P11-E2E | `c0d13f8` | (CI で実行) | folder-import / zip-env-import |
