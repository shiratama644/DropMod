# URL ルーティング再設計 計画書（案B+ 最終版）

> **作成日:** 2026-08-24 (JST)
> **対象ブランチ:** `arena/01a0337c-dropmod`
> **ステータス:** 計画（実装前。ユーザー合意済み）
> **本計画の位置づけ:** Phase 11/12/13（機能追加）とは別の、**情報設計（IA）/ ルーティングの単独リファクタ**。Phase 番号は付与しない。

---

## 0. 前提（重要）

本サイトは **Vercel 未デプロイ**（最終 Phase で公開）。外部被リンク・SEO 蓄積ゼロ。よって **URL 構造の変更コストが今が最小**。将来の Phase 11/12/13（ローカル環境 Import / Sync / CurseForge）を見据え、ここで構造を安定させる。

---

## 1. 背景・現状の問題

| # | 問題 |
| :--- | :--- |
| 1 | 詳細 `/mods/[slug]` 配下 なのに 一覧は `/discover/mods`。名前空間が分断 |
| 2 | `/mods` は検索へ飛ぶ死ページ（`next.config` 308 ＋ `app/mods/page.tsx` redirect の二重） |
| 3 | `/mods/@modal/(.)[slug]` は dead Intercept（`/mods` がリダイレクトなので発火しない） |
| 4 | 詳細 URL が型問わず `/mods/[slug]`。shader/RP も "mods" 配下に見える（Modrinth は `/shader/[slug]` 等で型別） |
| 5 | 予約ハブ `/modpack` `/resourcepack` `/shader` と 検索 `/discover/{modpack,resourcepack,shader}` の URL 2 重化 |
| 6 | discover セグメントの単複不揃い（`mods` 複数 / `modpack` `resourcepack` `shader` 単数） |

加えて、ユーザー要望: **「どのページから Mod を開いても、戻ればそのページの状態（スクロール・フィルタ・選択中プロファイル等）が保存される」こと**。

---

## 2. 方針（採用: 案B+）

1. **検索**: `/discover/{mods,modpacks,resourcepacks,shaders}`（**すべて複数形**に正規化）。`/discover` を「探索」名前空間として維持。案C（検索の `/mods` 等への全面移行）は不採用。
2. **詳細**: `/{mod,modpack,resourcepack,shader}/[slug]`（**単数形・型別**、Modrinth 準拠）。URL だけで Project Type が判別可能。
3. **モーダル（ポップアップ）は廃止**。詳細は「詳細ページ」1 ビューに統一（`ModDetailPageView`）。`ModDetailModalShell` は削除。
4. **Intercepting Route はルートレイアウトに配置**（Phase 4 の構成に戻す）。これにより **カードを含む全ページ（検索一覧・プロファイル・設定・LP）から Mod を開いて戻った時、元のページの状態が保持**される。
5. **URL 生成は一元化**（`project_type + slug → /<型>/<slug>` を 1 箇所で定義）。
6. **4 責務を分離**: Discovery / Preview(廃止) / Detail / External。

> ※ 状態保持と「ルーティング完全ゼロ複雑」は両立しない（URL 遷移 = 前ページ破棄のため）。本計画は **状態保持を優先**し、Intercepting Route（Parallel Slot）を**ルートに残す**。ただし現状よりポップアップモーダル廃止で **1 コンポーネント削除・1 ビュー化** されシンプルになる。

---

## 3. 最終 URL 設計

| 要素 | URL | レンダリング |
| :--- | :--- | :--- |
| LP | `/` | RSC（既存） |
| 検索一覧 | `/discover/{mods,modpacks,resourcepacks,shaders}` | RSC + `HomeInteractive`（既存） |
| 詳細 | `/{mod,modpack,resourcepack,shader}/[slug]` | `ModDetailPageView`（統一） |
| プロファイル | `/profile` | Client（既存） |
| 設定 | `/settings` | Client（既存） |
| 予約ハブ | `/modpack` `/resourcepack` `/shader` | `ReservedCategoryPage`（Phase 11/12、既存。詳細の名前空間ルートを兼務） |

**モーダル URL は不存在**（ポップアップ廃止）。詳細は常に `/<型>/[slug]`。

---

## 4. アーキテクチャ（状態保持の仕組み）

```
RootLayout (RSC)
 └ <body>
     <QueryProviders>
       <AppShell>            ← {children, modal} を受け取る（Phase 4 構成に戻す）
         {children}          ← 現在のページ（検索一覧 / プロファイル / …）★破棄されない
         {modal}             ← Intercept 発動時のみ詳細オーバーレイ（通常は null）
       </AppShell>
```

