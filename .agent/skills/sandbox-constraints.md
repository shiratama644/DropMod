# Sandbox / Environment Constraints

> 「動かない / 重い / フォーマット効かない / CI 回らない」時に読む。AGENT.md §6.2/§6.3 の実体版。

## 恒常的制約（修正対象ではない、迂回する）

| 制約 | 現象 | 迂回策 |
| :--- | :--- | :--- |
| `api.modrinth.com:443` 到達不可 | `pnpm build` で `TypeError: fetch failed` / `ECONNRESET`。Modrinth 依存機能（marquee/SSR search/詳細）が空表示 | **exit code 0 なら成功扱い**。ローカルでは空フォールバック UI、ユーザー環境（本番）で正常表示。検証は `pnpm build` の Route Table と exit 0 で判定 |
| Chromium バイナリ install 不可 | E2E（`pnpm test:e2e`）が実行できない | E2E は**書けるが実行不可**。CI（GitHub Actions）上のみ。ローカルで `playwright install` を試みない |
| `sharp` native build 不可 | `next/image` の画像最適化プロキシ（`/_next/image`）が**非常に重い**（再エンコードが squoosh/slow fallback） | `pnpm-workspace.yaml` で `sharp: false`。→ Modrinth 画像は `unoptimized` で直接 CDN 取得（[image-strategy.md](./image-strategy.md)）。Vercel 本番では sharp 自動注入で最適化復活 |
| PRoot (GPU 無し) で `backdrop-filter` が白フラッシュ | ボタン押下・ページ遷移のたびに blur レイヤー再合成で白く光る | **`backdrop-filter` / `backdrop-blur-*` は全コンポーネントで全廃済み** (2026-08-27。glass-panel / dropdown / モーダルオーバーレイ 9 ファイル / OfflineBanner) |
| GitHub App が `.github/workflows/` に書き込み不可 | CI ワークフローを直接 commit できない | 本体は `docs/ops/CI_WORKFLOW.yml`、ユーザーが手動で `.github/workflows/ci.yml` へ配置（`docs/ops/CI_SETUP.md`） |
| Vercel Hobby プラン制約 | Function Invocations 100k/月・Bandwidth 100GB/月・Build 100/day 等。開発中の SSR/ISR で即枯渇リスク | **本番デプロイは Phase 10+11+12+13 全完了後の最終ステップ**（`docs/planning/PHASE10_CANDIDATES.md` 【重要方針】）。開発中は local + CI のみ |

## 検証コマンド（commit 前, AGENT.md §3.1）

```bash
pnpm typecheck                # tsc --noEmit (main + tsconfig.test.json 両方)
pnpm exec biome lint .        # Biome 直接（pnpm lint より速い）
pnpm test:unit                # vitest run（※ pnpm test は watch, 使わない）
pnpm build                    # next build (turbopack)。ECONNRESET でも exit 0 なら OK
```

- ECONNRESET 等の Modrinth 通信エラーは**無視してよい**（exit 0 が全て）。
- bundle サイズは turbopack が出さないので `find .next/static -name "*.css" -exec ls -lh {} \;` 等で直接確認。

## 環境構築（Sandbox 再構築後）

```bash
bash .agent/hooks/restore-sandbox-env.sh
```
（スクリプトが node を `.nvmrc` の LTS に置換し、corepack + pnpm + 依存を再構築する。Sandbox 再構築時の復旧は `src/hooks/sandbox-rebuild-recovery.md` + AGENT.md §4.1.1 参照）

> ⚠️ **nodejs.org は Sandbox から到達不可**（SSL 接続エラー、§6.2 と同種）。Node バイナリは npm registry の `node-linux-x64` パッケージから取得する（`registry.npmjs.org` は到達可能）。

## 作業ブランチ（§4.4）

- セッション固定ブランチ（今 = `arena/01a04363-dropmod`）。他ブランチに push しない。
- ※ ブランチ名は**セッションごとに変わる**。AGENT.md §4.4 の記載値を鵜呑みにせず、
  必ず `git branch --show-current` で確認すること（過去セッションのブランチ名は
  文書に残さない方針。AGENT.md §4.4 参照）。
- **push は事前許可済み**（AGENT.md §4.3.1）。§3.1 の検証が通ったら確認なしで
  `git push origin <セッション固定ブランチ>` を実行する。

## その他環境メモ

- **webpack (--webpack) の persistent cache を効かせる条件 (2026-08-27 検証済み)**:
  1. next.config は **`.mjs` であること**。`.ts` は `next.config.compiled.js` にコンパイルされて読み込み後に削除され、webpack cache が「Caching failed for pack: Can't resolve next.config.compiled.js」で毎回無効化される。
  2. **`webpack()` 内で `config.cache` を独自 override しないこと**。Next 標準の cache 設定は pnpm レイアウト対応済み。override すると `mini-css-extract-plugin` の pack 解決に失敗する。
  3. キャッシュは `.next/cache/webpack` に書かれ、`scripts/build.ts` の symlink で永続化される。コールド 14.7s → ウォーム 4.8s を実測。
- **cookie の Secure フラグは https のみ付与** (2026-08-27): `Secure` 付き cookie は
  http (localhost 以外、LAN IP 等) で**黙って拒否**される。theme / active_profile cookie が
  保存されず「ライトに切り替えてもリロードでダークに戻る」バグの原因だった。
  `cookieSecureSuffix()` (useProfiles.ts) と AppShell の削除処理で protocol 条件分岐。
- Sandbox の node は **`restore-sandbox-env.sh` で `.nvmrc` のメジャー版（現行 24/LTS）に自動置換**される（nodejs.org は到達不可のため npm registry の `node-linux-x64` パッケージから取得 → `/usr/local/bin/node` を差し替え）。pnpm は 11.24（corepack が `packageManager` から解決）。TS 5 `strict` + `noUncheckedIndexedAccess`。
- Biome 2.5（ESLint 撤去済）。formatter は**無効**（フォーマット差分は出さない方針）。
- `pnpm-workspace.yaml` `allowBuilds`: `sharp:false / esbuild:true / msw:false`。

## 関連

- [image-strategy.md](./image-strategy.md)（sharp 不可 → unoptimized）/ [testing.md](./testing.md)（E2E CI のみ）
