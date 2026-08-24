# URL ルーティング再設計 計画書（改定版：モーダル・詳細ページ維持）

> **作成日:** 2026-08-24 (JST) ／ **改定日:** 2026-08-24（モーダル廃止→取りやめ、モーダル/詳細維持に方針変更）
> **対象ブランチ:** `arena/01a0337c-dropmod`
> **ステータス:** 計画（実装前。ユーザー合意済み）
> **位置づけ:** Phase 11/12/13（機能追加）とは別の、**情報設計（IA）/ ルーティングの単独リファクタ**。Phase 番号は付与しない。

---

## 0. 前提（重要）

本サイトは **Vercel 未デプロイ**（最終 Phase で公開）。外部被リンク・SEO 蓄積ゼロ。よって **URL 構造の変更コストが今が最小**。将来の Phase 11/12/13 を見据え、ここで構造を安定させる。

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

---

## 2. 方針（改定版）

> **モーダル（スマホで扱いやすい）と詳細ページは現状のまま残す。** ルーティングの**名前・構造のみ**整理し、モーダルに**「詳細ページ」ボタンを追加**して詳細ページへの導線を容易にする。

1. **検索**: `/discover/{mods,modpacks,resourcepacks,shaders}`（**すべて複数形**に正規化）。`/discover` を「探索」名前空間として維持。案C（検索の `/mods` 等への全面移行）は不採定。
2. **プレビューモーダル**: `/discover/<複数形>/<slug>`（例: `/discover/mods/sodium`）。**コンポーネント `ModDetailModalShell`・見た目・挙動（一覧の上に重ねる・戻るで状態保持）は現状のまま**。
3. **詳細ページ**: `/{mod,modpack,resourcepack,shader}/[slug]`（**単数形・型別**、Modrinth 準拠）。**コンポーネント `ModDetailPageView` は現状のまま**。
4. **モーダルに「詳細ページ」ボタンを追加** → `/<型>/<slug>`（詳細ページ）へ遷移。モーダル URL と詳細 URL を**分離**したことでボタンが自然に機能する。
5. **URL 生成は一元化**（`project_type + slug → モーダル URL / 詳細 URL` を 1 箇所で定義）。
6. **4 責務を分離**: Discovery（`/discover/<複数>`）／ Preview（`/discover/<複数>/<slug>` モーダル）／ Detail（`/<型>/<slug>`）／ External（Modrinth）。

> ※ モーダルと詳細ページを**別 URL** にする（推奨案・確定）。モーダルの「一覧を保持したまま重ねる」UX は **Intercepting Route** で現状どおり維持。

---

## 3. 最終 URL 設計

| 要素 | URL | コンポーネント | 状態 |
| :--- | :--- | :--- | :--- |
| LP | `/` | 既存 RSC | 変更なし |
| 検索一覧 | `/discover/{mods,modpacks,resourcepacks,shaders}` | `HomeInteractive` | セグメント複数形化 |
| **プレビューモーダル** | `/discover/<複数>/<slug>` | `ModDetailModalShell`（**そのまま**）+ **「詳細ページ」ボタン追加** | 新 URL |
| **詳細ページ** | `/{mod,modpack,resourcepack,shader}/[slug]` | `ModDetailPageView`（**そのまま**） | 型別へ |
| プロファイル / 設定 | `/profile` `/settings` | 既存 | 変更なし |
| 予約ハブ | `/modpack` `/resourcepack` `/shader` | `ReservedCategoryPage`（Phase 11/12） | 変更なし |

---

## 4. アーキテクチャ

### モーダル（Preview）＝ `/discover/<型>/<slug>` + Intercept

```
app/discover/[type]/
  layout.tsx              ← {children, modal}（@modal slot をここへ集約）
  page.tsx                ← 一覧（/discover/mods 等）
  [slug]/page.tsx         ← モーダル直接アクセス（ModDetailModalShell）
  @modal/(.)[slug]/page.tsx ← モーダル Intercept（soft nav → 一覧を破棄せず重ねる）
```

- 一覧（`/discover/<複数>`）でカードクリック → `/discover/<複数>/<slug>` へ soft nav → `(.)` Intercept 発動 → モーダルが一覧の上に重なり、**一覧は mount されたまま（状態保持）**。
- 戻る → モーダルが閉じ、一覧が**状態そのまま**で復元。
- 直接 URL アクセス・共有 → `[slug]/page.tsx` がモーダルを単体描画。

### 詳細ページ（Detail）＝ `/<型>/<slug>`

- モーダルの「詳細ページ」ボタン・プロファイル/LP のカード・直接 URL から遷移。
- `ModDetailPageView` でフル詳細を描画（現状のまま）。

### 導線まとめ

