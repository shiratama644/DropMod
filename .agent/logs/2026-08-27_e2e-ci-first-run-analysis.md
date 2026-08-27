# 2026-08-27 — E2E 初回 CI 実行の失敗分析と修正 (51 失敗試行 → 全原因特定)

## 経緯

- CI の E2E が初めて実行され 5m52s で失敗 (run 33061639578)。
- ユーザーが playwright-report を commit (2MB 以下のみ) → 51 トレースを解析。
- **結論: アプリはほぼ正常動作。E2E spec 側の陳腐化・バグが全失敗の原因。**
  (E2E は Sandbox で実行不可のため、spec は書かれてから一度も走っていなかった)

## 失敗パターンと原因 (トレース実解析に基づく)

| # | パターン (試行数) | 根本原因 | 修正 |
|---|---|---|---|
| 1 | mobile: `#desktop-sidebar, #app-header` 系 waitFor タイムアウト (21) | `.first()` が DOM 先頭の desktop-sidebar (`hidden md:flex`) を掴み、モバイルでは永久に非表示 | `:visible` 擬似クラスで実際に見えている側を掴む (全 spec) |
| 2 | dialog `/新規プロファイル/` が開かない (zip-import 6) | **.mrpack は「モーダル確認」→「ダイレクト追加+Toast」に仕様変更済み** (useZipImport)。spec が旧仕様 | Toast (role=status) の出現を検証 |
| 3 | dialog `/新規プロファイル/` が開かない (zip-env-import 9) | モーダルは実際に開いて解析まで完了していたが、**実タイトルは「ZIPからプロファイル作成」**で filter が不一致 | filter を `/新規プロファイル\|ZIPからプロファイル作成/` に拡張 |
| 4 | theme: click 後も html.dark (3) | click が hydration 完了前に no-op 化 (SSR HTML は visible 判定になるため waitFor(visible) では不十分。スナップショットでボタン文言が不変なことを確認) | AppShell が hydration 完了時に `html[data-hydrated]` を付与 → spec で待機 + リトライ付き click |
| 5 | zip-export: `[role=alert/status/dialog]` が見つからない (3) | 空プロファイルで warning Toast は出るが **Toast に role 属性が無かった** | ToastContainer に `role=status/alert` + `aria-live` を付与 (a11y 改善も兼ねる) |
| 6 | smoke: h1 が "DropMod" でない (6) | Phase 9.5 の LP 刷新で / の h1 は HeroRotator の回転タイトルに変更済み | `/Minecraft を彩る/` を検証 |
| 7 | mod-detail: h1.first() が hidden (3) | first h1 = Header ロゴ (PC で md:hidden)。モバイル版詳細の h1 は 2 番目 | タイトルの h1 を `getByRole('heading', {name})` で直接指定 |

## 解析手法 (再利用可能)

- トレース zip: `test.trace` (エラー) + `0-trace.trace` (アクション/console) +
  `0-trace.network` (API) を展開して JSON パース
- `.md` エラーコンテキスト = 失敗時点の ARIA スナップショット →
  「モーダルが実際に開いていた」ことの決定的証拠になった
- Actions のログ blob は Sandbox から到達不可 → annotations API と
  ユーザー経由の report commit で代替

## 実装

- app: ToastContainer (role/aria-live) + AppShell (data-hydrated marker)
- e2e/helpers/appReady.ts (waitForAppHydrated / navVisible / waitForAppReady)
- spec 修正: smoke / theme-persistence / mods-page / offline / mod-detail-modal /
  zip-import (Toast 検証へ書き換え) / zip-env-import (filter 拡張) / zip-export (hydration 待ち)
- 一時コミットされていた playwright-report (137MB) を git rm で削除

## 検証

typecheck 0 error / biome 0 warning / test:unit 629 passed / build exit 0。
E2E は push をトリガーに CI で再実行 → 結果を gh CLI で監視する。
