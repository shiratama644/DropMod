# SEO 改善候補リスト

> **作成日:** 2026-08-24 (JST)
> **位置づけ:** バックログ（候補集）。**現在の優先は Phase 11/12（ローカル環境 Import/Sync）。** 本リストの本格実施は Phase 11/12 完了後を想定。低コスト項目は並行で anytime 実施可。
> **制約:** SEO 効果は **Vercel デプロイ後でないと実測不可**（Sandbox は CDN 到達不可＋ Chromium 不可、§6.2/§7.7）。実装は可能だが計測は本番公開後。

---

## 0. 前提：優先順位

1. **Phase 11 / 12 を先に進める**（本リストより優先）。
2. 本リストは Phase 11/12 後に再開。ただし **§2-1「重複コンテンツ対策」だけは極小変更かつ実害リスク**（ルーティング再設計で発生）のため、**タイミングを問わず早期実施を推奨**（任意）。

---

## 1. 現状（実装済＝事実）

| 項目 | 状態 | 箇所 |
| :--- | :--- | :--- |
| SSR / ISR（Home・詳細ページ） | ✅ HTML に本文含む | `app/page.tsx`・`app/[projectType]/[slug]/page.tsx` |
| メタデータ（title template・description・OGP・Twitter Card） | ✅ | `generateMetadata`／`app/layout.tsx` |
| canonical URL | ✅ | 詳細ページ `alternates.canonical`（`/<型>/<slug>`） |
| `sitemap.xml`（静的 + 人気Mod100件） | ✅ | `app/sitemap.ts` |
| `robots.txt`（Allow /・Disallow /api/・Sitemap） | ✅ | `app/robots.ts` |
| `manifest.webmanifest`・favicon・セキュリティヘッダ | ✅ | `app/manifest.ts`・`next.config.ts` |
| h1=1・見出し階層 | ✅ | 各ページ（C6-1） |
| 308 リダイレクト・型別クリーン URL（`/mod/sodium`） | ✅ | `next.config.ts`・ルーティング再設計 |

基礎 SEO は固まっている。次の主戦場は **「リッチリザルト化」「拡散（OGP）」「重複排除」**。

---

## 2. 候補一覧（優先度別）

### 🥇 高優先

#### 2-1. 重複コンテンツ対策（モーダル vs 詳細）⚠️直近で発生
**背景**: ルーティング再設計で同一 Mod に 2 URL が発生:
- `/discover/<複数>/<slug>`（プレビューモーダル）
- `/<型>/<slug>`（詳細フルページ）

両者の中身が似ており、Google に**重複コンテンツ**と判定されると順位が分散・低下する。

**対策**（いずれか）:
- (推奨) モーダル直接ページ `app/discover/[type]/[slug]/page.tsx` を **noindex**:
  ```ts
  export const metadata = { robots: { index: false, follow: true } };
  ```
  → 詳細 `/<型>/<slug>` を「正」として index。
- または モーダル側の `canonical` を詳細ページへ向ける。

> Intercept（`@modal/(.)[slug]`）は soft-nav のみで実 URL は同じため、直接ページ側の noindex でカバーされる。

- **Impact**: 高（実害防止）／**Effort**: 極小（1ファイル・数行）

#### 2-2. 構造化データ（JSON-LD / schema.org）★最大の伸び代
**現状**: 未実装。検索結果をリッチリザルト化できる最大の手。

- **詳細ページ `/<型>/<slug>`**: `SoftwareApplication` スキーマ
  ```jsonc
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Sodium",
    "description": "...",
    "image": "https://cdn.modrinth.com/.../icon.png",
    "author": { "@type": "Person", "name": "JellySquid" },
    "applicationCategory": "GameExtension",
    "operatingSystem": "Minecraft (Java)",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "interactionStatistic": { "@type": "InteractionCounter", "interactionType": "DownloadAction", "userInteractionCount": 166259107 }
  }
  ```
  ※ aggregateRating は Modrinth に本当の評価（星）がないため**使わない**（スパム判定リスク）。DL 数は `interactionStatistic` で表現。
- **パンくず**: `BreadcrumbList`（Home › 検索 › <Mod名>）
- **サイト全体**: `WebSite` + `SearchAction`（サイトリンク検索ボックス）＋ `Organization`

**実装**: 各 `page.tsx` で `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />` を描画（Next.js 標準手順）。データは `fetchProjectDetailData` で流用可。

- **Impact**: 高／**Effort**: 中

#### 2-3. 動的 OGP 画像（`next/og`）
**現状**: `og:image` は Modrinth の**小アイコン（96px）のみ**。SNS（Twitter/Discord）で見劣え・縮小。

