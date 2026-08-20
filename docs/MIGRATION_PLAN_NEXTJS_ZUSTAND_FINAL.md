# DropMod → Next.js 15 (一部SSR) + React + TypeScript + Zustand 完全移行計画書【確定版】

> **作成日:** 2026-08-20 (JST) / **確定日:** 2026-08-20 クイズ回答反映版  
> **対象:** `shiratama644/DropMod` `8b8f4da` / `arena/01a01f07-dropmod`  
> **現行:** Vite 6 + Hono 4 + React 18 + TS 5.7 (SPA, 全CSR)  
> **目標:** Next.js 15 App Router + React 19 + TS + Zustand 5 + IndexedDB + Tailwind 4 + Route Handlers  
> **検証:** 全章 `web_search` で Next.js 15 / Zustand 5 公式ドocsを参照（推測なし）  
> **ユーザ決定反映:**  
> - Q1: **Home 初期24件 + Mods一覧 初期表示 + Mod詳細ページ をSSR、検索/フィルタ/無限スクロールはCSR**。全ページISR(revalidate:60)は見送り、SSR/CSR責務分離  
> - Q2: **localStorage → IndexedDB 移行**。`dropmod_state_v2` を初回に自動移行、以降はIndexedDBを正とし localStorage依存を排除。バージョン管理で将来スキーマ変更に対応  
> - Q3: **Vercelで動作確認するが Vercel固有SDK/APIに依存しないポータブル実装**。標準 Next.js / Web標準APIのみ  
> - Q4: **URLルーティングに完全移行** (`/` `/mods` `/settings` `/mod/[id]`)

---

## 目次
1. エグゼクティブサマリ（確定責務分離図）
2. 現行アーキテクチャ診断（再掲）
3. 目標アーキテクチャ全体図（確定版）
4. 移行方針・非目標（確定）
5. 詳細技術設計
6. Hono → Route Handlers 置換（ポータブル）
7. Zustand + IndexedDB ストア設計（自動移行＋バージョニング）
8. SSR/CSR境界とキャッシュ戦略（確定SSR 3箇所）
9. ルーティング設計（App Router ファイル構成確定版）
10. ファイルマッピング
11. フェーズ別ロードマップ（IndexedDB移行組込）
12. 設定ファイル移行
13. UI/スタイリング移行
14. データフェッチ層再設計
15. テスト・品質保証
16. リスク・ロールバック
17. チェックリスト（DoD確定版）
18. 参考文献
19. 付録: コードスニペット集

---

## 1. エグゼクティブサマリ（確定責務分離）

### 責務分離マトリクス（確定）

| 領域 | SSR | CSR | 備考 |
|---|---|---|---|
| **Home `/`** 初期24件 | ✅ Server Componentで `fetch(...,{next:{revalidate:60, tags:['mods:search']}})` | 検索入力・カテゴリ・ソート・無限スクロール追従はCSR | ISRは導入せず、Data Cacheの `revalidate:60` で60秒の鮮度を担保しつつ、フィルタ変更時はCSRで再fetch |
| **Mods一覧 `/mods`** 初期表示 | ✅ `force-dynamic` + Server ComponentでプロファイルサマリをSSR（ユーザ固有のためキャッシュなし） | 以降のバージョン切替・削除・ZIP操作はCSR (Zustand) | `localStorage/IndexedDB` 由来のデータはSSRではデフォルトを出し、Client hydrate後にIndexedDB値で上書き（mismatch回避） |
| **Mod詳細 `/mod/[id]`** | ✅ 動的SSR (`/mod/[projectId]/page.tsx`) で `project` + `versions` を取得、OGP生成 | ギャラリー拡大・追加/削除ボタン・バージョン切替はCSR | 現行の `ModDetailModal` をページに昇格しつつ、モーダルとしても再利用可能に |
| **Settings `/settings`** | シェルのみSSR | テーマ、プロファイル管理、ZIP入出力はCSR | `onDropZip` 等は `window` 前提 |
| **Header/BottomNav** | Serverシェル内にClient島として配置 | Zustand購読、`localStorage` → `IndexedDB` 後の状態を表示 | `"use client"` |
| **Route Handlers** | Server専用 | - | `app/api/modrinth/[...path]/route.ts` が唯一の外部境界 |

