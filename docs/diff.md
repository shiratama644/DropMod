# `.archive/vite/` と現行 Next.js 版の差分一覧

`.archive/vite/` に保存されている Vite 版 (Phase 0 開始時点の最終状態) と、リポジトリのルートに置かれている Next.js 版 (Phase 7 完了時点) の全ファイル差分を、機械的に洗い出したうえで分類したレポートです。

- 集計基準: `find .archive/vite -type f -not -path '*/node_modules/*'` と `find app components hooks lib types.ts -type f` の全ファイル、およびルート設定ファイル一式
- 比較日: 2026-08-21 (Phase 7 完了直後)
- 対象コミット: `arena/01a01fcf-dropmod` HEAD `260075c`

---

## 1. サマリ

| 種別 | 件数 | 説明 |
| --- | ---: | --- |
| **完全同一** (byte-for-byte identical) | 6 | Vite 側からそのままコピーされ、内容が 1 バイトも変わっていない |
| **軽微な差分のみ** (`'use client'` + import path のみ) | 18 | ロジック変更なし。Next.js の Client Component 化と `@/*` alias 対応 |
| **意味のある拡張** (signature 変更等) | 1 | `ModCard.tsx` — `onToggleMod` の型を async 対応に緩和 |
| **Vite 側にしか無い** (Next 側で消滅 or 統合) | 12 | Vite ランタイム固有ファイル + タブ Component 群 + `useModSearch` + `ErrorBoundary` + `App.tsx` + `main.tsx` |
| **Next 側にしか無い** (新規追加) | 24 | App Router / Route Handlers / Modal Routes / SEO / Vercel 対応 |
| **リネーム + 分割/統合** | 6 | Vite 側 1 ファイル → Next 側 2 ファイル以上、もしくは逆 |

合計で `.archive/vite/` 側 37 ファイル、Next 側 46 ファイル。うち共通対応関係が 25 ペア成立。

---

## 2. 完全同一 (6 件)

これらは Phase 2 でコピーされたまま **一度も編集されていません**。将来 Vite 版で改修があっても、そのまま反映できる状態です。

| Vite 側 | Next 側 | 行数 | 種別 |
| --- | --- | ---: | --- |
| `.archive/vite/src/types.ts` | `types.ts` | 133 | TypeScript 型定義 |
| `.archive/vite/src/index.css` | `app/globals.css` | 276 | Tailwind + theme カスタム CSS |
| `.archive/vite/src/constants/categories.ts` | `lib/constants/categories.ts` | 21 | Mod カテゴリ一覧 |
| `.archive/vite/src/utils/download.ts` | `lib/utils/download.ts` | 155 | Blob DL ヘルパ |
| `.archive/vite/src/utils/hash.ts` | `lib/utils/hash.ts` | 62 | SHA-1 (Web Crypto) |
| `.archive/vite/src/utils/id.ts` | `lib/utils/id.ts` | 15 | 一意 ID 生成 |

> ⚠️ ただし `.archive/vite/src/types.ts` は `import` 元が `../types` として `../` 相対、Next 側 `types.ts` はルート直下にあり `@/types` として参照される点だけ環境的に異なります (内容自体は同一)。

---

## 3. 軽微な差分のみ (18 件)

すべて **以下 2 種類の変更しか入っていません**:

1. ファイル先頭に `'use client';` を付与 (Next.js App Router で Client Component として動作させるため)
2. import path の `'../types'` → `'@/types'` 等の alias 変換
3. (ごく一部) 末尾 newline の有無、`import type` 化などのマイクロ変更

**ロジック・JSX・UX 差分は一切ありません**。

### 3.1 components/ (11 件)

| ファイル | 行数 | 差分 (diff -c: +追加/-削除) |
| --- | ---: | --- |
| `BottomNav.tsx` | 84 | +3 / -1 |
| `ConfirmDialog.tsx` | 94 | +4 / -2 |
| `CustomDropdown.tsx` | 279 | +3 / -1 |
| `DependencyCheckModal.tsx` | 839 | +5 / -3 |
| `EditProfileModal.tsx` | 187 | +4 / -2 |
| `Header.tsx` | 197 | +3 / -1 |
| `MarkdownRenderer.tsx` | 260 | +2 / -0 |
| `NewProfileModal.tsx` | 197 | +4 / -2 |
| `ToastContainer.tsx` | 88 | +3 / -1 |
| `ZipProgressModal.tsx` | 88 | +4 / -2 |

### 3.2 hooks/ (7 件)

| ファイル | 行数 | 差分 |
| --- | ---: | --- |
| `useConfirm.ts` | 65 | +3 / -1 |
| `useDependencyCheck.ts` | 100 | +5 / -3 |
| `useModalA11y.ts` | 152 | +2 / -0 |
| `useProfiles.ts` | 464 | +6 / -4 |
| `useToasts.ts` | 16 | +3 / -1 |
| `useZipExport.ts` | 339 | +3 / -1 |
| `useZipImport.ts` | 188 | +6 / -4 |

### 3.3 パス変換ルール (Phase 2 で sed 一括適用)

