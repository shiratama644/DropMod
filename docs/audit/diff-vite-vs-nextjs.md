# `.archive/vite/` と現行 Next.js 版の差分一覧

`.archive/vite/` に保存されている Vite 版 (Phase 0 開始時点の最終状態) と、リポジトリのルートに置かれている Next.js 版 (Phase 7 完了時点) の全ファイル差分を、機械的に洗い出したうえで分類したレポートです。

- 集計基準: `find .archive/vite -type f -not -path '*/node_modules/*'` と `find app components hooks lib types.ts -type f` の全ファイル、およびルート設定ファイル一式
- 比較日: 2026-08-21 (Phase 7 完了直後)
- 対象コミット: `arena/01a01fcf-dropmod` HEAD `260075c`

> ## ⚠️ 重要: 2026-08-22 更新について
>
> §11 と §12 に記載された「退行」「バグ」「未対応項目」の大部分は、
> `docs/audit/issues-legacy.md` の **第4波修正 (20 件、2026-08-22)** および
> **第5波修正 (30 件、2026-08-22)** で **すべて対応済み**です。
>
> 具体的には以下の記述は現在の実装 (HEAD `b6155f7` 以降) では **outdated**:
>
> | diff.md の記述 | 現在の実装 |
> | --- | --- |
> | §11.3 Hero Banner の「登録 MOD 数」パネル消失 (退行) | ✅ M4-1 で復元済 |
> | §11.6 `<title>` タグ重複バグ (`sodium - DropMod \| DropMod`) | ✅ H4-2 で修正済 (`sodium \| DropMod`) |
> | §11.7 セキュリティヘッダ 4 種新規 (既に対応済) | (継続) |
> | §11.10 sitemap/robots/OGP 新規追加 | (継続) |
> | §11.11 総括表: 「退行 1件・バグ 1件・改善 15件」 | ✅ 退行/バグ全て修正済 |
> | §12.1 モーダル背景スクロールロック抜け (重大 UX バグ) | ✅ C4-2 で修正済 |
> | §12.2 `<a href>` タグ = 0 (SEO 退行) | ✅ H4-1 で 5+ に増加、C5-1/C5-2 で二重遷移解消 |
> | §12.3 Vite bundle にあって Next に無い文言 16 件 | ✅ H4-6 で ErrorBoundary 移植、M4-1 で「登録 MOD 数」復元、M4-2 でフォールバック復元 |
> | §12.4 profile フォールバック 3 件消失 | ✅ M4-2 で復元済 |
> | §12.5 SSR プロファイル固定によるちらつき | ✅ H4-5 で cookie 化して解消 |
> | §12.6 `<Image>` 未使用 (9 箇所 `<img>`) | ✅ H4-3 で 7 箇所を `<Image>` に、残 2 は Markdown/プレビューで意図的維持 |
> | §12.11 First Load JS (第4波修正で微増予想) | 未再測定 (Vercel Analytics で確認推奨) |
> | §12.13 loading/error boundary 不在 | ✅ error.tsx / global-error.tsx / @modal loading.tsx 追加済 |
> | §12.14 theme FOUC | ✅ M4-3 で hydration 前 inline script により解消 |
> | §12.15 総括表: 18 件目〜32 件目のうち退行系 | ✅ 全て修正済 |
>
> **現状の未対応バグは `docs/audit/issues-legacy.md` を参照**してください。
> 第5波修正が完了した現在、実装は本番デプロイ可能な状態です。

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

**UI/UX 実測差分 (§11・§12 参照):**
- 総発見項目 **32 件** (§11.11 の 17 件 + §12.15 の 15 件)
- 内訳: 🔴 重大 (即時対応推奨) **3 件** / 🟡 中 (次期リリース) **8 件** / 🟢 低 (時間があれば) **8 件** / ✅ 改善 (Next で新規獲得・維持) **13 件**
- 特に **§12.1 モーダル背景スクロールロック抜け** と **§12.2 `<a href>` 未使用** は本番デプロイ前に修正することを強く推奨

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

