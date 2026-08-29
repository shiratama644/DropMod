# 2026-08-29 MojoLauncher 名称修正 + versionId 単一関数化 (P11-B7)

## 指示内容

- `mojo_instance.json` の検出対象は Modrinth App ではなく **MojoLauncher**
  (https://github.com/MojoLauncher/MojoLauncher、PojavLauncher ベース) である。
- 推測で答えず AGENT.md を再読し、検索ツールで一次情報を確認する。
- `mcVersionFromNeoForge` は拡張性が低いため、NeoForge / Forge / Quilt / Fabric を
  1 つの関数で version 情報を生成する方式に変更する。
- 質問はクイズ形式で行う。

## 実行内容

1. AGENT.md を再読 (§4.1.1 サンドボックス復旧、§7.5 Web 検索方針、§8.3 ログ運用)。
2. サンドボックス再構築を検出 → `git reset --hard FETCH_HEAD` で復旧 (HEAD = `6751971`)。
3. MojoLauncher 公式リポジトリをクローンし一次情報を確認:
   - インスタンス定義ファイル名: `mojo_instance.json`
     (`app_pojavlauncher/src/main/java/net/kdt/pojavlaunch/instances/Instances.java:43`)
   - versionId 形式 5 種:
     `app_pojavlauncher/src/main/java/net/kdt/pojavlaunch/modloaders/modpacks/api/ModLoader.java`
     の `getVersionId()` (Fabric / Quilt / Forge / NeoForge / Legacy Fabric)
   - 全ブランチで `mojo_instance.json` (旧 `mojo_launcher.json` は未確認)。
     → ユーザーへクイズ提示し、`mojo_instance.json` を採用と確認。
4. ユーザーとのクイズ確定事項:
   - ファイル名: `mojo_instance.json` (一次情報通り)
   - 名称変更: 全面リネーム (ファイル / rootType / ラベル / 旧 rootType レガシー保持)
   - 設計: 宣言テーブル + 単一関数
   - Legacy Fabric: 対応 (loader は `'Fabric'` として扱う)
   - `mcVersionFromNeoForge`: export 廃止し単一関数内の内部ヘルパー化
   - `parseVersionId`: 内部関数 (テストは `parseMojoInstance` 経由)
5. 実装:
   - `lib/env/detector/modrinthApp.ts` → `mojoLauncher.ts` にリネーム
   - `VERSION_ID_FORMATS` 宣言テーブル (5 形式) + 単一関数 `parseVersionId`
   - `MojoLauncherDetector` (name / rootType `mojo-launcher`) へ変更
   - registry: rootType/label 更新 + 旧 `modrinth-app` をレガシーラベルとして保持
   - types.ts: RootType に `mojo-launcher` 追加 (`modrinth-app` は後方互換で残置)
   - profileName.ts: RESERVED_FOLDER_NAMES に `mojo-launcher` / `mojolauncher`
   - zipSource.test.ts / env-import.md / index.md / task-list.md を追随更新
6. テスト: NeoForge 直接テストを `parseMojoInstance` 経由に書き換え、
   Legacy Fabric テスト追加 (detector.test 37 tests / total 1232 tests)。

## 気づき

- **mojo_instance.json は MojoLauncher の実ファイル名**。ユーザー提示の
  `mojo_launcher.json` は公式リポジトリに存在しない (全ブランチ確認済み)。
- 正規表現の名前付きキャプチャを `Record<string, string>` で受け取ると、
  `noUncheckedIndexedAccess: true` のため `string | undefined` になる
  (TS エラーの原因)。`?? ''` フォールバックで対処。
- MojoLauncher は NeoForge の versionId を `neoforge-<version>` で保持し、
  MC バージョンは NeoForge version から導出する必要がある
  (旧形式 21.x / 新形式 26.x の 2 形式、一次情報で確認済み)。

## 次アクション

- P11-B7 完了報告 (commit SHA / 検証結果)。
- Modrinth App (modrinth.com/app) は本プロジェクトの対応対象外。
  将来対応する場合は別タスクで検討 (rootType `modrinth-app` はレガシーラベルのみ残置)。
