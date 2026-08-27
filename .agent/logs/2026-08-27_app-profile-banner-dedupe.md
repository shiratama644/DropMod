# 2026-08-27 — APP_PROFILE バナー重複出力の修正

## タスク

ユーザー報告: `pnpm build` (PRoot/Termux, webpack) 実行時に
`[DropMod] APP_PROFILE=...` バナーが **4 回**出力される。

## 原因 (実測・特定済み)

PID プローブで特定: 4 回の内訳は **main プロセス 1 回 + jest-worker 子プロセス
(processChild.js) 3 回**。`next build` は型チェック / static generation 等の
ために worker を fork し、各 worker が next.config.mjs を再評価するため、
module scope の console.info がプロセス数分出力されていた。
(Sandbox turbopack でも 2 回出ることを確認。webpack 4 回 / turbopack 2 回)

## 修正 (next.config.mjs)

`process.env` ガードでプロセスツリー全体で 1 回だけ表示:

```js
const BANNER_GUARD_KEY = '__DROPMOD_APP_PROFILE_BANNER_SHOWN';
if (!process.env.VITEST && process.env[BANNER_GUARD_KEY] !== appProfile) {
  process.env[BANNER_GUARD_KEY] = appProfile;  // 値 = profile
  console.info(banner);
}
```

- 同一プロセスの再評価 → process.env 共有で抑止
- 子プロセス → fork 時の env 継承で抑止 (親は必ず先に config を読む)
- ガード値 = profile なので profile 変更時は再表示 (next dev の .env 変更にも追従)
- 不正 APP_PROFILE 値の警告 (`__DROPMOD_APP_PROFILE_INVALID_WARNED`) も同様に重複抑止

## 追加改善: 本番ビルド dev プロファイル警告

ユーザーのビルドログから `.env.local` の `APP_PROFILE=development` が
**本番ビルドにも適用され、CSP Report-Only のビルドが作られていた**ことが判明。
Next.js の .env 仕様 (.env.local は build にもロード) による footgun のため:

1. `NODE_ENV=production` (build) で development プロファイルが解決された場合、
   バナーに `⚠ この production build が development 設定で作られます...` を追加
2. `.env.example` に **開発専用なら `.env.development` へ** のガイドを追記
   (.env.development は next dev 時のみロード → build に影響しない)

## 検証

- webpack build: バナー 4 回 → **1 回** (通常 / APP_PROFILE=development /
  .env.local 由来のユーザー相当シナリオ、すべて 1 回)
- turbopack build: 2 回 → 1 回
- next dev: 起動時 1 回のみ (ページコンパイル後も増えない)
- typecheck 0 error / biome 0 warning / test:unit **602 passed** (バナー回帰
  テスト 6 件追加) / build exit 0
- .archive/vite/ 無変更

## 教訓

- **next.config の module scope の console 出力は build 中に複数回評価される**
  (main + jest-worker)。1 回だけ出したい場合は process.env ガードが有効
  (子プロセスへの env 継承を利用)。→ skills/app-profile.md に反映済み