このリストには入れませんが、`docs/ops/DEPLOY.md`, `docs/planning/NEXTJS_MIGRATION_PLAN.md`, `docs/audit/issues-legacy.md`, `README.md`, `.archive/vite/README.md` も新規追加されています。

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
| **React ErrorBoundary が消失** | React ツリー内の描画例外時、Vite 版はカスタム UI + 「ローカル削除して再読込」ボタンが出たが、Next 版は Next.js デフォルトの 500 ページ (英語) | Phase 8 で `app/error.tsx` + `app/global-error.tsx` を追加予定 (Vite 版 `ErrorBoundary.tsx` のロジックを移植) |
| **Hero Banner の「登録 MOD 数」パネル消失** | Vite 版では Home 画面右側に大きく Mod カウントが表示されていた (§11.3 参照)。Next.js 版では消えたため BottomNav バッジで代替 | Phase 8 で `components/HomeInteractive.tsx` の Hero Banner に復元推奨 |
| **`<title>` タグに "DropMod" 重複** | `/mod/[slug]` で `<title>${slug} - DropMod \| DropMod</title>` となる (§11.6 参照)。`layout.tsx` の `title.template` と `generateMetadata` の title 両方が "DropMod" を含む | `app/mod/[slug]/page.tsx` の `title:` から ' - DropMod' を削除する 5 分修正 |
| 🔴 **モーダル open 時の背景スクロールロック抜け** | `AppShell.tsx` の `isAnyModalOpen` に `/mod/[slug]` モーダル検知が無い (§12.1 参照)。モバイルで背景 (Home グリッド) が touch scroll できてしまう。Vite にはあったガードが消失 | Phase 8 で `usePathname()` を使い `pathname?.startsWith('/mod/')` を `isAnyModalOpen` に追加 (10 分修正) |
| 🔴 **`<a href>` タグ数が 0** | 全てのページ遷移が `router.push()` 実装で `<Link>` 未使用 (§12.2 参照)。右クリック「新規タブ」・中クリック・prefetch・SEO クロールが全て機能しない | Phase 8 で BottomNav/Header/ModCard/Empty state を `<Link>` に置換 (30 分修正) |
| **`next/image` 未使用** | `next.config.ts` に `remotePatterns` はあるが `<img>` を 9 箇所で素で使用 (§12.6 参照)。Modrinth CDN の PNG が WebP 変換されない、lazy loading・srcset 未使用 | Phase 8 で `<Image>` に置換、画像サイズ 50-80% 削減見込 |
| **防御コード欠落** | `profile?.name \|\| '名称未設定プロファイル'` 等の Optional chaining + フォールバック 3 件消失 (§12.4 参照) | Optional chaining を復元 (5 分) |
| **theme FOUC** | SSR は常に dark で送信、hydration 後に light に切替。Vite より視覚的に目立つ (§12.14 参照) | `<script>` inline で hydration 前に LocalStorage 読取 |
| **一般ページの loading/error boundary 不在** | `app/loading.tsx` / `app/error.tsx` / `app/global-error.tsx` が無い (§12.13 参照)。ページ切替時に一瞬何も見えない、React 例外時デフォルト 500 | Phase 8 で追加 |
| **SSR は default profile 固定 → hydration 後ちらつき** | Home の SSR は 1.20.1/Fabric 固定 → LocalStorage 復元後に別プロファイルの結果が上書きで見える (§12.5 参照)。Vite には無かった現象 | skeleton SSR + CSR 発火に変更 or cookie 化 |

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

これらは Vercel 本番デプロイ後の `docs/ops/DEPLOY.md` §5 チェックリストで確認する項目と重なっています。

---

*§11 は 2026-08-21 に Vite 版 (Phase 0 開始時点 `.archive/vite/`) と Next.js 版 (HEAD `260075c`) を並行起動して静的解析で比較した結果です。Playwright 等の動的スクリーンショット比較は sandbox の Chromium 不在で不可能だったため、curl + HTML パーサ + JSX ソース比較で徹底代替しました。*

---

## 12. 深掘り差分 (bundle strings 抽出・A11y・ルーティング挙動・キャッシュ・build 統計)

§11 で拾えなかった、より低レベル / 隠れた差分を集中的に洗い出した結果です。以下の 8 つの視点で追加調査しました:

1. **build 済み JS bundle 内の日本語文字列抽出比較** (JSX props ではなく実際にユーザーが見る文言)
2. **A11y (aria-* / role 属性) の実 DOM 出現数**
3. **CSS build 差分** (font 埋め込み方式)
4. **HTTP 経由の実挙動** (SPA fallback / RSC ペイロード / api ルート)
5. **モーダル open state のスクロールロック挙動**
6. **`<a href>` vs `router.push()` 選択差分**
7. **Suspense/loading 境界の配置**
8. **First Load JS の Next.js 公式ビルド統計**

### 12.1 【重大 UX バグ】モーダル open 時の背景スクロールロック抜け

**発見**: `AppShell.tsx` の `isAnyModalOpen` 判定に **`isModDetailModalOpen` に相当する項目が抜けている**。

```diff
// Vite App.tsx
  const isAnyModalOpen =
    isNewProfileModalOpen ||
    isEditProfileModalOpen ||
-   isModDetailModalOpen ||          // ← Vite にはあった
    isDepCheckModalOpen ||
    isZipModalOpen ||
    Boolean(confirmDialogProps.isOpen);
```

**影響**: `/mod/[slug]` にソフトナビした状態 (URL 付きモーダル表示中) で:
- モバイルで背景 (Home グリッド) が **touch scroll できてしまう**
- モーダルからはみ出た touch で背景がスクロールする → ユーザーが「モーダルが揺れる」ように感じる
- モーダル外のクリックが背景の Mod カードに反応してしまう可能性

Vite 版では `document.body.style.overflow = 'hidden'` が確実にかかっていた。

**原因**: Next 版では ModDetailModal が `usePathname()` ベースの URL 制御なので、AppShell 側に「Mod 詳細モーダルが開いてる」ことを伝える仕組みが無い。

**推奨修正 (Phase 8):**
```typescript
// AppShell.tsx
const pathname = usePathname();
const isModDetailOpen = pathname?.startsWith('/mod/') ?? false;

const isAnyModalOpen =
  isNewProfileModalOpen ||
  isEditProfileModalOpen ||
  isDepCheckModalOpen ||
  isZipModalOpen ||
  isModDetailOpen ||                 // ← 追加
  Boolean(confirmDialogProps.isOpen);
```

