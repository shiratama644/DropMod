# 2026-08-27 — README.md 全面更新 (ビルド方法 / 環境変数 / 未記載事項)

## タスク

ユーザー要望: 「README.md に環境ごとのビルド方法や環境変数設定方法を追加」+
「README.md に書いていないことも書いて」。

## 追加セクション

1. **環境ごとのビルド方法** — 4 環境 (PC / PRoot-Distro / Termux / Vercel) の
   バンドラ自動判定表 + 手動上書き (--webpack / --turbo / DROP_MOD_BUNDLER) +
   キャッシュ永続化 (.cache/dropmod-build, DROP_MOD_CACHE_ROOT, PNPM_STORE_DIR)
   + PRoot ビルド 1 分は正常の注記
2. **環境変数 (全面改稿)** — .env ファイル使い分け表 (.env.local が build にも
   適用される APP_PROFILE footgun 警告付き) + アプリ動作系 6 変数
   (APP_PROFILE / NEXT_PUBLIC_SITE_URL / MODRINTH_* 4 種、既定値付き) +
   ビルド系 3 変数 + Vercel 自動注入変数
3. **セキュリティ** — CSP / HSTS / レート制限 / SameSite=Strict / iframe
   sandbox / Read-only 取り込み
4. **対応ブラウザ** — File System Access API の対応表 (Chrome/Edge のみ
   フォルダ直接、他は ZIP)
5. **テストと品質保証** — 4 検証コマンド + 実測値 (72 files / 626 tests /
   stmts 84.5%) + E2E (10 spec) + CI docs 参照

## 更新 (古い記述の修正)

- ディレクトリ構成: 旧ルーティング (app/mods, app/mod/[slug], @modal) →
  現行 ([projectType]/[slug], discover/[type]/@modal, lib/env, lib/server,
  lib/loaders, scripts/, e2e/, __tests__)
- テスト規模: 29 files / 275 tests / 91.34% (Phase 9-C 時点) →
  72 files / 626 tests / 84.5% (2026-08-27 実測、coverage を実行して取得)
- 技術構成: Vitest 3 → 4、Zustand slice 7 → 8 (uiState 追加済み)
- Vercel セクション: next.config.ts → next.config.mjs
- 主な機能に検索表示形式 4 種・ローダーバージョン自動取得・トースト ON/OFF 追記

## 備考

- このセッション中に Sandbox 再構築が 1 回発生 (pnpm not found)。
  §4.1.1 手順 (fetch → reset --hard <SHA> → restore-sandbox-env.sh) で復旧。
- README の数値は実測 (coverage 実行) に基づく。次回大幅追加時に更新すること。

## 検証

- typecheck 0 error / biome 0 warning / test:unit 626 passed / build exit 0
  (README のみの変更だが §3.1 の 4 検証を全実施)
