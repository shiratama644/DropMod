# SEO 改善候補リスト (候補レジストリ)

> 対応 task-list ID: `SEO-1` (2-2 / 2-3 / 2-6〜) ・ `SEO-2` (2-1)
> **Phase 13 の実施計画書は [PHASE13_PLAN.md](./PHASE13_PLAN.md)** (2026-08-30:
> 旧 CurseForge Phase 13 は `.archive/docs/planning/PHASE13_PLAN.md` へ退避)。
> 本書は候補レジストリ。着手用 DoD は PHASE13_PLAN.md。

本書は SEO 改善の**候補と優先度の記録**。着手時は task-list.md に個別 ID を採番し、
_TEMPLATE.md 形式の計画書を起こす。

## 前提: 優先順位 (当時の判断)

1. 本体機能 (Phase 11〜13) を優先し、SEO は完了後に再開
2. **ただし 2-1 (重複コンテンツ対策) は実害 (順位分散) が進むため早期実施を推奨**
3. 実装済みの土台: メタデータ / OGP / Twitter Card (`app/layout.tsx`)・sitemap
   (人気 Mod 100 件 + ISR)・robots (`/api/*` disallow)・canonical (`alternates`)

## 候補一覧 (優先度別)

| # | 候補 | 優先度 | Impact | Effort | 判定 |
|---|---|---|---|---|---|
| 2-1 | 重複コンテンツ対策 (モーダル直接ページの noindex) | 🥇 高 | 高 (実害防止) | 極小 | **早期実施推奨** |
| 2-2 | 構造化データ (JSON-LD / schema.org) | 🥇 高 | 高 (最大の伸び代) | 中 | 保留 (SEO-1) |
| 2-3 | 動的 OGP 画像 (`next/og` 1200×630) | 🥇 高 | 高 (CTR) | 中 | 保留 (SEO-1) |
| 2-4 | パンくず表示 + `BreadcrumbList` | 🥈 中 | 中 | 小 | 保留 (2-2 と統合可) |
| 2-5 | sitemap 拡充 (全 4 型 + lastmod) | 🥈 中 | 中 | 小 | 保留 |
| 2-6〜 | (低優先: 見出し構造・内部リンク強化等) | 🥉 低 | 低 | 小 | 保留 |

## 主要候補の要点 (継承)

### 2-1. 重複コンテンツ対策 ⚠️ 直近で発生

ルーティング再設計で同一 Mod に 2 URL が存在:
- `/discover/<複数>/<slug>` (プレビューモーダル直接ページ)
- `/<型>/<slug>` (詳細フルページ)

**対策 (推奨)**: モーダル直接ページを `noindex`:
```ts
export const metadata = { robots: { index: false, follow: true } };
```
→ 詳細 `/<型>/<slug>` を「正」として index。
(Intercept `@modal/(.)[slug]` は soft-nav のみで実 URL が同じため、直接ページ側の
noindex でカバーされる。canonical を詳細へ向ける代替案もある)

### 2-2. 構造化データ (JSON-LD)

- 詳細ページ: `SoftwareApplication` スキーマ (name / description / image / author /
  applicationCategory: GameExtension / offers 無料 / **DL 数は `interactionStatistic`**)
- **aggregateRating は使わない** (Modrinth に本当の評価がなくスパム判定リスク)
- パンくず `BreadcrumbList` + サイト全体 `WebSite` + `SearchAction` + `Organization`
- 実装: 各 `page.tsx` で `<script type="application/ld+json" …>` を描画。
  データは `fetchProjectDetailData` で流用可

### 2-3. 動的 OGP 画像

- 現状 `og:image` は Modrinth の小アイコン (96px) のみ → SNS で見劣え
- `app/[projectType]/[slug]/opengraph-image.tsx` (`next/og` ImageResponse) で
  1200×630 (タイトル + アイコン + DL 数 + ブランドカラー) を動的生成

## 推奨実施順 (再開時)

1. **2-1 重複対策** (早期・単独で実施可)
2. 2-2 JSON-LD (2-4 パンくずを同時に)
3. 2-3 動的 OGP
4. 2-5 sitemap 拡充

---

*本レジストリは候補の記録として保存。着手時に task-list.md へ個別 ID 採番 + 計画書を作成する。*