### 12.2 【重大 SEO/UX 退行】`<a href>` タグ数がゼロ

**発見**: Next.js 版 Home HTML には **`<a href>` タグが 0 個**。全てのページ遷移が `router.push()` (JavaScript イベント) で実装されている。`<Link>` の使用は `not-found.tsx` のみ。

| ページ遷移 | Vite 版 | Next.js 版 |
| --- | --- | --- |
| BottomNav の 3 タブ | `<button onClick={setActiveTab}>` (元々 URL 無し) | `<button onClick={router.push}>` (`<a>` にできる) |
| Header ロゴ (`ホームへ`) | `<div role="button" onClick={setActiveTab('home')}>` | `<div role="button" onClick={router.push('/')}>` |
| ModCard クリック | `<div onClick={setDetailProjectId}>` (SPA モーダル) | `<div onClick={router.push('/mod/${id}')}>` |
| 「Modを探しに行く」ボタン (Empty state) | `<button onClick={setActiveTab('home')}>` | `<button onClick={router.push('/')}>` |
| ModDetailModal の閉じるボタン | `<button onClick={setIsOpen(false)}>` | `<button onClick={router.back()}>` |

**影響:**
1. **右クリック / 中クリック で新規タブが開けない** (すべて `<button>` / `<div>` のため)
2. **`rel="prefetch"` が効かない** (Next.js の `<Link>` の自動 prefetch を活用できていない)
3. **SEO クローラーが素の HTML から `<a>` を辿れない** (RSC ペイロード内には存在するが検索エンジンは JS 実行しない)
4. **キーボード Tab 移動での "リンクだけ辿る" 挙動が動作しない** (`<a>` と `<button>` は違う Landmark)

**推奨修正 (Phase 8):** BottomNav, Header ロゴ, ModCard, Empty state ボタンを `<Link>` に置換。

### 12.3 【新規発見: 消失文字列】Vite bundle にあって Next bundle に無い日本語

両 build 済み JS bundle から日本語文字列を Python の正規表現で抽出 (テンプレートリテラルの `${x}` を正規化してから比較) し、片方にしか無い文言を集計:

**Vite bundle にあって Next bundle に無い文言 (16件):**

```
アプリの描画中にエラーが発生し、画面が停止しました。以下を試してください:
「リロード」でページを再読み込み
それでも直らない場合は「ローカルデータを削除してリロード」
エラー詳細を表示
データを削除してリロード
予期しないエラーが発生しました
                                    ← ここまで ErrorBoundary の UI 文言 (6件)
                                       Vite 版 src/components/ErrorBoundary.tsx (175行)
                                       Next.js では未移植 (§9.1 で指摘済)

登録 MOD 数                          ← Hero Banner 右側パネル (§11.3 で指摘済)
名称未設定プロファイル                ← profile.name 空時のフォールバック (下記 §12.4)
詳細本文を読み込んでいます...        ← ModDetail の Body 読み込みスピナー
読み込み中...                       ← ModDetail のヘッダ loading placeholder

対応バージョン一覧 (                 ← 文字列連結方式の差 (下記 §12.7)
ギャラリー・スクリーンショット (
```

**Next bundle にあって Vite bundle に無い文言 (10件):**

```
ホームに戻る                        ← variant="page" 時のフッターボタン (§11.5)
Mod 情報を読み込めませんでした。      ← Server fetch 失敗時の新規エラー表示
このプロファイル向けの対応バージョンは見つかりませんでした。  ← 新規 empty state
[DropMod] sitemap: Modrinth 取得失敗、静的ルートのみ出力:  ← Server サイド ログ
MC ${x} (${x}) • ${x} 個のMod       ← Settings のプロファイル一覧ラベル (Vite と表記微差)
```

### 12.4 【新規発見: 防御コード欠落】`profile?.name || '名称未設定プロファイル'` フォールバックが消滅

**Vite `HomeTab.tsx` (line 88-99):**
```jsx
<span>Minecraft {profile?.mcVersion || '未設定'}</span>
<span>{profile?.loader || '未設定'}</span>
<h2>{profile?.name || '名称未設定プロファイル'}</h2>
<p>{profile?.description || 'Modrinthから...'}</p>
```

**Next `HomeInteractive.tsx` (line 244):**
```jsx
<span>Minecraft {profile.mcVersion}</span>        {/* ← || '未設定' なし */}
<span>{profile.loader}</span>                     {/* ← || '未設定' なし */}
<h2>{profile.name}</h2>                          {/* ← || '名称未設定プロファイル' なし */}
<p>{profile.description || 'Modrinthから...'}</p> {/* description だけは維持 */}
```

**影響**: `useProfiles` の sanitizeLoadedState で通常はガードされるが、Context 移行時に `currentProfile` が一瞬 undefined になるレースがあれば `undefined` が h2 に描画される。防御コードが 4 → 1 に減った。

**推奨修正 (Phase 8):** Optional chaining + フォールバックを復元。

### 12.5 【新規発見: SSR フォールバック不整合】Home の SSR は default profile 固定

**Next `app/page.tsx`:**
```typescript
const SSR_DEFAULT_MC_VERSION = '1.20.1';
const SSR_DEFAULT_LOADER = 'Fabric';

export default async function HomePage() {
  const [searchResult, mcVersions] = await Promise.all([
    fetchModrinthSearch({
      mcVersion: SSR_DEFAULT_MC_VERSION,   // ← 常に 1.20.1
      loader: SSR_DEFAULT_LOADER,           // ← 常に Fabric
      ...
    }),
```

