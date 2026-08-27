# 2026-08-27 — .env.local の APP_PROFILE=development が本番ビルドを緩和する重大 footgun 修正

## タスク

ユーザー指摘: 「普通 .env.local に環境変数を書くため、APP_PROFILE=development を
.env.local に書くと本番ビルドまで緩和されるバグは重大。修正して」。

## 修正内容

**APP_PROFILE=development は next dev (NODE_ENV=development) でのみ有効** とし、
NODE_ENV=production (next build / next start) では無視して常に production とする
(fail-secure + 警告 1 回)。lib/server/profile.ts と next.config.mjs の両方に
同一ガードを実装 (生の next build を含む全ビルド経路で保護)。

- 旧挙動: .env.local の development → 本番ビルドが CSP Report-Only /
  HSTS なし / レート制限なしで作成される (+ ⚠ バナー)
- 新挙動: build / start は常に production。development バナーは next dev 専用。
  旧 ⚠ 追加警告は廃止し、「無視した」旨の警告に置換。

## 実測検証 (ユーザーの正確なシナリオ)

`.env.local` に `APP_PROFILE=development` を置いて:

| コンテキスト | 結果 |
| --- | --- |
| `pnpm build` (webpack) | バナー production / 焼き付き CSP **Enforce** + HSTS + upgrade-insecure-requests / 警告 1 回 |
| `next start` + 130 req | health=production / **120 通過 + 10×429** (レート制限有効) |
| `next dev` | バナー development / **Report-Only** / 130 req 全通過 (緩和有効) |

→ .env.local に書いたまま運用しても本番は保護され、dev の緩和は維持。

## テスト

- profile.test.ts: NODE_ENV=production で development を無視 (+警告 1 回) /
  NODE_ENV=development では尊重 / production 指定は常に尊重 を追加
- next-config.security.test.ts: 「本番ビルドを development で作る ⚠」テストを
  「無視して production バナー + 警告 + Enforce ヘッダー」に書き換え
  (+ DEV_IGNORED ガードキーの cleanup)
- 計 629 tests / 72 files 全合格

## ドキュメント更新

- .env.example: footgun 警告を「.env.local に安心して書ける」説明に変更
- README.md: 同上 + APP_PROFILE 表の行とビルド時確定の注意を簡素化
- skills/app-profile.md: 解決優先度と .env 扱いを新仕様に更新

## 備考

- 作業中に Sandbox 再構築 1 回。next.config.mjs の未コミット編集のみ消失 →
  編集済み 3 ファイルを退避 → §4.1.1 復旧 → 再適用で復元 (全 diff 再確認済み)。
- `APP_PROFILE=development pnpm build` (実環境変数) も無視される仕様になった
  (本番ビルドを緩和する正当なユースケースは存在しないと判断)。

## 検証 (4 種)

typecheck 0 error / biome 0 warning / test:unit 629 passed / build exit 0。
