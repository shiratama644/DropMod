# DropMod 本番デプロイ手順 (Vercel)

Phase 7 の Vercel 本番検証で実施する作業を、コピー可能なチェックリスト形式でまとめています。

---

## 1. 事前準備

- [ ] GitHub リポジトリ `shiratama644/DropMod` が最新 (`main` に Phase 6 まで完了) であること
- [ ] Vercel アカウントを作成 (無料 Hobby プランで OK)
- [ ] Vercel と GitHub アカウントを連携済み

## 2. Vercel プロジェクト作成

1. [Vercel Dashboard](https://vercel.com/new) → **Import Git Repository**
2. `shiratama644/DropMod` を選択
3. 以下の設定でインポート:
   - **Framework Preset**: `Next.js` (自動検出されます)
   - **Root Directory**: `./` (デフォルト)
   - **Build Command**: `pnpm build` (デフォルト。`pnpm-lock.yaml` があるため pnpm が自動選択される)
   - **Install Command**: `pnpm install --frozen-lockfile`
   - **Output Directory**: (空欄でよい。Next.js が自動で `.next` を使う)
4. **Environment Variables** を追加 (下記セクション参照)
5. **Deploy** をクリック

## 3. Environment Variables

Vercel Dashboard → Project Settings → Environment Variables で以下を設定します。

| Key | Value 例 | Scope |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://dropmod.vercel.app` (もしくはカスタムドメイン) | Production, Preview, Development |
| `MODRINTH_USER_AGENT` | `DropMod/1.1.0 (https://github.com/shiratama644/DropMod)` | Production, Preview, Development |

- `NEXT_PUBLIC_SITE_URL` が未設定でも Vercel の `VERCEL_URL` が自動注入されるため動作しますが、プレビューごとに URL が変わるため OGP が安定しません。**本番ドメインが確定したら必ず設定**してください。
- `MODRINTH_USER_AGENT` を設定しない場合はコード内デフォルト値が使われます。フォークして運用する場合は自分の連絡先/URL を含めた UA に置き換え推奨。

## 4. リージョン

`vercel.json` で `regions: ["hnd1"]` (東京) 固定。日本国内ユーザ向けにレイテンシ最小化。

Serverless Function は Hobby プランでも東京リージョンで実行可能。Edge Function は全リージョン共通。

## 5. デプロイ後の検証チェックリスト

### 5.1 疎通確認

- [ ] `https://<your-domain>/api/health` → `{ ok: true }` が返る
- [ ] `https://<your-domain>/` → Home が表示される (初期 24 件が並ぶ)
- [ ] `https://<your-domain>/mods` → 「Modが選択されていません」の Empty state
- [ ] `https://<your-domain>/settings` → プロファイル 1 件 + 設定 UI

### 5.2 SSR / SEO 確認

- [ ] Home ページで DevTools → Network → `/` の Response HTML を確認し、初期 24 件の Mod タイトル (例: `<h3>` タグ) が **HTML 内に含まれている** (JavaScript 実行前に見える)
- [ ] `https://<your-domain>/mod/sodium` (存在する slug) を新しいタブで開く → **フルページ描画**
- [ ] view-source でその HTML を確認し、`<title>Sodium | DropMod</title>` と Mod 説明が含まれている
- [ ] `https://<your-domain>/sitemap.xml` に静的ルート 3 件 + Mod 100 件が含まれている
- [ ] `https://<your-domain>/robots.txt` に `Sitemap: https://<your-domain>/sitemap.xml` が含まれている

### 5.3 OGP 確認

以下いずれかで `og:title` / `og:image` が正しく生成されているか確認:

- [ ] [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) に `/mod/sodium` を入力
- [ ] [Twitter Card Validator](https://cards-dev.twitter.com/validator) に同 URL を入力 (要ログイン)
- [ ] Discord に URL を貼り付けてプレビューを確認

期待される項目:
- `og:title`: `Sodium - DropMod`
- `og:description`: Modrinth の description
- `og:image`: `cdn.modrinth.com/data/AANobbMI/icon.png` 等
- `og:type`: `article`
- `og:url`: フル URL (`https://<your-domain>/mod/sodium`)

### 5.4 モーダル動作確認

- [ ] Home の Mod カードをクリック → **URL が `/mod/[slug]` に変わりつつ Home 上にモーダルが重なる** (soft nav)
- [ ] モーダルの ✕ ボタン / 背景クリック → URL が `/` に戻り、Home のスクロール位置が保持される
- [ ] モーダルの「プロファイルに追加」→ Toast 表示 + モーダル自動閉 + Home の該当カードが「追加済み」表示に
- [ ] `/mod/sodium` をブラウザで直接開く (別タブ) → **フルページで描画** (背景に Home は無い)
- [ ] `/mods` → Mod カードクリック → やはりモーダル (別 tab から `/mods` 起点の場合は Home 経由でなくても intercept される)

### 5.5 Route Handlers 動作確認

- [ ] DevTools → Network で `/api/modrinth/search?query=iris` を叩き 200 が返る (Modrinth へプロキシ)
- [ ] `/api/modrinth/../../etc/passwd` 等の path traversal → 400 or Next.js 側で拒否

### 5.6 モバイル確認

- [ ] Chrome DevTools → iPhone SE / Pixel 8 でレイアウト崩れ無し
- [ ] BottomNav が safe-area-inset-bottom 込みで最下部に張り付く
- [ ] Header の ZIP 保存/読込ボタンが sm 未満で正しくアイコンのみ表示

### 5.7 Lighthouse (Chrome DevTools → Lighthouse)

以下のスコア目標を Production URL の Home で計測:

- [ ] Performance ≥ 90
- [ ] Accessibility ≥ 90
- [ ] Best Practices ≥ 90
- [ ] SEO = 100

Home では初期 24 件が **cookie ベースの Dynamic SSR** (ユーザーの実プロファイル反映) で流し込まれるため LCP が短くなり、Performance が高得点になるはず。Modrinth API の応答自体は fetch cache で 5 分間 revalidate されます。もし 90 未満なら:
- FontAwesome の CSS ファイルサイズ (~200KB) を確認 → Phase 8 で `next/font/local` + サブセット化を検討
- `optimizePackageImports` の対象を追加
- Modrinth の icon 画像を Next.js `<Image>` に置き換える (現状は `<img>` のまま)

### 5.8 LocalStorage 移行確認

- [ ] 旧 Vite 版で `localStorage.craftforge_state_v2` を持っている環境から本番 URL を開く → 自動的に `dropmod_state_v2` に移行され、プロファイルが復元される
- [ ] `Settings → データ初期化` → 両キーが消去され、デフォルトプロファイルが再生成される

## 6. カスタムドメイン設定 (任意)

1. Vercel Dashboard → Project → Settings → Domains → **Add**
2. `dropmod.example.com` などを追加
3. DNS の CNAME を Vercel が提示する値に設定
4. `NEXT_PUBLIC_SITE_URL` を新しいドメインに更新 → 再デプロイ (or Environment Variables 変更後の Redeploy)

## 7. トラブルシューティング

### 7.1 pnpm install が失敗する

Vercel の Node/pnpm バージョンが古い可能性があります。Project Settings → General → **Node.js Version** を `20.x` に固定してください。

### 7.2 Modrinth API から 429 が返る

- `MODRINTH_USER_AGENT` を設定しているか確認
- `src/lib/modrinth/server.ts` のキャッシュ TTL (`REVALIDATE.SEARCH` = 300s 等) が効いているか (Vercel Data Cache のヒット率を Vercel Dashboard → Analytics で確認)
- 短時間に大量アクセスされる場合は `revalidate` 値を長めに調整

### 7.3 og:image が反映されない

- `NEXT_PUBLIC_SITE_URL` が正しく本番ドメインに設定されているか確認
- `curl -A "facebookexternalhit/1.1" https://<domain>/mod/sodium | grep 'og:'` で HTML 内の meta タグを直接確認
- Facebook Debugger の「Scrape Again」でキャッシュを更新

### 7.4 モーダルが直接 URL 時に消えない

`src/app/discover/[type]/@modal/(.)[slug]/page.tsx`（Intercepting Modal）と `src/app/discover/[type]/@modal/default.tsx`（直接 URL 時）の両方が存在するか確認。片方でも欠けるとモーダルが残ります。

## 8. ロールバック

問題が起きた場合の緊急ロールバック:

- **軽度**: Vercel Dashboard → Deployments → 前のデプロイの `...` メニュー → **Promote to Production**
- **重度** (Next.js 版全般が動かない): `.archive/vite/README.md` の手順で Vite 版に戻す (ローカルで作業 → git force push)

---

Phase 7 完了時は、この文書の全チェックリストに ✅ が付き、本 PR がマージされた状態を DoD とします。