- カードクリック → `router.push('/<型>/<slug>')` → **ルート `@modal` の Intercept が発動** → `{modal}` に詳細が**全画面オーバーレイ**で描画され、`{children}`（元のページ）は **mount されたまま生存** → スクロール・フィルタ・選択中プロファイル等の**クライアント状態が保持**される。
- 戻る（ブラウザ戻る／詳細の「戻る」）→ `{modal}` がクリア → 元のページが**状態そのまで**復元。
- 直接 URL アクセス・共有リンク → Intercept 非発動 → `app/<型>/[slug]/page.tsx` が通常のフルページとして描画（背後にページ無し）。

> Intercept で描画するのは **ポップアップモーダルではなく、詳細ページと同じ `ModDetailPageView` を載せた全画面オーバーレイ**。見た目は「詳細ページへ遷移した」通りで、ポップアップには見えない。

---

## 5. コンポーネント設計

- **`ModDetailPageView`（既存・内容共通）**: 詳細本文。Intercept・直接アクセス**両方で同じ内容**を使用。`variant: 'intercept' | 'page'` を導入し **「戻る」の挙動のみ**切替:
  - `intercept`: `router.back()`（裏ページを状態保持したまま復元）
  - `page`（直接アクセス）: `<Link href="/discover/<型>">` フォールバック
- **フルスクリーンオーバーレイラッパ（新規・小）**: Intercept 用。`fixed inset-0` 不透明背景 + スクロール領域に `ModDetailPageView` を載せる。ポップアップ特有の backdrop blur / 中央寄せカード / focus-trap は持たない（「ページ」に見せる）。
- **`ModDetailModalShell`（既存）は削除**: ポップアップモーダルの廃止により不要。
- **URL 生成の一元化（`lib/constants/search.ts`）**:
  - `detailPathForType(type, slug)` → `/<型>/<slug>`（単数）
  - `detailPathFromProject(projectType, slug)`
  - `discoverPathForType(type)` → `/discover/<複数形>`（既存を複数形化）
  - `parseDetailType` / `parseDiscoverSegment`（複数形）
  - `ModCard`・検索結果・`ModsPageClient`・LP・詳細「戻る」等は**直接 URL 文字列を組み立てず**、これらの関数を使用。

---

## 6. ルート構成（ファイルツリー）

### 新規
```
app/
  @modal/                              ← ★ルートに Parallel slot を復活
    default.tsx                        ← null
    (...)mod/[slug]/page.tsx           ← 詳細 Intercept（型別×4、共有ロジックで薄く）
    (...)mod/[slug]/loading.tsx        ← skeleton（共通コンポーネント）
    (...)modpack/[slug]/page.tsx
    (...)resourcepack/[slug]/page.tsx
    (...)shader/[slug]/page.tsx
  mod/[slug]/page.tsx                  ← 詳細 直接アクセス（型別×4、共有ロジックで薄く）
  mod/[slug]/loading.tsx               ← skeleton（共有）
  modpack/[slug]/page.tsx
  resourcepack/[slug]/page.tsx
  shader/[slug]/page.tsx
```

### 変更
```
app/layout.tsx                         ← {children, modal} 受け取り（AppShell へ modal も渡す）
app/discover/[type]/page.tsx           ← 複数形セグメント対応（generateStaticParams/TITLES）
app/discover/layout.tsx                ← @modal slot を破棄（ルートへ移動）→ 単純化 or 削除
lib/constants/search.ts                ← URL 生成一元化（複数形 discover / 単数形 detail）
components/ModDetailPageView.tsx       ← variant (intercept/page) の「戻る」切替
components/ModCard.tsx                 ← detailPathForType 使用
components/ModsPageClient.tsx          ← router.push(detailPathForType(...))
components/landing/{PreviewCard,PopularMarquee}.tsx ← 同上
app/sitemap.ts                         ← 詳細 URL 型別化・検索複数形化
app/page.tsx (LP Footer)               ← /discover/<複数形> リンク更新
components/{BrowseBottomSheet,AppShell,DesktopSidebar}.tsx ← /discover/<複数形>・active 判定更新
app/{resourcepack,shader,modpack}/page.tsx ← ReservedCategoryPage の searchType を複数形に
next.config.ts                         ← 旧 redirect 削除（/mod/:slug→/mods/:slug 等）
```

### 削除
```
app/mods/                              ← 一式（page.tsx / [slug]/ / @modal/ / layout.tsx）
app/discover/@modal/                   ← 一式（旧 cross-namespace Intercept、default.tsx 含む）
components/ModDetailModalShell.tsx     ← ポップアップモーダル
```

### 共有ロジック（新規モジュール、重複回避）
- `lib/server/project-detail.ts`: `generateDetailStaticParams(type)` / `fetchDetailData(slug)` / `buildDetailMetadata(type, slug)`。4 つの直接ルートと 4 つの Intercept ルートから利用。