| Vite 側 (from) | Next 側 (to) |
| --- | --- |
| `'../types'` | `'@/types'` |
| `'../services/api'` | `'@/lib/modrinth/client'` |
| `'../utils/download'` | `'@/lib/utils/download'` |
| `'../utils/hash'` | `'@/lib/utils/hash'` |
| `'../utils/id'` | `'@/lib/utils/id'` |
| `'../hooks/useModalA11y'` | `'@/hooks/useModalA11y'` |
| `'../hooks/useToasts'` | `'@/hooks/useToasts'` |
| `'../hooks/useConfirm'` | `'@/hooks/useConfirm'` |
| `'../constants/categories'` | `'@/lib/constants/categories'` |
| `'../components/ConfirmDialog'` | `'@/components/ConfirmDialog'` |
| `'./CustomDropdown'` 等 (同ディレクトリ) | (そのまま維持) |

### 3.4 `services/api.ts` → `lib/modrinth/client.ts`

技術的にはこの対応関係も上と同じ「import 変換のみ」で、`import type` 化 + `@/types` パスの 2 行だけ変更されています (実質完全同一)。パス階層が変わったため上表からは別扱いにしていますが、下記 §7 のマッピングも参照してください。

---

## 4. 意味のある拡張 (1 件)

### 4.1 `components/ModCard.tsx`

`onToggleMod` prop の型シグネチャが変更されています。

```diff
- onToggleMod: (id: string, e: React.MouseEvent) => void;
+ /**
+  * 追加/削除トグル。AppShell 側の handleToggleMod は Promise を返すため
+  * 戻り値は緩めに unknown で受ける (React イベントは戻り値を無視するため
+  * ランタイム上は問題なし)。
+  */
+ onToggleMod: (id: string, e?: React.MouseEvent, silent?: boolean) => unknown;
```

**理由:** Next 版では `useAppContext().handleToggleMod` (async 関数) を直接渡すため、`Promise<void>` を受け付けられるよう緩めています。React イベントハンドラは戻り値を無視するのでランタイム影響はゼロ。

---

## 5. Vite 側にしか無いファイル (12 件)

Next.js 版では **消滅した / 別の場所に統合された / ランタイムが異なるため不要になった** ファイルです。

### 5.1 Vite ランタイム固有 (5 件、Next.js では概念自体が不要)

| ファイル | 行数 | 消滅理由 |
| --- | ---: | --- |
| `.archive/vite/index.html` | 14 | Next.js は `app/layout.tsx` が HTML shell を生成するため不要 |
| `.archive/vite/src/main.tsx` | 31 | React root マウントは Next.js が自動処理 |
| `.archive/vite/vite.config.ts` | 19 | Next.js は設定ファイルが `next.config.ts` に変わる |
| `.archive/vite/tsconfig.json` | 21 | Next 版は `plugins: [{name:'next'}]` + `paths: @/*` に刷新 |
| `.archive/vite/pnpm-workspace.yaml` | 3 | モノレポ構成をやめたので不要 |

### 5.2 Hono プロキシ (1 件、Next.js Route Handler に統合)

| ファイル | 行数 | 移行先 |
| --- | ---: | --- |
| `.archive/vite/server/index.ts` | 91 | `app/api/health/route.ts` + `app/api/modrinth/[...path]/route.ts` |

Hono の `app.get('/api/health')` と `app.on(['GET','POST'], '/api/modrinth/*')` の 2 endpoint がそのまま Next.js の Route Handlers に置換されました。path traversal 対策・ホスト検証・Web Streams パススルーのロジックは維持されています (詳細は §7 参照)。

### 5.3 タブ Component 群 (3 件、App Router のページに再構築)

| Vite 側ファイル | 行数 | Next 側の対応 |
| --- | ---: | --- |
| `src/components/HomeTab.tsx` | 317 | `app/page.tsx` (RSC) + `components/HomeInteractive.tsx` (Client) に分割 |
| `src/components/ModsTab.tsx` | 351 | `app/mods/page.tsx` (RSC ラッパ) + `components/ModsPageClient.tsx` (Client) に分割 |
| `src/components/SettingsTab.tsx` | 192 | `app/settings/page.tsx` (RSC ラッパ) + `components/SettingsPageClient.tsx` (Client) に分割 |

すべて「props で全 state を受け取る dumb Component」→「AppContext から必要な値を取得する Client Component」に構造が変わっています (§8 参照)。

### 5.4 モーダル Component (1 件、Parallel Routes に再構築)

| Vite 側 | 行数 | Next 側の対応 |
| --- | ---: | --- |
| `src/components/ModDetailModal.tsx` | 337 | `components/ModDetailModalShell.tsx` (512 行、variant="modal"/"page" の 2 モード) + `app/@modal/(.)mod/[slug]/page.tsx` + `app/mod/[slug]/page.tsx` |

Vite 版は「`isOpen` で表示制御される単一モーダル」。Next 版は「Parallel + Intercepting Routes で URL を持つモーダル + フルページ両対応」に再構築されました。バージョン一覧デフォルト展開・React error #310 対策 (全 hook を早期 return より前) などの UX/安全性上の仕様は Vite 版のロジックを継承。

### 5.5 Home 検索 hook (1 件、HomeInteractive に統合)

| Vite 側 | 行数 | Next 側の対応 |
| --- | ---: | --- |
| `src/hooks/useModSearch.ts` | 242 | `components/HomeInteractive.tsx` の内部 state + `executeSearch` useCallback に統合 |

Vite 版は `useModSearch(currentProfile, activeTab, showToast)` として独立 hook でしたが、Next 版では SSR で initialHits を props 受け取りしつつ Client 側で継続する構造になったため、`HomeInteractive` 単体に吸収されました。race condition 対策 (AbortController + requestSeq)、debounce (350ms)、無限スクロール (IntersectionObserver + `rootMargin: 800px`) のロジックは維持。