```
検索一覧(/discover/<複数>) ─クリック→ Preview Modal(/discover/<複数>/<slug>) ─「詳細ページ」ボタン→ Detail Page(/​<型>/​<slug>)
プロファイル/LP ─クリック→ Detail Page(/​<型>/​<slug>)  ※モーダル経由しない（現状どおり）
```

---

## 5. コンポーネント設計

- **`ModDetailModalShell`（既存・ほぼそのまま）**: モーダル本文は変更しない。**フッタのボタン群に「詳細ページ」ボタンを追加**（`router.push(detailPathFromProject(project.project_type, slug))`）。variant="modal" の挙動も現状どおり。
- **`ModDetailPageView`（既存・そのまま）**: フル詳細。「戻る」リンク先を `/discover/<複数>` に更新する程度。
- **URL 生成の一元化（`lib/constants/search.ts`）**:
  - `discoverPathForType(type)` → `/discover/<複数>` （既存を複数形化）
  - `modalPathForType(type, slug)` → `/discover/<複数>/<slug>` （新規）
  - `detailPathForType(type, slug)` → `/<型>/<slug>` （新規・単数形）
  - `detailPathFromProject(projectType, slug)` / `modalPathFromProject(...)`
  - `parseDiscoverSegment`（複数形）/ `parseDetailType`（単数形）
  - 各所（`ModCard`/`ModsPageClient`/LP/モーダル/詳細）は**URL 文字列を直接組み立てず**これらを使用。

---

## 6. ルート構成（ファイルツリー）

### 新規
```
app/discover/[type]/
  layout.tsx                          ← {children, modal}（@modal slot を /discover からここへ移動）
  [slug]/page.tsx                     ← モーダル直接アクセス（ModDetailModalShell）
  [slug]/loading.tsx                  ← skeleton（共通化）
  @modal/default.tsx                  ← null
  @modal/(.)[slug]/page.tsx           ← モーダル Intercept（ModDetailModalShell）
  @modal/(.)[slug]/loading.tsx        ← skeleton
app/mod/[slug]/page.tsx               ← 詳細 直接アクセス（ModDetailPageView）★型別×4
app/mod/[slug]/loading.tsx
app/modpack/[slug]/page.tsx
app/resourcepack/[slug]/page.tsx
app/shader/[slug]/page.tsx
lib/server/project-detail.ts          ← 共有ロジック（staticParams/metadata/data fetch。詳細とモーダルで共用）
```

### 変更
```
app/discover/[type]/page.tsx          ← 複数形セグメント（generateStaticParams/TITLES）
app/discover/layout.tsx               ← @modal slot 破棄（[type]/layout.tsx へ移動）→ 単純化 or 削除
lib/constants/search.ts               ← URL 生成一元化（複数形 discover / モーダル / 単数形 detail）
components/ModDetailModalShell.tsx    ← 「詳細ページ」ボタン追加
components/ModDetailPageView.tsx      ← 「戻る」リンク先を /discover/<複数>
components/ModCard.tsx                ← モーダル URL へリンク（検索一覧のカード）
components/ModsPageClient.tsx         ← 詳細 URL へ router.push（プロファイル）
components/landing/{PreviewCard,PopularMarquee}.tsx ← 詳細 URL へ（LP）
components/{BrowseBottomSheet,AppShell,DesktopSidebar}.tsx ← /discover/<複数>・active 判定
app/sitemap.ts                        ← 詳細 URL 型別化・検索複数形化（モーダル URL は SEO 上 sitemap から除外、詳細を正とする）
app/page.tsx (LP Footer)              ← /discover/<複数形>
app/{resourcepack,shader,modpack}/page.tsx ← ReservedCategoryPage の searchType を複数形に
next.config.ts                        ← 旧 redirect 削除（/mod/:slug→/mods/:slug 等）
```

### 削除
```
app/mods/                             ← 一式（page.tsx / [slug]/ / @modal/ / layout.tsx）
app/discover/@modal/                  ← 一式（旧 cross-namespace Intercept (...)mods/[slug] + default.tsx）
```

---

## 7. 「戻る」挙動

| コンテキスト | 挙動 |
| :--- | :--- |
| 一覧からモーダルを開いて戻る | 一覧が**状態保持**で復元（Intercept で一覧が生存しているため） |
| モーダルの「詳細ページ」ボタン | `/<型>/<slug>`（詳細ページ）へ遷移。モーダルは閉じ、一覧状態は失われる（明示的な詳細遷移のため許容） |
| 詳細ページの「戻る」 | ブラウザ戻る または `<Link href="/discover/<複数>">` で一覧へ |
| プロファイル/LP から詳細へ | 直接 `/<型>/<slug>`（モーダル経由なし、現状どおり） |

