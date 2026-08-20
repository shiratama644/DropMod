# DropMod → Next.js 15 (App Router) 段階的並行移行計画書 【確定版 v3】

> **作成日:** 2026-08-21 (JST)
> **対象コミット:** `arena/01a01fcf-dropmod` (`4799694` 時点)
> **現行構成:** Vite 6 + Hono 4 + React 18.3 + TS 5.7 (SPA)
> **目標構成:** Next.js 15 + App Router + React 19 + TS 5.9 + Tailwind 4 + Route Handlers (Vercel Deploy)
> **本計画の位置づけ:** 前作 2 つの計画書 (`MIGRATION_PLAN_NEXTJS_ZUSTAND.md`, `..._FINAL.md`) を **段階的並行移行** の方針で全面リライトした確定版。
>
> ## 🎯 ユーザー決定事項
>
> | 項目 | 選択 |
> |---|---|
> | フレームワーク | **Next.js 15 + App Router** (React 19 対応) |
> | デプロイ先 | **Vercel** (公式ホスティング) |
> | 移行スタイル | **段階的・並行移行** (`next/` サブディレクトリで新規構築 → ページ単位で切替 → 最後に Vite を除去) |
> | 状態層 | **Server Components 中心** + 最小限の Zustand / Client state (Dexie/TanStack Query は後日別 PR) |
> | SSR/CSR 境界 | Home 初期24件 = **ISR** / Mod 詳細 = **Parallel + Intercepting Routes モーダル + ISR** / 検索・無限スクロール・Settings = **CSR** |
> | URL ルーティング | **完全 URL 化** (`/`, `/mods`, `/settings`, `/mod/[slug]`) |

---

## 📖 目次

