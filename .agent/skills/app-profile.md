# APP_PROFILE — セキュリティ/ログのプロファイル切替 (2026-08-27)

`APP_PROFILE=production | development` (.env / 環境変数) でアプリ全体の
セキュリティレベルとログ出力を切り替える仕組み。

## 解決優先度 (lib/platform/profile.ts と next.config.mjs の 2 箇所で同一ロジック)

1. `APP_PROFILE` — 明示指定 (最優先)。**development は NODE_ENV !== production
   のときのみ有効** (2026-08-27 修正: NODE_ENV=production では無視して production)
2. `VERCEL_ENV` — production|preview → production / development → development
3. `NODE_ENV` — development → development / それ以外 (test 含む) → production

- 不正な値は **fail-secure** で production 扱い (+ 警告 1 回)。
- **development が有効なのは next dev のみ**。next build / next start では
  APP_PROFILE=development は無視され常に production (+ 警告 1 回)。
  理由: .env.local は build にも適用されるため、開発緩和を .env.local に
  書くと本番ビルドが緩和される重大な footgun があった。ランタイム側も
  同一ルールで、ビルド成果物とのプロファイル混在を根絶。
- 通常は未設定で運用してよい (next dev → development、build/start → production、
  Vercel → VERCEL_ENV で自動判定)。
- 主なユースケース: 開発緩和 (`APP_PROFILE=development` を .env.local へ —
  build に漏れないので安全)、本番相当の Enforce CSP を dev で試す
  (`APP_PROFILE=production`)。

## 何が切り替わるか

| 項目 | production | development | 実装場所 |
| :--- | :--- | :--- | :--- |
| CSP | Enforce | Report-Only | next.config.mjs (build 時) |
| HSTS | 2 年 + preload | なし | next.config.mjs (build 時) |
| upgrade-insecure-requests | あり | なし | next.config.mjs (build 時) |
| connect-src ws://localhost (HMR) | なし | あり | next.config.mjs (build 時) |
| API レート制限 (/api/*) | 120/60 req/min | 無効 | src/lib/platform/rateLimit.ts (runtime) |
| サーバログ debug/info | 抑制 | 出力 | lib/platform/logger.ts (runtime) |
| /api/health の profile | "production" | "development" | app/api/health (runtime) |

## 重要事実 (2026-08-27 実証済み)

1. **Next.js 16 は .env を next.config 評価前にロードする**
   (`next/dist/server/config.js`: `loadEnvConfig` → config import の順)。
   → next.config.mjs で `process.env.APP_PROFILE` を .env 系から読める。
   実環境変数が常に優先。.ts/.mjs 問わず (webpack キャッシュ問題さえなければ)。
2. **headers() は build 時に routes-manifest.json へ確定**。
   APP_PROFILE を変えたら `pnpm build` し直すこと (next dev は .env 変更で
   自動再起動)。ランタイム側 (logger/rateLimit/health) は起動時に解決するため、
   ビルドとランタイムでプロファイルが混在し得る (デバッグ時に混乱しやすいので注意)。
3. **next.config の module scope の console 出力は build 中に複数回評価される**
   (main プロセス 1 + jest-worker processChild × 3 = webpack で最大 4 回)。
   1 回だけ出したい場合は `process.env` ガードを使う
   (同一プロセスの再評価は env 共有で、子プロセスは fork 時の env 継承で抑止。
   ガード値を profile にすると変更時のみ再表示)。実装例は next.config.mjs の
   `BANNER_GUARD_KEY` 参照。
4. サーバーロガーは `src/lib/platform/logger.ts` を使う:
   `logger.debug/info` は development のみ、`logger.warn/error` は常時出力。
   既存の `console.warn('[DropMod] msg', ...)` と同じ出力形式 (prefix 連結) なので
   spy テスト互換。クライアントコードでは使わない (誤 import 時は静かに fail-quiet)。

## .env ファイルの扱い (2026-08-27 修正後は安全)

- `.env.local` は next dev と next build 両方に適用されるが、
  APP_PROFILE=development は NODE_ENV=production で無視されるため
  **.env.local に書いても本番ビルド・本番ランタイムは緩和されない**。
  開発緩和用に .env.local へ itsまま書ける (修正前は .env.development へ
  書く必要があった)。

## テスト

- `__tests__/lib/platform/profile.test.ts` — 解決ロジック純粋関数テスト
- `__tests__/lib/platform/logger.test.ts` — `// @vitest-environment node` 必須
  (jsdom だと window が有り server 判定にならないため)
- `__tests__/lib/platform/rateLimit.test.ts` — production/development 両挙動
- `__tests__/nextConfigSecurity.test.ts` — vi.resetModules + 動的 import で
  next.config.mjs を両プロファイルで読み分ける回帰テスト