---

## 8. 実装ステップ（小さく、順に）

> **ルーティング変更と UI 変更を同時に大きく行わない**。モーダル/詳細の**コンポーネントは流用**し、新規デザインしない（唯一の UI 追加は「詳細ページ」ボタン1つ）。

1. URL 生成ルールを一元化（`lib/constants/search.ts`: 複数形 discover / モーダル URL / 単数形 detail）＋単体テスト更新
2. 詳細ルート `/<型>/[slug]` 4 本 + 共有ロジック（直接アクセス用）
3. モーダルルート `/discover/[type]/[slug]` + `@modal/(.)[slug]` Intercept 再構成（`ModDetailModalShell` 流用）
4. `ModDetailModalShell` に「詳細ページ」ボタン追加
5. 各種リンク・`router.push`（ModCard=モーダル URL / ModsPageClient・LP=詳細 URL）・Nav active 判定を更新
6. `metadata` / canonical / `sitemap.ts` を更新
7. `app/discover/[type]/layout.tsx` に `{modal}` slot 導入、`app/discover/layout.tsx` の旧 slot 破棄
8. dead route 削除（`app/mods/` 一式・旧 `app/discover/@modal/`）＋ `next.config.ts` 旧 redirect 削除
9. `pnpm typecheck` / `pnpm exec biome lint .` / `pnpm test:unit` / `pnpm build`（`.archive/vite/` 無変更確認）
10. 遷移を確認（一覧→モーダル→戻る の状態保持／モーダル→詳細ページ／プロファイル→詳細／直接 URL）→ commit

---

## 9. スコープ外（明示）

- **モーダル（Preview）UI の刷新**: コンポーネント・見た目は現状維持（「詳細ページ」ボタン追加のみ）。
- **モーダル廃止**: 取りやめ（スマホでモーダルが扱いやすいため存続）。
- **ルートレベル Intercept による全ページ状態保持**: 取りやめ（モーダルは検索一覧からの導線に限定し、現状の局所 Intercept で維持）。
- **案C（検索 URL の `/mods` 等への全面移行）**: 不採用。
- **Phase 11/12/13 の機能実装**: 本計画は IA/ルーティングのみ。

---

## 10. リスク・ロールバック

| リスク | 影響 | 軽減策 |
| :--- | :--- | :--- |
| モーダル Intercept（`(.)[slug]`）が一覧状態を保持しない | 🟠 High | ステップ 3 で「一覧→モーダル→戻る」を必ず手動確認。発動しない場合は階層見直し |
| 4 型の詳細/モーダルルート重複実装で保守性低下 | 🟡 Med | 共有ロジック（`lib/server/project-detail.ts`）に集約し各 page.tsx は薄く保つ |
| 旧 `/mods/` 参照漏れ | 🟡 Med | ステップ 5 後、grep で `/mods/` 残存 0 件を確認 |
| モーダルと詳細でデータ取得二重化 | 🟡 Med | 同一の `fetchProjectDetailData(slug)` を共用 |

**ロールバック**: 本変更は 1 ブランチ上のコミット群。問題時は該当 commit を revert（`.archive/vite/` は全期間不変）。

---

## 11. Definition of Done (DoD)

- [ ] 検索 URL がすべて複数形（`/discover/{mods,modpacks,resourcepacks,shaders}`）
- [ ] 詳細 URL が型別単数形（`/{mod,modpack,resourcepack,shader}/[slug]`）
- [ ] モーダル URL が `/discover/<複数>/<slug>`（一覧から開くと一覧状態を保持）
- [ ] モーダルに「詳細ページ」ボタンがあり、`/<型>/<slug>` へ遷移する
- [ ] `app/mods/`・旧 `app/discover/@modal/` が存在しない（`git ls-files` で 0 件）
- [ ] `ModDetailModalShell`・`ModDetailPageView` は**コンポーネントとして削除せず**流用（UI は現状維持＋ボタン1つ追加）
- [ ] URL 生成が `lib/constants/search.ts` に一元化され、`/mods/` 直接組み立てが 0 件（grep）
- [ ] `pnpm typecheck` / `pnpm exec biome lint .` / `pnpm test:unit` / `pnpm build` すべて pass
- [ ] `.archive/vite/` 無変更
- [ ] `docs/README.md` 目次反映済

---

## 12. 関連

- 経緯: 本セッションの設計議論（モーダル廃止を検討後、スマホ UX から存続に決定 → URL 構造のみ整理 + 「詳細ページ」ボタン追加）。
- `docs/planning/NEXTJS_MIGRATION_PLAN.md` §6（旧 Phase 4 の Intercepting Route 設計）。
- AGENT.md §6.9（計画書 > AGENT.md）。
