# Phase 9.5: ランディングページ全面刷新 + BottomNav 再設計 (Modrinth 風)

**ステータス**: 計画中 (ユーザーの Go 待ち)
**優先度**: 🔴 Phase 10 前に完了させる必要あり
**見積工数**: 2〜3 週間 (1 人フルタイム換算)
**着手前提**: Biome 移行完了 (現状 clean)
**Vercel デプロイとの関係**: 本 Phase も Vercel 前に完了 (Hobby プラン枯渇対策、`docs/planning/PHASE10_CANDIDATES.md` §【重要方針】参照)

---

## 1. 概要と目的

Phase 9-F で作成した簡易ランディング (`app/page.tsx`) を **Modrinth
(https://modrinth.com) レベルの本格ランディング** に刷新する。あわせて
BottomNav を「ハンバーガーメニュー方式」に再設計し、Phase 11 の 4 カテゴリ
(Mods / Modpacks / ResourcePacks / Shaders) 対応の UI 土台を作る。

### 1.1 目的
1. **DropMod のブランド価値を最初の 3 秒で伝える** — Hero に 3D シーンを配置
2. **スクロールで進化を見せる** — Anime.js による段階的アニメーションで各セクションを演出
3. **Phase 11 準備** — BottomNav「探す」ボタンで 4 カテゴリを選ばせる UX を先行導入
4. **モバイル UX の Modrinth 準拠** — ハンバーガーメニューで設定・テーマ・ZIP 操作を集約

### 1.2 主要成果物 (3 系統)

| # | 系統 | 内容 |
|---|---|---|
| A | ランディングページ全面刷新 | `app/page.tsx` を Hero (3D) + Feature grid + Screenshots + Coming Soon + CTA の多段構成に |
| B | BottomNav 再設計 | 右端をハンバーガー化、「探す」ボタンは 4 カテゴリ選択シート |
| C | Header の条件付き非表示 | ランディングページ (`/`) のみ Header 非表示 |

### 1.3 参考デザイン
- Modrinth トップページ (https://modrinth.com) の Hero・Feature ブロック
- Modrinth モバイル版の下部 nav + bottom sheet (添付画像 2 枚: 右端 ≡ ボタン
  で下から Sign in / Settings / Change theme が上がる UX)

---

## 2. 技術スタック

### 2.1 導入ライブラリ

| ライブラリ | Version | 用途 | サイズ (gzip) |
|---|---|---|---|
| **animejs** | ^4.5.0 | スクロールアニメ、Hero UI アニメ、bottom sheet の transition | ~14 KB |
| **three** | ^0.185.1 | Hero 3D シーン (回転する Minecraft ブロック / cube) | ~150 KB |
| **@react-three/fiber** | ^9.7.0 | React 統合 (declarative Three.js) | ~50 KB |
| **@react-three/drei** | ^10.7.8 | 便利 helpers (OrbitControls, Environment 等)、必要分だけ tree-shake | ~50 KB (使う分だけ) |

**合計 bundle 影響**: 全部合わせても gzip ~250 KB。ただし **全部 dynamic import
で分離** し、`app/page.tsx` の LCP には影響させない (Hero mount 後にロード)。

### 2.2 Bundle 戦略 (重要)

Phase 10 の「bundle 900 KB 目標」との整合:

```
Landing (/)
  ├─ 初期 shell (SSR + Hydration)  ~50 KB (現状の / と同等)
  ├─ Anime.js (dynamic, on-mount)   ~14 KB
  └─ Three.js scene (dynamic, IntersectionObserver で Hero 見えたら)
       ├─ three                     ~150 KB
       ├─ @react-three/fiber        ~50 KB
       └─ @react-three/drei         ~50 KB
```

- **他ページ (`/mods`, `/profile`, `/settings`)** は Three.js / Anime.js を一切
  読み込まない (`app/page.tsx` 内でのみ dynamic import)
- **Anime.js** は BottomNav の bottom sheet transition でも使うので、`AppShell`
  レベルで dynamic import することも検討 (Phase 9.5 実装時に判断)

### 2.3 Three.js 統合の選択理由

**@react-three/fiber を使う理由**:
- 素の Three.js より 50 KB 重いが、React コンポーネントとして書けるので保守性 ↑
- `<Canvas>` に unmount hook を活かして cleanup (メモリリーク回避)
- Suspense 統合で dynamic import と親和性 ◎

**代替案の却下理由**:
- CSS 3D transform のみ: Modrinth レベルの「奥行き」を出せない
- Vanilla Three.js: React ライフサイクルとの整合コスト大

### 2.4 Anime.js v4 に関する注意

**v3 → v4 で完全 API 変更**:
```javascript
// v3 (旧)
anime({ targets: '.el', translateY: [50, 0], opacity: [0, 1] });

// v4 (新)
import { animate } from 'animejs';
animate('.el', { y: ['50', 0], opacity: [0, 1] });
```

Phase 9.5 は **v4 前提で新規実装** するので既存資産と衝突なし。

---

## 3. ランディングページ設計 (成果物 A)

### 3.1 セクション構成

Modrinth トップページの構造を参考にしつつ、DropMod の Phase 11+ 未来機能も
含めた **7 セクション** 構成:

```text
┌───────────────────────────────────────────────────────┐
│ 1. Hero                                               │
│    ├─ 3D 回転 Minecraft ブロック (Three.js)           │
│    ├─ 大文字タイトル "DropMod" (段階 fade-in)         │
│    ├─ Subtitle (typewriter effect)                    │
│    └─ CTA 2 個 (Explore Mods / Learn More)            │
├───────────────────────────────────────────────────────┤
│ 2. Feature Grid (3-4 個)                              │
│    ├─ Modrinth 検索                                   │
│    ├─ Profile 管理                                    │
│    ├─ 依存関係チェック                                │
│    └─ ZIP エクスポート/インポート                     │
│    ※ scroll-triggered fade-up (Anime.js)              │
├───────────────────────────────────────────────────────┤
│ 3. Stats Counter                                      │
│    ├─ "Modrinth の 100k+ Mod にアクセス"              │
│    ├─ "4 つの Loader 対応 (Fabric/Forge/NeoForge/Quilt)"│
│    ├─ "オフライン対応 (IndexedDB)"                    │
│    ※ Number count-up animation (Anime.js)             │
├───────────────────────────────────────────────────────┤
│ 4. Screenshot Showcase                                │
│    ├─ Mod 詳細ページ / プロファイル画面 / 依存チェック│
│    ├─ Modrinth 風の斜め透視 (CSS perspective)         │
│    ※ IntersectionObserver で順次 slide-in             │
├───────────────────────────────────────────────────────┤
│ 5. Coming Soon (Phase 11+ 予告)                       │
│    ├─ "ローカル Minecraft 環境と直接同期"             │
│    ├─ ".mrpack Modpack 対応"                          │
│    ├─ "Import / Sync / Rollback"                      │
│    ※ 未来的なグロー効果 (CSS filter + Anime.js)       │
├───────────────────────────────────────────────────────┤
│ 6. Community / Open Source                            │
│    ├─ GitHub リンク (star badge)                      │
│    ├─ Issue / PR welcome の案内                       │
├───────────────────────────────────────────────────────┤
│ 7. Final CTA                                          │
│    ├─ "今すぐ Mod を探そう" 大型ボタン                │
│    └─ Fine print (Not affiliated with Mojang etc)     │
└───────────────────────────────────────────────────────┘
```

### 3.2 Hero 詳細 (3D)

```tsx
// components/landing/Hero3D.tsx (Client Component、dynamic import)
'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, MeshDistortMaterial } from '@react-three/drei';

export function Hero3D() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }} dpr={[1, 2]}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} />
      {/* Minecraft ブロック風の cube 群を数個配置、自動回転 */}
      <RotatingBlocks />
      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  );
}
```

- **Reduced Motion 対応**: `prefers-reduced-motion: reduce` を検知したら
  自動回転を停止 (WCAG 2.1 SC 2.3.3)
- **Fallback**: `<Suspense>` で loading 中は静止イラスト (SVG)、Three.js 読込
  失敗時 (WebGL 非対応環境) はグラデーション背景に fallback

### 3.3 スクロールアニメーション

- **IntersectionObserver + Anime.js** で「セクションが 20% 見えたら発火」
- 各セクションで fade-in + slight upward translate (`y: 40 → 0`)
- Feature cards は **stagger** (100ms ずつずらす) で洗練された感じに

```typescript
// components/landing/useScrollReveal.ts
'use client';
import { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

export function useScrollReveal(selector: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        animate(ref.current!.querySelectorAll(selector), {
          opacity: [0, 1],
          y: [40, 0],
          duration: 800,
          delay: stagger(100),
          ease: 'outCubic'
        });
        io.disconnect();
      }
    }, { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [selector]);
  return ref;
}
```

### 3.4 Header 非表示ロジック (成果物 C)

`components/AppShell.tsx` に pathname 判定を追加:

```tsx
const pathname = usePathname();
const isLandingPage = pathname === '/';

return (
  <>
    {!isLandingPage && <Header ... />}
    {children}
    <BottomNav ... />
  </>
);
```

**注意点**:
- BottomNav はランディングでも表示 (ハンバーガーメニューでテーマ変更等をしたい)
- ランディング側で「上部空間の pt-6」等を Header 非表示前提で調整

---

## 4. BottomNav 再設計 (成果物 B)

### 4.1 新構成 (4 タブ → 3 主タブ + 1 ハンバーガー)

**旧** (Phase 9-F): `Home / 探す / 現在のMod / 設定`
**新** (Phase 9.5): `Home / 探す (bottom sheet) / 現在のMod / メニュー (bottom sheet)`

| 位置 | 旧 | 新 |
|---|---|---|
| 左 | Home (Link → `/`) | Home (Link → `/`) |
| 中央左 | 探す (Link → `/mods`) | **探す (bottom sheet トリガー)** |
| 中央右 | 現在のMod (Link → `/profile`) | 現在のMod (Link → `/profile`) |
| 右 | 設定 (Link → `/settings`) | **メニュー (bottom sheet トリガー、ハンバーガーアイコン)** |

**理由**:
- Phase 11 で 4 カテゴリ (Mods / Modpacks / RP / Shader) が必要になるが、
  BottomNav に 7 アイコン並べるのは狭い → 「探す」で bottom sheet 経由
- Settings は使用頻度が中程度なので、テーマ切替と一緒にハンバーガーメニューへ

### 4.2 Bottom Sheet コンポーネント (共通化)

添付画像の Modrinth デザインを再現、共通コンポーネント `<BottomSheet>` として実装:

```tsx
// components/BottomSheet.tsx
'use client';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}

export function BottomSheet({ isOpen, onClose, children, ariaLabel }: BottomSheetProps) {
  // useModalA11y (Escape + focus trap) 再利用
  // 開閉アニメは Anime.js: translateY(100%) → 0 (300ms, outCubic)
  // 背景クリック (backdrop) で close
  // 上部に grabber (小さいバー) を表示 (視覚ヒント、ドラッグ操作は Phase 10 で検討)
  ...
}
```

**デザイン (添付画像から抽出)**:
- Sheet の背景: `bg-white` (light) / `bg-slate-900` (dark)、上部角丸 `rounded-t-3xl`
- 各ボタン: フル幅、`py-4 px-6`、`rounded-2xl`、text-base font-bold
- Primary ボタン: `bg-emerald-600 text-white` (DropMod 独自 accent green)
- Secondary ボタン: `bg-slate-50 border border-slate-200` (light) / `bg-slate-800 border-slate-700` (dark)
- ボタン間の間隔: `space-y-3`
- BottomNav 自体は常に見える (sheet の下、opacity 保持)
- BottomNav 右端のアイコンが `≡` → `✕` に切り替わる (Anime.js で回転 rotate)

### 4.3 「探す」ボタンの Bottom Sheet 内容 (成果物 B-1)

**Phase 11 準備**: 4 カテゴリを大きなカードで選択できる UI。各カード → 対応する
`/mods?type=xxx` にリンク (Phase 11 で fetchModrinthSearch に facets を追加)。

```text
┌────────────────────────────────────────┐
│  [ ✚ Mods ]                            │
│     .jar ファイル、動作追加             │
├────────────────────────────────────────┤
│  [ 📦 Modpacks ]                       │
│     Mod セット丸ごとパッケージ          │
├────────────────────────────────────────┤
│  [ 🎨 Resource Packs ]                 │
│     テクスチャ・音・言語               │
├────────────────────────────────────────┤
│  [ ✨ Shaders ]                        │
│     光影・水面表現 (Iris/OptiFine)     │
└────────────────────────────────────────┘
```

各カードのアイコン (FontAwesome):
- Mods: `fa-cube` (現状の Mod アイコンと統一)
- Modpacks: `fa-boxes-stacked` or `fa-cubes-stacked`
- Resource Packs: `fa-palette`
- Shaders: `fa-wand-sparkles` or `fa-sun`

**UI**:
- 4 カテゴリボタン、縦積み or 2x2 grid (画面幅で切替)
- 各ボタン: 左アイコン + 右矢印 `fa-chevron-right`、`py-4`
- タップで即座に close + `/mods?type=xxx` に遷移

**Phase 11 での拡張予定**: このシートに「フォルダから取り込み」ボタンも追加。

### 4.4 「メニュー」ボタンの Bottom Sheet 内容 (成果物 B-2)

**添付画像を DropMod 版に翻訳**:

| Modrinth | DropMod (順序) |
|---|---|
| Sign in (primary) | 🟢 ZIP 保存 (primary、`fa-file-zipper`) |
| Settings | Settings (`fa-gear`) |
| Change theme | Change theme (`fa-moon` / `fa-sun`) |
| — | ZIP 読込 (`fa-file-import`) |

4 ボタン、間隔・スタイルは添付画像通り。順序は「使用頻度が高いもの・目玉機能」を上に。

**特殊挙動**:
- **ZIP 保存**: 現在プロファイル (`useCurrentProfileWithFallback`) の mods を
  zip 化する既存 `handleDownloadZip` (useZipExport) を呼ぶ
- **Change theme**: 現在の `theme` に応じて `fa-moon` / `fa-sun` を出し分け、
  タップで即座に切替 + sheet は閉じない (アニメーションで theme 変化を見せる)
- **ZIP 読込**: hidden `<input type="file">` を trigger、既存 `handleImportZipInput` へ

### 4.5 Bottom Sheet 開閉アニメーション

```typescript
// Open
animate(sheetRef.current, {
  translateY: ['100%', '0%'],
  duration: 300,
  ease: 'outCubic'
});
animate(backdropRef.current, {
  opacity: [0, 1],
  duration: 200
});

// Close (逆)
```

**a11y**: Escape で close、focus trap は `useModalA11y` を再利用。

---

## 5. データフロー変更

### 5.1 BottomNav Props 追加

現行 `BottomNavProps`:
```typescript
interface BottomNavProps {
  activeTab: TabName;
  onSwitchTab: (tab: TabName) => void;
  modCount: number;
  hasDepWarning: boolean;
}
```

Phase 9.5 版:
```typescript
interface BottomNavProps {
  activeTab: TabName;
  onSwitchTab: (tab: TabName) => void;
  modCount: number;
  hasDepWarning: boolean;
  // ✚ Phase 9.5 追加
  theme: ThemeMode;
  onToggleTheme: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
}
```

これらは AppShell (既に `useProfilesStore` から `theme` 取得済み、`Header` に渡している) が
BottomNav にも渡す形。

### 5.2 `TabName` 型の拡張検討

現状 `type TabName = 'home' | 'mods' | 'profile' | 'settings'`。Phase 9.5 では:
- `'mods'` は bottom sheet トリガーになるので active 判定は `/mods` を含む path で維持
- `'settings'` は BottomNav から消えるが、`/settings` は URL として残る (ハンバーガー
  メニューから遷移可能)
- 新規に `'menu'` タブ疑似値を追加? → **不要**、`activeTab` は URL ベース判定なので
  ハンバーガー sheet が開いている時も背景の activeTab は変わらない

### 5.3 Landing で `AppShell` を通すか

**判断**: 通す。Header だけ非表示にし、BottomNav / Toast / Confirm / Providers は
そのまま利用したい。`AppShell.tsx` に `isLandingPage` フラグを 1 個追加するだけ
で対応可能 (§3.4)。

---

## 6. UI / UX 詳細

### 6.1 ランディングページのレスポンシブ

- **Desktop (≥1024px)**: Hero 3D が画面右半分、テキストが左半分の 2 カラム
- **Tablet (640-1023px)**: Hero 3D は上、テキスト下の縦積み
- **Mobile (<640px)**: Hero 3D の高さを 60vh に抑え、テキスト collapsed

### 6.2 Bottom Sheet のドラッグ操作

**Phase 9.5 では実装しない** (計画外)。将来的にドラッグで close できる UX は
Phase 10 以降で検討。

### 6.3 ダークモード対応

添付画像は light mode。dark mode 版は:
- Sheet 背景: `bg-slate-900/95` + backdrop blur
- ボタン背景: `bg-slate-800 border-slate-700`
- Primary は同じ `bg-emerald-600` を維持 (視認性)

### 6.4 Reduced Motion 対応

- Hero 3D の auto-rotate → 停止
- スクロールアニメ → 即座に最終状態を表示 (アニメなし)
- Bottom sheet の translateY アニメ → 200ms 短縮 (完全停止はしない、UX 保持)

---

## 7. 実装フェーズ分割 (Phase 9.5 内)

### Phase 9.5-A: 基盤 + BottomNav 再設計 (1 週)

- [ ] 依存追加: `pnpm add animejs three @react-three/fiber @react-three/drei`
- [ ] pnpm-workspace.yaml の allowBuilds 更新 (three は postinstall なし想定、確認)
- [ ] `components/BottomSheet.tsx` 共通コンポーネント新設
- [ ] `useModalA11y` を BottomSheet でも動くように調整 (必要なら)
- [ ] `components/BottomNav.tsx` 改修
  - 4 タブ → 3 主タブ + ハンバーガー
  - 「探す」ボタン → bottom sheet トリガー
  - ハンバーガーアイコン (`≡` / `✕` 切替)
- [ ] `components/BrowseBottomSheet.tsx` (「探す」sheet の中身、4 カテゴリ)
- [ ] `components/MenuBottomSheet.tsx` (ハンバーガー sheet の中身、4 ボタン)
- [ ] `AppShell.tsx` の Props 追加 (theme / onToggleTheme / onDownloadZip / onImportZip)
- [ ] 検証: 全ページで BottomNav が正しく動く、既存の /mods /profile 遷移も OK

### Phase 9.5-B: Header 条件付き非表示 + ランディング骨組み (0.5 週)

- [ ] `AppShell.tsx` に `isLandingPage = pathname === '/'` 判定追加
- [ ] Header 非表示ロジック
- [ ] 既存 `app/page.tsx` を新ランディング用に骨組み再構築
  - 7 セクション (§3.1) の空きコンテナだけ配置
  - 各セクションは Server Component として max-w + padding 設定
- [ ] レスポンシブ確認 (mobile / tablet / desktop)

### Phase 9.5-C: Hero 3D + Anime.js スクロール (1 週)

- [ ] `components/landing/Hero3D.tsx` (Client、dynamic import)
- [ ] `<Canvas>` 内で Minecraft ブロック風 cube 群を配置
- [ ] Auto-rotate、Reduced Motion 対応
- [ ] `useScrollReveal` hook 実装
- [ ] Feature Grid / Stats Counter / Screenshots / Coming Soon の各セクションに適用
- [ ] IntersectionObserver で発火、Anime.js で stagger アニメ
- [ ] Fallback (Suspense + SVG イラスト)

### Phase 9.5-D: コンテンツ充実 + polish (0.5 週)

- [ ] 各セクションの文言確定 (DropMod のブランドメッセージ)
- [ ] Screenshot 画像 (実際のアプリスクリーンショット、`public/landing/*.png`)
- [ ] Coming Soon セクションで Phase 11+ の予告 (「ローカル Minecraft 環境と直接同期」)
- [ ] Final CTA + fine print
- [ ] a11y 総点検 (Contrast、Focus、ARIA)
- [ ] Bundle 分析 (`.next/analyze/`) で dynamic import が効いているか確認

**合計**: 3 週間 (1 人フルタイム)

---

## 8. 実装上の注意点 (Gotchas)

### 8.1 Anime.js v4 の import 形式

v3 の default export は消失、named export のみ:
```typescript
// ✗ v3 の書き方 (エラーになる)
import anime from 'animejs';

// ✓ v4
import { animate, stagger, createTimeline } from 'animejs';
```

### 8.2 Three.js の SSR 対策

`@react-three/fiber` は SSR で `window is not defined` になる。
**必ず dynamic import + `ssr: false`** で:

```typescript
import dynamic from 'next/dynamic';

const Hero3D = dynamic(() => import('@/components/landing/Hero3D'), {
  ssr: false,
  loading: () => <HeroFallback />
});
```

### 8.3 Bundle 削減 (Three.js の tree-shake)

`three` パッケージは巨大 (600 KB uncompressed)。以下で削減:
- `import { WebGLRenderer, Scene, PerspectiveCamera } from 'three'` のように
  必要な export のみ import (`@react-three/fiber` 経由なら自動処理)
- `@react-three/drei` は use するコンポーネントだけ import
  (`import { OrbitControls } from '@react-three/drei/core/OrbitControls'` 等)

### 8.4 BottomSheet と既存モーダルの Z-index

現状: ConfirmDialog `z-[60]`、Modal `z-50`、Header `z-30`、BottomNav `z-40`。
BottomSheet の z-index は BottomNav (`z-40`) と ConfirmDialog (`z-[60]`) の
間 = **`z-[50]`** に設定。既存モーダルとの整合を保つ。

### 8.5 SEO への配慮

ランディングページは SEO 最重要。以下を守る:
- Hero 3D の下に必ず `<h1>DropMod</h1>` が SSR HTML に存在すること
- 各セクションに `<h2>`〜`<h3>` を適切に配置
- 3D scene は装飾なので `aria-hidden="true"` を Canvas に付与
- `robots.ts` は既存の全許可のまま

### 8.6 モバイル UX

- Hero 3D はモバイルで **DPR を 1 に固定** (`dpr={[1, 1]}`) してパフォーマンス確保
- スクロールアニメが多いページは iPhone Safari で jank しやすい → GPU 加速
  (`will-change: transform, opacity`) 適用
- Bottom Sheet はモバイルで `100vh` フル使う可能性があるが、Modrinth 準拠で
  「必要な高さだけ」 (`max-h-[50vh]`) に留める

### 8.7 テスト戦略

- **Unit**: `BottomSheet` の open/close 状態遷移、Anime.js 呼び出しのモック
- **E2E**: Playwright で「探す」タップ → 4 カテゴリ表示 → 選択 → `/mods` 遷移、
  ハンバーガータップ → テーマ切替、Escape で close
- **Visual regression**: Percy 等は導入しない (Phase 9.5 スコープ外)、代わりに
  screenshot 手動レビュー

---

## 9. 【重要】既存機能への影響

### 9.1 Header の "設定タブ" 呼び出し

現状 `Header` は `onSwitchTab('settings')` を呼ぶ経路があるかも → grep で確認、
BottomNav から settings が消えても `/settings` URL は残るので影響なし。

### 9.2 activeTab 判定

`AppShell` の `PATH_TO_TAB` mapping で `/settings` → `'settings'` を維持。
BottomNav に settings アイコンが無くても `activeTab` の状態は保持される
(将来復活させる場合に備える)。

### 9.3 E2E テスト影響

現状の `e2e/smoke.spec.ts` などで BottomNav をタップして遷移するテストがある
場合、修正が必要。`data-testid` を BottomSheet トリガーにも付与しておく。

---

## 10. 未解決の設計論点 (実装前に確定すべき)

- [ ] Screenshot に使う画像 3-4 枚をどう用意するか (実アプリのキャプチャ / モック画像)
- [ ] Community セクションで GitHub star 数を動的に取得するか (静的表示で OK?)
- [ ] Bottom sheet を open した状態で URL 遷移が起きた場合の close 挙動
      (`usePathname` 変化を検知して自動 close?)
- [ ] Hero 3D のブロックデザイン (Minecraft cube 風 or DropMod ロゴ風)

---

## 11. Roadmap: Phase 9.5 以降

- **Phase 10** (`docs/planning/PHASE10_CANDIDATES.md`): bundle 削減 / AppContext 削除 等
- **Phase 11** (`docs/planning/PHASE11_PLAN.md`): ローカル Minecraft 環境 Import
  → 「探す」sheet に「フォルダから取り込み」ボタンを追加、ハンバーガーメニューにも
  「フォルダから Import」を追加検討
- **Phase 12+**: Sync / Modpack 対応

---

## 12. 検証方針

各サブフェーズ (9.5-A/B/C/D) 完了時に以下を必ず全緑にする:

- [ ] `pnpm typecheck` (main + test): 0 error
- [ ] `pnpm exec biome lint .`: 0 errors / 0 warnings
- [ ] `pnpm test:unit`: 全 test pass
- [ ] `pnpm build`: ✓ Compiled successfully
- [ ] `pnpm build --webpack`: ✓ (Vercel 本番互換確認)
- [ ] ローカル `pnpm start` で全ページ HTTP 200 (`/`, `/mods`, `/profile`, `/settings`, `/mods/sodium`)
- [ ] Reduced Motion モードで再確認
- [ ] Mobile viewport (Chrome DevTools 375x812) で BottomSheet 動作確認
- [ ] `.archive/vite/` 無変更

---

## 13. 見積工数まとめ

| サブフェーズ | 内容 | 週数 |
|---|---|---|
| 9.5-A | 基盤 + BottomNav 再設計 | 1 週 |
| 9.5-B | Header 条件非表示 + ランディング骨組み | 0.5 週 |
| 9.5-C | Hero 3D + Anime.js スクロール | 1 週 |
| 9.5-D | コンテンツ充実 + polish | 0.5 週 |
| **合計** | | **3 週** |

**リスク係数**: Three.js の bundle 化と SSR 対策、Anime.js v4 の学習曲線を考慮し
**+1 週間バッファ** で **合計 3〜4 週**。

---

**関連ドキュメント**:
- `docs/planning/PHASE10_CANDIDATES.md` — Phase 10 候補
- `docs/planning/PHASE11_PLAN.md` — Phase 11 (Read-only Import)
- `docs/planning/PHASE12_PLAN.md` — Phase 12 (Sync + Modpack)
- 添付画像: Modrinth モバイル UI (下部 nav + bottom sheet の 2 状態)
- 既存資産: `hooks/useModalA11y.ts`, `hooks/useZipExport.ts`, `hooks/useZipImport.ts`,
  `components/BottomNav.tsx`, `components/AppShell.tsx`