---

## 7. 「戻る」挙動（コンテキスト別）

| コンテキスト | 「戻る」の動作 |
| :--- | :--- |
| Intercept（一覧/プロファイル等から開いた） | `router.back()` → 元ページが**状態保持**で復元 |
| 直接 URL アクセス・共有リンク | `<Link href="/discover/<型>">` で該当型の検索一覧へ |
| 履歴が無い（外部から直接） | `router.push('/discover/<型>')` フォールバック |

---

## 8. 実装ステップ（小さく、順に）

> **ルーティング変更と UI 変更を同時に大きく行わない**（本計画はルーティング＋データ/URL 設計が主。UI は `ModDetailPageView` をそのまま流用し、新規デザインしない）。

1. URL 生成ルールを一元化（`lib/constants/search.ts`: 複数形 discover + 単数形 detail + 関数群）＋単体テスト更新
2. 詳細ルート `/<型>/[slug]` 4 本 + 共有ロジック（直接アクセス用）
3. ルート `@modal` Intercept 4 本（フルスクリーンオーバーレイ + `ModDetailPageView variant="intercept"`）
4. 各種リンク・`router.push`・LP・Footer・Nav の active 判定を更新
5. `metadata` / canonical / `sitemap.ts` を更新
6. `app/layout.tsx` に `{modal}` slot を導入、旧 `/discover` slot を破棄
7. dead route 削除（`app/mods/` 一式・旧 `/discover/@modal/`・`ModDetailModalShell`）＋ `next.config.ts` 旧 redirect 削除
8. `pnpm typecheck` / `pnpm exec biome lint .` / `pnpm test:unit` / `pnpm build`（`.archive/vite/` 無変更確認）
9. 遷移を確認（一覧→詳細→戻る の状態保持、プロファイル→詳細→戻る、直接 URL）→ commit

---

## 9. スコープ外（明示）

- **モーダル（Preview）UI の刷新**: 廃止したため不要。
- **「詳細ページへ移動」ボタン**: カードが直接詳細へ遷移するため不要（前回要件は解消）。
- **案C（検索 URL の `/mods` `/modpacks` 等への全面移行）**: 不採用。検索は `/discover/<複数形>` を維持。
- **Phase 11/12/13 の機能実装**: 本計画は IA/ルーティングのみ。

---

## 10. リスク・ロールバック

| リスク | 影響 | 軽減策 |
| :--- | :--- | :--- |
| Intercept が期待通り発動しない（状態保持されない） | 🟠 High | ステップ 3 で一覧→詳細→戻る を必ず手動確認。発動しない場合は `(.)`/`(..)`/`(...)` の階層見直し |
| 4 型の直接/Intercept ルート重複実装で保守性低下 | 🟡 Med | 共有ロジック（`lib/server/project-detail.ts`）に集約し各 page.tsx は薄く保つ |
| 旧 URL `/mods/[slug]` 参照漏れ | 🟡 Med | ステップ 4 で全リンク更新後、grep で `/mods/` 残存 0 件を確認 |
| ルート `@modal` 導入によるレイアウト副作用 | 🟡 Med | `{modal}` は通常 null、発動時のみ固定オーバーレイ。AppShell への渡し方を Phase 4 実績に倣う |

**ロールバック**: 本変更は 1 ブランチ上のコミット群。問題時は該当 commit を revert（`.archive/vite/` は全期間不変）。

---

## 11. Definition of Done (DoD)

- [ ] 検索 URL がすべて複数形（`/discover/{mods,modpacks,resourcepacks,shaders}`）
- [ ] 詳細 URL が型別単数形（`/{mod,modpack,resourcepack,shader}/[slug]`）
- [ ] `app/mods/`・`app/discover/@modal/`・`ModDetailModalShell` が存在しない（`git ls-files` で 0 件）
- [ ] ルート `@modal` による Intercept が、一覧 AND プロファイル の**両方**から詳細を開いて戻った時に**状態を保持**する（手動確認）
- [ ] URL 生成が `lib/constants/search.ts` に一元化され、`/mods/` 直接組み立てが 0 件（grep）
- [ ] `pnpm typecheck` / `pnpm exec biome lint .` / `pnpm test:unit` / `pnpm build` すべて pass
- [ ] `.archive/vite/` 無変更
- [ ] `docs/README.md` 目次反映済

---

## 12. 関連

- 経緯: 本セッションの設計議論（モーダル廃止→詳細ページ化→状態保持のため Intercept をルート配置）。
- `docs/planning/NEXTJS_MIGRATION_PLAN.md` §6（旧 Phase 4 のルート `@modal` 設計）— 本計画はその構成を現代化して復活させる。
- AGENT.md §6.9（計画書 > AGENT.md）。
