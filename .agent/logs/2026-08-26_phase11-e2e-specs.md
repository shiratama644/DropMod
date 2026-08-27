# Phase 11 完了: E2E spec 作成 (folder-import / zip-env-import) + ドキュメント整備

> Date: 2026-08-26 (JST) / Branch: `arena/01a04363-dropmod`

## 1. 指示内容 (Task Summary)

「優先順位はPhase 11を完了することなので続きであるE2E spec 作成を行ってください」—
PHASE11_PLAN.md §7 11-C の残項目「E2E テスト (Chromium 環境で `__e2e_mock_handle__` 検討)」と
「ドキュメント整備」を実施し、Phase 11 を完了させる。

## 2. 実行内容 (Executed Actions)

| 変更 | 内容 |
| :--- | :--- |
| `e2e/helpers/minecraftEnv.ts` (新規) | .minecraft 構造 ZIP 生成 (mods/versions/resourcepacks、既知 Mod + 未知ファイル混在) + `installModrinthApiMock(page)`: `page.route` で /version_files・/projects を決定論的にモック (proxy `/api/modrinth/*` と direct api.modrinth.com 両方)。sha1 は Node crypto で事前計算 (ASCII 内容のためブラウザと同一ハッシュ) |
| `e2e/helpers/folderPickerMock.ts` (新規) | `installFolderPickerMock(page, rootName, files)`: `addInitScript` で window.showDirectoryPicker をメモリ上 fake FileSystemDirectoryHandle に差し替え (**計画書の `__e2e_mock_handle__` 案を実装**。init script はブラウザ側コードのため文字列注入で TS/biome 対象外に) |
| `e2e/folder-import.spec.ts` (新規, Desktop 専用 2 tests) | ①フォルダ選択 → 解析 → Analysis View (公式ランチャー / Minecraft 1.21.1 / Fabric / 0.16.0、件数、未識別 warning、§6.1 名前自動生成) → 作成 → toast + モーダル close。②不適切フォルダ名 (.minecraft) → `Fabric 1.21.1` 生成 |
| `e2e/zip-env-import.spec.ts` (新規, Desktop 2 + Mobile 1 tests) | ①DesktopSidebar ZIP 読込 → .minecraft ZIP 解析 → Analysis View → 作成。②`.minecraft/` サブフォルダ入り ZIP の re-root。③Mobile: MenuBottomSheet から同じ流れ |
| `components/NewProfileModal.tsx` (微修正) | ZIP 経路の件数表示を「照合成功 + 未識別 (location 別)」= フォルダ解析の scannedCounts と同じ意味に統一 (`countImportedContents`) |
| `README.md` | 機能説明にローカル環境取り込み (Read-only・ブラウザ差・Phase 12 予告) を追加 |

検証: typecheck 0 error / biome 0 warning (213 files) / test:unit 548 passed / build exit 0。
E2E 自体は **Sandbox で Chromium install 不可のため CI での実行確認が必要** (ユーザー側)。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **Playwright から File System Access API を駆動する方法**: ネイティブピッカーは自動化不可 → `page.addInitScript` で `window.showDirectoryPicker` を fake handle に差し替える。FileSystemSource が使う API (name/kind/getDirectoryHandle/getFileHandle/values/getFile) だけの duck-typing 実装で足りる。**addInitScript はページスクリプトより先に走る**ため `supportsDirectoryPicker()` 判定にも反映される。
- **init script は文字列で注入**: ブラウザ側で実行されるコードを TS として書くと strict の implicit any と biome noExplicitAny に挟まれる。fixture は `JSON.stringify` で埋め込む。
- **page.route による API モック**: client.ts は proxy `/api/modrinth/*` を最初に試むため `**/api/modrinth/version_files` で捕捉できる (direct fallback 用に `**/api.modrinth.com/v2/...` も登録)。クエリ付き URL は末尾 `*` で (`projects*`)。
- **表示件数の semantics 統一**: フォルダ解析は scannedCounts (照合成功+未識別)、ZIP 経路は matched のみで件数の意味がズレていた → unknownFiles の location から補完して統一 (本タスクで発見・修正)。
- E2E で Modrinth API をモックする理由: 実 API だと CI の実行ごとに結果が変わり (レート制限・ランキング) assertion が不安定になる。sha1 は Node 側で事前計算して route handler に埋め込む。

## 4. 次にすべきこと (Next Actions)

1. **ユーザー側 CI で E2E green 確認** (Phase 10.5〜11 の全変更を含む)。
2. Phase 11 は本タスクで完了 (11-A/B/C + E2E + docs)。次は **Phase 12-A** (linkedSource / dirHandles 永続化 / EnvironmentSink・Sync 設計) か、SEO 候補の早期実装 (重複コンテンツ対策)。
