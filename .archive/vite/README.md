# Vite 版 DropMod (アーカイブ)

このディレクトリには、Next.js 移行前の **Vite + React + Hono** 版 DropMod の完全なソースが保存されています。**ビルド対象外** (ルートの `pnpm install` / `pnpm build` は Next.js 版のみを扱います) で、履歴・仕様比較・緊急ロールバック用の参考実装です。

## 収録物

| パス | 内容 |
| --- | --- |
| `src/` | React コンポーネント / hooks / utils / types (Vite build 対象) |
| `server/index.ts` | Modrinth プロキシ Hono サーバ (Vite dev の中で動く) |
| `index.html` | Vite エントリーポイント |
| `vite.config.ts` | Vite + Tailwind 4 + Hono dev-server 設定 |
| `tsconfig.json` | React 18 / ES2022 / strict の TS 設定 |
| `package.json` | Vite 版の依存とスクリプト (React 18 / Vite 6 / Hono 4 / etc) |
| `pnpm-lock.yaml` | Vite 版依存の lockfile |
| `pnpm-workspace.yaml` | pnpm allowBuilds (esbuild) 設定 |

## ロールバック手順 (緊急時)

もし Next.js 版で致命的な不具合があり Vite 版に戻したい場合:

```bash
# 1. ルートの Next.js 版設定を一時退避
mkdir -p /tmp/dropmod-next-backup
mv app components hooks lib public types.ts next.config.ts postcss.config.mjs \
   tsconfig.json package.json pnpm-lock.yaml README.md /tmp/dropmod-next-backup/

# 2. Vite 版をルートへ復元
cp -r .archive/vite/. .
# 一部トップレベルファイルは cp では見えるが glob で除外されている可能性があるので明示コピー:
cp .archive/vite/index.html .
cp .archive/vite/vite.config.ts .
cp .archive/vite/tsconfig.json .
cp .archive/vite/package.json .
cp .archive/vite/pnpm-lock.yaml .
cp .archive/vite/pnpm-workspace.yaml .

# 3. Vite 版依存インストール + 起動
pnpm install --frozen-lockfile
pnpm dev
```

## Vite 版と Next.js 版の主な差分

| 項目 | Vite 版 (このアーカイブ) | Next.js 版 (ルート) |
| --- | --- | --- |
| ルーティング | React state `activeTab` | App Router (`/`, `/mods`, `/settings`, `/mod/[slug]`) |
| Mod 詳細 | React モーダル | Parallel + Intercepting Routes モーダル + `/mod/[slug]` フルページ (SSR/OGP) |
| Modrinth プロキシ | Hono (`/api/modrinth/*` → dev サーバ内で動作) | Next.js Route Handler (`app/api/modrinth/[...path]/route.ts`) |
| Home の初期 24 件 | CSR (`useModSearch` fetch) | ISR (Server Component + `fetch({ next: { revalidate: 300 } })`) |
| React | 18.3 | 19.2 |
| build ツール | Vite 6 | Next.js 16 (Turbopack) |
| デプロイ | 任意 (Vite preview / Docker) | Vercel 前提 |

`docs/NEXTJS_MIGRATION_PLAN.md` の Phase 0〜7 に、この移行の判断と作業ログが記録されています。