### 5.6 App shell / エラー境界 (2 件、AppShell に統合)

| Vite 側 | 行数 | Next 側の対応 |
| --- | ---: | --- |
| `src/App.tsx` | 305 | `components/AppShell.tsx` (363 行、Root Layout 直下で全 hook + モーダル + Header + BottomNav を集約) |
| `src/components/ErrorBoundary.tsx` | 175 | **未移植** (Next.js の `app/error.tsx` boundary で置換予定、Phase 8+ 検討) |

⚠️ `ErrorBoundary` は現時点で Next.js 版にも `app/error.tsx` にも実装されていません。React ツリー内の描画例外があると Next.js のデフォルト 500 ページが出るだけなので、UX 上は Vite 版より軽微に退行しています。**Phase 8 で `app/error.tsx` + `app/global-error.tsx` の追加を推奨**。

### 5.7 Vite 版依存 (1 件、参照用)

| ファイル | 内容 |
| --- | --- |
| `.archive/vite/package.json` | React 18.3 / Vite 6 / Hono 4 / @tailwindcss/vite / @hono/vite-dev-server 等 |
| `.archive/vite/pnpm-lock.yaml` | Vite 版依存ツリーの lockfile (96,237 行) |

---

## 6. Next 側にしか無いファイル (24 件)

Next.js への移行に伴って **新規に追加された** ファイルです。カテゴリ別に分類します。

### 6.1 App Router 構造 (7 件)

| ファイル | 行数 | Phase | 役割 |
| --- | ---: | :-: | --- |
| `app/layout.tsx` | 112 | 1 → 4 → 7 | Root Layout、`children + @modal` 2 スロット、metadataBase 解決、OGP テンプレ |
| `app/page.tsx` | 57 | 3 → 5 | Home Server Component (ISR 5m/1y + 初期24件 SSR) |
| `app/mods/page.tsx` | 21 | 5 | `/mods` RSC ラッパ |
| `app/settings/page.tsx` | 22 | 5 | `/settings` RSC ラッパ |
| `app/mod/[slug]/page.tsx` | 108 | 4 → 7 | Mod 詳細フルページ (SSG + ISR + `generateStaticParams` 人気100件 + `generateMetadata` OGP + canonical) |
| `app/mod/[slug]/loading.tsx` | 39 | 4 | Suspense fallback スケルトン |
| `app/mod/[slug]/not-found.tsx` | 32 | 4 | 404 boundary |

### 6.2 Parallel + Intercepting Routes (3 件)

| ファイル | 行数 | Phase | 役割 |
| --- | ---: | :-: | --- |
| `app/@modal/default.tsx` | 11 | 4 | slot fallback (`return null`) |
| `app/@modal/[...catchAll]/page.tsx` | 10 | 4 | 別ページ遷移時にモーダルを自動閉じる |
| `app/@modal/(.)mod/[slug]/page.tsx` | 46 | 4 | Home 上に重ねるインターセプトモーダル (RSC + 1h ISR) |

### 6.3 Route Handlers (2 件、Hono から置換)

| ファイル | 行数 | Phase | 役割 |
| --- | ---: | :-: | --- |
| `app/api/health/route.ts` | 12 | 3 | `{status:'ok',service:'DropMod Next API'}` |
| `app/api/modrinth/[...path]/route.ts` | 109 | 3 | Modrinth 直プロキシ (path traversal 対策 + ホスト検証 + Web Streams パススルー) |

### 6.4 SEO / メタデータ (2 件)

| ファイル | 行数 | Phase | 役割 |
| --- | ---: | :-: | --- |
| `app/sitemap.ts` | 76 | 7 | 静的3ルート + 人気Mod100件 (1h ISR、Modrinth 到達不可時はフォールバック) |
| `app/robots.ts` | 34 | 7 | `Allow: /` + `Disallow: /api/` + `Sitemap:` 明示 |

### 6.5 Client 集約層 (2 件、App.tsx から移行)

| ファイル | 行数 | Phase | 役割 |
| --- | ---: | :-: | --- |
| `components/AppContext.tsx` | 119 | 5 | `AppContextValue` 型 + Provider + `useAppContext()` |
| `components/AppShell.tsx` | 363 | 5 | Vite `App.tsx` 相当。全 hook + モーダル + Header + BottomNav を Root Layout 直下に集約 |

### 6.6 タブ / モーダル Client Components (4 件、Vite の *Tab.tsx + ModDetailModal から再構築)

| ファイル | 行数 | Phase | 役割 |
| --- | ---: | :-: | --- |
| `components/HomeInteractive.tsx` | 461 | 3 → 5 | Home 全 UI + 検索/カテゴリ/ソート/無限スクロール |
| `components/ModsPageClient.tsx` | 440 | 5 | 選択中 Mod 一覧 (デスクトップテーブル + モバイルカード) |
| `components/SettingsPageClient.tsx` | 209 | 5 | プロファイル管理 + テーマ + ZIP import/export + データ初期化 |
| `components/ModDetailModalShell.tsx` | 512 | 4 → 5 | Mod 詳細 (`variant="modal"` / `"page"` 2 モード) |

### 6.7 Server 側 Modrinth ラッパ (1 件、client.ts と役割分担)

| ファイル | 行数 | Phase | 役割 |
| --- | ---: | :-: | --- |
| `lib/modrinth/server.ts` | 245 | 3 | Server Components / RSC 用の Modrinth fetch (`fetch({ next: { revalidate, tags } })` で ISR 対応、429 リトライ、`REVALIDATE.SEARCH=300s`, `PROJECT=3600s`, `VERSION=3600s`, `TAG=86400s`) |

