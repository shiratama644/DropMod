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

*このレポートは Phase 7 完了時点 (2026-08-21, HEAD `260075c`) のリポジトリ状態に基づき生成されました。以降 Phase 8+ で新規ファイル追加や既存ファイル改修があった場合、対応するセクションを追記する運用としてください。*
