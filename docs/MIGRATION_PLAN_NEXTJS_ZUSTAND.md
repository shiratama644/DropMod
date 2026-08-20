# DropMod → Next.js 15 (App Router, 一部SSR) + React + TypeScript + Zustand 完全移行計画書

> **作成日:** 2026-08-20 (JST)  
> **対象コミット:** `8b8f4da` / `arena/01a01f07-dropmod` branch  
> **現行構成:** Vite 6 + Hono 4 + React 18 + TypeScript 5.7 (SPA, 全CSR, `localStorage: dropmod_state_v2`)  
> **目標構成:** Next.js 15 (App Router) + React 19 対応 + TypeScript + Zustand 5 + Tailwind 4 + Route Handlers  
> **検証方法:** 本計画はすべて `web_search` で **Next.js 15 / Zustand 5 の最新公式ドキュメント**を都度参照して作成（推測なし）

---

## 目次
1. [エグゼクティブサマリ](#1-エグゼクティブサマリ)
2. [現行アーキテクチャ診断](#2-現行アーキテクチャ診断)
3. [目標アーキテクチャ設計](#3-目標アーキテクチャ設計)
4. [移行方針・非目標](#4-移行方針非目標)
5. [詳細技術設計](#5-詳細技術設計)
6. [Hono → Next.js Route Handlers 置換設計](#6-hono--nextjs-route-handlers-置換設計)
7. [Zustand 5 ストア設計](#7-zustand-5-ストア設計)
8. [SSR / CSR 境界とキャッシュ戦略](#8-ssr--csr-境界とキャッシュ戦略)
9. [ファイルマッピング (Vite → Next.js)](#9-ファイルマッピング-vite--nextjs)
10. [フェーズ別移行ロードマップ](#10-フェーズ別移行ロードマップ)
11. [設定ファイル移行](#11-設定ファイル移行)
12. [UI / スタイリング / アニメーション移行](#12-ui--スタイリング--アニメーション移行)
13. [データフェッチ・Modrinth API 層の再設計](#13-データフェッチmodrinth-api-層の再設計)
14. [テスト・品質保証計画](#14-テスト品質保証計画)
15. [リスク・ロールバック計画](#15-リスクロールバック計画)
16. [チェックリスト](#16-チェックリスト)
17. [今後の拡張ポイント](#17-今後の拡張ポイント)
18. [参考文献 (最新API検証済み)](#18-参考文献-最新api検証済み)
19. [クイズ：意思決定が必要な事項](#19-クイズ意思決定が必要な事項)

---

## 1. エグゼクティブサマリ

### なぜ移行するのか
| 現行課題 | Next.js 15 で解決 |
|---|---|
| SEOが空の `index.html` (CSRのみ) | App Routerの Server Components + Streaming SSRで初回HTMLをサーバ生成 [6](https://strapi.io/blog/ssr-in-next-js) |
| Hono単独サーバをVite dev-serverに埋め込む構成 (`@hono/vite-dev-server`) は本番運用が複雑 | Next.js Route Handlers に一本化。`app/api/.../route.ts` で完結 [3](https://nextjs.org/docs/app/guides/migrating/from-vite) |
| グローバル状態が `useProfiles` 内の `useState + localStorage` に分散 | Zustand 5 `persist + createJSONStorage + skipHydration` で型安全・永続化・SSR対応を一元化 [5](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) |
| 無限スクロール・検索が都度CSRフェッチ | Server Componentで初期24件をSSR `fetch(..., {next:{revalidate, tags}})` し、以降はClientで追従 → TTFB改善 |

### 一部SSRの定義
- **SSRする**: 初回表示に必須な `/` (HomeTab) の初期Mod一覧、`/mods` のプロファイルサマリ、OGP/SEOに関わるメタ
- **CSRのまま**: 検索入力・無限スクロール追従、モーダル群 (Detail/Dependency/ZipProgress)、ZIP生成/読込 (JSZip + localStorage + IndexedDB的処理)、テーマ切替、Toast

> Next.js 15では **Server Componentsがデフォルト**、必要箇所だけ `"use client"` を付与する [1](https://releasebot.io/updates/vercel/next-js)

---

## 2. 現行アーキテクチャ診断

### 2.1 規模感
- 全体 **4002行** (`src`配下)。最大ファイルは `DependencyCheckModal.tsx` 606行、`HomeTab.tsx` 315行。
- `src/App.tsx` がハブ: `useToasts / useProfiles / useModSearch / useDependencyCheck / useZipExport / useZipImport` を統合し `Header / HomeTab / ModsTab / SettingsTab / 5つのModal` を描画。
- 状態はすべてAppローカル `useState` + `localStorage` 直書き。コンポーネント間は props drilling。

### 2.2 現行ルーティング
- 存在しない（単一 `index.html` + `activeTab: 'home'|'mods'|'settings'` の疑似タブ）。BottomNav / Header が `setActiveTab` で切替、GSAPでフェード。

### 2.3 現行API層
- `server/index.ts` Hono: `GET /api/health`, `ALL /api/modrinth/*` → `https://api.modrinth.com/v2` プロキシ。
- `src/services/api.ts` `fetchModrinth()`: まず `/api/modrinth` (プロキシ) → 失敗時 `https://api.modrinth.com/v2` 直呼び + メモリ `apiCache`。

### 2.4 現行課題の棚卸し
- SSR不可、SEO不可、`window`/`localStorage` 前提でテスト困難
- `useModSearch` 内 `isLoadingMods` 依存の `useCallback` が無限ループしやすい（既知の stale closure）
- `useZipExport` の `Mod` 型は `src/types.ts` で未定義 (`Mod` vs `ModItem` の表記揺れが一部残存)
- `vite.config.ts` の `devServer` エントリがNextでは不要

---

## 3. 目標アーキテクチャ設計

```
┌─────────────────────────────────────────────────────────┐
│  Next.js 15 App Router (React 19)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ app/layout.tsx │→│ app/page.tsx │→│ Server Component│ │
│  │ (RootLayout) │  │ (Home SSR)  │  │ fetch Modrinth  │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
│         │                 │  "use client"                │
│         ▼                 ▼                              │
│  ┌──────────────┐  ┌──────────────┐                      │
│  │ Zustand 5    │  │ Client Comp. │  ← Header/HomeTab/..│
│  │ stores/      │←→│ BottomNav    │                      │
│  │ persist      │  │ ModCard etc  │                      │
│  └──────────────┘  └──────────────┘                      │
│         │                                               │
│  ┌──────────────────────────────────────┐                │
│  │ Route Handlers                        │                │
│  │ app/api/modrinth/[...path]/route.ts  │ → Modrinth API │
│  │ app/api/health/route.ts              │                │
│  └──────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
         │
         ▼
  外部: api.modrinth.com/v2 (User-Agent: DropMod/1.1.0)
  永続化: localStorage (Zustand persist, key: dropmod_state_v2 互換 or 新key + migrate)
```

### ディレクトリ目標像 (Next.js推奨構成 [3](https://nextjs.org/docs/app/guides/migrating/from-vite))
```
/
├── app/
│   ├── layout.tsx                # RootLayout (html lang="ja", <body> + Header + BottomNav + Providers)
│   ├── page.tsx                  # "/"  Home - Server Componentで初期検索SSR
│   ├── mods/
│   │   └── page.tsx              # "/mods" Server Component + Client ModsTab
│   ├── settings/
│   │   └── page.tsx              # "/settings" 主にClient
│   ├── api/
│   │   ├── health/route.ts       # GET
│   │   └── modrinth/[...path]/route.ts # GET/POST/ALL プロキシ
│   ├── globals.css               # 旧 src/index.css を移植 (Tailwind 4)
│   └── loading.tsx / error.tsx / not-found.tsx
├── components/                   # 旧 src/components/* (一部 "use client" 付与)
├── stores/                       # ★新設 Zustand
│   ├── profileStore.ts
│   ├── uiStore.ts                # theme, activeTab, toasts
│   ├── modSearchStore.ts         # 検索状態 (isLoading, hits, pagination) ※一部はServerに移管
│   └── index.ts
├── hooks/                        # 残すのは純粋ロジックのみ (useZipExport等はstore actionへ)
├── lib/
│   ├── api.ts                    # fetchModrinth (Server/Client 共用, fetch拡張対応)
│   ├── modrinth.ts               # 型ヘルパ
│   └── utils/hash.ts
├── types/index.ts                # 旧 src/types.ts
├── constants/categories.ts
├── next.config.ts                # ★新設 (next.config.ts は Next 15から正式サポート) [3](https://nextjs.org/blog/next-15)
├── tsconfig.json                 # Nextプラグイン追加
└── public/                       # 静的アセット
```

---

## 4. 移行方針・非目標

### 方針
- **App Router一択**: Pages Routerは新規では非推奨 [4](https://render.com/articles/how-to-deploy-next-js-applications-with-ssr-and-api-routes)。`app/` ディレクトリに集約。
- **段階移行 (Strangler Fig)**: 一度に全置換せず、Phase 0で Next.js 基盤を立ち上げ、既存コンポーネントを `"use client"` でそのまま動かしつつ、徐々にServer化・Zustand化。
- **互換維持**: `dropmod_state_v2` の localStorage 形式はZustand `persist.migrate` で吸収し、既存ユーザのデータを失わない。
- **型安全最優先**: `typescript.ignoreBuildErrors: false` を維持。

### 非目標 (今回はやらない)
- Turbopack本番ビルドの強制有効化 (Next 15.3でAlpha [4](https://www.sparkleweb.in/blog/next.js_15.3_release:_new_features,_improvements_and_tips) のため `next build --turbopack` はオプション)
- Edge Runtimeへの移行 (`runtime = 'nodejs'` 固定。ModrinthプロキシはNode fetchが安定)
- i18nルーティング (`/ja` 等) は後続フェーズ
- Auth / DB導入

---

## 5. 詳細技術設計

### 5.1 Renderingモード選択

| ページ/コンポーネント | モード | 理由 | 実装 |
|---|---|---|---|
| `app/layout.tsx` | Server (static) | 全ページ共通シェル | `export default function RootLayout` |
| `app/page.tsx` (Home) | **SSR + ISR** | 初回24件をSEO/OGP付きで高速表示 | `fetch(..., {next:{revalidate:60, tags:['mods:search']}})` または `export const revalidate = 60` [1](https://medium.com/@ThinkingLoop/next-js-15-cache-rules-revalidate-like-a-pro-82b3b475634e) |
| `app/mods/page.tsx` | SSR (dynamic) | プロファイルはユーザ固有でキャッシュ不可 | `export const dynamic = 'force-dynamic'` または `fetch(...,{cache:'no-store'})` [2](https://nextjs.org/docs/14/app/building-your-application/caching) |
| `app/settings/page.tsx` | Client Heavy | localStorage/ファイル操作のみ | Serverはシェルのみ、子は `"use client"` |
| モーダル群 | Client (`"use client"`) | `window`, `document`, `JSZip`, `crypto.subtle` 使用 | 変更なし |
| `Header` / `BottomNav` | Client | `localStorage`, `window`, Zustand購読 | `"use client"` 必須 |

> Next.js 15では **GET Route Handlers がデフォルトでキャッシュされない** ため、Modrinthプロキシは明示的に `next:{revalidate}` を付けるしない限り毎回新鮮なデータを取得できる [3](https://nextjs.org/blog/next-15) 。これは現行の「常に最新」を保つのに有利。

### 5.2 App Router 固有の新概念

- **Server Components**: デフォルト。`async function Page()` 内で直接 `await fetch` 可能。`cookies()/headers()` は `next/headers` から。
- **Route Handlers**: `app/api/**/route.ts` が `export async function GET/POST` を公開。Pages Routerの `pages/api` と異なり App直下。
- **Segment Config**: `export const dynamic = 'force-dynamic' | 'force-static' | 'auto'` / `export const revalidate = 60` / `export const fetchCache = 'force-no-store'` 等 [4](https://medium.com/@livenapps/next-js-15-app-router-a-complete-senior-level-guide-0554a2b820f7)
- **Caching 4層**: Request Memoization / Data Cache / Full Route Cache / Router Cache [2](https://nextjs.org/docs/14/app/building-your-application/caching)。本移行では **Data Cache** (`fetch` の `next.revalidate/tags`) と **Router Cache** (`revalidatePath/revalidateTag`) を主に制御。

---

## 6. Hono → Next.js Route Handlers 置換設計

### 現行 Hono (server/index.ts)
```ts
app.get('/api/health', c=>c.json({status:'ok'}))
app.all('/api/modrinth/*', async c=>{
  const target = MODRINTH_BASE + path + query
  fetch(target, {headers:{'User-Agent':...}})
})
```

### 移行後 Next.js (推奨: 公式Route Handlersパターン [6](https://nextjs.org/docs/app/building-your-application/routing/route-handlers))

#### `app/api/health/route.ts`
```ts
export async function GET() {
  return Response.json({ status: 'ok', service: 'DropMod Next API' })
}
```

#### `app/api/modrinth/[...path]/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server'

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2'
const USER_AGENT = 'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)'

async function proxy(req: NextRequest, params: { path?: string[] }) {
  const path = params.path ? `/${params.path.join('/')}` : ''
  const query = req.nextUrl.search // "?query=..."
  const targetUrl = `${MODRINTH_API_BASE}${path}${query}`

  const headers: Record<string,string> = {
    'User-Agent': USER_AGENT,
  }
  const ct = req.headers.get('content-type')
  if (ct) headers['Content-Type'] = ct

  const init: RequestInit = {
    method: req.method,
    headers,
    // Next.js 15では GET Route Handlerはデフォルト非キャッシュなので
    // Modrinthの検索結果を60秒キャッシュしたい場合は next.revalidate を付与可能
    // 例: next: { revalidate: 60, tags: ['modrinth'] }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer()
  }

  try {
    const res = await fetch(targetUrl, init)
    const data = await res.arrayBuffer()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' }
    })
  } catch (err:any) {
    console.error('Proxy Error:', err)
    return NextResponse.json({ error: err.message || 'Proxy Error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) {
  return proxy(req, await ctx.params)
}
export async function POST(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) {
  return proxy(req, await ctx.params)
}
export async function PUT(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) {
  return proxy(req, await ctx.params)
}
export async function DELETE(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) {
  return proxy(req, await ctx.params)
}
// 必要なら PATCH も同様
```

> **ポイント**
> - `params` は Next.js 15で `Promise` 型になった点に注意 (`await ctx.params`)。
> - `req.nextUrl.search` でクエリを正確に転送。
> - `NextResponse` を使用。`Hono` 依存は `package.json` から削除。
> - キャッシュ制御: 検索系 (`/search`) は `next:{revalidate:60, tags:['modrinth:search']}` を付け、詳細 (`/project/:id`) は `revalidate:3600` 等で最適化可能 [1](https://medium.com/@ThinkingLoop/next-js-15-cache-rules-revalidate-like-a-pro-82b3b475634e)。

### クライアント側 `lib/api.ts` の書き換え
現行 `fetchModrinth` は `/api/modrinth` → 直呼びフォールバックの2段構えだが、移行後は **常に `/api/modrinth`** に統一（直呼びはCORS回避のため残す場合も可だが、Route HandlerがCORSを吸収するので不要）。Server Componentsからは `fetch('http://localhost:3000/api/modrinth/...', {next:{...}})` ではなく内部的に `fetchModrinth` が `process.env.NEXT_PUBLIC_BASE_URL` または相対パスで呼ぶ形に抽象化。

```ts
// lib/api.ts (Server/Client 共用)
export async function fetchModrinth<T>(endpoint:string, params:Record<string,any>={}, opts:{noCache?:boolean, signal?:AbortSignal, method?:string, body?:any, revalidate?:number, tags?:string[]}={}):Promise<T> {
  const qs = new URLSearchParams(...)
  const url = `/api/modrinth${endpoint}${qs}`
  const res = await fetch(url, {
    method: opts.method || 'GET',
    signal: opts.signal,
    // Next.js拡張: Serverでのみ有効、Clientでは無視される
    ...(opts.revalidate !== undefined ? { next: { revalidate: opts.revalidate, tags: opts.tags } } : {}),
    ...(opts.noCache ? { cache: 'no-store' as const } : {}),
    headers: { 'Content-Type':'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if(!res.ok) throw new Error(`Modrinth ${res.status}`)
  return res.json()
}
```

---

## 7. Zustand 5 ストア設計

### 7.1 なぜ Zustand 5 か
- **v5のBreaking**: `import {create} from 'zustand'` のみ (default export廃止) [1](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)、`persist` は初期stateをstorageに書き込まなくなった (v4.5.5→v5変更) [1](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5) → 移行時に `onRehydrateStorage` で明示的hydrationが必要。
- **Next.js SSRの落とし穴を公式が文書化**: `skipHydration: true` + `persist.rehydrate()` + `hasHydrated` ゲートが推奨パターン [5](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) [8](https://maryanmats.com/blog/why-zustand-breaks-in-nextjs/)。

### 7.2 ストア分割方針
| ストア | 責務 | persist | hydration戦略 |
|---|---|---|---|
| `profileStore` | `profiles`, `currentProfileId`, `currentProfile` (getter), CRUD + `handleToggleMod` 等 | `name: 'dropmod_state_v2'` (互換) or `'dropmod-profile'` + `migrate` | `skipHydration: true`, `createJSONStorage(()=>localStorage)` [5](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) |
| `uiStore` | `theme: 'dark'|'light'`, `activeTab` (※App RouterではURLが正なので `activeTab` はRouterに移譲しつつ互換のため残す), `hasHydrated` | 同上 (themeのみ) | 同上。`theme` は `document.documentElement.classList` 同期を `useEffect` で行う |
| `toastStore` | `toasts: Toast[]`, `showToast`, `dismissToast` | しない (一時的) | そのまま |
| `modSearchStore` (Client側のみ) | `hits`, `isLoading`, `hasMore`, `searchInput` 等 (一部Serverに移管するため縮小) | しない or sessionStorage | - |
| `zipStore` | `zipProgress` 等 | しない | - |

### 7.3 実装スケルトン

#### `stores/profileStore.ts`
```ts
'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Profile, ModItem } from '@/types'
import { fetchModrinth, fetchStableModVersion } from '@/lib/api'

type ProfileState = {
  profiles: Profile[]
  currentProfileId: string
  _hasHydrated: boolean
  setHasHydrated: (v:boolean)=>void
  // getters
  currentProfile: () => Profile
  // actions
  setProfiles: (p:Profile[])=>void
  setCurrentProfileId: (id:string)=>void
  switchProfile: (id:string)=>void
  createProfile: (name:string, mcVersion:string, loader:string, desc:string, mods?:ModItem[])=>void
  duplicateProfile: ()=>void
  saveEditedProfile: (name:string, mcVersion:string, loader:string, desc:string)=>void
  deleteProfile: (id:string)=>void
  toggleMod: (projectId:string, e?:React.MouseEvent, silent?:boolean)=>Promise<void>
  updateModVersion: (projectId:string, versionId:string)=>Promise<void>
  removeAllMods: ()=>void
}

const defaultProfile: Profile = {
  id: 'default-profile',
  name: '1.20.1 Fabric 軽量化・ユーティリティ',
  mcVersion: '1.20.1',
  loader: 'Fabric',
  description: 'Modrinthから直接Modを取得・ダウンロードする標準構成',
  mods: []
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: [defaultProfile],
      currentProfileId: 'default-profile',
      _hasHydrated: false,
      setHasHydrated: (v)=> set({_hasHydrated:v}),
      currentProfile: () => {
        const {profiles, currentProfileId} = get()
        return profiles.find(p=>p.id===currentProfileId) || profiles[0]
      },
      setProfiles: (profiles)=> set({profiles}),
      setCurrentProfileId: (id)=> set({currentProfileId:id}),
      switchProfile: (id)=> {
        set({currentProfileId:id})
        // toastは別storeへ委譲するか、ここで直接呼ぶ
      },
      createProfile: (name, mcVersion, loader, desc, mods=[])=>{
        const newId = 'profile-'+Date.now()
        const newProfile:Profile={id:newId, name, mcVersion, loader, description:desc, mods}
        set(s=>({profiles:[...s.profiles, newProfile], currentProfileId:newId}))
      },
      duplicateProfile: ()=>{
        const cur = get().currentProfile()
        const newId='profile-'+Date.now()
        const dup:Profile={...cur, id:newId, name:`${cur.name} (コピー)`, mods: JSON.parse(JSON.stringify(cur.mods))}
        set(s=>({profiles:[...s.profiles, dup], currentProfileId:newId}))
      },
      saveEditedProfile: (name, mcVersion, loader, desc)=>{
        const id=get().currentProfileId
        set(s=>({profiles: s.profiles.map(p=> p.id===id ? {...p, name, mcVersion, loader, description:desc}:p)}))
      },
      deleteProfile: (id)=>{
        const {profiles, currentProfileId} = get()
        if(profiles.length<=1) return
        const remaining = profiles.filter(p=>p.id!==id)
        set({profiles: remaining, currentProfileId: currentProfileId===id ? remaining[0].id : currentProfileId})
      },
      toggleMod: async (projectId, e, silent)=>{
        e?.stopPropagation?.()
        const cur = get().currentProfile()
        const idx = cur.mods.findIndex(m=> m.id===projectId || m.slug===projectId)
        if(idx>=0){
          const removed = cur.mods[idx]
          set(s=>({profiles: s.profiles.map(p=> p.id===get().currentProfileId ? {...p, mods: p.mods.filter(m=> m.id!==projectId && m.slug!==projectId)}:p)}))
          // showToast
        } else {
          const project = await fetchModrinth<any>(`/project/${projectId}`)
          const verRes = await fetchStableModVersion(projectId, cur)
          if(!verRes) return
          const primary = verRes.targetVersion.files.find(f=>f.primary) || verRes.targetVersion.files[0]
          const modObj:ModItem={...}
          set(s=>({profiles: s.profiles.map(p=> p.id===get().currentProfileId ? {...p, mods:[...p.mods, modObj]}:p)}))
        }
      },
      updateModVersion: async (projectId, versionId)=>{ /* 同様 */ },
      removeAllMods: ()=>{
        const id=get().currentProfileId
        set(s=>({profiles: s.profiles.map(p=> p.id===id ? {...p, mods:[]}:p)}))
      },
    }),
    {
      name: 'dropmod_state_v2', // 既存keyを維持して互換性を保つ
      storage: createJSONStorage(()=> localStorage),
      // Next.js SSRでは localStorage が存在しないため、初期renderではhydrationをスキップ
      skipHydration: true,
      // persistするキーを絞る (関数等は除外)
      partialize: (state)=> ({ profiles: state.profiles, currentProfileId: state.currentProfileId }),
      version: 2,
      migrate: (persistedState:any, version:number)=>{
        // v1: 旧 {theme, currentProfileId, profiles} 形状 → v2: themeをuiStoreへ分離等
        if(version===1 && persistedState.theme){
          // themeはuiStoreへ移行、ここでは無視
          const {theme, ...rest} = persistedState
          return rest
        }
        return persistedState as ProfileState
      },
      onRehydrateStorage: ()=> (state, error)=>{
        if(error) console.error('profileStore hydration error', error)
        else state?.setHasHydrated(true)
      },
    }
  )
)
```

#### `stores/uiStore.ts`
```ts
'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type UIState = {
  theme: 'dark'|'light'
  _hasHydrated: boolean
  setTheme: (t:'dark'|'light')=>void
  toggleTheme: ()=>void
  setHasHydrated:(v:boolean)=>void
}

export const useUIStore = create<UIState>()(
  persist(
    (set,get)=>({
      theme: 'dark',
      _hasHydrated: false,
      setHasHydrated: (v)=> set({_hasHydrated:v}),
      setTheme: (theme)=> set({theme}),
      toggleTheme: ()=> set({theme: get().theme==='dark'?'light':'dark'}),
    }),
    {
      name: 'dropmod_ui',
      storage: createJSONStorage(()=> localStorage),
      skipHydration: true,
      partialize: (s)=> ({theme: s.theme}),
      onRehydrateStorage: ()=> (state)=> state?.setHasHydrated(true),
    }
  )
)
```

#### Hydrationゲートコンポーネント `app/providers.tsx`
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useProfileStore } from '@/stores/profileStore'
import { useUIStore } from '@/stores/uiStore'

export function ZustandHydration({children}:{children:React.ReactNode}){
  const [hydrated, setHydrated] = useState(false)
  useEffect(()=>{
    // 手動rehydrate: Zustand 5の推奨パターン [5](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)
    useProfileStore.persist.rehydrate()
    useUIStore.persist.rehydrate()
    // onRehydrateStorage で _hasHydrated が立つまで待つ簡易版
    const unsub1 = useProfileStore.persist.onFinishHydration(()=> setHydrated(true))
    const unsub2 = useUIStore.persist.onFinishHydration(()=> setHydrated(true))
    // 既にhydratedなら即true
    if(useProfileStore.persist.hasHydrated() && useUIStore.persist.hasHydrated()) setHydrated(true)
    return ()=>{ unsub1(); unsub2(); }
  },[])

  // SSRと初回Client renderを一致させるため、hydrated前はnullまたはスケルトン
  // これで hydration mismatch を回避 [8](https://maryanmats.com/blog/why-zustand-breaks-in-nextjs/)
  if(!hydrated) return null // または <Skeleton />
  return <>{children}</>
}
```

> **重要**: `createJSONStorage(()=>localStorage)` は **lazy evaluation** でSSR時の `window is not defined` を回避する公式推奨 [10](https://zustand.docs.pmnd.rs/reference/middlewares/persist)。決して `storage: localStorage` と直書きしない。

### 7.4 旧hooksの扱い
| 旧hook | 移行先 |
|---|---|
| `useProfiles` | `profileStore` に完全移行。`useEffect` の localStorage 復元/保存は `persist` が代替。 |
| `useToasts` | `toastStore` (persistなし) |
| `useModSearch` | 分割: 初期検索は `app/page.tsx` Server ComponentでSSR、以降の `searchInput` / `hasMore` / `sentinel` は `modSearchStore` or クライアント `useState` に残留。`fetchModrinth` は `lib/api.ts` を共用。 |
| `useDependencyCheck` | `dependencyStore` or `useEffect` のままClient専用。`profileStore.currentProfile.mods` を購読。 |
| `useZipExport` / `useZipImport` | `zipStore` + Client actions。`JSZip`, `crypto.subtle`, `FileReader` はClient限定のため `"use client"` 維持。 |

---

## 8. SSR / CSR 境界とキャッシュ戦略

### 8.1 Server Componentでのデータフェッチ例 (Home初期表示)
```tsx
// app/page.tsx
import { fetchModrinth } from '@/lib/api' // Serverでも動作するfetchラッパ

export const revalidate = 60 // 60秒 ISR [4](https://medium.com/@livenapps/next-js-15-app-router-a-complete-senior-level-guide-0554a2b820f7)

async function getInitialMods(profile:{mcVersion:string, loader:string}){
  // App Routerでは fetch に next.revalidate/tags を付与してData Cacheを制御 [1](https://medium.com/@ThinkingLoop/next-js-15-cache-rules-revalidate-like-a-pro-82b3b475634e)
  const data = await fetchModrinth<{hits:any[]}>('/search', {
    query: '',
    facets: JSON.stringify([['project_type:mod'], [`versions:${profile.mcVersion}`], [`categories:${profile.loader.toLowerCase()}`]]),
    index: 'downloads',
    limit: 24,
    offset: 0,
  }, { revalidate: 60, tags: ['mods:search'] })
  return data.hits
}

export default async function HomePage(){
  // デフォルトプロファイルでSSR。実際は cookies() からユーザ設定を読むことも可
  const initialHits = await getInitialMods({mcVersion:'1.20.1', loader:'Fabric'})
  return <HomeClient initialHits={initialHits} />
}
```

```tsx
// app/HomeClient.tsx
'use client'
import { useState } from 'react'
import { HomeTab } from '@/components/HomeTab'
export function HomeClient({initialHits}:{initialHits:any[]}){
  const [hits, setHits] = useState(initialHits)
  // 以降は既存の useModSearch ロジックで追従フェッチ
  return <HomeTab hits={hits} ... />
}
```

### 8.2 キャッシュ無効化
- **検索条件変更時**: Client側で `fetch` し直すためServer Cacheは影響小。
- **Mod追加/削除後の一覧更新**: Server Action内で `revalidateTag('mods:search')` または `revalidatePath('/')` を呼ぶ [2](https://nextjs.org/docs/14/app/building-your-application/caching)。ただし本アプリは一覧がユーザ固有でないため、厳密な無効化は必須ではない。
- **Mod詳細**: `fetch(...,{next:{revalidate:3600, tags:['project:xxx']}})` とし、更新時は `revalidateTag('project:xxx')`。

### 8.3 ハイドレーション対策まとめ
- **原則**: Serverは**デフォルト値**でHTMLを生成、Clientは `skipHydration:true` で初回は同じHTMLを出し、 `useEffect` で `rehydrate()` 後に真の値を描画 [8](https://maryanmats.com/blog/why-zustand-breaks-in-nextjs/)。
- **判定**: `useProfileStore(s=>s._hasHydrated)` が `true` になるまで、プロファイル依存UIはスケルトン or `null` を返す。
- **代替**: `dynamic(() => import('@/components/Header'), {ssr:false})` も有効だが、SEOに影響するため本計画では `skipHydration` ゲートを推奨。

---

## 9. ファイルマッピング (Vite → Next.js)

| 現行 | 移行後 | 変更内容 |
|---|---|---|
| `index.html` | `app/layout.tsx` | `<html lang="ja" className={theme}>` をServerで出力。`metadata` APIでtitle/description/OGPを定義 |
| `src/main.tsx` | `app/layout.tsx` + `app/providers.tsx` | `ReactDOM.createRoot` 削除。`providers.tsx` で ZustandHydration, GSAP, FontAwesomeをラップ |
| `vite.config.ts` | `next.config.ts` | `import type {NextConfig} from 'next'` で型安全化 [3](https://nextjs.org/blog/next-15)。`devServer` 削除, `images.remotePatterns` で `cdn.modrinth.com` 許可, `transpilePackages: ['gsap']` 任意 |
| `tsconfig.json` | `tsconfig.json` | `plugins:[{name:"next"}]`, `jsx: preserve`, `baseUrl:"."`, `paths:{"@/*":["./*"]}` 追加 [3](https://nextjs.org/docs/app/guides/migrating/from-vite) |
| `src/App.tsx` | `app/layout.tsx` + `app/page.tsx` + `app/mods/page.tsx` + `app/settings/page.tsx` | タブ切替を **ファイルルーティング** に置換。`activeTab` state → `usePathname()` 判定。GSAPタブアニメは `template.tsx` or `usePathname` 変化で発火 |
| `server/index.ts` | `app/api/modrinth/[...path]/route.ts` + `app/api/health/route.ts` | Hono削除 |
| `src/services/api.ts` | `lib/api.ts` | `apiCache` は Data Cache (`next.revalidate`) に置換 or 併用。`DIRECT_MODRINTH_BASE` フォールバックは維持可 |
| `src/hooks/useProfiles.ts` | `stores/profileStore.ts` | 上記 |
| `src/types.ts` | `types/index.ts` | そのまま。`Mod` 型の不整合を修正 (`ModItem` に統一) |
| `src/index.css` | `app/globals.css` | Tailwind 4は `app/globals.css` で `@import "tailwindcss"` のまま動作。Next.js 15でも `@tailwindcss/vite` 相当は `tailwindcss` 4 + `postcss` で代替 |
| 静的アセット | `public/` | `index.html` 内の手動script削除 |

---

## 10. フェーズ別移行ロードマップ

### Phase 0: 基盤準備 (1-2日)
- [ ] `pnpm add next@latest react@latest react-dom@latest zustand@latest`
- [ ] `pnpm remove hono @hono/node-server @hono/vite-dev-server` の準備（Phase 3で削除）
- [ ] `npx tsc --noEmit` で現行の型エラー有無を確認
- [ ] `git checkout -b migrate/nextjs-zustand` 作成

### Phase 1: Next.js 基盤構築 (2-3日) — **最小可動**
1. `next.config.ts` 作成:
   ```ts
   import type { NextConfig } from 'next'
   const nextConfig: NextConfig = {
     reactStrictMode: true,
     images: { remotePatterns: [{ hostname: 'cdn.modrinth.com' }] },
   }
   export default nextConfig
   ```
   [3](https://nextjs.org/blog/next-15) の通り `next.config.ts` は Next 15から正式サポート。
2. `tsconfig.json` 更新 (Nextプラグイン) [3](https://nextjs.org/docs/app/guides/migrating/from-vite)
3. `app/layout.tsx` 作成 (RootLayout)。既存 `src/components/Header`, `BottomNav` を一旦 `"use client"` のまま移植し、propsは仮に `useState` で渡す。
4. `app/page.tsx` は一時的に `src/App.tsx` の中身を `"use client"` でラップして表示 → **この時点で `pnpm dev` (next dev) が起動すれば成功**。Viteの `vite.config.ts` はまだ残置。

### Phase 2: Zustand 導入 (3-4日)
1. `stores/profileStore.ts`, `uiStore.ts`, `toastStore.ts` 作成 (上記スケルトン)。
2. `app/providers.tsx` (ZustandHydration, ThemeProvider) を `app/layout.tsx` に組み込み。
3. `src/App.tsx` の `useProfiles` → `useProfileStore` に置換。`src/components/Header` 等の props drilling を `useProfileStore` 直接購読に段階的に置換。
4. `localStorage` マイグレーションテスト: 既存 `dropmod_state_v2` を持つブラウザでリロードし、データが引き継がれるか確認。

### Phase 3: Hono → Route Handlers 置換 (1-2日)
1. `app/api/modrinth/[...path]/route.ts` 実装。
2. `lib/api.ts` の `fetchModrinth` を新Route Handler向きに修正。
3. `server/index.ts` と `vite.config.ts` の `devServer` を削除。
4. `package.json` scripts を更新:
   ```json
   { "dev": "next dev", "build": "next build", "start": "next start", "lint": "next lint" }
   ```

### Phase 4: App Router 本格化 + SSR化 (3-5日)
1. `app/page.tsx` をServer Component化し、初期Mod 24件をSSR `fetch`。
2. `app/mods/page.tsx`, `app/settings/page.tsx` を作成し、`activeTab` による条件分岐を **ルーティング** に置換。
   ```tsx
   // app/mods/page.tsx
   export const dynamic = 'force-dynamic' // ユーザ固有 [4](https://medium.com/@livenapps/next-js-15-app-router-a-complete-senior-level-guide-0554a2b820f7)
   export default async function ModsPage(){ return <ModsTabClient /> }
   ```
3. `BottomNav` の `onSwitchTab` → `next/navigation` の `useRouter().push('/mods')` に置換。`usePathname()` で `activeTab` 判定。
4. `loading.tsx` / `error.tsx` を各segmentに配置し、Suspense streamingを活用。

### Phase 5: フックの解体・最適化 (2-3日)
1. `useModSearch` → Serverフェッチ + Client追従に分割。
2. `useDependencyCheck` → `profileStore` 購読のままClient専用化。`useEffect` の 5秒ポーリングは `useInterval` に切り出し。
3. `useZipExport` / `useZipImport` → `stores/zipStore.ts` + `lib/zip.ts` 純粋関数に分離。`Mod` 型不整合を修正。
4. `CustomDropdown` の `ReactDOM.createPortal` は Nextでもそのまま動作 (Client限定)。

### Phase 6: 仕上げ・品質保証 (2-3日)
1. `pnpm build` で `typescript.ignoreBuildErrors: false` をパスすることを確認。
2. Lighthouse (SEO, Performance) 計測。
3. E2Eテスト (Playwright) で「プロファイル作成→Mod追加→依存チェック→ZIP出力→ZIP再インポート」フローを検証。
4. `pnpm remove vite @vitejs/plugin-react @hono/*` 等不要依存を削除し、`pnpm-lock.yaml` 更新。
5. README更新、デプロイ (Vercel or 自前Node)。

**合計見積: 14-22日 (1人, 1日6h換算)** — Vite→Next公式ガイドの1-4週間 [2](https://ventroxtech.in/blog/vite-to-nextjs-migration-complete-guide/) と一致。

---

## 11. 設定ファイル移行

### `next.config.ts` 完全例
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Tailwind 4はそのまま利用、Turbopackは任意 (Next 15.3でAlpha)
  // turbopack: { rules: { '*.svg': { loaders: ['@svgr/webpack'], as: '*.js' } } },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.modrinth.com' },
      { protocol: 'https', hostname: '**.modrinth.com' },
    ],
  },
  // Modrinth CDNのCORSをRoute Handlerで吸収するため rewrites は不要だが、
  // 旧URL互換が必要なら:
  // async rewrites(){ return [{source:'/api/modrinth/:path*', destination:'/api/modrinth/:path*'}] },
  experimental: {
    // Client Router Cacheの挙動を旧来に戻したい場合のみ:
    // staleTimes: { dynamic: 30 } // [3](https://nextjs.org/blog/next-15)
  },
}

export default nextConfig
```

### `tsconfig.json` 差分 (公式手順 [3](https://nextjs.org/docs/app/guides/migrating/from-vite))
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
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
    "paths": { "@/*": ["./*"] },
    "baseUrl": "."
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### `package.json` scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

### 環境変数
- 現行は `import.meta.env` を使用していないため影響小。もし将来 `VITE_*` を使う場合は `NEXT_PUBLIC_*` にリネーム [3](https://nextjs.org/docs/app/guides/migrating/from-vite)。

---

## 12. UI / スタイリング / アニメーション移行

- **Tailwind 4**: `app/globals.css` に `@import "tailwindcss"` を維持。`@tailwindcss/vite` プラグインは Nextでは不要で、`tailwindcss` 本体 + `postcss` で動作。`next.config.ts` に追加設定不要。
- **GSAP**: Client専用のため `"use client"` コンポーネント内で `useEffect` + `gsap` をそのまま使用。SSRでは実行されないため `window` エラーなし。
- **FontAwesome / Fontsource**: `app/layout.tsx` で `import '@fortawesome/...'` を維持。`next/font` への移行は任意だが、現行の `@fontsource` はそのまま動作。
- **CSS変数テーマ**: `useUIStore` の `theme` を `useEffect` で `document.documentElement.classList.toggle('dark')` する既存ロジックを `providers.tsx` に集約。

---

## 13. データフェッチ・Modrinth API 層の再設計

### 現行の2段フォールバックを整理
- **Server Components**: `fetch` に `next:{revalidate, tags}` を付与してData Cacheを活用。
- **Client Components**: 従来通り `/api/modrinth` 経由で `fetch`。`apiCache` (メモリMap) は Data Cacheと二重になるため、Client側のみで維持するか、SWR/React Queryへの置換を検討。

### 推奨フェッチラッパ `lib/modrinth.ts`
```ts
export async function searchMods(params:{query:string, facets:string, index:string, limit:number, offset:number}, opts?:{revalidate?:number}){
  return fetchModrinth<{hits:ModrinthHit[]}>('/search', params, {revalidate: opts?.revalidate ?? 60, tags:['mods:search']})
}
export async function getProject(id:string, opts?:{revalidate?:number}){
  return fetchModrinth<ModrinthProject>(`/project/${id}`, {}, {revalidate: opts?.revalidate ?? 3600, tags:[`project:${id}`]})
}
```

### エラーハンドリング
- Route Handlerで Modrinthが `429` (Rate Limit) を返した場合は `NextResponse.json({error:'Rate limited'}, {status:429})` をそのまま転送し、Clientで `showToast('Modrinthが混雑しています', 'warning')`。

---

## 14. テスト・品質保証計画

| 区分 | 内容 |
|---|---|
| **型チェック** | `pnpm tsc --noEmit` をCIで必須。`next build` でも `typescript.ignoreBuildErrors:false` で二重チェック [1](https://nextjs.org/docs/pages/api-reference/config/next-config-js/typescript) |
| **単体** | Zustand storeは `store.getState()` で直接テスト可能 (`vitest` or `jest`)。`lib/api.ts` は `msw` でモック |
| **E2E** | Playwrightで「Home検索→追加→Modsでバージョン切替→依存チェック→ZIP出力」 |
| **目視** | `hasHydrated` 前後のチラつき (flash) がないか、ダーク/ライト切替がSSR後も維持されるか |
| **パフォーマンス** | Lighthouse CIで `TTFB < 800ms`, `LCP < 2.5s` を目標。SSR化で改善を定量化 |

---

## 15. リスク・ロールバック計画

| リスク | 影響 | 対策 |
|---|---|---|
| **Hydration mismatch** (Zustand persist) | 初回描画で `Text content does not match` エラー | `skipHydration:true` + `hasHydrated` ゲート + `createJSONStorage(()=>localStorage)` を徹底 [5](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)[8](https://maryanmats.com/blog/why-zustand-breaks-in-nextjs/) |
| **Modrinth Rate Limit** | 検索が429で失敗 | Route Handlerで `revalidate` を付けてキャッシュし、Clientは `apiCache` 併用 |
| **JSZipがSSRで `window` エラー** | ビルド失敗 | `useZipExport` を `"use client"` に閉じ込め、Serverから import しない。`dynamic(() => import('@/components/ZipProgressModal'), {ssr:false})` も有効 |
| **既存ユーザの localStorage 消失** | プロファイル消失 | `persist.migrate` で旧形状を吸収し、QAで実データ移行テスト |
| **GSAPがServerで実行** | `document is not defined` | `useEffect` 内でのみ `gsap` を呼ぶ既存パターンを維持 |
| **移行中の開発停滞** | 2週間のfeature freeze | Phase 1で「旧Viteでも動く」状態を保ち、Feature Branchで並行開発。`git merge main` を頻繁に |

**ロールバック**: 各Phase完了時に `git tag phase-1-next-base` 等を打ち、問題時はタグから `git checkout` で即時復旧。`main` へのマージはPhase 6完了後のみ。

---

## 16. チェックリスト

### 移行完了の定義 (DoD)
- [ ] `pnpm dev` / `pnpm build` / `pnpm start` が全て成功し、`next build` で型エラー0
- [ ] `app/api/modrinth/[...path]/route.ts` がHonoと同等のプロキシを返し、`curl /api/health` が200
- [ ] 既存 `dropmod_state_v2` を持つブラウザでリロードしてもプロファイルが消えない
- [ ] `theme` 切替がリロード後も維持され、SSR初回とCSRでチラつかない
- [ ] Homeの初期24件がSSRでHTMLに含まれている (`view-source` で確認)
- [ ] 無限スクロール・検索・モーダル・依存チェック・ZIP入出力が現行と同等に動作
- [ ] Lighthouse SEOスコアが現行 (CSR) より向上
- [ ] `package.json` から `hono`, `vite`, `@hono/*` が削除されている

---

## 17. 今後の拡張ポイント

- **認証**: `cookies()` + Zustand `authStore` + Route Handlerで `httpOnly` cookie管理。
- **DB永続化**: `unstable_cache` + `revalidateTag` でDBフェッチをキャッシュ [2](https://nextjs.org/docs/14/app/building-your-application/caching)。
- **i18n**: `app/[lang]/` ルーティング + `next-intl`。
- **Turbopack本番**: Next 15.3で `next build --turbopack` が安定したら移行 [4](https://www.sparkleweb.in/blog/next.js_15.3_release:_new_features,_improvements_and_tips)。
- **PWA**: `next-pwa` でオフラインZIP操作。

---

## 18. 参考文献 (最新API検証済み)

- Next.js 15 リリースノート: App Router, `next.config.ts` サポート, GET Route Handlers非キャッシュ化, Client Router Cache変更 [3](https://nextjs.org/blog/next-15)
- Next.js公式 Vite移行ガイド: `next.config` / `tsconfig.json` / `app/layout.tsx` 手順 [3](https://nextjs.org/docs/app/guides/migrating/from-vite)
- Next.js Cachingドキュメント: Data Cache / Full Route Cache / Router Cache と `fetch` の `next.revalidate/tags`, `revalidatePath/Tag`, `dynamic/revalidate` [2](https://nextjs.org/docs/14/app/building-your-application/caching)
- Next.js Route Handlers: `app/api/**/route.ts` の `GET/POST` と Segment Config [6](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- Next.js 15 Cache Rules: `revalidate` / `revalidatePath` / `revalidateTag` 使い分け [1](https://medium.com/@ThinkingLoop/next-js-15-cache-rules-revalidate-like-a-pro-82b3b475634e)
- Zustand 5 Migration: `import {create}`, `persist` の初期storage書込廃止 [1](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)
- Zustand Persist: `createJSONStorage(()=>localStorage)`, `skipHydration`, `onRehydrateStorage`, `persist.rehydrate()` [5](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)
- Zustand Next.js Hydrationパターン: `skipHydration:true` + `hasHydrated` ゲート [8](https://maryanmats.com/blog/why-zustand-breaks-in-nextjs/)
- Vite→Next移行の落とし穴: `window`/`localStorage` は `"use client"` 必須, 環境変数は `NEXT_PUBLIC_` [2](https://ventroxtech.in/blog/vite-to-nextjs-migration-complete-guide/)

---

## 19. クイズ：意思決定が必要な事項

> 以下のクイズに答えていただくと、計画書を **確定版** に更新し、実装を開始できます。  
> 各問 2-4択 + 自由記述でお答えください。

### Q1. SSRの範囲はどこまで広げますか？
- **A.** Homeの初期24件のみSSR (推奨・最小リスク)
- **B.** Home + Mods一覧もSSR (OGPは不要だがTTFB改善)
- **C.** 全ページSSR + ISR (検索結果も `revalidate:60` でキャッシュ)
- **D.** 現行通り完全CSRのまま、Next.jsはルーティングとAPIのためだけに使う

### Q2. Zustandの永続化キー `dropmod_state_v2` をどうしますか？
- **A.** そのまま維持し `migrate` で互換 (既存ユーザのデータを完全保持・推奨)
- **B.** 新キー `dropmod_v3` にし、初回起動時に旧キーを自動移行
- **C.** 旧データは破棄しクリーンな新キーで開始

### Q3. デプロイ先はどこを想定していますか？
- **A.** Vercel (Next.jsネイティブ, Route Handlers/ISRが最も安定)
- **B.** 自前Nodeサーバ / Docker (Honoと同様に `next start` で運用)
- **C.** Cloudflare Workers / Edge (要 `runtime: 'edge'` 対応)
- **D.** 未定

### Q4. `activeTab` の扱いは？
- **A.** App RouterのURL (`/`, `/mods`, `/settings`) に完全移行し `activeTab` stateは廃止 (推奨・SEO/履歴対応◎)
- **B.** URLとstateを併用 (後方互換)
- **C.** 現行のstate切替のまま (URLは常に `/`)

### Q5. Tailwind / GSAP は維持しますか？
- **A.** 現行通り Tailwind 4 + GSAP 維持
- **B.** Tailwindは維持、GSAPは `framer-motion` に置換
- **C.** デザインシステムを刷新したい

---

**次のアクション:** 上記クイズにご回答いただき次第、
1. 計画書を確定版 (`docs/MIGRATION_PLAN_NEXTJS_ZUSTAND_FINAL.md`) に更新
2. Phase 1の `next.config.ts` / `app/layout.tsx` / `stores/*` の実装を開始
3. PR `arena/01a01f07-dropmod` にコミット

ご回答をお待ちしています！