**対策**: `ImageResponse`（`next/og`）で **1200×630 の専用 OG 画像**を動的生成（タイトル＋アイコン＋DL数＋ブランドカラー）。Vercel Edge で高速生成。
**実装**: 詳細ルートに `opengraph-image.tsx`（`app/[projectType]/[slug]/opengraph-image.tsx`）を置くと Next.js が自動で `og:image` に結線。`generateMetadata` の `images` はそちらへ寄せる。

- **Impact**: 高（拡散 CTR 向上 → 間接的 SEO）／**Effort**: 中

---

### 🥈 中優先

#### 2-4. パンくず表示 + `BreadcrumbList`
現在 詳細ページは「Mod 一覧に戻る」リンクのみ。**視覚的パンくず**（Home › Mods › <名前>）を表示し `BreadcrumbList` スキーマを付与（2-2 と統合可）。
- **Impact**: 中／**Effort**: 小

#### 2-5. sitemap 拡充
現状: 人気 **Mod 100 件**（projectType=mod）のみ。
- 全 4 型（mod/modpack/resourcepack/shader）の人気上位を網羅。
- `lastmod` に Modrinth `updated` を活用（新鮮度シグナル）。
- 優先度（`priority`）の調整、予約ハブ `/modpack` 等の取捨。
- **Impact**: 中（クロール効率）／**Effort**: 小

#### 2-6. 内部リンク（関連 Mod）
詳細ページから「依存 Mod」「同カテゴリ」へのリンク。**Phase 11+ で「関連Project」が計画済**なので、そこへ統合すると効率的。クロール depth 改善＋滞留時間 UP。
- **Impact**: 中／**Effort**: 中（Phase 11 と統合可）

#### 2-7. Core Web Vitals 計測
`web-vitals`（既存 `WebVitalsReporter`）を **Vercel Analytics** または `/api/analytics` 送信へ接続。LCP/INP/CLS を継続監視（画像最適化は直近で実施済）。
- **Impact**: 中（順位シグナル）／**Effort**: 小

#### 2-8. コンテンツ厚
詳細ページ本文に **changelog・依存関係・インストール手順**等を追加（indexable 文本数 UP → 関連性・ロングテール強化）。Modrinth API の `changelog` 等を活用。
- **Impact**: 中／**Effort**: 中

---

### 🥉 低優先（将来フェーズ）

#### 2-9. i18n / hreflang
現状 日本語のみ。英語展開時に `hreflang` で地域最適化（Phase 14+）。

#### 2-10. FAQ schema
よくある質問ページができたら `FAQPage` でリッチリザルト。

#### 2-11. RSS / Atom フィード
新着 Mod 配信。SEO 直接効果は小さいが巡回系に有利。

---

## 3. 推奨実施順（再開時）

1. **2-1 重複対策**（noindex）← これだけは早めに（実害リスク）
2. **2-2 JSON-LD** + **2-3 動的 OGP 画像**（リッチリザルト＋拡散の 2 本柱）
3. **2-4 パンくず構造化** + **2-5 sitemap 拡充**（小コスト積み重ね）
4. **2-6 関連Mod内部リンク**（Phase 11 と統合）
5. **2-7 Web Vitals 計測** + **2-8 コンテンツ厚**（運用に入ってから）

## 4. 優先度マトリクス（Impact × Effort）

| 施策 | Impact | Effort |
| :--- | :--- | :--- |
| 2-1 重複対策（noindex） | 高 | 極小 |
| 2-2 JSON-LD | 高 | 中 |
| 2-3 動的 OGP 画像 | 高 | 中 |
| 2-4 パンくず構造化 | 中 | 小 |
| 2-5 sitemap 拡充 | 中 | 小 |
| 2-6 関連Mod内部リンク | 中 | 中（Phase11統合） |
| 2-7 Web Vitals 計測 | 中 | 小 |
| 2-8 コンテンツ厚 | 中 | 中 |
| 2-9 i18n/hreflang | 中 | 大（将来） |
| 2-10 FAQ schema | 低 | 小（FAQ整備後） |
| 2-11 RSS | 低 | 小 |

---

## 5. 関連

- 現行メタデータ: `app/layout.tsx`・`app/[projectType]/[slug]/page.tsx`（`generateMetadata`）
- `app/sitemap.ts`・`app/robots.ts`・`app/manifest.ts`
- ルーティング（重複 URL の元）: `docs/planning/ROUTING_REDESIGN_PLAN.md`・`.agent/skills/routing-and-pages.md`
- ロードマップ優先: **Phase 11 / 12**（`docs/planning/PHASE11_PLAN.md`・`PHASE12_PLAN.md`）