**挙動:**
- LocalStorage に「1.21.4 / Forge」のプロファイルがあるユーザーが Home を開くと:
  1. **SSR HTML**: 1.20.1/Fabric ベースの Mod カード 24 個が届く
  2. **hydration 完了**: LocalStorage 復元 → mcVersion/loader が変わる → useEffect が発火
  3. **CSR re-fetch**: 1.21.4/Forge の 24 個が上書きで表示
  4. **ユーザーには**: 「一瞬 Fabric の Mod が見えて、パッと Forge のに切り替わる」**ちらつき**

Vite 版は SSR 無しの CSR 一直線だから、この現象は起きない (代わりに初期表示自体が遅い)。

**軽減案 (Phase 8):**
- SSR 段階では **抽象的なプレースホルダ (skeleton) だけ返し**、hydration 後に fetch する (SSR の意義を捨てる)
- または、LocalStorage を先読みする inline `<script>` を layout に注入して、SSR を条件分岐にする
- または、静的化を諦めて **cookie-based プロファイル管理**に移行 (要大改修)

### 12.6 【新規発見: `<Image>` 未使用】Modrinth CDN の画像が最適化されていない

**`next.config.ts`:**
```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'cdn.modrinth.com' },
    { protocol: 'https', hostname: 'raw.githubusercontent.com' }
  ]
}
```

**しかし実際の Component:**
```bash
# next/image を import している箇所を検索
$ grep -rn "from 'next/image'" components/ app/
(結果: 0 件)

# <img> タグの使用箇所
$ grep -rn '<img' components/
components/DependencyCheckModal.tsx:673:  <img ... />
components/DependencyCheckModal.tsx:735:  <img ... />
components/MarkdownRenderer.tsx:146:      <img ... />
components/ModCard.tsx:50:              <img ... />
components/ModDetailModalShell.tsx:187:  <img ... />
components/ModDetailModalShell.tsx:270:  <img ... />
components/ModDetailModalShell.tsx:303:  <img ... />
components/ModsPageClient.tsx:288:       <img ... />
components/ModsPageClient.tsx:381:       <img ... />
```

**影響:** Next.js の画像最適化 (WebP/AVIF 変換、srcset 生成、lazy loading、blur placeholder) が **全て効いていない**。`remotePatterns` の設定だけあって使われていない。

**推奨修正 (Phase 8):** ModCard / ModDetailModalShell / ModsPageClient の 9 箇所を `next/image` の `<Image>` に置換。Modrinth の PNG icon が自動で WebP に変換されて 50%〜80% サイズ削減が見込める。

### 12.7 【新規発見: 文字列連結スタイルの一貫化】

**Vite:**
```jsx
<span>対応バージョン一覧 ({versions.length})</span>
<span>ギャラリー・スクリーンショット ({project.gallery.length})</span>
```
→ bundle には `対応バージョン一覧 (` と `)` が別々に残る (2 つの文字列 + JSX children)

**Next:**
```jsx
<span>{`対応バージョン一覧 (${versions.length})`}</span>
<span>{`ギャラリー・スクリーンショット (${project.gallery.length})`}</span>
```
→ bundle には `対応バージョン一覧 (${x})` としてテンプレートリテラル 1 つで残る

**理由**: 過去に他コンポーネントで「JSX 内で日本語と `{変数}` を接続詞で汚く混ぜない」というユーザー指摘を受けた際、テンプレートリテラルに統一する方針で移植したため。

**影響**: **UI 表示は完全に同じ**。i18n 抽出ツール (i18next-parser 等) の互換性がむしろ向上している。

### 12.8 A11y (aria-* / role) 属性の SSR 段階出現数

curl で取得した Home HTML を直接 grep:

| 属性 | Vite (SSR HTML) | Next.js (SSR HTML) |
| --- | ---: | ---: |
| `aria-hidden="true"` | 0 | **21** |
| `aria-pressed="false"` | 0 | **9** |
| `aria-pressed="true"` | 0 | **1** (Home タブが active) |
| `role="combobox"` | 0 | **2** (プロファイル / ソート dropdown) |
| `aria-haspopup="listbox"` | 0 | **2** |
| `aria-expanded="false"` | 0 | **2** |
| `role="button"` | 0 | **1** (Header ロゴ) |
| `aria-current="page"` | 0 | **1** (BottomNav Home) |
| `aria-label="..."` | 0 | **9** (テーマ切替 / 依存チェック / ZIP保存 / ZIP読込 / プロファイル切り替え / 新規プロファイル作成 / 並び順 / メインナビゲーション / ホーム画面へ移動) |
| **合計** | **0** | **48** |

**影響:** 
- スクリーンリーダー (VoiceOver / NVDA) が **JavaScript 実行前に Landmark と Widget を認識**できる
- Lighthouse Accessibility スコアの `aria-*` 系項目で有利
- キーボード-only ユーザーが Tab 順序を認識できる

Vite 版もハイドレーション完了後は同じ数の aria が付与されるが、**SSR 段階では 0**。→ アクセシビリティ支援ツールとの相性は Next.js が圧勝。