### 6.8 プロジェクト設定 (3 件)

| ファイル | 行数 | Phase | 役割 |
| --- | ---: | :-: | --- |
| `next.config.ts` | 50 | 1 → 7 | reactStrictMode + images.remotePatterns + optimizePackageImports + セキュリティヘッダ 4 種 |
| `vercel.json` | 10 | 7 | 東京リージョン (hnd1) + cleanUrls + framework: nextjs |
| `.env.example` | 50 | 7 | `NEXT_PUBLIC_SITE_URL` + `MODRINTH_USER_AGENT` の scope 説明 |

### 6.9 ドキュメント (Next 側にしか無い、参考)

このリストには入れませんが、`docs/DEPLOY.md`, `docs/NEXTJS_MIGRATION_PLAN.md`, `docs/issues.md`, `README.md`, `.archive/vite/README.md` も新規追加されています。

---

## 7. リネーム + 分割/統合の対応表

Vite 版と Next 版でファイル境界が変わった箇所の対応関係を整理します。

### 7.1 サーバ層

| Vite 側 (1 ファイル) | Next 側 (2 ファイル) | 分割の意図 |
| --- | --- | --- |
| `src/services/api.ts` (271 行) | `lib/modrinth/client.ts` (271 行、ほぼ同一) + `lib/modrinth/server.ts` (245 行、新規) | Client (LRU/TTL キャッシュ + 429 リトライ) と Server (Data Cache ISR + revalidate タグ) でランタイム特性が違うため分離 |
| `server/index.ts` (91 行、Hono) | `app/api/health/route.ts` (12 行) + `app/api/modrinth/[...path]/route.ts` (109 行) | Hono ルーターから Next.js Route Handler に置換。ロジックはほぼそのまま (path traversal 対策 3 パターン、ホスト再検証、GET/POST のみ、Web Streams パススルー) を継承 |

### 7.2 タブ Component

| Vite 側 (1 ファイル) | Next 側 (2 ファイル) | 分割の意図 |
| --- | --- | --- |
| `src/components/HomeTab.tsx` (317 行、props 20+ 個) | `app/page.tsx` (57 行、RSC で SSR) + `components/HomeInteractive.tsx` (461 行、Client) | ページ全体を Server Component 化し、初期 24 件を SSR。Client 側は AppContext から state 取得 |
| `src/components/ModsTab.tsx` (351 行) | `app/mods/page.tsx` (21 行、RSC ラッパ) + `components/ModsPageClient.tsx` (440 行) | プロファイル依存で Client 全描画。ラッパは metadata 定義のみ |
| `src/components/SettingsTab.tsx` (192 行) | `app/settings/page.tsx` (22 行、RSC ラッパ) + `components/SettingsPageClient.tsx` (209 行) | 同上 |
| `src/components/ModDetailModal.tsx` (337 行、isOpen で制御) | `components/ModDetailModalShell.tsx` (512 行、variant 2 モード) + `app/@modal/(.)mod/[slug]/page.tsx` (46 行) + `app/mod/[slug]/page.tsx` (108 行) + `app/mod/[slug]/{loading,not-found}.tsx` | Parallel + Intercepting Routes で URL 対応モーダル + SSR フルページ両立 |

### 7.3 hook

| Vite 側 (1 ファイル、独立 hook) | Next 側 (吸収先) |
| --- | --- |
| `src/hooks/useModSearch.ts` (242 行) | `components/HomeInteractive.tsx` に統合 (SSR initialHits を受け取る形に変わったため独立 hook 化不要) |

---

## 8. アーキテクチャ差分の要約

上記ファイル単位の差分から見えてくる、**Vite 版と Next.js 版の根本的な違い** を整理します。

