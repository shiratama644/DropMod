# Modrinth 429 ビルドフラッド対策 (事前生成削減 + backoff + サーキットブレーカー)

> Date: 2026-08-26 (JST) / Branch: `arena/01a04363-dropmod`

## 1. 指示内容 (Task Summary)

ユーザー環境 (PRoot/Ubuntu, webpack ビルド) の `pnpm build` で Modrinth `HTTP 429 Too Many Requests` が大量発生した問題への対応として、ユーザーが選択した方針「**事前生成を絞る + リトライ改善 + サーキットブレーカー**」を実装する。

## 2. 実行内容 (Executed Actions)

| 変更 | 内容 |
| :--- | :--- |
| `lib/server/project-detail.ts` | `PREBUILD_LIMIT` 100 → **15/型**（400 ページ → 60 ページ、≒1,200 req → ≒180 req/build）。残りは dynamicParams=true で初回アクセス時 ISR 生成 |
| `lib/modrinth/server.ts` | ①429 リトライ: 1 回 → **2 回の backoff 再試行**（ヘッダなし時 2s→4s）+ **最小 1s クランプ**（`Retry-After: 0` の即再試行を防止。`MODRINTH_429_MIN_WAIT_MS` で上書き可）②**サーキットブレーカー**: 429 最終失敗が連続 3 リクエストで 60s 間 fetch せず即 throw（fail-fast）。成功で連続カウント リセット。テスト用 `_resetRateLimitStateForTesting()` 追加 |
| `__tests__/lib/modrinth/server.test.ts` | 429 describe を拡張 (+5 tests): backoff 3 試行 / Retry-After なしの clamp / breaker open で fetch なし fail-fast / 成功で strikes リセット |

検証: typecheck 0 error / biome 0 warning / **test:unit 463 passed / 55 files** / build exit 0 / **coverage exit 0 (全 threshold green 維持、総計 stmt 82.04)**。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **429 フラッドの定量的原因**: `generateStaticParams` が 4 型 × 100 件 = 400 ページ事前生成し、各ページ project/versions/members の 3 fetch（metadata の project は Next fetch cache で dedup）→ **≒1,200 req を build 中にバースト**。Modrinth の 300 req/min を確実に超過。
- **`Retry-After: 0` の罠**: Modrinth は 429 時に `Retry-After: 0` を返すことがあり、旧実装は「Waiting 0ms」で即再試行 → 再 429 → throw。レート穴を深めるだけだった。最小クランプ (1s) が必須。
- **`vi.unstubAllEnvironments` は存在しない**（`vi.unstubAllEnvs()` が正）。unstable API 名の記憶に注意。
- **テスト用の待ち時間短縮は env を call 時に読む設計**にすると module load 時でなく `vi.stubEnv` が効く（`rateLimitMinWaitMs()`）。backoff 基準も同関数起点にすれば既定挙動 (2s→4s) を変えずにテストだけ速くできる。
- **webpack `next.config.compiled.js` キャッシュ警告は良性**: Persistent cache の書き込み失敗警告のみでビルドの正しさに影響なし（既知事象）。`rm -rf .next` で一時解消。ユーザー環境 (PRoot) は `scripts/build.ts` が意図的に webpack を選択するため出る。
- **ELIFECYCLE の正体**: ユーザーログに `^C` があるためビルド中断 (SIGINT) によるものと推定。429 自体は各所で catch されるので build はフォールバックで完走する設計。

## 4. 次にすべきこと (Next Actions)

1. ユーザー環境で `pnpm build` を再実行し、429 が収まるか確認（≈180 req/build + breaker で完走するはず）。
2. Phase 11-A（ProjectItem データモデル基盤 + Dexie v2 migration）着手。
3. (任意) 10.5-D / 10.5-E。