### 12.9 CSS ビルドの font 埋め込み方式

**Vite (`dist/assets/index-CDcqlQEQ.css`, 214KB):**
```css
@font-face {
  font-family: Inter;
  src: url(data:font/woff2;base64,d09GMg...) format("woff2"),
       url(data:font/woff;base64,d09GRg...) format("woff");
}
/* ↑ base64 でフォントを CSS 内に埋め込み */
```

**Next.js (`.next/static/chunks/3phldgbukhn51.css`, 111KB + 別 css 60KB):**
```css
@font-face {
  font-family: Inter;
  src: url(../media/inter-latin-400-normal.abc123.woff2) format("woff2");
}
/* ↑ 別ファイルに分離し、CSS からは URL 参照 */
```

| メトリクス | Vite | Next.js |
| --- | ---: | ---: |
| CSS ファイル合計 | 214 KB (1 個) | 171 KB (2 個) |
| フォント (別ファイル) | 800+ KB (public/assets/) | 800+ KB (.next/static/media/) |
| **CSS + font 単純合計** | ~1.0 MB | ~1.0 MB |
| キャッシュ効率 | ❌ フォントと CSS が一体、CSS 更新でフォント再 DL | ✅ フォント単独、CSS 更新でも Etag ヒット |
| ネットワークリクエスト数 (初回) | 1 (CSS のみ) | 数個 (CSS + 使用フォント) |
| HTTP/2 環境 | 単一 request 有利 | multiplexing で差なし |

**総合評価**: 継続運用時のキャッシュ効率は **Next 圧勝**。初回訪問時のリクエスト数は Vite 有利だが HTTP/2 の multiplexing で差はほぼ無い。

### 12.10 SPA fallback の副作用: API ルートの応答差分

Vite `pnpm preview` (production 静的 hosting 相当) 環境で、Hono プロキシは動かず、全 URL に Home HTML を返す:

| URL | Vite `preview` | Next.js `start` |
| --- | --- | --- |
| `/` | 200 text/html (Home) | 200 text/html (Home SSR) |
| `/mods` | **200 text/html (Home 返却)** | 200 text/html (mods SSR) |
| `/mod/sodium` | **200 text/html (Home 返却)** | 200 text/html (mod 詳細 SSR) |
| `/api/health` | **200 text/html (Home 返却)** ❌ | 200 application/json ✅ |
| `/api/modrinth/tag/game_version` | **200 text/html (Home 返却)** ❌ | 502 application/json (Modrinth 到達不可、正しくプロキシ試行) |
| `/sitemap.xml` | **200 text/html (Home 返却)** ❌ | 200 application/xml ✅ |
| `/robots.txt` | **200 text/html (Home 返却)** ❌ | 200 text/plain ✅ |
| `/nonexistent` | **200 text/html (Home 返却)** ❌ | 404 text/html ✅ |

**Vite の運用リスク**: `pnpm dev` 時のみ Hono API が動作するため、**Vercel/Cloudflare Pages 等の静的 hosting にデプロイすると Modrinth API が完全に死ぬ**。dev / preview / prod で挙動が異なる = **本番環境で想定外の障害**。

Vite 版を実運用するには Node.js サーバ (`@hono/node-server`) を別途起動して同一 origin にリバースプロキシする必要があり、デプロイ複雑度が高い。

Next.js 版はこの問題を **Route Handler で構造的に解消**している。

### 12.11 Next.js の実 First Load JS メトリクス (公式 build 統計)

`.next/diagnostics/route-bundle-stats.json` から実測:

| Route | First Load JS (uncompressed) | 使用 chunks 数 |
| --- | ---: | ---: |
| `/` (Home) | **800 KB** | 9 個 |
| `/mods` | **797 KB** | 9 個 |
| `/settings` | **793 KB** | 9 個 |
| `/mod/[slug]` | **1,126 KB** | 11 個 |
| `/(.)mod/[slug]` | **1,117 KB** | 10 個 |

参考: Vite 版 SPA は **単一 bundle 766 KB** で全ページ共通。

**分析:**
- Home/mods/settings は共通 chunk が多く 800KB 前後で揃う
- Mod 詳細ページは +330KB 追加 (react-markdown + rehype/remark + gsap の詳細ページ限定 chunk)
- Vite 版はページ切替でネットワーク発生ゼロ (初回 766KB 一括読み込み)
- Next 版はページ切替で追加チャンクを取りに行くが、共通部分は browser cache HIT

**結論**: 初回 Home ロード時は Vite が有利 (766KB vs 800KB)、以降のページ遷移は Next.js が有利 (RSC ペイロード 20〜50KB のみ)。継続利用時の総ダウンロード量は Next.js のほうが少ない。

### 12.12 `router.back()` の副作用: 履歴スタック汚染

**Vite 版**: モーダル閉じは `setIsOpen(false)`。ブラウザ履歴は 1 エントリのまま。

**Next 版**: モーダル閉じは `router.back()`。開くたびに `router.push('/mod/[slug]')` で **履歴が積まれる**。