> **ISR(revalidate:60)を全ページに適用しない** という決定により、Data Cacheの `revalidate` は **Home検索のみ60秒**、詳細は `3600秒`、Mods一覧は `no-store` と使い分ける。`export const revalidate` のページ全体ISRは使わず、**`fetch` 単位の `next.revalidate` で制御** するのが Next 15の推奨 [1](https://medium.com/@ThinkingLoop/next-js-15-cache-rules-revalidate-like-a-pro-82b3b475634e)。

### なぜIndexedDBか
- localStorage は **5-10MB** 上限 [2](https://sanjewa.com/blogs/zustand-persistence-middleware-guide/)。Mod数が増えると `profiles[].mods` の `icon_url` 等で容易に超過。
- Zustand `persist` は **同期localStorage** と **非同期IndexedDB** の両対応だが、asyncは **microtaskでhydrate** されるため初期renderはデフォルト値になる [4](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)。これを `skipHydration:true` + `hasHydrated` ゲートで正しく扱う。

---

## 2. 現行アーキテクチャ診断

（前版 `MIGRATION_PLAN_NEXTJS_ZUSTAND.md` §2 を踏襲）

- 4002行、最大 `DependencyCheckModal.tsx` 606行。`App.tsx` が全hooksを束ねるハブ。
- ルーティングなし（`activeTab` 疑似タブ + GSAPフェード）
- `server/index.ts` Honoが `api.modrinth.com/v2` プロキシ、`src/services/api.ts` が2段フォールバック＋メモリ `apiCache`
- 状態は `useState + localStorage: dropmod_state_v2` に分散、props drilling

---

## 3. 目標アーキテクチャ全体図（確定版）

```
┌─ Next.js 15 App Router (React 19, ポータブル) ──────────────────┐
│ app/layout.tsx (Server)                                          │
│  ├─ <html lang="ja"> + <head> metadata + globals.css            │
│  └─ providers.tsx (Client) ─ ZustandHydration + ThemeSync       │
│       ├─ app/page.tsx (Home, SSR:初期24件) ─┐                  │
│       ├─ app/mods/page.tsx (SSR:初期サマリ) │                  │
│       ├─ app/mod/[id]/page.tsx (SSR:詳細+OGP)│                  │
│       ├─ app/settings/page.tsx (CSR heavy)   │                  │
│       └─ components/* ("use client" 島)      │                  │
│            ├─ Header / BottomNav (Client)    │                  │
│            ├─ HomeTab (Client: 検索/無限)    │                  │
│            └─ ModsTab / ModDetail etc        │                  │
│                                                                  │
│  stores/ (Zustand 5 + IndexedDB)                                 │
│   ├─ profileStore  ─┐                                            │
│   ├─ uiStore        ├─ persist: IndexedDB (idb-keyval)          │
│   └─ toastStore     │   + 初回 localStorage→IDB自動移行          │
│                     └─ version + migrate で将来スキーマ対応      │
│                                                                  │
│  app/api/modrinth/[...path]/route.ts (Route Handler, Node) ──→ api.modrinth.com
│  app/api/health/route.ts                                         │
└──────────────────────────────────────────────────────────────────┘
         ▲
         │ Web標準 fetch / Next cache (revalidate/tags)
         │
    Modrinth CDN (cdn.modrinth.com)  ← next.config images.remotePatterns
```

**ポータビリティ担保**: Vercel固有の `@vercel/kv`, `vercel/og` の拡張OGP, `unstable_after` 等は使わず、標準 `fetch`, `revalidateTag/Path`, `NextResponse`, `headers()/cookies()` のみに依存。

---

## 4. 移行方針・非目標（確定）

### 方針
- **App Router一択**（Pages Router不使用） [3](https://nextjs.org/docs/app/guides/migrating/from-vite)
- **Strangler Fig**: Phase 1で旧コンポーネントを `"use client"` でそのまま動かし、Phase 4でSSR島を徐々に切り出し
- **URLが正**: `activeTab` stateは廃止し `usePathname()` + `next/link` に置換。GSAPタブアニメは `template.tsx` または `usePathname` 変化で再現
- **IndexedDBが正**: 移行後は `localStorage` に書き込まない。`localStorage` は初回移行時のみ読み、成功後に `removeItem('dropmod_state_v2')`（または保持して冗長化するかは後述）

### 非目標
- Vercel Analytics / Speed Insights / Edge Config 等への依存
- Turbopack本番ビルドの強制（`next build` 標準のまま）
- `runtime: 'edge'` への移行（`runtime: 'nodejs'` 固定）
- 全ページISR、Auth/DB導入

---

## 5. 詳細技術設計

### 5.1 Renderingモード確定表

| ルート | ファイル | モード | Segment Config | 理由 |
|---|---|---|---|---|
| `/` | `app/page.tsx` | **SSR (ISR的 Data Cache)** | なし（`fetch` で `next:{revalidate:60}`） | 初回24件をSEOに載せつつ、検索条件変更はCSRで追従。ページ全体の `export const revalidate` は使わず fetch単位で制御 [1](https://medium.com/@ThinkingLoop/next-js-15-cache-rules-revalidate-like-a-pro-82b3b475634e) |
| `/mods` | `app/mods/page.tsx` | **SSR dynamic** | `export const dynamic = 'force-dynamic'` | プロファイルはユーザ固有でキャッシュ不可。Serverはヘッダと空スケルトンを出し、Client hydrate後にIndexedDB値で描画 |
| `/mod/[id]` | `app/mod/[id]/page.tsx` | **SSR dynamic** | `export const dynamic = 'force-dynamic'` + `generateMetadata` | 詳細はModrinthから取得、OGPをServerで生成。`fetch(...,{next:{revalidate:3600, tags:['project:id']}})` |
| `/settings` | `app/settings/page.tsx` | **SSR shell + CSR** | `export const dynamic = 'force-dynamic'` | ファイル操作・IndexedDB操作はClientのみ |
| `/api/*` | `app/api/**/route.ts` | **Route Handler (Node)** | `export const runtime = 'nodejs'` | ポータブル、Web標準 `Request/Response` |

> Next 15では **GET Route Handlersはデフォルト非キャッシュ** [3](https://nextjs.org/blog/next-15) なので、Modrinthプロキシは検索時のみ `revalidate` を付与すればよい。

---

## 6. Hono → Route Handlers 置換（ポータブル）

### 6.1 現行Hono
```ts
app.get('/api/health', c=>c.json({status:'ok'}))
app.all('/api/modrinth/*', async c=> fetch(MODRINTH_BASE + path + query, {headers:{'User-Agent':...}}))
```

### 6.2 移行後（Web標準のみ）

**`app/api/health/route.ts`**
```ts
export const runtime = 'nodejs'
export async function GET() {
  return Response.json({ status: 'ok', service: 'DropMod Next API' })
}
```

**`app/api/modrinth/[...path]/route.ts`**
```ts
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs' // Vercel/Nodeどちらでも動作する標準

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2'
const USER_AGENT = 'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)'

async function proxy(req: NextRequest, params: { path?: string[] }) {
  const path = params.path ? `/${params.path.join('/')}` : ''
  const targetUrl = `${MODRINTH_API_BASE}${path}${req.nextUrl.search}` // searchには?を含む
  const headers: Record<string,string> = { 'User-Agent': USER_AGENT }
  const ct = req.headers.get('content-type')
  if (ct) headers['Content-Type'] = ct

  const init: RequestInit = {
    method: req.method,
    headers,
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer()
  }
  try {
    const res = await fetch(targetUrl, init)
    const data = await res.arrayBuffer()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    })
  } catch (err:any) {
    console.error('Proxy Error:', err)
    return NextResponse.json({ error: err.message || 'Proxy Error' }, { status: 500 })
  }
}

// Next 15では params が Promise なので await する
export async function GET(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) { return proxy(req, await ctx.params) }
export async function POST(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) { return proxy(req, await ctx.params) }
export async function PUT(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) { return proxy(req, await ctx.params) }
export async function DELETE(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) { return proxy(req, await ctx.params) }
export async function PATCH(req: NextRequest, ctx:{params: Promise<{path?: string[]}>}) { return proxy(req, await ctx.params) }
```

**ポータビリティ**: `NextRequest/NextResponse` は Next標準、`fetch` は Web標準。`@vercel/*` 不使用。

---

## 7. Zustand + IndexedDB ストア設計（確定・最重要）

### 7.1 依存追加
```bash
pnpm add zustand@latest idb-keyval
# zustand 5 は peer: React 18+, TS 4.5+ が必須 [1](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)
```

### 7.2 IndexedDB Storage 実装（公式パターン）

Zustand公式が IndexedDB は `idb-keyval` の `get/set/del` を `StateStorage` にラップする例を提示 [4](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) [2](https://sanjewa.com/blogs/zustand-persistence-middleware-guide/)。本計画でもこれを採用（`zustand-indexeddb` 等のコミュニティパッケージは追加依存を避けるため不採用、必要なら将来置換可）。

**`lib/indexedDBStorage.ts`**
```ts
import { get, set, del, createStore } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

// DB名とStore名を明示し、他アプリと衝突しないようにする
const idbStore = createStore('dropmod-db', 'dropmod-store')

export const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return (await get<string>(name, idbStore)) || null
    } catch {
      return null
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value, idbStore)
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name, idbStore)
  },
}
```

> **なぜ `createJSONStorage` でラップするか**: Zustand `persist.storage` は `PersistStorage` を要求するが、`createJSONStorage(()=>storage)` が `JSON.stringify/parse` を肩代わりしつつ、SSR時の `localStorage is not defined` を lazy評価で回避する公式推奨 [5](https://zustand.docs.pmnd.rs/reference/middlewares/persist)。IndexedDBでも同様に `createJSONStorage(()=>indexedDBStorage)` でラップする。

### 7.3 自動移行 (localStorage → IndexedDB) 設計

**要件**: 既存 `dropmod_state_v2` を初回に自動移行し、以降はIndexedDBを正とする。

**`lib/migrateFromLocalStorage.ts`**
```ts
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { createStore } from 'idb-keyval'

const LEGACY_KEY = 'dropmod_state_v2' // 旧
const NEW_PROFILE_KEY = 'dropmod-profile' // 新 (IndexedDB側キー)
const NEW_UI_KEY = 'dropmod-ui'

const idbStore = createStore('dropmod-db', 'dropmod-store')

export async function migrateLocalStorageToIndexedDB(): Promise<void> {
  if (typeof window === 'undefined') return // SSRでは何もしない

  // 既にIDBにデータがあれば移行不要
  const existingProfile = await idbGet<string>(NEW_PROFILE_KEY, idbStore)
  const existingUI = await idbGet<string>(NEW_UI_KEY, idbStore)
  if (existingProfile && existingUI) return

  const legacyRaw = localStorage.getItem(LEGACY_KEY)
  if (!legacyRaw) return

  try {
    const legacy = JSON.parse(legacyRaw) as {
      theme?: 'dark'|'light'
      currentProfileId?: string
      profiles?: any[]
      // 将来の拡張で state がネストしている場合も考慮
      state?: { profiles?: any[], currentProfileId?: string, theme?: string }
    }

    // 旧形式は {theme, currentProfileId, profiles} のフラット
    // 新形式は storeごとに分離
    const profiles = legacy.profiles ?? legacy.state?.profiles
    const currentProfileId = legacy.currentProfileId ?? legacy.state?.currentProfileId
    const theme = legacy.theme ?? legacy.state?.theme

    if (profiles && currentProfileId) {
      const profilePayload = JSON.stringify({
        state: { profiles, currentProfileId },
        version: 2, // 新バージョン
      })
      await idbSet(NEW_PROFILE_KEY, profilePayload, idbStore)
    }
    if (theme) {
      const uiPayload = JSON.stringify({
        state: { theme },
        version: 1,
      })
      await idbSet(NEW_UI_KEY, uiPayload, idbStore)
    }

    // 移行成功後に旧キーを削除（ロールバック用に一時保持するならコメントアウト）
    // localStorage.removeItem(LEGACY_KEY)
    // 安全のため、移行済みフラグを残す
    localStorage.setItem('dropmod_migrated_to_idb', 'true')
    console.info('[DropMod] Migrated localStorage → IndexedDB')
  } catch (e) {
    console.error('[DropMod] Migration failed', e)
  }
}
```

**呼び出しタイミング**: `providers.tsx` の `useEffect` で `rehydrate()` 前に実行。`await migrateLocalStorageToIndexedDB()` 後に `persist.rehydrate()` する。

### 7.4 ストア実装（バージョン管理付き）

#### `stores/profileStore.ts`
```ts
'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexedDBStorage'
import { Profile, ModItem } from '@/types'
import { fetchModrinth, fetchStableModVersion } from '@/lib/api'

type ProfileState = {
  profiles: Profile[]
  currentProfileId: string
  _hasHydrated: boolean
  setHasHydrated: (v:boolean)=>void
  currentProfile: () => Profile
  setProfiles: (p:Profile[])=>void
  setCurrentProfileId: (id:string)=>void
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
      setHasHydrated: (v)=> set({ _hasHydrated: v }),
      currentProfile: () => {
        const { profiles, currentProfileId } = get()
        return profiles.find(p=>p.id===currentProfileId) || profiles[0]
      },
      setProfiles: (profiles)=> set({ profiles }),
      setCurrentProfileId: (id)=> set({ currentProfileId: id }),
      createProfile: (name, mcVersion, loader, desc, mods=[])=>{
        const newId='profile-'+Date.now()
        const p:Profile={id:newId, name, mcVersion, loader, description:desc, mods}
        set(s=>({ profiles:[...s.profiles, p], currentProfileId:newId }))
      },
      duplicateProfile: ()=>{
        const cur=get().currentProfile()
        const newId='profile-'+Date.now()
        const dup:Profile={...cur, id:newId, name:`${cur.name} (コピー)`, mods: JSON.parse(JSON.stringify(cur.mods))}
        set(s=>({ profiles:[...s.profiles, dup], currentProfileId:newId }))
      },
      saveEditedProfile: (name, mcVersion, loader, desc)=>{
        const id=get().currentProfileId
        set(s=>({ profiles: s.profiles.map(p=> p.id===id ? {...p, name, mcVersion, loader, description:desc}:p)}))
      },
      deleteProfile: (id)=>{
        const {profiles, currentProfileId}=get()
        if(profiles.length<=1) return
        const remaining=profiles.filter(p=>p.id!==id)
        set({ profiles: remaining, currentProfileId: currentProfileId===id ? remaining[0].id : currentProfileId })
      },
      toggleMod: async (projectId, e, silent)=>{
        e?.stopPropagation?.()
        const cur=get().currentProfile()
        const idx=cur.mods.findIndex(m=> m.id===projectId || m.slug===projectId)
        if(idx>=0){
          set(s=>({ profiles: s.profiles.map(p=> p.id===get().currentProfileId ? {...p, mods: p.mods.filter(m=> m.id!==projectId && m.slug!==projectId)}:p)}))
        } else {
          const project=await fetchModrinth<any>(`/project/${projectId}`)
          const verRes=await fetchStableModVersion(projectId, cur)
          if(!verRes) return
          const primary=verRes.targetVersion.files.find(f=>f.primary) || verRes.targetVersion.files[0]
          const modObj:ModItem={
            id: project.id, slug: project.slug, title: project.title,
            description: project.description, icon_url: project.icon_url,
            author: project.author || 'Modrinth',
            category: project.display_categories?.[0] || project.categories?.[0] || 'mod',
            selectedVersionId: verRes.targetVersion.id,
            selectedVersionNumber: verRes.targetVersion.version_number,
            versionType: verRes.targetVersion.version_type,
            fileUrl: primary.url, filename: primary.filename
          }
          set(s=>({ profiles: s.profiles.map(p=> p.id===get().currentProfileId ? {...p, mods:[...p.mods, modObj]}:p)}))
        }
      },
      updateModVersion: async (projectId, versionId)=>{
        const cur=get().currentProfile()
        const mod=cur.mods.find(m=> m.id===projectId || m.slug===projectId)
        if(!mod) return
        const vData=await fetchModrinth<any>(`/version/${versionId}`)
        const primary=vData.files.find((f:any)=>f.primary) || vData.files[0]
        set(s=>({ profiles: s.profiles.map(p=> p.id===get().currentProfileId ? {...p, mods: p.mods.map(m=> m.id===projectId || m.slug===projectId ? {...m, selectedVersionId:vData.id, selectedVersionNumber:vData.version_number, versionType:vData.version_type, fileUrl: primary.url, filename: primary.filename}:m)}:p)}))
      },
      removeAllMods: ()=>{
        const id=get().currentProfileId
        set(s=>({ profiles: s.profiles.map(p=> p.id===id ? {...p, mods:[]}:p)}))
      },
    }),
    {
      name: 'dropmod-profile', // ★新キー (IndexedDB内キー)
      storage: createJSONStorage(()=> indexedDBStorage), // async IndexedDB
      skipHydration: true, // SSRではhydrateせず、Clientで手動rehydrate [4](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)
      partialize: (s)=> ({ profiles: s.profiles, currentProfileId: s.currentProfileId }),
      version: 2, // ★バージョン管理: 将来スキーマ変更時に migrate が呼ばれる
      migrate: (persistedState:any, version:number)=>{
        // v0→v1: 旧 {profiles, currentProfileId} のまま
        // v1→v2: 例) ModItem に `author` が必須になった等
        // persistedState は {state:{profiles, currentProfileId}, version} の state 部分が渡される
        if(version===0){
          // 初期バージョンからの移行例
          return { ...persistedState, profiles: persistedState.profiles || [defaultProfile] }
        }
        if(version===1){
          // v1→v2: mods[].category が undefined のものを 'mod' に補完
          const profiles = persistedState.profiles?.map((p:any)=>({
            ...p,
            mods: p.mods?.map((m:any)=> ({ ...m, category: m.category || 'mod' })) || []
          }))
          return { ...persistedState, profiles }
        }
        return persistedState as ProfileState
      },
      merge: (persistedState:any, currentState:ProfileState)=>{
        // 深いマージ: persistedが優先だが、currentのデフォルトを失わない
        return { ...currentState, ...persistedState }
      },
      onRehydrateStorage: ()=>(state, error)=>{
        if(error) console.error('profileStore rehydrate error', error)
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
import { indexedDBStorage } from '@/lib/indexedDBStorage'

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
      _hasHydrated:false,
      setHasHydrated:(v)=>set({_hasHydrated:v}),
      setTheme:(theme)=>set({theme}),
      toggleTheme:()=>set({theme: get().theme==='dark'?'light':'dark'}),
    }),
    {
      name: 'dropmod-ui',
      storage: createJSONStorage(()=> indexedDBStorage),
      skipHydration: true,
      partialize:(s)=>({theme:s.theme}),
      version: 1,
      onRehydrateStorage:()=>(state)=> state?.setHasHydrated(true),
    }
  )
)
```

#### `app/providers.tsx`（Hydrationゲート + 自動移行）
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useProfileStore } from '@/stores/profileStore'
import { useUIStore } from '@/stores/uiStore'
import { migrateLocalStorageToIndexedDB } from '@/lib/migrateFromLocalStorage'

export function ZustandHydration({children}:{children:React.ReactNode}){
  const [hydrated, setHydrated] = useState(false)

  useEffect(()=>{
    let cancelled=false
    ;(async()=>{
      // 1. localStorage → IndexedDB 自動移行 (初回のみ)
      await migrateLocalStorageToIndexedDB()

      // 2. 手動rehydrate (async IndexedDB は microtask で完了) [4](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)
      //    persist.rehydrate() は Promise<void> を返す (async storageの場合)
      await Promise.all([
        useProfileStore.persist.rehydrate(),
        useUIStore.persist.rehydrate(),
      ])

      if(cancelled) return

      // 3. hasHydrated が立つまで待つ (onRehydrateStorage でも立つが、保険で hasHydrated() も確認)
      const check = () => useProfileStore.persist.hasHydrated() && useUIStore.persist.hasHydrated()
      if(check()) setHydrated(true)
      else {
        const unsub1 = useProfileStore.persist.onFinishHydration(()=> check() && setHydrated(true))
        const unsub2 = useUIStore.persist.onFinishHydration(()=> check() && setHydrated(true))
        // cleanupは外のreturnで
      }
    })()
    return ()=>{ cancelled=true }
  },[])

  // SSRと初回Clientを一致させるため、hydrated前はスケルトン
  // これで "Text content does not match" を回避 [8](https://maryanmats.com/blog/why-zustand-breaks-in-nextjs/)
  if(!hydrated){
    return (
      <div className="min-h-screen flex items-center justify-center theme-text-muted text-xs">
        <i className="fa-solid fa-spinner fa-spin mr-2" /> 読み込み中...
      </div>
    )
  }
  return <>{children}</>
}

// Theme同期を別コンポーネントに分離
export function ThemeSync(){
  const theme = useUIStore(s=>s.theme)
  const hasHydrated = useUIStore(s=>s._hasHydrated)
  useEffect(()=>{
    if(!hasHydrated) return
    const html=document.documentElement
    if(theme==='light') html.classList.remove('dark')
    else html.classList.add('dark')
  },[theme, hasHydrated])
  return null
}
```

> **IndexedDBの非同期性コスト**: 公式にも「async hydration は microtask で完了し、初期renderではデフォルト値が表示される」 と明記 [4](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)。そのため `hydrated` 前に `profiles.length` を表示すると一瞬 `1` (defaultProfileのみ) が表示されるが、上記ゲートで `null/スケルトン` を出すことでチラつきを隠蔽する。

### 7.5 将来のスキーマ変更フロー
1. `stores/profileStore.ts` の `version` を `2 → 3` にインクリメント
2. `migrate` に `if(version===2){ ... }` を追加（例: `ModItem` に `installedAt` を追加する等）
3. IndexedDB内の `version:2` のデータは次回 `rehydrate` 時に `migrate` が自動で呼ばれ `version:3` に変換され保存される
4. `merge` で未知フィールドは保持されるため、前方互換も担保

---

## 8. SSR/CSR境界とキャッシュ戦略（確定3箇所）

### 8.1 Home `/` — 初期24件のみSSR
```tsx
// app/page.tsx
import { HomeClient } from '@/components/HomeTab.client' // Client島

async function getInitialMods(){
  // 標準 fetch + Next拡張 next.revalidate/tags [1](https://medium.com/@ThinkingLoop/next-js-15-cache-rules-revalidate-like-a-pro-82b3b475634e)
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/modrinth/search?query=&facets=${encodeURIComponent(JSON.stringify([['project_type:mod'],['versions:1.20.1'],['categories:fabric']]))}&index=downloads&limit=24&offset=0`, {
    next: { revalidate: 60, tags: ['mods:search:initial'] }
  })
  if(!res.ok) throw new Error('Failed to fetch initial mods')
  const data = await res.json()
  return data.hits as ModrinthHit[]
}

export default async function HomePage(){
  const initialHits = await getInitialMods().catch(()=>[])
  return <HomeClient initialHits={initialHits} />
}
```
- `revalidate:60` で60秒キャッシュ。以降の検索・無限スクロールは `HomeClient` 内で `fetch('/api/modrinth/search...', {cache:'no-store'})` でCSR追従。
- `revalidateTag('mods:search:initial')` を呼べば即時再検証可能だが、全ページISRはしないため今回は手動無効化は不要。

### 8.2 Mods一覧 `/mods` — 初期表示SSR (dynamic)
```tsx
// app/mods/page.tsx
export const dynamic = 'force-dynamic' // ユーザ固有、キャッシュなし [4](https://medium.com/@livenapps/next-js-15-app-router-a-complete-senior-level-guide-0554a2b820f7)

export default async function ModsPage(){
  // Serverではプロファイルを読めない (IndexedDBはClientのみ) ため、Serverはシェルのみ
  // Clientが hydrate 後に Zustand から真の mods を描画
  return <ModsClient />
}
```
- Serverは `ModsTab` のスケルトンを即時返し、Clientで `useProfileStore(s=>s.currentProfile())` が `hasHydrated` 後に真のリストを表示。

### 8.3 Mod詳細 `/mod/[id]` — 動的SSR + OGP
```tsx
// app/mod/[id]/page.tsx
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export async function generateMetadata({params}:{params: Promise<{id:string}>}){
  const {id}=await params
  const project = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/modrinth/project/${id}`, { next:{ revalidate:3600, tags:[`project:${id}`] }}).then(r=>r.json()).catch(()=>null)
  if(!project) return {}
  return {
    title: `${project.title} | DropMod`,
    description: project.description,
    openGraph: { images: [project.icon_url] },
  }
}

export default async function ModDetailPage({params}:{params: Promise<{id:string}>}){
  const {id}=await params
  // 並列取得
  const [project, versionsRes] = await Promise.all([
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/modrinth/project/${id}`, { next:{ revalidate:3600, tags:[`project:${id}`] }}).then(r=> r.ok? r.json(): null),
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/modrinth/project/${id}/version?loaders=["fabric"]&game_versions=["1.20.1"]`, { next:{ revalidate:3600, tags:[`project:${id}:versions`] }}).then(r=> r.ok? r.json(): []),
  ])
  if(!project) notFound()
  return <ModDetailClient project={project} versions={versionsRes} />
}
```
- 現行の `ModDetailModal` を `ModDetailClient` として再利用。`/mod/[id]` に直接アクセスしてもSSRでOGP付きHTMLが返る。
- 一覧からの遷移は `next/link` で `prefetch` され、Router Cacheに載る。

### 8.4 キャッシュ無効化ポリシー
- Home検索: `revalidate:60` で十分。管理画面で `revalidateTag('mods:search:initial')` を呼ぶ将来拡張は用意。
- 詳細: `revalidate:3600`、更新時は `revalidateTag('project:${id}')`。
- Mods一覧: `force-dynamic` で Data Cache自体を使わないため無効化不要。

---

## 9. ルーティング設計（確定版ファイル構成）

```
app/
├── layout.tsx                 # RootLayout (Server) — metadata, html lang="ja", <Providers>
├── providers.tsx              # ZustandHydration + ThemeSync (Client)
├── globals.css                # 旧 src/index.css
├── loading.tsx                # 全体ローディング (Suspense fallback)
├── error.tsx                  # "use client" エラーバウンダリ
├── not-found.tsx
├── page.tsx                   # "/" Home (SSR初期24件 + Client島)
├── mods/
│   └── page.tsx               # "/mods" (force-dynamic)
├── mod/
│   └── [id]/
│       └── page.tsx           # "/mod/:id" (force-dynamic, generateMetadata)
├── settings/
│   └── page.tsx               # "/settings"
└── api/
    ├── health/route.ts
    └── modrinth/[...path]/route.ts
components/
├── Header.tsx                 # "use client" — useProfileStore, useUIStore, useRouter, usePathname
├── BottomNav.tsx              # "use client" — next/link に置換
├── HomeTab.client.tsx         # "use client" — 検索/無限スクロール
├── ModsTab.client.tsx
├── ModDetail.client.tsx       # 元 ModDetailModal のページ版 + モーダル再利用
├── ModCard.tsx
├── CustomDropdown.tsx         # "use client" — portalはそのまま
├── MarkdownRenderer.tsx       # "use client" (rehypeはClientでOK、Serverでも可だがhydration差異を避けるためClient)
├── ToastContainer.tsx
└── ... (他モーダルは "use client")
stores/
├── profileStore.ts
├── uiStore.ts
├── toastStore.ts
└── index.ts
lib/
├── api.ts                     # fetchModrinth (Server/Client共用)
├── indexedDBStorage.ts        # idb-keyval ラッパ
├── migrateFromLocalStorage.ts # 自動移行
└── utils/hash.ts
```

**`Header/BottomNav` の `onSwitchTab` 置換**:
```tsx
'use client'
import { useRouter, usePathname } from 'next/navigation'
const router = useRouter()
const pathname = usePathname()
// activeTab = pathname === '/' ? 'home' : pathname.startsWith('/mods') ? 'mods' : 'settings'
<button onClick={()=> router.push('/mods')}>Mods</button>
<Link href="/settings" prefetch>Settings</Link>
```

---

## 10. フェーズ別ロードマップ（IndexedDB移行組込・確定版）

| Phase | 期間 | 目的 | 成果物 | 検証 |
|---|---|---|---|---|
| **0: 準備** | 1-2日 | 型エラー洗い出し、ブランチ作成 | `git checkout -b migrate/nextjs-zustand` | `pnpm tsc --noEmit` 0エラー |
| **1: Next基盤** | 2-3日 | `next.config.ts` / `app/layout.tsx` / `providers.tsx` で旧UIを `"use client"` のまま起動 | `pnpm dev` (next dev) で現行と同等表示 | `curl localhost:3000/api/health` 200 |
| **2: Zustand+IDB** | 3-4日 | `stores/*` + `lib/indexedDBStorage.ts` + `lib/migrateFromLocalStorage.ts` 実装。`App.tsx` の `useProfiles` を `useProfileStore` に置換。`dropmod_state_v2` を持つブラウザで移行テスト | IndexedDB (DevTools → Application → IndexedDB → dropmod-db) に `dropmod-profile` が保存される | 旧データが消えず、新規追加がIDBに書かれる |
| **3: Hono→Route Handlers** | 1-2日 | `app/api/modrinth/[...path]/route.ts` 実装、`server/index.ts` 削除、`lib/api.ts` 修正。Vercel固有API未使用を `grep -r vercel` で確認 | `pnpm build` 成功、`/api/modrinth/search` がModrinthと同等JSONを返す | `diff <(curl Hono) <(curl Next)` |
| **4: App Router本格化** | 3-5日 | `app/page.tsx` SSR(初期24件)、`app/mods/page.tsx` `force-dynamic`、`app/mod/[id]/page.tsx` SSR+OGP、`/settings` 分離。`activeTab` → `usePathname` 置換 | URLで `/` `/mods` `/mod/xxx` `/settings` が各々SSR HTMLを返す (`view-source` で確認) | Lighthouse SEO向上 |
| **5: フック解体** | 2-3日 | `useModSearch` 分割、`useDependencyCheck` はClientのまま、`useZip*` は `stores/zipStore` に。`Mod` 型不整合修正 | 無限スクロール・依存チェック・ZIP入出力がIDB永続化後も動作 | E2E: 検索→追加→依存→ZIP出力→別ブラウザでZIP再インポート |
| **6: 仕上げ** | 2-3日 | `pnpm remove vite hono`, `pnpm build` 型エラー0, Lighthouse, Playwright, README更新, Vercelプレビュー | `main` へPR | DoD全チェック |

**合計 14-22日**（前版と同等、IDB移行で+1日程度）

---

## 11. 設定ファイル移行

### `next.config.ts`（ポータブル・確定）
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.modrinth.com' },
      { protocol: 'https', hostname: '**.modrinth.com' },
    ],
  },
  // Vercel固有の experimental.* は使わない
  // turbopack は任意
}

export default nextConfig
```

### `tsconfig.json` 差分（公式手順 [3](https://nextjs.org/docs/app/guides/migrating/from-vite)）
- `plugins: [{name:"next"}]`, `jsx: preserve`, `paths: {"@/*":["./*"]}`, `incremental:true` 追加

### `package.json` scripts
```json
{ "scripts": { "dev": "next dev", "build": "next build", "start": "next start", "lint": "next lint" } }
```

---

## 12. UI/スタイリング移行

- Tailwind 4: `app/globals.css` で `@import "tailwindcss"` 維持。`@tailwindcss/vite` は不要。
- GSAP: `"use client"` 内 `useEffect` で実行。SSRでは呼ばれない。
- FontAwesome/Fontsource: `app/layout.tsx` で import維持。
- テーマ: `ThemeSync` コンポーネントに集約。

---

## 13. データフェッチ層再設計

`lib/api.ts` は `fetchModrinth(endpoint, params, {revalidate, tags, cache, signal})` を Server/Client 共用に。Serverでは `next.revalidate/tags` が有効、Clientでは無視されるため分岐不要。

---

## 14. テスト・品質保証

| 区分 | 内容 |
|---|---|
| 型 | `pnpm tsc --noEmit` + `next build` ( `ignoreBuildErrors:false` ) |
| 単体 | `vitest` で `profileStore.getState().createProfile()` 等を `idb-keyval` モック (`fake-indexeddb`) でテスト |
| E2E | Playwrightで「旧localStorageを持つ状態で起動→IDB移行確認→プロファイル操作→ZIP入出力」 |
| 目視 | `hasHydrated` 前のスケルトン、IDB移行後の `localStorage.removeItem` 有無、ダークモード維持 |
| 性能 | Lighthouse TTFB/LCP、IDB読み書きの `performance.mark` 計測 |

---

## 15. リスク・ロールバック

| リスク | 対策 |
|---|---|
| **IndexedDB async hydrateの遅延** | `hasHydrated` ゲートでスケルトン表示、初期renderはデフォルト値で一致させる [4](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) |
| **IDB移行失敗** | `try/catch` で握りつぶし、旧localStorageを残す (デフォルトは `removeItem` せずフラグのみ)。`console.error` で検知 |
| **IDB容量・権限エラー (Safari private等)** | `indexedDBStorage` の `getItem` で `catch=>null` し、メモリフォールバック。`hasHydrated` は `true` にしてアプリは動作継続 |
| **SSRで indexedDB 参照** | `lib/*` は `typeof window === 'undefined'` で早期return、`createJSONStorage(()=>indexedDBStorage)` は lazy なのでSSRでは評価されない [5](https://zustand.docs.pmnd.rs/reference/middlewares/persist) |
| **Vercel以外での動作** | `runtime: 'nodejs'` 固定、Web標準APIのみで `next build && next start` がどこでも動作 |

ロールバックは `git tag phase-N` で各Phase完了時にタグ打ち。

---

## 16. チェックリスト（DoD確定版）

- [ ] `pnpm build` が型エラー0で成功
- [ ] `grep -r "from.*vercel\|@vercel" app lib` が0件（ポータブル担保）
- [ ] `curl /api/health` 200、`curl /api/modrinth/search` がModrinthと同等
- [ ] 旧 `dropmod_state_v2` を持つブラウザで初回起動時に IndexedDB `dropmod-db/dropmod-store` に自動移行され、2回目以降はIDBが正として動作
- [ ] DevTools → Application → IndexedDB → `dropmod-db` に `dropmod-profile` / `dropmod-ui` が存在
- [ ] `localStorage` への新規書き込みがない（`localStorage` は移行時のみ読み）
- [ ] `/` の `view-source` に初期24件の `ModCard` HTMLが含まれる（SSR確認）
- [ ] `/mod/[id]` の `view-source` にOGP `og:title` が含まれる
- [ ] `/mods` が `force-dynamic` で毎回 fresh（`Cache-Control: no-store` 相当）
- [ ] `hasHydrated` 前に hydration mismatch エラーが出ない
- [ ] 検索・無限スクロール・依存チェック・ZIP入出力が現行と同等
- [ ] `activeTab` stateが削除され、URL遷移でタブが切り替わる
- [ ] Lighthouse SEOがCSR時より向上、TTFB < 800ms

---

## 17. 今後の拡張

- `stores/profileStore` の `version:3` で `installedAt` 等を追加する際は `migrate` に分岐を追加
- 認証は `cookies()` + `httpOnly` cookie でServerが読める形に（IndexedDBはClientのみなので認証には不向き）
- `unstable_cache` でDBフェッチをラップする将来拡張は `revalidateTag` で無効化 [2](https://nextjs.org/docs/14/app/building-your-application/caching)

---

## 18. 参考文献

- Next.js 15: `next.config.ts` 正式サポート、GET Route Handlers非キャッシュ化、Client Router Cache変更 [3](https://nextjs.org/blog/next-15)
- Vite→Next移行公式ガイド [3](https://nextjs.org/docs/app/guides/migrating/from-vite)
- Next.js Caching 4層と `fetch` `next.revalidate/tags`, `revalidateTag/Path`, `dynamic` [2](https://nextjs.org/docs/14/app/building-your-application/caching)[1](https://medium.com/@ThinkingLoop/next-js-15-cache-rules-revalidate-like-a-pro-82b3b475634e)
- Route Handlers `app/api/**/route.ts` と `runtime: 'nodejs'` [6](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- Zustand 5 Migration: `import {create}`, persist初期書込廃止 [1](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)
- Zustand Persist: `createJSONStorage`, `skipHydration`, `persist.rehydrate()`, `hasHydrated` [4](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)[5](https://zustand.docs.pmnd.rs/reference/middlewares/persist)
- Zustand + IndexedDB (`idb-keyval`) パターン [2](https://sanjewa.com/blogs/zustand-persistence-middleware-guide/)[4](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) + GitHub Discussion [1](https://github.com/pmndrs/zustand/discussions/1721)
- Hydration mismatch 対策 [8](https://maryanmats.com/blog/why-zustand-breaks-in-nextjs/)
- localStorage上限 5-10MB [2](https://sanjewa.com/blogs/zustand-persistence-middleware-guide/)

---

## 19. 付録: コードスニペット集

（本文中の `lib/indexedDBStorage.ts`, `lib/migrateFromLocalStorage.ts`, `stores/*`, `app/providers.tsx`, `app/api/modrinth/[...path]/route.ts`, `app/mod/[id]/page.tsx` を参照）

---

**次のアクション**: 本確定版を `MIGRATION_PLAN_NEXTJS_ZUSTAND_FINAL.md` として保存済み。Phase 0から実装を開始できます。`ask_user` でのクイズは全て回答済みのため、追加の意思決定待ちはありません。実装PRの作成をご希望でしたらお声がけください。