| 観点 | Vite 版 (旧) | Next.js 版 (新) |
| --- | --- | --- |
| ルーティング | React state `activeTab: 'home'/'mods'/'settings'` | App Router (`/`, `/mods`, `/settings`, `/mod/[slug]`) |
| Mod 詳細 | React state `isModDetailModalOpen` で制御 | URL 付きモーダル (Parallel + Intercepting Routes) + 直接アクセス時はフルページ SSR |
| Home 初期表示 | CSR (`useModSearch` の fetch) | ISR 5min キャッシュ + 初期24件を Server 側で fetch → HTML に埋め込み |
| 状態共有 | `App.tsx` が全 hook を持ち props で bucket brigade | `AppShell` が全 hook を持ち Context 経由で全ページに配布 |
| Modrinth API | Hono プロキシ経由 (`/api/modrinth/*`) | Next.js Route Handler (同 URL) + Server Component 直叩き (Data Cache + ISR タグ) |
| React バージョン | 18.3 | 19.2 |
| ビルドツール | Vite 6 + esbuild | Next.js 16 + Turbopack (`--webpack` フラグで webpack 選択可) |
| デプロイ | 任意 (Vite preview / Docker / Nginx) | Vercel 前提 (`vercel.json` で hnd1 リージョン固定) |
| SEO | title のみ (`index.html` 静的) | `metadataBase`, `title.template`, OGP, Twitter Card, canonical, sitemap.xml, robots.txt |
| セキュリティヘッダ | なし (静的 HTML 配信) | 全ページに 4 種 (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`) |
| エラー境界 | `ErrorBoundary` component | **未移植** (Phase 8+ で `app/error.tsx` を追加予定) |
| フォント | `@fontsource/*` を `main.tsx` で import | `@fontsource/*` を `app/layout.tsx` で import (同じ扱い) |
| CSS | Tailwind v4 + `src/index.css` | Tailwind v4 + `app/globals.css` (完全同一の 276 行) |
| 永続化 | LocalStorage `dropmod_state_v2` (+ 旧 `craftforge_state_v2` 移行) | 同上 (`useProfiles` ロジック完全維持) |

---

## 9. 機能的なリグレッションと残タスク

### 9.1 現時点でリグレッションしているもの

| 項目 | 影響 | 対応方針 |
| --- | --- | --- |
| **React ErrorBoundary が消失** | React ツリー内の描画例外時、Vite 版はカスタム UI + 「ローカル削除して再読込」ボタンが出たが、Next 版は Next.js デフォルトの 500 ページ | Phase 8 で `app/error.tsx` + `app/global-error.tsx` を追加予定 (Vite 版 `ErrorBoundary.tsx` のロジックを移植) |
| **Hero Banner の「登録 MOD 数」パネル消失** | Vite 版では Home 画面右側に大きく Mod カウントが表示されていた (§11.3 参照)。Next.js 版では消えたため BottomNav バッジで代替 | Phase 8 で `components/HomeInteractive.tsx` の Hero Banner に復元推奨 |
| **`<title>` タグに "DropMod" 重複** | `/mod/[slug]` で `<title>${slug} - DropMod \| DropMod</title>` となる (§11.6 参照)。`layout.tsx` の `title.template` と `generateMetadata` の title 両方が "DropMod" を含む | `app/mod/[slug]/page.tsx` の `title:` から ' - DropMod' を削除する 5 分修正 |

### 9.2 Vite 版から仕様継承済み (差分としては現れないが担保されている)

- `useProfiles.ts` の hydration ガード (M-6) + 旧 `craftforge_state_v2` からの自動移行
- `useDependencyCheck.ts` の 1.2s デバウンス背景チェック (5s interval 廃止による Modrinth レート制限保護)
- `useZipExport.ts` の CONCURRENCY=4 並列 DL + dedup + Retry-After 尊重
- `useZipImport.ts` の `.mrpack` 直接インポート + `.jar` SHA-1 照合 + Insecure Context 検知
- Mod 詳細のバージョン一覧デフォルト展開 (`useState(true)` + `useEffect [isOpen]` の cleanup も維持)
- DependencyCheckModal のボタン配置刷新 (`flex-row` 固定、控えめスタイル、actionInFlight state、600ms デバウンス自動再検証)
- 全モーダル系での React error #310 対策 (全 hook を早期 return より前に配置)
- `.jar` cross-origin download (fetch → Blob → 一時 `<a>`)

### 9.3 Next.js 化で新規獲得した機能

- URL 付きモーダル (`/mod/[slug]` の share 可能な URL、ブラウザバック対応、SEO/OGP 出力)
- Home の TTFB / LCP 改善 (SSR + ISR)
- Modrinth API の Vercel Data Cache 経由キャッシュ (300s〜86400s)
- `sitemap.xml` / `robots.txt` 自動生成
- OGP / Twitter Card 自動生成
- セキュリティヘッダ 4 種
- Vercel での自動プレビューデプロイ + 東京リージョン

---

## 10. 参考: `.archive/vite/` からの復元手順

`.archive/vite/README.md` に詳細記載されていますが、要点のみ:

```bash
# 1. Next.js 版設定を退避
mkdir -p /tmp/next-backup
mv app components hooks lib public types.ts next.config.ts postcss.config.mjs \
   tsconfig.json package.json pnpm-lock.yaml README.md vercel.json /tmp/next-backup/

# 2. Vite 版一式をルートへ復元
cp -r .archive/vite/src src
cp -r .archive/vite/server server
cp .archive/vite/{index.html,vite.config.ts,tsconfig.json,package.json,pnpm-lock.yaml,pnpm-workspace.yaml} .

# 3. Vite 版依存インストール + 起動
pnpm install --frozen-lockfile
pnpm dev
```

---

## 11. UI/UX 実測差分 (両バージョンをローカルで並行起動して比較)

### 11.1 検証方法

両方をローカルで **production build → 起動** して、curl / 静的 HTML 解析ツールで挙動を実測。sandbox 環境の外部通信制約で Modrinth API は不通なため、以下 4 項目に焦点を絞る:

| 検証対象 | ツール | 目的 |
| --- | --- | --- |
| **SSR HTML 差分** | `curl -s` + Python HTML パーサ | JavaScript 実行前に画面にあるものを比較 |
| **HTTP レスポンスヘッダ** | `curl -I` | セキュリティ / キャッシュ / SEO ヘッダ |
| **各ページのステータス** | `curl -so /dev/null -w '%{http_code}'` | 404 応答, SPA fallback 挙動 |
| **JSX ソース比較** | `diff` + `sed -n` | UI 要素の追加 / 削除 / 属性変更 |

起動コマンド:
```bash
# Vite 版 (旧)
cd .archive/vite/  # (実際は一時ディレクトリに展開)
pnpm install --frozen-lockfile
pnpm build            # dist/ 生成
pnpm preview --host 0.0.0.0 --port 4173

# Next.js 版 (新)
cd /home/user/DropMod
pnpm install --frozen-lockfile
pnpm build            # .next/ 生成
pnpm start --port 3100 --hostname 0.0.0.0
```

Playwright 等の自動スクリーンショットは sandbox から Chromium バイナリを取得できず断念 (Google CDN 到達不可)。代替として上記の静的解析ベースで徹底比較しました。

### 11.2 SSR HTML の情報量差分 (最重要)

| ページ | Vite 版 | Next.js 版 |
| --- | ---: | ---: |
| `/` (Home) | **683 bytes** (`<div id="root"></div>` のみ) | **25,211 bytes** (Header + Hero + Search + Category + Grid skeleton + BottomNav 完全描画) |
| `/mods` | 683 bytes (SPA fallback) | 22,134 bytes (Empty state 完全描画) |
| `/settings` | 683 bytes (SPA fallback) | 25,130 bytes (テーマ切替 + ZIP UI + Profile 一覧 完全描画) |
| `/nonexistent` | **200 OK / 683 bytes** (SPA fallback で Home HTML を返す = 死んだ URL でも 200) | **404 / 11,061 bytes** (正しい 404 ページ) |

**37 倍以上の情報量差**。Next.js 版は JavaScript 実行前に既にほぼ完全な UI が見える。これは:

- **SEO クローラーがコンテンツを直接見られる** (Vite 版は空の `<div id="root">` しか見えないため実質クロール不可)
- **初期 LCP 向上** (First Meaningful Paint が JavaScript を待たない)
- **JavaScript 無効ブラウザでも UI が表示される** (フォームは動かないが情報は読める)

具体的に Next.js 版 SSR で見える要素:

```
Home (/) の SSR HTML 内で描画される DOM 要素 (11 個の id):
  #toast-container       (空だが空 div は準備済)
  #app-header            (Header 全体 + プロファイル dropdown 選択済)
  #header-theme-toggle   (テーマ切替ボタン)
  #header-theme-icon     (moon アイコン)
  #tab-home              (Home セクション)
  #hero-banner           (プロファイル情報 + 編集/複製/依存チェックボタン)
  #search-bar-panel      (検索入力 + ソート dropdown + カテゴリ 10 個)
  #mod-grid              (Mod カード skeleton or Empty state)
  #infinite-scroll-sentinel
  #bottom-nav            (3 タブすべて描画済)
  #_R_                   (Next.js Router 予約)

button として初期描画される最初のカテゴリラベル 10 個:
  「すべて」「装飾」「工業」「魔法」「装備」
  「ストレージ」「軽量化」「ユーティリティ」「冒険」「ワールド生成」
```

これらは **Vite 版では JavaScript 実行後にしか存在しません**。

### 11.3 Hero Banner の UI 要素差分 (Vite → Next で意図的に削除された要素あり)

Vite 版 `HomeTab.tsx` の Hero Banner 右側には **登録 MOD 数を強調表示する専用パネル** がありました:

```jsx
{/* Vite 版のみ (Next.js 版では削除) */}
<div className="w-full sm:w-auto shrink-0 flex items-center justify-between sm:justify-start gap-3.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-slate-950 font-extrabold text-lg sm:text-xl shadow-md ring-1 ring-white/20 shrink-0">
      <i className="fa-solid fa-cubes" aria-hidden="true" />
    </div>
    <div>
      <div className="text-xs font-bold theme-text-secondary uppercase tracking-wider">
        登録 MOD 数
      </div>
      <div className="text-2xl sm:text-3xl font-black theme-text-brand font-mono tracking-tight leading-none mt-0.5">
        {modCount}
      </div>
    </div>
  </div>

  <button
    type="button"
    onClick={() => onSwitchTab('mods')}
    className="sm:hidden px-3 py-1.5 text-xs font-bold bg-emerald-600 text-slate-950 rounded-lg"
  >
    確認
  </button>