**シナリオ:**
1. Home → Mod A クリック → モーダル (`/mod/A`)
2. モーダル閉じる → Home (`/`)
3. Mod B クリック → モーダル (`/mod/B`)
4. モーダル閉じる → Home (`/`)
5. ブラウザ「戻る」ボタン → **`/mod/B` に戻ってしまう** (Mod B のモーダルが再開する)
6. さらに「戻る」 → `/` (Home)
7. さらに「戻る」 → `/mod/A` (Mod A モーダル再開)
8. さらに「戻る」 → `/` (Home)
9. さらに「戻る」 → 前ページ (別サイト等)

**影響:**
- ブラウザバックの挙動が「モーダルを閉じた後にもう一度モーダルが開く」→ 混乱
- 検索エンジンからのランディング後、ワンクリック戻れない
- ユーザーが「戻る」を連打しないと元のサイトに戻れない (履歴汚染)

**軽減案:**
- `router.push()` の代わりに `router.replace()` を使う (履歴を上書き)
- ただし複数 Mod を渡り歩く場合、履歴が壊れて期待通り戻れない
- Trade-off が微妙、UX 設計次第

### 12.13 loading.tsx / not-found.tsx / error.tsx の配置

Next 版で追加された Suspense/error boundary の配置:

| ファイル | 存在 | 目的 |
| --- | :-: | --- |
| `app/loading.tsx` | ❌ | 存在しない → **Home へ切替時に一瞬何も見えない可能性** |
| `app/error.tsx` | ❌ | 存在しない → **React 例外時デフォルト 500 ページ** |
| `app/global-error.tsx` | ❌ | 存在しない → **`app/error.tsx` も落ちた時のフォールバック** |
| `app/not-found.tsx` | ❌ | 存在しない → 全体の 404 は Next.js デフォルト |
| `app/mod/[slug]/loading.tsx` | ✅ | Mod 詳細ページの Suspense fallback (スケルトン) |
| `app/mod/[slug]/not-found.tsx` | ✅ | Mod 詳細ページ専用の 404 |
| `app/@modal/(.)mod/[slug]/loading.tsx` | ❌ | 存在しない → **モーダル経路で ISR MISS 時に無音待機** |

**影響:**
- 一般ページの loading / error / not-found が Next.js デフォルト (英語) のまま
- Vite 版には `ErrorBoundary` に日本語 UI があった (§12.3 参照)、Next 版はそれが完全に消失

**推奨追加 (Phase 8):**
1. `app/error.tsx` — Vite 版 `ErrorBoundary.tsx` のロジックを移植
2. `app/global-error.tsx` — アプリ全体の最終フォールバック
3. `app/@modal/(.)mod/[slug]/loading.tsx` — モーダル ISR MISS 時のスケルトン
4. `app/loading.tsx` — 全体切替時の共通 skeleton (任意、UX 向上)

### 12.14 theme (dark/light) の初期化 FOUC

**Vite 版:**
- `<html lang="ja" class="dark">` 固定 (index.html)
- `useProfiles` の hydration で LocalStorage 復元 → theme が light に変わる可能性

**Next 版:**
- `<html lang="ja" className="dark">` 固定 (layout.tsx)
- 同じく hydration で light に変わる可能性

**両者共通**: LocalStorage に light 保存済のユーザーが、hydration 完了までの一瞬 dark 画面を見る **FOUC (Flash of Unstyled Content)**。

**Next.js のほうが影響が大きい理由:**
- Vite は空 HTML なので視覚的にはほぼ気付かれない (単に真っ黒→light 切替)
- Next は SSR で dark theme の完全 UI (Header/Grid) を描画してしまうため、「一瞬 dark UI が完全表示 → パッと light に切り替わる」動きが目立つ

**推奨修正 (Phase 8):**
```typescript
// app/layout.tsx の <head> 内に inline script を注入
<script dangerouslySetInnerHTML={{ __html: `
  try {
    const saved = JSON.parse(localStorage.getItem('dropmod_state_v2') || '{}');
    if (saved.theme === 'light') document.documentElement.classList.remove('dark');
  } catch {}
`}} />
```

### 12.15 更新された総括表 (§11.11 の追補)

§11.11 の 17 項目に加えて、§12 で発見した項目:

| # | 差分 | 種別 | 影響度 | 対応 |
| --- | --- | --- | :-: | --- |
| 18 | モーダル open 時の背景スクロールロック抜け (`isAnyModalOpen` の項目漏れ) | **重大 UX バグ** | 🔴 高 | AppShell.tsx に `usePathname()` で `/mod/*` 検知を追加 |
| 19 | `<a href>` タグ数 0 (全部 `router.push()`) | **重大 SEO/UX 退行** | 🔴 高 | BottomNav/Header/ModCard/Empty state を `<Link>` に置換 |
| 20 | ErrorBoundary の日本語 UI 文言 6 件が消失 | 退行 | 🟡 中 | `app/error.tsx` + `app/global-error.tsx` 追加 (§9.1 で既記録) |
| 21 | `profile?.name \|\| '名称未設定プロファイル'` 等の防御コード 3 件消失 | 退行 | 🟢 低 | Optional chaining + フォールバック復元 (5 分) |
| 22 | SSR は default profile 固定 → hydration 後に ちらつき | 新規発生 | 🟡 中 | skeleton SSR + CSR 発火に変更 or cookie 化 |
| 23 | `next/image` 未使用 (`<img>` 9 箇所) | 未活用 | 🟡 中 | ModCard/ModDetailModalShell/ModsPageClient を `<Image>` に |
| 24 | ModDetail の「読み込み中...」「詳細本文を読み込んでいます...」文言消失 | 変更 | 🟢 低 | SSR で fetch 完了しているため不要、モーダル ISR MISS 時のみ `loading.tsx` 追加が望ましい |
| 25 | `router.back()` で履歴スタック汚染 | 変更 | 🟢 低 | UX 判断次第で `router.replace()` に |
| 26 | `app/loading.tsx` / `app/error.tsx` / `app/global-error.tsx` 不在 | 未実装 | 🟡 中 | Phase 8 で追加 |
| 27 | theme FOUC (dark で SSR → hydration で light に一瞬切替) | 新規発生 | 🟢 低 | inline `<script>` で hydration 前に LocalStorage 読取 |
| 28 | Vite `preview` で `/api/*` が Home HTML を返す (SPA fallback) | Vite の元々の制約 | ✅ 解決済 | Next 版で構造的解消 |
| 29 | Vite `preview` で `/sitemap.xml` / `/robots.txt` が Home HTML | Vite の元々の制約 | ✅ 解決済 | Next 版で正しい MIME で応答 |
| 30 | Vite bundle は font を base64 で CSS 埋め込み、Next は分離 | 実装差 | ✅ Next 有利 | (キャッシュ効率) |
| 31 | SSR HTML に aria-* / role 属性が Vite 0 個 → Next 48 個 | 大幅改善 | ✅ Next 有利 | - |
| 32 | 日本語文字列連結: Vite は JSX children、Next はテンプレートリテラル | 実装差 | ✅ 同等 | i18n 抽出容易性は Next 有利 |

### 12.16 発見された修正候補の優先度 (Phase 8+ ロードマップ提案)

以下の順で対応すると効果が高い:

**優先度 🔴 高 (即時対応推奨):**
1. `<a href>` / `<Link>` への置換 (SEO 直結)
2. モーダル背景スクロールロックの復元 (UX バグ)
3. `<title>` タグ重複バグ修正 (§11.6 で既指摘、5 分作業)

**優先度 🟡 中 (次期リリースまでに):**
4. `app/error.tsx` + Vite ErrorBoundary 移植
5. Hero Banner の「登録 MOD 数」パネル復元 (§11.3 で既指摘)
6. `next/image` への置換 (Modrinth 画像最適化)
7. `app/loading.tsx` (全体 skeleton)
8. `app/@modal/(.)mod/[slug]/loading.tsx` (モーダル ISR MISS 時 skeleton)
9. SSR/hydration ちらつき解消 (skeleton or cookie 化)

**優先度 🟢 低 (時間があれば):**
10. `profile?.name || '名称未設定プロファイル'` 等の防御コード復元
11. theme FOUC の inline script 対応
12. `router.replace()` vs `router.push()` の履歴戦略決定

---

*§12 は 2026-08-21 に §11 で拾えなかった低レベル / 隠れた差分を Python + curl + `.next/diagnostics/` のビルド統計から追加調査した結果です。特に §12.1 と §12.2 は本番デプロイ前に修正することを強く推奨します。*

---

*このレポートは Phase 7 完了時点 (2026-08-21, HEAD `260075c`) のリポジトリ状態に基づき生成されました。以降 Phase 8+ で新規ファイル追加や既存ファイル改修があった場合、対応するセクションを追記する運用としてください。*

---

## 13. Phase 8 + Phase 9 追加サマリ (2026-08-23 更新)

§11 と §12 の Phase 7 差分点検を経て、Phase 8 (Dexie + TSQ + Zustand + テスト土台) と Phase 9 (AppContext 撤去 + operationsStore 分割 + テスト強化 + Profiler 測定 + 小改善) が完了した。ここでは **Vite 版 (`.archive/vite/`) との差** ではなく、**Phase 7 完了時 (`260075c`) との差** を追記する。

### 13.1 新規ディレクトリ / ファイル

