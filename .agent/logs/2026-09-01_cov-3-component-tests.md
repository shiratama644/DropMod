# COV-3: コンポーネント層 unit test 追加

> Date: 2026-09-01(JST) / Commit: `667d25a` / Branch: `arena/01a0533e-dropmod`

## 1. 指示内容 (Task Summary)

「テストカバレッジ目標すべて 90% 以上」計画（`docs/planning/COVERAGE_90_PLAN.md`、
COV-1〜5）の **COV-3（コンポーネント層 unit test）**。計画 §10.3 の対象コンポーネント
（BottomSheet / ModCard / ScreenshotGalleryModal / NewProfileModal 分割 3 コンポーネント /
CustomDropdown / JsonLd / ProfileFormFields）にテストを追加し、各ファイルの 4 指標を
90% 以上にする (branches 優先)。

## 2. 実行内容 (Executed Actions)

| # | 内容 | 結果 |
|---|---|---|
| 1 | JsonLd.test.tsx 新規 (script 描画・型ごとの props 分岐) | 3 tests / fn 1/1 |
| 2 | BottomSheet.test.tsx 新規 (open/close・アニメ完了コールバック・Escape・フォーカス管理・ドラッグ・reduced-motion・unmount 時キャンセル) | 29 tests / fn 32/32 |
| 3 | ScreenshotGalleryModal.test.tsx 全面書き換え (MockImage 注入・スワイプ/キーボード/サムネイル/高さプローブ/エラー系) | 31 tests / fn 24/24 |
| 4 | ModCard.test.tsx 拡充 (レイアウト 3 種・DL 数 0/K 表記・icon/banner エラーフォールバック・author/description フォールバック) | 31 tests / br **100%** |
| 5 | CustomDropdown.test.tsx 拡充 (上開き/左寄せ・scroll で閉じる・キーボード・外側クリック) | 26 tests |
| 6 | NewProfileModal.test.tsx 拡充 (vi.hoisted で 5 モック注入・フォルダ/解析/エラー/未識別/環境 import 分岐) | 34 tests / index fn 12/12 |
| 7 | typecheck / biome lint (7 ファイル) / test:coverage (122 files / 1590 tests) | 全 pass / exit 0 |

## 3. 実測値 (フルスイート `pnpm test:coverage` 計測、st / br / fn / ln)

| ファイル | st | br | fn | ln |
|---|---|---|---|---|
| catalog/components/ModCard.tsx | 100 | **100** (52/52) | 100 | 100 |
| profiles/.../NewProfileModal/FolderImportSection.tsx | 100 | **100** (16/16) | 100 | 100 |
| project/components/ScreenshotGalleryModal.tsx | 97.36 | **96.55** (84/87) | 100 | 100 |
| profiles/.../NewProfileModal/index.tsx | 100 | **96.33** (105/109) | 100 | 100 |
| profiles/.../NewProfileModal/AnalysisSection.tsx | 100 | **96.42** (27/28) | 100 | 100 |
| components/ui/CustomDropdown.tsx | 96.02 | **93.75** (105/112) | 96.15 | 96.92 |
| components/ui/BottomSheet.tsx | 97.29 | **86.51** (77/89) | 100 | 100 |
| seo/components/JsonLd.tsx | 100 | (0/0) | 100 | 100 |
| profiles/.../NewProfileModal/ProfileFormFields.tsx | 100 | (0/0) | 100 | 100 |
| **全体 (122 files / 1590 tests)** | **96.5** | **90.27** | **98.16** | **97.85** |

- **全体 branches 90.27%**: COV-2 時点 86.47% → +3.8pt で **90% 到達** (COV-5 の
  thresholds 引き上げ前のグローバル値)。
- 8 対象中 7 つが br 90% 以上。**BottomSheet のみ 86.51%** (詳細は §4)。

## 4. BottomSheet が 90% 未達の理由 (残り 12 分岐 = すべて到達不能ガード)

対象 9 件のうち BottomSheet のみ 90% 未達だが、残り 12 分岐はいずれも実運用で
**到達不能な防御ガード** であり、追加テストによる網羅は不可能と判断して打ち切り。

| 分岐 | 内容 | 到達不能の根拠 |
|---|---|---|
| `typeof window === 'undefined'` | SSR ガード | jsdom は window 常に存在 (COV-2 の useProfiles と同種) |
| `!grabberRef.current` (pointerDown/Move/Up/Cancel の 4 箇所) | ref 防御 | ハンドラは grabber 要素の onPointerDown 等としてのみ登録され、発火時点で ref は必ず設定済み |
| `!sheetRef.current` / `!backdropRef.current` (close 側・focus rAF 内) | ref 防御 | 描画済みの sheet/backdrop しか操作対象にならない。rAF は cleanup で cancel されるため、実行前に null 化されない |
| `cancelled` (close アニメ完了後) | cleanup 競合ガード | close 中に unmount すると import 直後の cancelled チェックで先に return するため、ここの true 側には到達しない |
| `prev && typeof prev.focus === 'function'` の偽側 | フォーカス復元ガード | activeElement は常に body (focus メソッドあり) |
| `e.target === e.currentTarget` の偽側 | 背景クリック判定 | sheet 側の stopPropagation が先に効くため backdrop まで到達しない |
| `typeof document !== 'undefined' ? ... : null` | SSR ガード | jsdom では document 常に存在 |

fn は 32/32 = 100% であり、実装ロジック自体は完全に実行されている。

## 5. 備考 (テスト基盤として確立したレシピ)

- **ScreenshotGalleryModal**: `vi.stubGlobal('Image', MockImage)` で window.Image を差し替え、
  static instances に onload/onerror を保持し、テスト側で act 内に発火する。
  (jsdom は画像ロードを一切行わないため、高さプローブを決定的に制御する手段)
- **NewProfileModal**: `vi.hoisted` + `vi.mock` で capabilities / env-import /
  useLoaderVersionOptions を注入。folder 解析系は msw + fake ファイルシステムで実物検証
  (FolderImport.test.tsx は無改変)。
- **BottomSheet**: navigationMock (next/navigation) + animejs `animateMock` +
  50ms setTimeout flush (`act` 内) で rAF/アニメ完了を安定化。
- **ModCard**: `containerImg(container, i)` ヘルパーで next/image の onError を発火。

## 6. 残事項

- **COV-4 (E2E)**: 計画 §10.4 の 5 spec (profileMods / modDetailGallery / versionFilter /
  discoverSkeleton / folderImportCopy) を追加済み (commit `??`)。CI (workflow_dispatch)
  で green を確認したら task-list を更新する。
- **COV-5**: thresholds 90% 化。