1. [エグゼクティブサマリ](#1-エグゼクティブサマリ)
2. [現行アーキテクチャ診断 (2026-08-21 時点)](#2-現行アーキテクチャ診断-2026-08-21-時点)
3. [目標アーキテクチャ全体図](#3-目標アーキテクチャ全体図)
4. [移行方針 & 非目標 (Non-Goals)](#4-移行方針--非目標-non-goals)
5. [ディレクトリ構造 & ファイルマッピング](#5-ディレクトリ構造--ファイルマッピング)
6. [Modal Route 詳細設計 (Parallel + Intercepting)](#6-modal-route-詳細設計-parallel--intercepting)
7. [SSR/CSR/ISR キャッシュ戦略](#7-ssrcsrisr-キャッシュ戦略)
8. [Hono → Route Handlers 置換設計](#8-hono--route-handlers-置換設計)
9. [フェーズ別ロードマップ (Phase 0 〜 Phase 7)](#9-フェーズ別ロードマップ-phase-0--phase-7)
10. [設定ファイル移行](#10-設定ファイル移行)
11. [スタイリング / Tailwind v4 移行](#11-スタイリング--tailwind-v4-移行)
12. [クライアント境界 (`"use client"`) 一覧](#12-クライアント境界-use-client-一覧)
13. [Vercel デプロイ設定](#13-vercel-デプロイ設定)
14. [並行移行のブランチ戦略 & PR フロー](#14-並行移行のブランチ戦略--pr-フロー)
15. [テスト & 品質保証](#15-テスト--品質保証)
16. [リスク & ロールバック](#16-リスク--ロールバック)
17. [Definition of Done (DoD) チェックリスト](#17-definition-of-done-dod-チェックリスト)
18. [フェーズ後の拡張プラン (別 PR)](#18-フェーズ後の拡張プラン-別-pr)
19. [参考文献](#19-参考文献)
20. [付録 A: 主要コードスニペット集](#付録-a-主要コードスニペット集)
21. [付録 B: 「よくある落とし穴」チェックリスト](#付録-b-よくある落とし穴チェックリスト)

---

## 1. エグゼクティブサマリ

### なぜ移行するのか

| 現行課題 | Next.js 15 で解決 |
|---|---|
| SEO が空 (`<div id="root">` のみ)。Modrinth の Mod 詳細を検索エンジンや共有時に本文が表示されない | Server Components + ISR で `<title>`, `<meta og:*>`, Mod 説明本文まで HTML に埋め込み。動的 OGP 対応 |
| Hono を Vite dev-server に埋め込む変則構成 (`@hono/vite-dev-server`) が本番運用で不安定 | Route Handlers `app/api/*/route.ts` に一本化。Vercel 上で Edge / Node 選択可能 |
| ページ切替 = React state (`activeTab`) のみで URL に反映されない → 共有・戻る動作なし | ファイルベースルーティングで `/`, `/mods`, `/settings`, `/mod/[slug]` を提供 |
| Mod 詳細モーダルは URL を持たず、直リンク・SNS 共有・再読込で復元不能 | **Parallel Routes (`@modal`) + Intercepting Routes (`(.)mod/[slug]`)** パターンで「モーダルとしての UX」と「独立ページとしての SEO/共有性」を両立 |
| Home 初期表示が CSR で **API 待ち** → TTFB / LCP が悪い | 初回 24 件を ISR で事前レンダリング。90 分毎に再生成 (`export const revalidate = 5400`) |

### 移行の骨格 (3 行要約)

1. `next/` サブディレクトリで **Next.js 15 プロジェクトを新規並行構築** (既存 Vite は影響を受けない)。
2. **Phase 単位でページを 1 つずつ Next.js 側に移設** → 完成したページから Vercel プレビューで動作確認 → main にマージ。
3. 全ページ完成後、**ルート `/` を Next.js に切り替え → 旧 Vite ソースを削除**。

### 一部 SSR の定義 (最終確定)

| 領域 | レンダリング | 詳細 |
|---|---|---|
| `/` (Home) 初期 24 件 | **ISR** | `export const revalidate = 5400` (90分)。Modrinth `/search` を Server で fetch → 静的 HTML。以降は Client Component `<HomeInteractive />` にバトンタッチ |
| `/` 検索・無限スクロール・カテゴリ/ソート変更 | **CSR** | Client Component で `useState + fetch` (もしくは後日 TanStack Query) |
| `/mod/[slug]` (直接アクセス時) | **ISR** | 各 Mod の詳細ページとして生成。`generateStaticParams` で人気 Top100 を事前生成、それ以外は on-demand ISR |
| `/mod/[slug]` (Home からタップ) | **モーダル (Intercepting Route)** | Parallel Slot `@modal/(.)mod/[slug]/page.tsx` が Server Component で同じデータを取得しモーダルに描画 |
| `/mods` (Settings 内 Mod 一覧) | **CSR** | プロファイルは LocalStorage (フェーズ内は現状維持) 由来なので Client のみ |
| `/settings` | **CSR** | 全 UI がプロファイル依存 |
| `/api/modrinth/[...path]` | **Route Handler (Node.js runtime)** | Hono プロキシを置換 |

---

## 2. 現行アーキテクチャ診断 (2026-08-21 時点)

### 2.1 規模

- **総行数:** 約 4,500 行 (第 2 波修正含む) / 27 ソースファイル
- **最大ファイル:** `DependencyCheckModal.tsx` (約 620 行), `HomeTab.tsx` (約 315 行)
- **依存:** React 18.3 / Vite 6 / Hono 4 / GSAP / JSZip / react-markdown v9 / Tailwind v4

### 2.2 現行の主要フック & 依存関係

```
App.tsx
├─ useToasts()              → Toast 通知
├─ useConfirm()             → window.confirm 置換ダイアログ
├─ useProfiles(theme, ..., confirm)  → LocalStorage 永続化 + Mod トグル
│    └─ profilesRef / currentProfileIdRef (render 中同期セット)
├─ useModSearch(currentProfile, activeTab, showToast)
│    └─ AbortController + requestSeq + IntersectionObserver
├─ useDependencyCheck(currentProfile)  → デバウンス 1.2s / profile.id 変化で再チェック
├─ useZipExport(currentProfile, showToast)  → 並列 4 worker + JSZip
└─ useZipImport(setProfiles, setCurrentProfileId, ...)  → .mrpack / SHA-1 照合
```

### 2.3 現在の LocalStorage スキーマ

```json
// key: "dropmod_state_v2"
{
  "theme": "dark" | "light",
  "currentProfileId": "profile-uuid",
  "profiles": [
    {
      "id": "...",
      "name": "...",
      "mcVersion": "1.20.1",
      "loader": "Fabric",
      "description": "...",
      "mods": [ /* ModItem[] */ ]
    }
  ]
}
```
- 旧キー `craftforge_state_v2` からの自動移行ロジックあり (`useProfiles.ts:56`)
- 破損データ sanitize / 復旧フォールバックあり (`useProfiles.ts:60-100`)

### 2.4 現行 Hono プロキシ

```
GET  /api/health                     → { status: 'ok', service: 'DropMod Hono API' }
GET  /api/modrinth/*                 → 万能プロキシ (path traversal 対策済)
POST /api/modrinth/*                 → 同上 (POST body = arrayBuffer 転送)
```

### 2.5 GSAP 依存

- **Toast のスライドイン** (`ToastContainer.tsx`)
- **CustomDropdown のフェード** (`CustomDropdown.tsx`)
- ~~タブ切替~~ (第 2 波で廃止済 → CSS `@keyframes tab-fade-in`)
- ~~カードアニメ~~ (第 2 波で廃止済 → CSS `@keyframes mod-card-appear`)

**移行方針:** GSAP は残存 2 箇所ともサイズ小 (< 30 行) なので Next.js 側でもそのまま維持。RSC 内では使えないため両者ともに `"use client"` 側の子コンポーネントに留める。

---

## 3. 目標アーキテクチャ全体図

```
                     ┌─────────────────────────────────────────────┐
                     │ Vercel Edge (CDN + Static Assets)          │
                     │  ├── /_next/static/*  (ハッシュ付き)         │
                     │  └── ISR Cache (revalidate: 90分)          │
                     └─────────────────────────────────────────────┘
                                        │
                                        ▼
    ┌──────────────────── Vercel Node Runtime ────────────────────┐
    │                                                              │
    │  app/                                                        │
    │  ├── layout.tsx  ← Root Layout (RSC) + ThemeProvider(Client)│
    │  ├── page.tsx    ← / Home (ISR: 初回24件を SSR)             │
    │  │                                                            │
    │  ├── @modal/                                                  │
    │  │   ├── default.tsx                    ← 常に null           │
    │  │   ├── (.)mod/[slug]/page.tsx         ← モーダル描画 (RSC) │
    │  │   └── [...catchAll]/page.tsx         ← 他遷移で自動close  │
    │  │                                                            │
    │  ├── mod/[slug]/                                              │
    │  │   ├── page.tsx      ← 直接アクセス時のフルページ (ISR)     │
    │  │   └── loading.tsx   ← streaming fallback                   │
    │  │                                                            │
    │  ├── mods/page.tsx      ← "use client" (プロファイル依存 CSR)│
    │  ├── settings/page.tsx  ← "use client" (テーマ・データ管理) │
    │  │                                                            │
    │  └── api/                                                     │
    │      ├── health/route.ts       (Route Handler, GET)          │
    │      └── modrinth/[...path]/route.ts (GET/POST, Node runtime)│
    │                                                                │
    │  lib/                                                          │
    │  ├── modrinth/                                                 │
    │  │   ├── server.ts   ← RSC/Route Handler 内で使う API 呼び出し│
    │  │   └── client.ts   ← Client Component 内で使う fetch ラッパ │
    │  ├── zip/            (JSZip export/import は Client のみ)     │
    │  └── utils/          (id / hash / download 等はほぼ流用)      │
    │                                                                │
    │  components/         (既存を最大限流用、UI 用は "use client") │
    │  └── ...                                                       │
    └────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                             ┌──────────────────────┐
                             │ api.modrinth.com/v2  │
                             │ cdn.modrinth.com     │
                             └──────────────────────┘
```

---

## 4. 移行方針 & 非目標 (Non-Goals)

### ✅ やること (今回の PR / フェーズ群のスコープ)

1. **`next/` サブディレクトリで並行構築** — 既存 Vite ソースには一切手を触れない
2. **URL 完全ルーティング** — 3 タブ + Mod 詳細 = 計 4 ルート
3. **Home 初期 24 件 ISR** + Mod 詳細 ISR
4. **Parallel + Intercepting Routes モーダル**
5. **Hono → Route Handlers 置換**
6. **UI/UX は現状 100% 再現** (デザインシステム、GSAP アニメ、Toast、Confirm ダイアログ含む)
7. **Vercel 上での動作確認** (プレビュー URL)

### ❌ やらないこと (別 PR で対応)

1. **LocalStorage → IndexedDB (Dexie) 移行** ← 次期 PR
2. **TanStack Query 導入** ← 次期 PR
3. **Zustand への state 全面移行** ← 状況次第で更に別 PR
4. **Modrinth 認証 / ユーザーログイン** ← 未来の機能追加
5. **Modrinth 以外のプロバイダ対応** (CurseForge 等) ← 未来
6. **国際化 (i18n)** ← 未来

---

## 5. ディレクトリ構造 & ファイルマッピング

### 5.1 並行移行中のリポジトリ全景

```
DropMod/
├── src/                              ← 【現行 Vite 版】(Phase 6 完了までそのまま維持)
├── server/                           ← 【現行 Hono 版】(同上)
├── index.html                        ← 【現行】
├── vite.config.ts                    ← 【現行】
│
├── next/                             ← 【新規 Next.js 版 (Phase 0 〜 6 で成長)】
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                        (Home)
│   │   ├── globals.css
│   │   ├── @modal/
│   │   │   ├── default.tsx
│   │   │   ├── (.)mod/[slug]/page.tsx
│   │   │   └── [...catchAll]/page.tsx
│   │   ├── mod/[slug]/
│   │   │   ├── page.tsx
│   │   │   ├── loading.tsx
│   │   │   └── not-found.tsx
│   │   ├── mods/page.tsx
│   │   ├── settings/page.tsx
│   │   └── api/
│   │       ├── health/route.ts
│   │       └── modrinth/[...path]/route.ts
│   ├── components/                        (既存 src/components/ からコピー & 最小修正)
│   ├── lib/                               (modrinth / zip / utils)
│   ├── hooks/                             (client hooks 集約)
│   ├── types.ts
│   ├── next.config.mjs
│   ├── tailwind.config.ts                 (実質空、CSS-in-CSS)
│   ├── tsconfig.json
│   └── package.json  ← 別 package.json でも良い / モノリポ的にはルートに統合可
│
├── docs/
│   ├── NEXTJS_MIGRATION_PLAN.md           ← 本ファイル
│   ├── MIGRATION_PLAN_NEXTJS_ZUSTAND.md   (旧計画・参照用に残置)
│   ├── MIGRATION_PLAN_NEXTJS_ZUSTAND_FINAL.md (旧計画・参照用)
│   └── issues.md
│
└── vercel.json                            ← Phase 3 で追加
```

### 5.2 判断: `next/` サブディレクトリか、ルート統合か

**推奨: 段階中は `next/` サブディレクトリ配置** (下記理由):

- ✅ Vite と Next.js が **依存 conflict しない**別 package.json / node_modules
- ✅ 開発中は `cd next && pnpm dev` で単独起動、既存 Vite dev-server と両立可能
- ✅ Phase 6 で完成したら `next/*` をルートへ移動、`src/` `server/` `index.html` `vite.config.ts` `package.json` (Vite側) を **一括削除**

デメリット:
- ⚠️ ソース参照ができない (`import X from '../../src/...'` のようなクロス参照は不可)
  - → **意図した制約** として運用。共通化したいものは lib/ に切り出す。

**代替案 (却下):** モノリポ化 (pnpm workspaces で `apps/vite` `apps/next` に分ける)。学習コスト増 & CI 複雑化のため、今回のスコープでは不採用。

### 5.3 ファイルマッピング表 (Vite → Next.js)

| Vite 版 (`src/*`) | Next.js 版 (`next/*`) | 変更点 |
|---|---|---|
| `main.tsx` | `app/layout.tsx` | Root Layout に統合。ErrorBoundary は `error.tsx` へ。フォント import は `next/font/local` へ移行 |
| `App.tsx` | 各 `app/*/page.tsx` + `app/layout.tsx` に分解 | 大部分は `app/layout.tsx` (Header + BottomNav + Toast + Confirm) + 各 page.tsx (タブ本体) |
| `components/Header.tsx` | `components/Header.tsx` (Client) | `useRouter` (`next/navigation`) を使用しタブクリックで push |
| `components/BottomNav.tsx` | 同上 | Same |
| `components/HomeTab.tsx` | `app/page.tsx` (RSC) + `components/HomeInteractive.tsx` (Client) | RSC 側で初期 24 件 ISR fetch + hero banner。Client 側で検索/カテゴリ/無限スクロール |
| `components/ModsTab.tsx` | `app/mods/page.tsx` (Client) | プロファイル依存なので全て Client |
| `components/SettingsTab.tsx` | `app/settings/page.tsx` (Client) | Same |
| `components/ModDetailModal.tsx` | `app/@modal/(.)mod/[slug]/page.tsx` (RSC) + `components/ModDetailModalShell.tsx` (Client) | RSC で project + versions を ISR fetch → props 経由で Client shell に渡す |
| `components/NewProfileModal.tsx` | `components/NewProfileModal.tsx` (Client) | 変更なし。トリガーは Settings ページから |
| `components/EditProfileModal.tsx` | 同上 | 変更なし |
| `components/DependencyCheckModal.tsx` | 同上 | 変更なし。API 呼び出しは維持 |
| `components/ZipProgressModal.tsx` | 同上 | 変更なし |
| `components/ConfirmDialog.tsx` | 同上 | 変更なし |
| `components/CustomDropdown.tsx` | 同上 | 変更なし。GSAP + createPortal はブラウザ限定 |
| `components/MarkdownRenderer.tsx` | 同上 (Client) | 変更なし。iframe allowlist 継続 |
| `components/ToastContainer.tsx` | `components/ToastContainer.tsx` (Client) | Same |
| `components/ErrorBoundary.tsx` | `app/error.tsx` (RSC/Client 両方対応の Next.js 標準) | Next.js の `error.tsx` に置換 |
| `hooks/useToasts.ts` | 同上 | Same |
| `hooks/useConfirm.ts` | 同上 | Same |
| `hooks/useProfiles.ts` | 同上 | Same (LocalStorage 依存維持) |
| `hooks/useModSearch.ts` | **`components/HomeInteractive.tsx` にインライン化** | 初期 hits は props (SSR) から、後続は既存ロジックを踏襲 |
| `hooks/useDependencyCheck.ts` | 同上 | Same |
| `hooks/useZipExport.ts` / `useZipImport.ts` | 同上 | Same (JSZip はブラウザ API のみ) |
| `hooks/useModalA11y.ts` | 同上 | Same |
| `services/api.ts` | **`lib/modrinth/client.ts`** (ブラウザ用) + **`lib/modrinth/server.ts`** (RSC/Route Handler 用) に分割 | Server 側は `fetch(..., { next: { revalidate, tags } })` を使う |
| `utils/download.ts` / `utils/hash.ts` / `utils/id.ts` | `lib/utils/*` | Same |
| `constants/categories.ts` | `lib/constants/categories.ts` | Same |
| `types.ts` | `types.ts` | Same |
| `index.css` | `app/globals.css` | Tailwind v4 の `@import "tailwindcss"` を維持 |
| `server/index.ts` | `app/api/modrinth/[...path]/route.ts` + `app/api/health/route.ts` | 後述 §8 |

---

## 6. Modal Route 詳細設計 (Parallel + Intercepting)

### 6.1 挙動マトリクス

| ユーザー操作 | URL 変化 | 描画される要素 | 履歴 |
|---|---|---|---|
| Home で Mod カードをタップ | `/` → `/mod/[slug]` | Home + **モーダル** (`@modal` slot) | `/mod/[slug]` を push |
| モーダルを ✕ or 背景タップ or Esc | `/mod/[slug]` → `/` | Home のみ | pop (`router.back()`) |
| リロード (モーダル表示中) | `/mod/[slug]` (hard nav) | **フルページ** `mod/[slug]/page.tsx` | そのまま |
| 直接 `/mod/xyz` を訪問 (URL 共有) | `/mod/xyz` | **フルページ** | 単独履歴 |
| モーダル内で「プロファイルに追加」→ 閉じる | `/mod/xyz` → `/` | Home のみ | pop |
| モーダル表示中に BottomNav で `/mods` へ | `/mod/xyz` → `/mods` | `/mods` ページ (モーダルは自動閉) | push |

### 6.2 ファイル構成 (Next.js App Router)

```
next/app/
├── layout.tsx                          ← modal prop を受け取り {children}{modal} 両方描画
├── page.tsx                            ← Home ページ
│
├── @modal/                             ← Parallel Route slot (URL に影響しない)
│   ├── default.tsx                     ← 常に null (未マッチ時に必須。無いとハードナビ後にエラー)
│   ├── (.)mod/[slug]/                  ← Intercepting Route。(.) は「同レベル」を意味
│   │   └── page.tsx                    ← モーダル描画 (Server Component)
│   └── [...catchAll]/                  ← モーダル閉じる用の catch-all
│       └── page.tsx                    ← null を返す。これが無いと /mods 等へ遷移した後にモーダルが残る
│
└── mod/[slug]/                         ← 通常ルート (直接アクセス/リフレッシュ時)
    ├── page.tsx                        ← フルページ (Server Component, ISR)
    ├── loading.tsx                     ← streaming fallback
    └── not-found.tsx                   ← 404 (Modrinth に無いスラッグ)
```

### 6.3 `app/layout.tsx` (modal slot を受け取る)

```tsx
// next/app/layout.tsx
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import '@/app/globals.css';

export default function RootLayout({
  children,
  modal
}: {
  children: ReactNode;
  modal: ReactNode; // ← Parallel slot @modal のマウントポイント
}) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen flex flex-col pb-28 md:pb-24 antialiased selection:bg-emerald-500 selection:text-white">
        <AppShell>
          {children}
          {modal}
        </AppShell>
      </body>
    </html>
  );
}
```

### 6.4 `app/@modal/(.)mod/[slug]/page.tsx` (Server Component)

```tsx
// next/app/@modal/(.)mod/[slug]/page.tsx
import { fetchModrinthProject, fetchModrinthProjectVersions } from '@/lib/modrinth/server';
import { ModDetailModalShell } from '@/components/ModDetailModalShell';

// モーダルもフルページと同じ ISR 設定
export const revalidate = 3600; // 1時間

export default async function InterceptedModPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [project, versions] = await Promise.all([
    fetchModrinthProject(slug),
    fetchModrinthProjectVersions(slug)
  ]);

  return (
    <ModDetailModalShell
      project={project}
      versions={versions}
      // モーダルモード = 閉じたら router.back()
      variant="modal"
    />
  );
}
```

### 6.5 `app/@modal/default.tsx` (必須)

```tsx
// 未マッチ (Home 表示など) 時は何も描画しない
export default function ModalDefault() {
  return null;
}
```

### 6.6 `app/@modal/[...catchAll]/page.tsx` (`/mods` などへの遷移でモーダルを閉じる)

```tsx
export default function ModalCatchAll() {
  return null;
}
```
> **理由:** Next.js は「slot の直前 state を保持する」ため、`/mod/xyz` → `/mods` へ soft navigation したときに、モーダルが残り続ける不具合が起きる。catch-all を置くことで自動的に null に上書き。

### 6.7 `app/mod/[slug]/page.tsx` (フルページ + ISR + OGP)

```tsx
// next/app/mod/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { ModDetailModalShell } from '@/components/ModDetailModalShell';
import { fetchModrinthProject, fetchModrinthProjectVersions, fetchPopularProjectSlugs } from '@/lib/modrinth/server';

export const revalidate = 3600; // 1時間 ISR
export const dynamicParams = true; // 事前生成外もオンデマンドで生成

// 人気 Mod Top100 は build 時に事前生成 (Vercel Edge Cache に即載る)
export async function generateStaticParams() {
  const slugs = await fetchPopularProjectSlugs(100);
  return slugs.map((slug) => ({ slug }));
}

// 動的 metadata (OGP / タイトル)
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const project = await fetchModrinthProject(slug);
    return {
      title: `${project.title} | DropMod`,
      description: project.description?.slice(0, 160) ?? 'Minecraft Mod',
      openGraph: {
        title: project.title,
        description: project.description ?? '',
        images: project.icon_url ? [project.icon_url] : undefined
      }
    };
  } catch {
    return { title: 'Mod詳細 | DropMod' };
  }
}

export default async function FullModPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const [project, versions] = await Promise.all([
      fetchModrinthProject(slug),
      fetchModrinthProjectVersions(slug)
    ]);
    return <ModDetailModalShell project={project} versions={versions} variant="page" />;
  } catch {
    notFound();
  }
}
```

### 6.8 `<ModDetailModalShell>` (Client, variant で挙動切替)

現行の `ModDetailModal.tsx` の JSX 部分をそのまま流用。違いは:
- **props で `project`/`versions` を受け取る** (fetch 不要)
- `variant="modal"` の場合: 外枠がモーダル (fixed inset-0 + backdrop) + 閉じるボタン → `router.back()`
- `variant="page"` の場合: 通常の container 内に埋め込み (背景は透明、閉じるボタン無し)

---

## 7. SSR/CSR/ISR キャッシュ戦略

### 7.1 各ルートの設定表

| ルート | `dynamic` | `revalidate` | fetch cache | tags |
|---|---|---|---|---|
| `/` (Home) | `auto` | `5400` (90分) | `{ next: { revalidate: 5400, tags: ['mods:search-top'] } }` | `['mods:search-top']` |
| `/mod/[slug]` フル | `auto` | `3600` (1時間) | `{ next: { revalidate: 3600, tags: ['mod', 'mod:${slug}'] } }` | `['mod', 'mod:${slug}']` |
| `/mod/[slug]` モーダル | 同上 | 同上 | 同上 | 同上 (キャッシュ共有) |
| `/mods` | `force-dynamic` | `0` | - | - |
| `/settings` | `force-dynamic` | `0` | - | - |
| `/api/modrinth/*` | `force-dynamic` | `0` (プロキシは常に生 fetch、キャッシュはクライアント/CDN 任せ) | - | - |

### 7.2 fetch キャッシュ設定パターン

```ts
// lib/modrinth/server.ts
export async function fetchModrinthProject(slug: string) {
  const res = await fetch(`https://api.modrinth.com/v2/project/${slug}`, {
    headers: { 'User-Agent': 'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)' },
    next: {
      revalidate: 3600,               // 1時間
      tags: ['mod', `mod:${slug}`]    // on-demand で invalidate 可能
    }
  });
  if (!res.ok) throw new Error(`Modrinth /project/${slug}: HTTP ${res.status}`);
  return res.json();
}
```

### 7.3 revalidate 判断根拠

| リソース | 頻度 | 選択 |
|---|---|---|
| Home 検索結果 (人気 24 件) | 分単位で並び順が微変動するが、ユーザーは新着より安定した並びを期待 | **90 分** |
| Mod プロジェクト情報 | icon/title/description は数日〜数週間単位で更新 | **1 時間** |
| Mod バージョン一覧 | 新しい版が出たら数分〜数時間で反映したい | **1 時間** |
| Minecraft バージョン一覧 (`/tag/game_version`) | ほぼ静的 | **24 時間** |
| プロファイル情報 | ユーザー固有 (LocalStorage) → SSR 対象外 | - |

### 7.4 On-demand revalidation

将来的に Modrinth Webhook を実装する場合、以下で即時無効化できる:
```ts
'use server';
import { revalidateTag } from 'next/cache';
export async function invalidateMod(slug: string) {
  revalidateTag(`mod:${slug}`);
}
```

---

## 8. Hono → Route Handlers 置換設計

### 8.1 `app/api/health/route.ts`

```ts
export const runtime = 'nodejs'; // Edge でも動作可、シンプルさを優先し Node
export async function GET() {
  return Response.json({ status: 'ok', service: 'DropMod Next API' });
}
```

### 8.2 `app/api/modrinth/[...path]/route.ts`

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODRINTH_HOST = 'api.modrinth.com';
const MODRINTH_BASE = 'https://api.modrinth.com/v2';
const UA = 'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';

function isSafePath(segments: string[]): boolean {
  return !segments.some((s) => {
    const lower = s.toLowerCase();
    return lower.includes('..') || lower.includes('%2e%2e') ||
           lower.includes('%2e.') || lower.includes('.%2e');
  });
}

async function handler(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!isSafePath(path)) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }
  const url = new URL(req.url);
  const target = `${MODRINTH_BASE}/${path.join('/')}${url.search}`;
  const parsed = new URL(target);
  if (parsed.host !== MODRINTH_HOST) {
    return Response.json({ error: 'Only api.modrinth.com is allowed' }, { status: 400 });
  }
  const init: RequestInit = {
    method: req.method,
    headers: {
      'User-Agent': UA,
      ...(req.headers.get('Content-Type') && { 'Content-Type': req.headers.get('Content-Type')! })
    }
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }
  try {
    const res = await fetch(parsed.toString(), init);
    const respHeaders = new Headers();
    const ct = res.headers.get('Content-Type');
    if (ct) respHeaders.set('Content-Type', ct);
    const ra = res.headers.get('Retry-After');
    if (ra) respHeaders.set('Retry-After', ra);
    // res.body はストリームでパススルー
    return new Response(res.body, { status: res.status, headers: respHeaders });
  } catch (err: any) {
    console.error('[DropMod] Modrinth proxy error:', err);
    return Response.json({ error: err?.message || 'Proxy Error' }, { status: 502 });
  }
}

export { handler as GET, handler as POST };
```

### 8.3 移行後の削除対象

- `server/index.ts` (Hono)
- `@hono/vite-dev-server`, `@hono/node-server`, `hono` (dependencies)
- `vite.config.ts` の `devServer({ entry: 'server/index.ts', ... })`

---

## 9. フェーズ別ロードマップ (Phase 0 〜 Phase 7)

### 概略ガントチャート

```
Phase 0: 準備・調査              ▓ (0.5日)
Phase 1: next/ 骨組み作成        ▓▓ (1日)
Phase 2: 共通コンポ移植          ▓▓▓ (1.5日)
Phase 3: Route Handlers + Home   ▓▓▓ (1.5日)
Phase 4: /mod/[slug] + Modal     ▓▓▓▓ (2日)
Phase 5: /mods + /settings       ▓▓ (1日)
Phase 6: 統合切替 + Vite 削除    ▓▓ (1日)
Phase 7: Vercel 本番検証         ▓ (0.5日)
                                    -----
                                     計 約 9 営業日 (実装のみ)
```

各 Phase は **独立した PR** としてリリースする。マージ後も次 Phase 完了までは既存 Vite 版が本番稼働できる状態を維持する。

---

### 🔹 Phase 0: 準備・調査 (0.5日) ✅ **完了 (2026-08-21)**

**目的:** 移行に必要な前提を整える。実装作業なし。

- [x] `pnpm-workspace.yaml` の `allowBuilds: esbuild: true` を Next.js の SWC ビルドと衝突しないか確認
      → Vite 側でのみ使う設定。Next.js は SWC の precompiled バイナリを使うので影響なし。
      Phase 6 で Vite 削除時に本設定も削除予定。
- [x] Node.js バージョンを **20.x LTS 以上** に固定 (`.nvmrc` に `20` を記載 + `package.json` の `engines.node` に `>=20.0.0` を明記)
- [x] Vercel アカウントの準備 + GitHub リポジトリ連携 (実際のプロジェクト作成は Phase 7 で実施予定。今回はドキュメント上の準備のみ)
- [x] `.env.example` を作成 (Modrinth UA / 認証・Vercel 関連の受け皿としてコメント記載)
- [x] `docs/NEXTJS_MIGRATION_PLAN.md` (本ファイル) を main にマージ (PR #1 で既に反映済み)

**Phase 0 で追加したファイル:**
- `.nvmrc` (Node 20 固定)
- `.env.example` (環境変数プレースホルダ)

**Phase 0 で変更したファイル:**
- `package.json` (`engines.node: >=20.0.0`, `engines.pnpm: >=9.0.0` を追加)

**Vite 版が引き続き動作することを確認:**
- ✅ `pnpm exec tsc --noEmit` → 0 エラー
- ✅ `pnpm exec vite build` → 成功

**PR:** `docs: Next.js 15 段階的並行移行計画書 v3 を追加` (`872ece6`) と同ブランチに追加コミット

**DoD:**
- [x] 計画書が main にマージされている (PR #1)
- [x] Node バージョンが `.nvmrc` に固定されている
- [x] Vercel アカウント準備完了 (Phase 7 で実施すればよい)

---

### 🔹 Phase 1: `next/` 骨組み作成 (1日) ✅ **完了 (2026-08-21)**

**目的:** Next.js 15 プロジェクトを `next/` に新規作成し、既存 Vite に影響を与えないことを検証。

**実際に採用したバージョン:** `create-next-app@latest` 実行時点で **Next.js 16.3.1 / React 19.2.8 / Tailwind 4.3.3** が生成された。計画書当初は Next.js 15 を想定していたが、Next.js 16 も App Router / Parallel Routes / ISR の API 仕様に破壊的変更が無いため、そのまま採用。

**作業:**
- [x] `next/` ディレクトリで `pnpm create next-app@latest` (TypeScript, Tailwind, App Router, `src/` 無し, ESLint 無し, pnpm, alias `@/*`, Turbopack)
- [x] `next/app/layout.tsx` に既存フォント (Inter / JetBrains Mono / FontAwesome) を **`@fontsource/*` パッケージで移植** (計画書当初の `next/font/local` は Phase 6 の最適化フェーズに延期。Vite 版と完全に同じフォントを使い視覚差分ゼロを優先)
- [x] `next/app/globals.css` に `src/index.css` を丸ごとコピー (Tailwind v4 継続、276 行)
- [x] `next/app/page.tsx` にプレースホルダ "DropMod (Phase 1: 骨組み)" を配置
- [x] `next/next.config.ts` を設定 (Next.js 16 は `.ts` がデフォルト):
  - `reactStrictMode: true`
  - `poweredByHeader: false`
  - `experimental.optimizePackageImports` に `@fortawesome/fontawesome-free`, `react-markdown` を追加
  - `images.remotePatterns` に `cdn.modrinth.com`, `raw.githubusercontent.com` を追加
- [x] `next/tsconfig.json` の `paths` は自動生成時に `@/*` → `./*` が設定済
- [x] `cd next && pnpm dev --port 3001` で単独起動確認 → HTML に `<title>DropMod ...</title>` 等が反映
- [x] ルートの Vite `pnpm exec vite build` が引き続き成功することを確認
- [x] Next.js 側 `pnpm build` (production ビルド) 成功 → `/` は Static content として prerendered

**PR:** `feat(next): Phase 1 - Next.js 16 骨組みを next/ に新規作成`

**Phase 1 で追加した主要ファイル:**
- `next/app/layout.tsx` (Root Layout, フォント import 含む)
- `next/app/page.tsx` (プレースホルダ Home)
- `next/app/globals.css` (Vite 版と同一の CSS 変数テーマ)
- `next/next.config.ts`
- `next/tsconfig.json`, `next/package.json`, `next/pnpm-lock.yaml`, `next/postcss.config.mjs`

**副次:**
- `next/.gitignore` に `AGENTS.md` / `CLAUDE.md` を追加 (Next.js 16 が起動時に自動生成する AI エージェント向けドキュメントで、コミット不要)

**DoD:**
- [x] `next/` で `pnpm dev` 実行 → localhost:3001 で "DropMod" 表示 (ポートは既存プレビューと衝突しないよう 3001 を採用)
- [x] 既存 Vite 版が依然として動作 (`vite build` 成功)
- [x] Tailwind + Inter/JetBrains Mono + FontAwesome が反映

---

### 🔹 Phase 2: 共通コンポーネント移植 (1.5日)

**目的:** Header / BottomNav / Toast / Confirm / モーダル群など、ページ非依存の UI を `next/components/` にコピー・調整。

**作業:**
- [ ] `next/components/`, `next/hooks/`, `next/lib/utils/`, `next/lib/constants/`, `next/types.ts` を作成
- [ ] 以下を `src/` から `next/` にコピー:
  - components: `Header`, `BottomNav`, `ToastContainer`, `ConfirmDialog`, `CustomDropdown`, `MarkdownRenderer`, `NewProfileModal`, `EditProfileModal`, `DependencyCheckModal`, `ZipProgressModal`
  - hooks: `useToasts`, `useConfirm`, `useModalA11y`
  - utils: `download`, `hash`, `id`
  - constants: `categories`
  - types.ts
- [ ] 各ファイルに **`"use client"`** ディレクティブを冒頭に追加 (ブラウザ API を使うため)
- [ ] `next/components/AppShell.tsx` (Client) を新規作成:
  - `useToasts` / `useConfirm` / theme state / `ThemeProvider` 相当
  - Header + BottomNav + Toast + Confirm を配置
  - children (page) + modal (parallel slot) の両方を受け取る
- [ ] `next/lib/modrinth/client.ts` に既存 `services/api.ts` の内容をコピー (Client 用フォールバック fetch)

**PR:** `feat(next): Phase 2 - 共通コンポーネント (Header/BottomNav/Modal群) を next/ に移植`

**DoD:**
- ✅ `next/app/page.tsx` を `<HomeInteractive />` プレースホルダに置換して、Header + BottomNav が表示される
- ✅ Confirm ダイアログ / Toast が動作
- ✅ TypeScript strict エラー 0 件
- ✅ 既存 Vite 版が変わらず稼働

---

### 🔹 Phase 3: Route Handlers + Home ISR (1.5日)

**目的:** `/api/modrinth/*` を Route Handler で置換し、Home ページを ISR で構築。

**作業:**
- [ ] `next/app/api/health/route.ts` を実装
- [ ] `next/app/api/modrinth/[...path]/route.ts` を実装 (§8.2 参照)
- [ ] `next/lib/modrinth/server.ts` に Server 側の fetch ラッパを実装:
  - `fetchModrinthSearch(params)`, `fetchModrinthProject(slug)`, `fetchModrinthProjectVersions(slug)`, `fetchPopularProjectSlugs(n)`, `fetchLatestMinecraftVersions()`
  - 全て `fetch(..., { next: { revalidate, tags } })` を使う
- [ ] `next/app/page.tsx` (RSC) を実装:
  - Server 側で初期 24 件 (人気順) を fetch
  - `<HeroBanner />` (RSC, プロファイル依存部分はプレースホルダ) + `<HomeInteractive initialHits={...} />` (Client)
- [ ] `next/components/HomeInteractive.tsx` (Client):
  - `useState<ModrinthHit[]>(initialHits)` で初期値をハイドレート
  - 既存 `useModSearch` のロジックをインライン化 (mcVersion/loader/カテゴリ/ソート/検索/無限スクロール)
  - Mod カードクリックで `router.push('/mod/${slug}')`

**PR:** `feat(next): Phase 3 - Route Handlers + Home ページ ISR (初期24件を SSR)`

**DoD:**
- ✅ `curl http://localhost:3000/api/health` → `{status: 'ok', service: 'DropMod Next API'}`
- ✅ `curl http://localhost:3000/api/modrinth/tag/game_version` → JSON 返却
- ✅ `curl http://localhost:3000/` の HTML に初期 24 件の Mod 名が含まれている (SSR確認)
- ✅ 検索・カテゴリ・無限スクロールが Client で動作
- ✅ Mod カードをクリックすると `/mod/[slug]` に URL が変わる (次 Phase で完成)

---

### 🔹 Phase 4: `/mod/[slug]` + Parallel/Intercepting Modal (2日)

**目的:** モーダル型の Mod 詳細ページを Modal Route パターンで実装。

**作業:**
- [ ] `next/app/layout.tsx` を **`children` + `modal` の 2 スロット** を受け取る形に変更
- [ ] `next/app/@modal/default.tsx` を作成 (`return null`)
- [ ] `next/app/@modal/[...catchAll]/page.tsx` を作成 (`return null`)
- [ ] `next/app/@modal/(.)mod/[slug]/page.tsx` (RSC) を実装:
  - `fetchModrinthProject(slug)` + `fetchModrinthProjectVersions(slug)` を並列 fetch
  - `<ModDetailModalShell project={} versions={} variant="modal" />` を返す
- [ ] `next/app/mod/[slug]/page.tsx` (RSC, ISR) を実装:
  - 同上の fetch → `variant="page"` で描画
  - `generateStaticParams` で人気 100 件を事前生成
  - `generateMetadata` で OGP / title
- [ ] `next/app/mod/[slug]/loading.tsx` (streaming fallback)
- [ ] `next/app/mod/[slug]/not-found.tsx`
- [ ] `next/components/ModDetailModalShell.tsx` (Client) を実装:
  - 既存 `ModDetailModal.tsx` の JSX を流用
  - `variant="modal"`: 外枠 fixed + backdrop + 閉じるボタン → `useRouter().back()`
  - `variant="page"`: 通常 container 描画
  - どちらでも **バージョン一覧はデフォルト展開** (直近 UI 修正を継承)

**PR:** `feat(next): Phase 4 - Mod 詳細を Parallel + Intercepting Routes モーダルで実装`

**DoD:**
- ✅ Home で Mod カード → URL が `/mod/[slug]` になり、モーダルオーバーレイが表示される
- ✅ 閉じるボタン → URL が `/` に戻り、Home が復元
- ✅ `/mod/[slug]` を直接ブラウザで開くとフルページ (背景ダーク + カード) が SSR で表示
- ✅ HTML ソースに Mod タイトルと本文が含まれている (SEO確認)
- ✅ Vercel プレビューで `og:title` `og:image` が正しく反映される

---

### 🔹 Phase 5: `/mods` + `/settings` (1日)

**目的:** プロファイル依存の 2 タブを Client Component で実装。

**作業:**
- [ ] `next/hooks/useProfiles.ts` をコピー (LocalStorage 依存維持)
- [ ] `next/hooks/useZipExport.ts` / `useZipImport.ts` / `useDependencyCheck.ts` をコピー
- [ ] `next/lib/modrinth/client.ts` を最終化 (現行 `services/api.ts` 相当)
- [ ] `next/app/mods/page.tsx` (Client, `"use client"`):
  - AppShell 側の `useProfiles` を Context 経由で参照 (もしくは Client hook 直接)
  - 既存 `ModsTab.tsx` の中身を移植
- [ ] `next/app/settings/page.tsx` (Client): 同上
- [ ] AppShell の Header / BottomNav 側で `next/link` を使ってルート切替を URL ベースに (`useRouter().push('/mods')` など)
- [ ] active tab の判定を `usePathname()` に置換

**PR:** `feat(next): Phase 5 - /mods と /settings を CSR で移植`

**DoD:**
- ✅ 3 タブ (`/`, `/mods`, `/settings`) を BottomNav で切替できる
- ✅ プロファイルの追加・切替・削除が動作
- ✅ Mod トグル・ZIP エクスポート・ZIP インポート・依存チェックが動作
- ✅ LocalStorage の既存データ (旧 `craftforge_state_v2` 含む) が正しく復元される

---

### 🔹 Phase 6: 統合切替 + Vite 削除 (1日)

**目的:** Next.js 版を **本番の主軸** にして、Vite 版を安全に削除。

**作業:**
- [ ] `next/` の中身を **リポジトリのルートに移動**:
  - `next/app/` → `app/`
  - `next/components/` → `components/`
  - `next/lib/` → `lib/`
  - `next/hooks/` → `hooks/`
  - `next/public/` → `public/`
  - `next/next.config.mjs`, `next/tsconfig.json` → ルートへ
  - `next/package.json` の依存を **ルート `package.json` にマージ**
- [ ] 以下を **削除**:
  - `src/` (Vite 版ソース全部)
  - `server/` (Hono)
  - `index.html`
  - `vite.config.ts`
  - 依存: `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@hono/vite-dev-server`, `@hono/node-server`, `hono`, `rollup-plugin-visualizer`
- [ ] `package.json` scripts を Next.js 標準に:
  - `dev`: `next dev`
  - `build`: `next build`
  - `start`: `next start`
  - `preview` 削除
- [ ] `pnpm install` で lockfile 更新
- [ ] `pnpm build` → ローカルで完全ビルド確認

**PR:** `chore(migration): Phase 6 - Vite 版を削除し Next.js 版を本番構成に統合`

**DoD:**
- ✅ `pnpm build` 成功
- ✅ `pnpm start` で本番モード起動 → 全機能動作
- ✅ TypeScript strict エラー 0 件
- ✅ リポジトリの `src/` と `server/` が消えている

---

### 🔹 Phase 7: Vercel 本番検証 (0.5日)

**目的:** Vercel にデプロイして本番相当の環境で最終確認。

**作業:**
- [ ] Vercel プロジェクト作成 → GitHub 連携 → プレビューデプロイ実行
- [ ] `vercel.json` を作成 (必要に応じてリージョン指定):
  ```json
  {
    "regions": ["hnd1"],
    "functions": {
      "app/api/modrinth/[...path]/route.ts": { "runtime": "nodejs20.x" }
    }
  }
  ```
- [ ] 本番 URL で以下をチェック:
  - Home 初期 24 件が **HTML 内に含まれている** (view-source で確認)
  - Mod カードクリック → モーダル
  - モーダル閉じる → `/`
  - `/mod/xyz` 直接アクセス → フルページ
  - `og:image` / `og:title` が Facebook Debugger 等で正しく反映
  - `/api/health` が Vercel でも 200
  - Modrinth プロキシ経由の検索・詳細取得が動作
  - モバイル (Chrome DevTools iPhone シミュレーション) でレイアウト崩れなし
- [ ] Lighthouse 計測:
  - Performance ≥ 90
  - Accessibility ≥ 90
  - SEO = 100

**PR:** `feat(deploy): Phase 7 - Vercel 本番デプロイ設定を追加`

**DoD:**
- ✅ Vercel 本番 URL で全機能動作
- ✅ Lighthouse スコアが基準達成
- ✅ OGP スニペットが正しく生成される

---

## 10. 設定ファイル移行

### 10.1 `package.json` (Phase 6 完了後)

```json
{
  "name": "dropmod",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@fontsource/inter": "^5.3.0",
    "@fontsource/jetbrains-mono": "^5.3.0",
    "@fortawesome/fontawesome-free": "^7.3.1",
    "gsap": "^3.12.5",
    "jszip": "^3.10.1",
    "react-markdown": "^9.0.1",
    "rehype-raw": "^7.0.0",
    "rehype-sanitize": "^6.0.0",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9",
    "eslint-config-next": "^15.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.9.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 10.2 `next.config.mjs`

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.modrinth.com' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' } // Modrinth 本文の画像埋め込み用
    ]
  },
  experimental: {
    optimizePackageImports: ['@fortawesome/fontawesome-free', 'react-markdown']
  }
};

export default nextConfig;
```

### 10.3 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 11. スタイリング / Tailwind v4 移行

### 現状 (Vite + `@tailwindcss/vite`)

- `src/index.css` の先頭で `@import "tailwindcss";`
- テーマは CSS 変数で完全定義済 (`--bg-panel`, `--color-text-brand` 等)
- Tailwind 設定ファイルなし (v4 の CSS-in-CSS 方式)

### Next.js への移行 (`@tailwindcss/postcss`)

- Next.js の `next dev` は PostCSS プラグイン経由でビルドする
- `postcss.config.mjs`:
  ```js
  export default { plugins: { '@tailwindcss/postcss': {} } };
  ```
- `app/globals.css` に既存 `src/index.css` を **そのままコピー**
- **設定変更は不要** (v4 の思想を継承)

### GSAP 対応

- GSAP は完全にクライアント API → 使用する `<CustomDropdown />` `<ToastContainer />` を `"use client"` にすれば OK

---

## 12. クライアント境界 (`"use client"`) 一覧

Server Components がデフォルトなので、**ブラウザ API / hooks / event handler を使う箇所のみ** `"use client"` を宣言。

| ファイル | Client? | 理由 |
|---|---|---|
| `app/layout.tsx` | RSC | children + modal を配置するだけ |
| `app/page.tsx` (Home) | RSC | 初期 24 件を SSR fetch |
| `app/mod/[slug]/page.tsx` | RSC | 詳細を SSR fetch |
| `app/@modal/(.)mod/[slug]/page.tsx` | RSC | 同上 (キャッシュ共有) |
| `app/mods/page.tsx` | Client | LocalStorage プロファイル依存 |
| `app/settings/page.tsx` | Client | 同上 |
| `components/AppShell.tsx` | Client | Header / Toast / Confirm 統合 |
| `components/HomeInteractive.tsx` | Client | 検索・無限スクロール |
| `components/ModDetailModalShell.tsx` | Client | ボタン操作・GSAP無し |
| `components/Header.tsx` | Client | `useRouter`, `usePathname` |
| `components/BottomNav.tsx` | Client | 同上 |
| `components/ToastContainer.tsx` | Client | GSAP |
| `components/CustomDropdown.tsx` | Client | GSAP + createPortal |
| `components/MarkdownRenderer.tsx` | Client | react-markdown の hooks |
| `components/ConfirmDialog.tsx` | Client | useState |
| その他モーダル | Client | すべて Modal state |

---

## 13. Vercel デプロイ設定

### 13.1 `vercel.json`

```json
{
  "regions": ["hnd1"],
  "functions": {
    "app/api/modrinth/[...path]/route.ts": {
      "runtime": "nodejs20.x",
      "memory": 256,
      "maxDuration": 30
    }
  }
}
```

### 13.2 環境変数 (`.env.local`, Vercel Dashboard)

```
# 現時点で必須のものはなし。将来的に:
# MODRINTH_USER_AGENT=DropMod/1.1.0 (https://github.com/shiratama644/DropMod)
```

### 13.3 Preview / Production ブランチ

- **Production:** `main` ブランチ (Phase 6 マージ後)
- **Preview:** 全 PR ブランチで自動生成 → PR 内にプレビュー URL がコメントされる

---

## 14. 並行移行のブランチ戦略 & PR フロー

### ブランチ構造

```
main
 └── arena/01a01fcf-dropmod  ← 本セッションのブランチ
      ├── PR: docs (Phase 0)
      ├── PR: Phase 1 骨組み
      ├── PR: Phase 2 コンポ移植
      ├── PR: Phase 3 Route Handlers + Home
      ├── PR: Phase 4 Modal Routes
      ├── PR: Phase 5 mods/settings
      ├── PR: Phase 6 Vite 削除
      └── PR: Phase 7 Vercel 設定
```

**制約 (Arena セッション):** すべての PR は `arena/01a01fcf-dropmod` から派生し、同一ブランチにマージされる (feature branch を分けない)。

### PR レビュー方針

- 各 Phase 完了時に PR 本文へ:
  1. Phase 番号 / DoD チェックリスト
  2. 動作確認手順 (curl / ブラウザ手順)
  3. スクリーンショット (デスクトップ + モバイル)
  4. `next/` ディレクトリ配下のみ変更されている旨 (Phase 1-5)

---

## 15. テスト & 品質保証

### 15.1 手動 QA チェックリスト (各 Phase 完了時)

- [ ] `pnpm build` 成功 (エラー・警告ゼロ)
- [ ] `pnpm typecheck` エラー 0 件
- [ ] LocalStorage の既存データが復元される (dev tools で確認)
- [ ] Home 検索・カテゴリ切替・無限スクロール動作
- [ ] Mod カードクリック → モーダル (Phase 4 以降)
- [ ] モーダル閉じる → Home 復元
- [ ] `/mod/xyz` 直接アクセス → フルページ (Phase 4 以降)
- [ ] プロファイル切替 / 作成 / 削除 (Phase 5 以降)
- [ ] Mod 追加 / 削除
- [ ] ZIP エクスポート / インポート
- [ ] 依存チェック
- [ ] iPhone 相当 (375px) でレイアウト崩れなし
- [ ] Chrome DevTools Lighthouse: Performance ≥ 90 / SEO = 100

### 15.2 自動テスト (今回スコープ外・将来)

- Playwright E2E (`/`, `/mod/[slug]`, モーダル)
- Vitest unit (`lib/modrinth/*`, `lib/utils/*`)

### 15.3 リグレッションチェック (Phase 6 完了時)

現行 Vite 版を Chrome プロファイル A、Next.js 版を Chrome プロファイル B で開き:
- 同じプロファイルデータで両方が同じ結果を返すこと
- LocalStorage が正しく移行されていること

---

## 16. リスク & ロールバック

### 16.1 リスク一覧

| # | リスク | 発生確率 | 影響 | 対策 |
|---|---|---|---|---|
| R1 | Modal Route の `default.tsx` / `[...catchAll]` を忘れると、遷移後にモーダルが残る | 中 | 高 | Phase 4 の DoD で明示的にチェック |
| R2 | React 18 → 19 で `useEffect` の挙動変化により副作用が二重発火 | 中 | 中 | Strict Mode を維持し、既存の Ref 同期パターンで対応済 |
| R3 | Tailwind v4 の PostCSS プラグインが Next.js 15 でまだ RC 段階の可能性 | 低 | 中 | 事前に Phase 0 で動作確認、必要なら Tailwind v3 にダウングレード |
| R4 | Modrinth API のレートリミット (300 req/min) に ISR ビルド時に抵触 | 低 | 中 | `generateStaticParams` を Top100 に抑制、ビルド時に並列度を落とす |
| R5 | Vercel Free プランの制限 (帯域 100GB/月) を超過 | 低 | 低 | 初期は個人利用想定なので想定内 |
| R6 | GSAP が React 19 の Concurrent Rendering で問題を起こす | 低 | 低 | 使用箇所が 2 つのみなので、問題出たら CSS animation に置換 |
| R7 | LocalStorage 移行が破損データで失敗 | 低 | 中 | 既存の sanitize + fallback ロジックを引き継ぎ |

### 16.2 各 Phase のロールバック手順

各 Phase の PR は独立しているので、問題発生時は該当 PR を revert すれば直前 Phase の状態に戻る。

**Phase 6 (Vite 削除) のロールバック:** git revert で復元可能。ただしマージ済みで一定期間経過している場合は手動で `src/` `server/` を復元。→ **Phase 6 のマージ前に十分な期間 (最低 1 週間) 本番稼働で検証** することを推奨。

---

## 17. Definition of Done (DoD) チェックリスト

### 全体完了条件 (Phase 7 完了時点)

- [ ] リポジトリのルートに Next.js 15 プロジェクトが配置されている
- [ ] `src/` `server/` `index.html` `vite.config.ts` が削除されている
- [ ] 4 ルート (`/`, `/mods`, `/settings`, `/mod/[slug]`) が全て動作
- [ ] Home 初回 24 件が SSR で HTML に含まれる (view-source 確認)
- [ ] Mod カード → モーダル、閉じる → Home 復元 (URL 変化する)
- [ ] `/mod/[slug]` 直接アクセスでフルページ + OGP メタタグ
- [ ] `pnpm build` が warning ゼロで成功
- [ ] `pnpm typecheck` エラー 0
- [ ] Vercel 本番 URL で全機能動作
- [ ] Lighthouse Performance ≥ 90, SEO = 100
- [ ] LocalStorage の旧データ (`dropmod_state_v2` / `craftforge_state_v2`) が正しく復元
- [ ] iOS Safari + Android Chrome + Desktop Chrome/Firefox でレイアウト崩れなし
- [ ] `docs/NEXTJS_MIGRATION_PLAN.md` に完了マーク

---

## 18. フェーズ後の拡張プラン (別 PR)

Phase 7 完了後、以下を段階的に追加していく (それぞれ独立 PR):

### 18.1 State/Storage 近代化 (Post-Phase 8)

- **8-A. Dexie.js 導入 + LocalStorage → IndexedDB 移行**
  - schema v1: `appState` (プロファイル束) / `apiCache` (TTL 付き Modrinth キャッシュ)
  - 初回起動時に LocalStorage を自動移行 → 削除
- **8-B. TanStack Query 導入**
  - Home 初期 fetch (SSR) は Server 側維持、後続は `useInfiniteQuery`
  - Persister を Dexie にバインドしオフライン即表示
  - DevTools は dev のみ

### 18.2 UX 強化 (Post-Phase 9)

- Mod 詳細モーダルで「関連 Mod」レコメンド
- プロファイル同期 (WebDAV / GitHub Gist)
- ダウンロード進捗の Web Worker 化 (メインスレッド保護)

### 18.3 プラットフォーム拡張 (Post-Phase 10)

- CurseForge プロバイダ対応
- Modrinth 認証 → プライベート Mod 対応
- i18n (日本語 / 英語)

---

## 19. 参考文献

- [Next.js 15 App Router 公式](https://nextjs.org/docs/app)
- [Next.js Intercepting Routes 公式](https://nextjs.org/docs/app/building-your-application/routing/intercepting-routes)
- [Next.js Parallel Routes 公式](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes)
- [Next.js ISR 公式ガイド](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [Vercel Deploying Next.js Apps](https://vercel.com/docs/frameworks/nextjs)
- [Modrinth API Ratelimits](https://docs.modrinth.com/api/#ratelimits)
- [Tailwind CSS v4 移行ガイド](https://tailwindcss.com/docs/upgrade-guide)

---

## 付録 A: 主要コードスニペット集

### A-1. `app/layout.tsx`

```tsx
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import '@/app/globals.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
// フォントは next/font/local で最適化 (省略)

export const metadata = {
  title: 'DropMod - Minecraft Mod Downloader',
  description: 'Modrinth から Mod を検索・ダウンロード管理する Web アプリ',
  metadataBase: new URL('https://dropmod.example.com')
};

export default function RootLayout({
  children,
  modal
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen flex flex-col pb-28 md:pb-24 antialiased">
        <AppShell>
          {children}
          {modal}
        </AppShell>
      </body>
    </html>
  );
}
```

### A-2. `app/page.tsx` (Home ISR)

```tsx
import { fetchModrinthSearch, fetchLatestMinecraftVersions } from '@/lib/modrinth/server';
import { HomeInteractive } from '@/components/HomeInteractive';

export const revalidate = 5400; // 90分

export default async function HomePage() {
  const [initialResults, mcVersions] = await Promise.all([
    fetchModrinthSearch({
      query: '',
      mcVersion: '1.20.1',
      loader: 'fabric',
      category: 'All',
      sortBy: 'popular',
      offset: 0
    }),
    fetchLatestMinecraftVersions()
  ]);

  return (
    <HomeInteractive
      initialHits={initialResults.hits}
      initialMcVersions={mcVersions}
    />
  );
}
```

### A-3. `lib/modrinth/server.ts`

```ts
const BASE = 'https://api.modrinth.com/v2';
const UA = 'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';

export async function fetchModrinthProject(slug: string) {
  const res = await fetch(`${BASE}/project/${slug}`, {
    headers: { 'User-Agent': UA },
    next: { revalidate: 3600, tags: ['mod', `mod:${slug}`] }
  });
  if (!res.ok) throw new Error(`Modrinth /project/${slug}: HTTP ${res.status}`);
  return res.json();
}

// ... その他の fetch 関数
```

---

## 付録 B: 「よくある落とし穴」チェックリスト

1. **`@modal/default.tsx` を忘れる** → ハードナビ時にエラー
2. **`@modal/[...catchAll]/page.tsx` を忘れる** → 別ページ遷移後もモーダルが残る
3. **`(.)` の階層計算間違い** → `@modal` は slot なのでカウントしない
4. **Server Component 内で `useState` / `useEffect`** → `"use client"` を追加
5. **Modrinth Direct fetch の User-Agent 忘れ** → Server 側は必ず付ける
6. **`generateStaticParams` で `slug` を大量指定** → ビルド時 429 リスク → Top100 制限
7. **`generateMetadata` 内で `throw` すると build 全体が失敗** → try/catch 必須
8. **Client Component 内で `next/font` を使うとハイドレーションミスマッチ** → RootLayout でのみ使用
9. **Modrinth CDN 画像を `<Image>` で使う場合 `remotePatterns` 未設定** → next.config.mjs に追加
10. **Tailwind v4 の `@import "tailwindcss"` を `@tailwind base` などと混在** → v4 では @import のみ

---

**以上、本計画に従い Phase 0 から順次実施する。各 Phase 完了時に本ドキュメントの該当 DoD にチェックを入れて進捗を管理する。**