```
lib/db/                       [Phase 8]
├── dexie.ts                  # 3 テーブル (profiles / apiCache / meta)
└── migrate.ts                # LocalStorage → Dexie 自動移行 + 7 日 backup
lib/query/                    [Phase 8]
├── client.ts                 # QueryClient + Dexie async storage persister
├── hooks.ts                  # useProjectQuery / useVersionsQuery / useProjectsBatchQuery
└── keys.ts                   # canonical queryKeys builder
lib/state/                    [Phase 8]
└── sanitize.ts               # LocalStorage 復元時の pure sanitizer (100% coverage)
lib/store/                    [Phase 8 + Phase 9 増強]
├── profiles.ts               # subscribeWithSelector + devtools middleware
├── toast.ts                  # MAX_VISIBLE_TOASTS=5
├── confirm.ts                # Symbol owner ID 対応 (L7-2)
├── zipExport.ts              [Phase 9-B.1]
├── zipImport.ts              [Phase 9-B.2]
├── depCheck.ts               [Phase 9-B.3]
└── appActions.ts             [Phase 9-A.1] AppShell 由来 action 登録先
components/
├── OfflineBanner.tsx         [Phase 8-B] navigator.onLine subscribe
├── WebVitalsReporter.tsx     [Phase 8-E] LCP/INP/CLS を /api/analytics に送信
├── Providers.tsx             [Phase 8-B] PersistQueryClientProvider ラッパ
└── CacheStatusBadge.tsx      [Phase 9-E.1] 🌐 X 分前のキャッシュバッジ
hooks/
├── useConfirm.ts             [Phase 8-C] Promise-based confirm shim
├── useToasts.ts              [Phase 8-C] shim
└── (既存 useProfiles / useZipExport / useZipImport / useDependencyCheck を shim 化)
__tests__/                    [Phase 8-D 起点、Phase 9-C で 275 tests まで拡張]
├── mocks/                    [Phase 9-C.1] msw handlers + server
├── test-utils/               [Phase 9-C.3] QueryClientProvider wrapper
├── perf/rerender.test.tsx    [Phase 9-D] 軽量 Profiler
└── components / hooks / lib / ...
docs/
├── PHASE8_PLAN.md            [Phase 8]
├── PHASE8_COMPLETE.md        [Phase 8]
├── PHASE9_PLAN.md            [Phase 9] 1629 行
├── PHASE9_C_COMPLETE.md      [Phase 9-C.6]
├── PHASE9_PROFILER.md        [Phase 9-D]
├── CI_SETUP.md               [Phase 8-D、Phase 9-E.7 で加筆]
├── CI_WORKFLOW.yml           [Phase 8-D] 実物ワークフロー保管
└── DEPLOY.md                 [Phase 7 継続]
```

### 13.2 撤去されたコード

- `components/AppContext.tsx` — **stub 化** (Phase 9-A.5): `AppContextValue = Record<string, never>`、`useAppContext()` は throw、`AppContextProvider` は pass-through、全 export @deprecated
- `components/AppShell.tsx` の contextValue useMemo (30+ field) — Phase 9-A.5 で完全撤去、appActionsStore の register useEffect に置換
- `hooks/useProfiles.ts` の sanitizeLoadedState re-export (dead) — Phase 8 第7波 M7-2 で削除
- LocalStorage `dropmod_state_v2` 単独運用 — Dexie 併走 + 7 日 backup 期限管理へ移行 (LocalStorage は移行後 7 日で自動掃除)

### 13.3 設計方針の変化

| 領域 | Phase 7 完了時 | Phase 9 完了時 |
|---|---|---|
| 状態管理 | React `useState` + AppContext | Zustand 7 slice (細粒度 subscription、devtools middleware) |
| 永続化 | LocalStorage 直接 | IndexedDB (Dexie) + LocalStorage 7 日バックアップ、SSR 安全 |
| Modrinth 取得 | client 直呼び (`fetchModrinth`) | TanStack Query (`useQuery`/`useInfiniteQuery`) + Dexie persister (24h TTL、オフライン閲覧可) |
| 依存チェック | `setInterval(5s)` 常時ポーリング | Zustand + TSQ (queryClient.fetchQuery)、profile signature 変化時のみ 1200ms debounce |
| Server → Client 関数受け渡し | Context props | appActionsStore (register/unregister)、Server Component 境界を跨げる形に |
| テスト | ~6% coverage、Zustand store のみ | **91.34% coverage**、msw + user-event + fake-indexeddb で hooks/components integration まで網羅 |
| bundle 最適化 | react-markdown のみ | + @tanstack/react-query + @tanstack/react-query-persist-client (Phase 9-E.8) |
| 再レンダー効率 | Context 巻き添え発生 | 3 シナリオで **80% 削減実測** (Phase 9-D `__tests__/perf/rerender.test.tsx`) |

### 13.4 追加された品質保証

- `__tests__/perf/rerender.test.tsx` — 継続的な再レンダー数リグレッション監視
- `vitest.config.ts` の per-module thresholds — lib/state 95% / lib/store 85% / lib/db 75% / lib/query 70% / lib/modrinth 65% / lib/utils 60% / hooks 70% / components 50% を CI で enforce
- `docs/ops/CI_WORKFLOW.yml` — 3 job (static-checks / build / e2e) + artifact upload、ユーザー配置後に GitHub Actions 実運用開始 (`docs/ops/CI_SETUP.md` 手順あり)
- msw の `onUnhandledRequest: 'error'` — テスト中に実 Modrinth API を叩く事故を即検出

### 13.5 Phase 10 (未実施) 候補

Phase 9 完了時点で意図的に残した項目:

- **Bundle 削減**: FontAwesome の tree-shaking (現状 CSS-only ライブラリでフル、動的 icon 呼び出しの subset 化が課題)
- **Vercel 本番デプロイ**: 設定は Phase 7 で完了済み、実際の公開デプロイは未実施
- **9-E.2**: E-4 Markdown 内画像を `<Image>` 化 (現状は rehype-sanitize の `<img>` フォールバック)
- **9-E.3**: E-5 skeleton 強化 (shimmer 効果)
- AppContext.tsx の**完全削除** (現状は stub、後方互換で残置)
- `optimizePackageImports` に FontAwesome 追加検討 (JS export 皆無なので現状不可)
- Storybook 導入 — Phase 9 のクイズ回答で「小規模個人開発では割に合わない」として不採用

---

*§13 は 2026-08-23 に Phase 8 + Phase 9 完了時点 (HEAD `8247ee0`) の追記です。次回 Phase 10 で再度差分を追記する場合は §14 として続けてください。*
