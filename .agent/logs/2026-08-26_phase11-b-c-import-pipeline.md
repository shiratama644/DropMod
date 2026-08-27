# Phase 11-B/C: Import パイプライン (Source / Detector / Analyzer / Analysis / UI / ZIP)

> Date: 2026-08-26 (JST) / Commits: `1c43693` `b3f8d40` `a2f44ba` + 本 commit / Branch: `arena/01a04363-dropmod`

## 1. 指示内容 (Task Summary)

「11-B, Cも丁寧にお願いします」— PHASE11_PLAN.md §7 の残項目 (11-A 残件 + 11-B + 11-C) を実装する:
EnvironmentSource 抽象 → Detector chain (公式/Prism/Generic) → Analyzer (SHA-1 Worker + Modrinth 照合) →
Analysis View (§5 検証) → NewProfileModal「フォルダから」→ ZIP フォールバック。

4 コミットに分割して実施 (小さく実装→検証→commit のサイクル遵守)。

## 2. 実行内容 (Executed Actions)

| Commit | 内容 |
| :--- | :--- |
| `1c43693` | **基盤①**: `lib/env/source.ts` (EnvironmentSource + FileSystemSource) / `picker.ts` (mode:'read' ラッパ) / fs-access.d.ts 補完 / `__tests__/test-utils/fakeFs.ts` (Fake FSA) + 12 tests |
| `b3f8d40` | **基盤②**: `lib/env/detector/` (types / official / prism / generic / index chain) + 21 tests。versions/*.json パーサ (§4.4.1 の表) と mmc-pack.json パーサ (§4.4.2) |
| `a2f44ba` | **基盤③**: `hashCore.ts` / `hash.worker.ts` / `hashWorker.ts` (Worker→メインスレッド fallback) / `analyzer.ts` (検出→列挙→ハッシュ→/version_files→/projects→ImportAnalysis) / `analysis.ts` (§5 検証 6 項目) + 19 tests |
| 本 commit | **UI 統合 + ZIP**: `zipSource.ts` (ZipSource + isMinecraftFolderZip) / `profileName.ts` (§6.1 名前自動生成) / NewProfileModal のフォルダ解析 + Analysis View + 解析中 progress + extras 渡し / useZipImport の 1.5 番目経路 (.minecraft ZIP → pendingImportData → モーダル、`.minecraft/` re-root 対応) / PendingImportData・appActions・handleCreateProfile 拡張 (ProfileContentExtras) + 23 tests |

検証 (各 commit 時点で §3.1 4 検証 + coverage green):
- 最終: typecheck 0 error / biome 0 warning (209 files) / **test:unit 548 passed / 65 files** / build exit 0 / **coverage exit 0 (総計 stmt 84.00 / br 72.44 / fn 90.15 / lines 86.09)**

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **jsdom の File は arrayBuffer() 未実装** (`typeof f.arrayBuffer === 'undefined'` を実測)。Fake FSA の getFile は arrayBuffer 実装付きの File 互換オブジェクトを返す必要がある。実ブラウザは本来の File。
- **TS 5.9 の lib.dom に FileSystemDirectoryHandle.values() が無い** → fs-access.d.ts で補完宣言。
- **msw の POST override パターン**: client.ts は `/api/modrinth${endpoint}` プロキシを最初に試むため、override は path-only `/api/modrinth/version_files` (**/v2 を入れない**)。ワイルドカード origin 指定 `*/api/...` は proxy 相対 fetch に効かない。
- **`0.16.0-1.21.1` の正規表現トークン化の罠**: `\b\d+\.\d+(?:\.\d+)?(?:-[a-z0-9]+)?\b` は `0.16.0-1` で切れて後続が `21.1` になる。'-' パート分割 + パート単位の version 様判定が確実。
- **Dexie/DB を使わない Worker のテスト**: `typeof Worker === 'undefined'` (jsdom) で自動的にメインスレッド fallback する設計にすると Worker ブートストラップ以外を全てテストできる。Worker 失敗時の fallback も同じ経路。
- **Python でのテキスト編集は `'\\n'` (literal backslash-n) 混入に注意**: heredoc 内の Python 文字列で改行を書くつもりの `'\\n'` がファイルに literal として入り esbuild syntax error になった。生成後は `cat -A` で確認するのが確実。
- **`??` と空配列**: `folderAnalysis?.resourcepacks ?? initialImportData?.resourcepacks` は空配列 `[]` を保持する (undefined ではない)。Profile 構築側 (useProfiles) で `length > 0` ガードしているため実害なし。

## 4. 次にすべきこと (Next Actions)

1. **E2E**: Phase 11 の E2E spec (Chromium の __e2e_mock_handle__ 検討・計画書 11-C) と Phase 10.5 + 11-A〜C 全体の CI green 確認 (ユーザー側 CI)。
2. **Phase 12-A**: linkedSource / dirHandles 永続化 / EnvironmentSink (readwrite) / Sync 設計。
3. ドキュメント整備: README の機能説明に「フォルダ取り込み (Chromium) / .minecraft ZIP (全ブラウザ)」を追加。