</div>
```

**Next.js 版では消失**しています。これは Phase 3 で `HomeInteractive.tsx` を新規実装した際、Vite `HomeTab.tsx` からポート漏れ (元の props に `modCount` を渡す設計がなかった) と推測されます。

**影響:** モバイル/デスクトップとも、Home 画面から「現在のプロファイルに何個 Mod が入っているか」の情報が一目で分からなくなりました。代わりに BottomNav の「選択中のMod」タブに badge (数字) が付くので致命的ではないが、Vite 版比では**明確な UX 退行**です。

**推奨:** Phase 8 で `HomeInteractive.tsx` の Hero Banner に該当パネルを復元。

### 11.4 Hero Banner ボタン (Vite → Next で軽微変更)

| Vite 版ボタン | Next.js 版ボタン | 差分 |
| --- | --- | --- |
| `<span>編集</span>` | `プロファイルを編集` | ラベル拡張 (親切化) |
| `<span>複製</span>` | `複製` | 同一 |
| `<span>依存・競合チェック</span>` | `依存・競合チェック` | 同一 |

角丸クラスが `rounded-lg` → `rounded-xl` (12px → 16px、若干大きく) に変更。Vite 版は明示的な `text-[11px]` アイコンサイズだが Next.js 版はデフォルト。

### 11.5 ModDetailModal のフッター動作差分

| 要素 | Vite `ModDetailModal.tsx` | Next `ModDetailModalShell.tsx` |
| --- | --- | --- |
| フッター折り返し | `flex justify-end gap-2` (1 行固定) | `flex justify-end gap-2 ... flex-wrap` (狭い画面で折り返し可) |
| 閉じるボタン | 常に「閉じる」 | modal バリアント: 「閉じる」 / page バリアント: 「🏠 ホームに戻る」 |
| .jar 直DL ボタン | 単純ボタン | **`isJarDownloading` state で spinner 表示 + disabled** (連打防止) |
| 追加/削除ボタン | 単純ボタン | **`isTogglePending` state で spinner 表示 + disabled** (連打防止) |
| 追加/削除後の挙動 | `onToggleMod(); onClose();` (直列同期) | `await handleToggleMod(); router.back();` (非同期完了待ち) |

**改善点 (Next.js 版で向上):**
- 連打時の重複トグル暴発が防がれる (Vite 版は連打すると重複追加リスクがあった)
- モバイルでボタン列が長すぎる場合に自動折り返し

**変更点 (機能変化):**
- Vite: モーダルを閉じる = React state のフラグを false に。Next: URL を戻すため `router.back()`。ブラウザ履歴が積まれる。

### 11.6 title タグの重複バグ (Next.js 版で新規発生)

Modrinth API 到達不可時 (build 時など) の `/mod/[slug]` の `<title>` タグを実測:

```html
<title>sodium - DropMod | DropMod</title>
```

**"DropMod" が 2 回出現しています**。原因は 2 箇所で "DropMod" が結合されているため:

- `app/layout.tsx`: `title.template = '%s | DropMod'`
- `app/mod/[slug]/page.tsx`: `generateMetadata` の fallback で `title: '${slug} - DropMod'`

**推奨修正:**
```typescript
// app/mod/[slug]/page.tsx
return {
-  title: `${slug} - DropMod`,
+  title: slug,   // layout.tsx の template が ' | DropMod' を付ける
   ...
};
```

正常系 (Modrinth 到達成功時) も `${project.title} - DropMod` → `${project.title} | DropMod` に統一するのが望ましい。

Vite 版は `title` タグが `<title>DropMod - Minecraft Mod Downloader</title>` 固定 (静的 HTML) のため、この問題はそもそも発生しない。

### 11.7 HTTP レスポンスヘッダの差分

| ヘッダ | Vite 版 | Next.js 版 |
| --- | --- | --- |
| `X-Content-Type-Options` | (無) | `nosniff` ✅ |
| `Referrer-Policy` | (無) | `strict-origin-when-cross-origin` ✅ |
| `X-Frame-Options` | (無) | `SAMEORIGIN` ✅ |
| `Permissions-Policy` | (無) | `camera=(), microphone=(), geolocation=(), interest-cohort=()` ✅ |
| `Cache-Control` | `no-cache` (dev-server デフォルト) | `s-maxage=300, stale-while-revalidate=31535700` (ISR 5min + 1y SWR) |
| `Vary` | `Origin` | `rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding` |
| `x-nextjs-cache` | (無) | `HIT` (2回目以降のリクエスト) |
| `x-nextjs-prerender` | (無) | `1` (SSG プレレンダー済み) |

すべて Next.js 化で新規獲得したもの。**CDN 効率とセキュリティが顕著に改善**。

### 11.8 バンドルサイズ差分

| 種別 | Vite 版 (dist/) | Next.js 版 (.next/static/) | 差 |
| --- | ---: | ---: | ---: |
| JS 合計 | 766 KB (単一 chunk) | 1,286 KB (11 chunks に分割) | +520 KB |
| CSS 合計 | 214 KB (単一) | 171 KB (2 chunks) | -43 KB |
| **合計** | **980 KB** | **1,457 KB** | **+477 KB (+48%)** |

Next.js 版のほうが **合計は大きい** が、以下の点で実質的なユーザー体験は改善:

- **route-based code splitting**: `/mods` にアクセスした時は `HomeInteractive.tsx` のバンドルは読まれない (Vite 版は単一 SPA なので初回に全部落とす)
- **`<link rel="preload">` / `<link rel="preconnect">`** を SSR HTML 内に自動挿入 (Vite 版なし)
- **`fetchPriority="low"`** を router 用 chunk に付与 (メイン CSS/JS を優先)

初期 First Load JS の実効サイズは `next build` の出力から確認できるが、実測で最も重要な chunk 上位:
- `1qtbr5bh5dkuq.js` (331 KB) = React DOM
- `2_idiv-r9kevu.js` (253 KB) = App Shell (AppContext + hooks + FontAwesome)
- `3_7zh56wg04y1.js` (229 KB) = React
- `3fpx60_ff5yua.js` (156 KB) = Modrinth ラッパ + JSZip 部分

### 11.9 URL 設計の根本差分

| 動作 | Vite 版 | Next.js 版 |
| --- | --- | --- |
| `/mods` を直接開く | 200 OK (SPA fallback で Home HTML → JS が pathname 読んで内部で切替、ただし初回は Home が一瞬見える) | **200 OK でネイティブに /mods 描画** (Home が一瞬見えない) |
| `/mod/sodium` を直接開く | 200 OK (SPA fallback で Home HTML → 実装なし、URL が変わっただけで実質 dead link) | **200 OK で /mod/sodium フルページ描画** (SEO/共有 URL 対応) |
| `/nonexistent` を直接開く | **200 OK** (Vite preview は SPA fallback で必ず Home を返す) | **404** (正しい応答) |
| Home のカードクリック | React state 切替 (URL 変わらず) | `router.push('/mod/[slug]')` → **モーダル表示 + URL 更新** (共有可、ブラウザ戻る対応) |
| Home ↔ Mods タブ切替 | React state 切替 (URL 変わらず、リロードで Home に戻る) | `router.push('/mods')` → **URL 更新**、リロードしても `/mods` |

**Next.js 版で新規獲得:**
- ディープリンク (URL 共有時に正しいページが開く)
- ブラウザバック / フォワード / リロード が期待通り動く
- Google 検索結果から `/mod/sodium` に直接ランディング可能

### 11.10 追加された Next.js 特有機能

以下は Vite 版に **概念自体が存在しない** 機能:

| 機能 | エンドポイント | 実装 |
| --- | --- | --- |
| **RSC ペイロード配信** | `/mod/sodium?_rsc=xxx` に自動リダイレクト | `Vary: rsc` ヘッダで判別、soft nav 時にペイロードのみ返す |
| **sitemap** | `/sitemap.xml` | 静的3ルート + 人気Mod100件 |
| **robots** | `/robots.txt` | `Allow: /`, `Disallow: /api/`, `Sitemap:` |
| **health check** | `/api/health` | `{status:'ok',service:'DropMod Next API'}` |
| **Route Handler** | `/api/modrinth/*` | Vite の Hono プロキシと同等 (置換) |
| **OGP メタタグ** | 全ページの `<head>` | `og:title/og:description/og:site_name/og:locale/og:type` |
| **Twitter Card** | 全ページの `<head>` | `twitter:card/title/description` |
| **canonical URL** | `/mod/[slug]` | `<link rel="canonical" href="/mod/${slug}">` |
| **Static prerendering** | `/mod/[slug]` 人気100件 | build 時に `generateStaticParams` |

### 11.11 UI/UX 差分の総括表

| # | 差分 | 種別 | 影響 | 対応 |
| --- | --- | --- | --- | --- |
| 1 | Hero Banner から「登録 MOD 数」パネルが消失 | **退行** | Home 画面情報密度低下 | Phase 8 で復元推奨 |
| 2 | `<title>` タグに "DropMod" 重複 | **バグ** | SEO 表示品質低下 | 5 分で修正可能 |
| 3 | Home Hero Banner のボタン ラベル拡張 (「編集」→「プロファイルを編集」) | 改善 | 意図が明確 | - |
| 4 | ModDetailModal のフッターに spinner / disabled 追加 | 改善 | 連打事故防止 | - |
| 5 | ModDetailModal のフッターに `flex-wrap` | 改善 | モバイル UI 破綻回避 | - |
| 6 | ModDetailModal の閉じるボタンが variant 別 (「閉じる」 / 「ホームに戻る」) | 改善 | ページ経路に応じた導線 | - |
| 7 | BottomNav の JSX は完全同一 | (無変更) | - | - |
| 8 | Header は import path 以外完全同一 | (無変更) | - | - |
| 9 | SSR HTML 情報量: Vite 683B → Next 25KB | 大幅改善 | SEO / LCP 大幅向上 | - |
| 10 | 404 レスポンス: Vite 常時 200 → Next 正しい 404 | 改善 | 検索エンジン品質シグナル | - |
| 11 | セキュリティヘッダ 4 種新規 | 改善 | XSS / clickjacking 対策 | - |
| 12 | Cache-Control: `no-cache` → `s-maxage=300, SWR=1y` | 大幅改善 | CDN 効率大幅向上 | - |
| 13 | バンドル合計: 980KB → 1457KB (+48%) | 中立 | route-splitting で実質改善 | - |
| 14 | URL 直開き / 共有 / リロード対応 | 大幅改善 | ディープリンク成立 | - |
| 15 | sitemap.xml / robots.txt / OGP / canonical 新規 | 大幅改善 | SEO 対応の質的向上 | - |
| 16 | `router.back()` によるモーダル閉じ (履歴が積まれる) | 変更 | 「ブラウザ戻る」で自然に閉じる | - |
| 17 | プロファイル切替の一瞬 Home が見える (SPA fallback がなくなったため) | 改善 | 各ページ直接描画 | - |

### 11.12 制限事項 (今回の実測でカバーできなかった項目)

sandbox の外部通信制限と Chromium 不在により、以下は **手動確認が必要** です:

- 実際の Mod カードのグリッド表示（Modrinth 到達要）
- Mod カードクリック → モーダル → 閉じる の**視覚的な動画**
- カテゴリボタン切替時の**アニメーション**
- Mod 詳細のギャラリー画像**表示**
- テーマ切替時の**色の変化**
- LocalStorage 移行 (旧 `craftforge_state_v2` → 新 `dropmod_state_v2`) 実挙動
- Lighthouse スコア (Performance / Accessibility / SEO)
- モバイルレイアウト (Chrome DevTools iPhone シミュレーション)
- Facebook Debugger での OGP プレビュー
- 実 Vercel 環境での ISR 動作

これらは Vercel 本番デプロイ後の `docs/DEPLOY.md` §5 チェックリストで確認する項目と重なっています。

---

*§11 は 2026-08-21 に Vite 版 (Phase 0 開始時点 `.archive/vite/`) と Next.js 版 (HEAD `260075c`) を並行起動して静的解析で比較した結果です。Playwright 等の動的スクリーンショット比較は sandbox の Chromium 不在で不可能だったため、curl + HTML パーサ + JSX ソース比較で徹底代替しました。*

---

*このレポートは Phase 7 完了時点 (2026-08-21, HEAD `260075c`) のリポジトリ状態に基づき生成されました。以降 Phase 8+ で新規ファイル追加や既存ファイル改修があった場合、対応するセクションを追記する運用としてください。*
