# Phase 13: SEO 改善（候補レジストリの実施）

> 対応 task-list ID: `SEO-2` / `SEO-1` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: ローカル検証済み** (2026-08-30)
>
> - 旧 CurseForge Phase 13 は `.archive/docs/planning/PHASE13_PLAN.md` へ退避
> - 候補表の正本は [SEO_CANDIDATES.md](./SEO_CANDIDATES.md)
> - 本番 HTML（meta robots / JSON-LD / OG 画像）の目視は **ユーザー指示で未実施**
>   （状態は「完了」にしない。DEPLOY-1 後に確認する）

## 1. 開始前確認

- CurseForge 計画が `.archive/docs/planning/PHASE13_PLAN.md` にあること
- SEO-2 (`080ede1`) → SEO-1 (`52bf0b9`) の順で実装済み
- AGENT.md §6 / `.agent/skills/routing-and-pages.md`

## 2. 目的 (Why)

1. プレビュー URL と詳細 URL の順位分散を止める（詳細だけ index）
2. 詳細を検索エンジン・SNS が理解できる形にする（JSON-LD / パンくず / 1200×630 OG）
3. 発見性を 4 型に広げる（sitemap + 見出し・内部リンク）

## 3. 変更範囲 (Scope)

実施済み:

- SEO-2: `app/discover/[type]/[slug]/page.tsx` / `buildDiscoverModalMetadata`
- SEO-1: `lib/seo/*` / `components/JsonLd.tsx` / 詳細 page + layout /
  `opengraph-image.tsx` / `lib/server/sitemap-entries.ts` / パンくず UI /
  discover `h1` / カテゴリ → `?q=` リンク

変更しない (境界外):

- 詳細・一覧の index（noindex しない）
- `@modal/(.)[slug]` への metadata（クローラは直接ページを GET）
- CurseForge（アーカイブ済み）
- `.archive/vite/` 不変
- 本番デプロイ・本番 HTML 目視（DEPLOY-1 / ユーザー判断）

## 4. 禁止事項

- 詳細 (`/<型>/<slug>`) や一覧を noindex しない
- `aggregateRating` を付けない（Modrinth に実評価がない）
- Intercept ルートにセグメント設定（`revalidate` 等）を置かない
- 本番チェックを勝手に始めない（2026-08-30 ユーザー確定）

## 5. 完了条件 (DoD)

ローカル（達成）:

- [x] `/discover/<複数>/<slug>` が `robots: { index: false, follow: true }`
- [x] 同 URL の canonical が `/<型>/<slug>`
- [x] 詳細・一覧は index 可能
- [x] JSON-LD: SoftwareApplication / WebSite+SearchAction / Organization / BreadcrumbList
- [x] 動的 OG 1200×630（詳細 + サイト）
- [x] sitemap が 4 型の人気 URL + lastmod
- [x] 純関数の unit test + 4 検証 pass

本番（未実施・ユーザー延期）:

- [ ] デプロイ後に meta robots / JSON-LD / OG 画像を目視

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | 実施済み | noindex / JSON-LD / OG 文言 / sitemap 静的 URL |
| Component | パンくず smoke のみ | RSC メタは unit |
| E2E | しない | Sandbox 不可 |
| 実環境 | **延期** | DEPLOY-1 後 |

## 7. 停止条件

- 詳細まで noindex したくなる判断
- 本番チェックの開始（ユーザー確認が必要）

## 8. 完了時に行うこと

ローカル 4 検証と task-list 更新は済み。task-list の状態は **ローカル検証済み** のまま。
「完了」は本番目視のあと。

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 状態 |
|---|---|---|---|
| SEO-2 | 重複対策 (2-1) | モーダル直接ページ noindex + canonical | ローカル検証済み `080ede1` |
| SEO-1 | 2-2〜2-6 | JSON-LD / パンくず / OG / sitemap / h1 | ローカル検証済み `52bf0b9` |

## 10. 設計詳細・仕様

### SEO-2

クローラの GET `/discover/mods/sodium` → `app/discover/[type]/[slug]/page.tsx`。

```ts
robots: { index: false, follow: true }
alternates: { canonical: '/mod/sodium' }
```

未知の discover segment は noindex のみ（誤 canonical なし）。

### SEO-1

- SoftwareApplication: GameExtension / 無料 Offer / DL は interactionStatistic
- SearchAction: `/discover/mods?q={search_term_string}`
- OG: `next/og` 1200×630。twitter-image の `runtime` / `revalidate` はリテラル必須
- sitemap: 型あたり 25 件（4 型）。`date_modified` があれば lastmod
- 2-6: discover の sr-only h1。詳細カテゴリは一覧 `?q=`（facet ではない）

## 11. リスク・Gotchas

- セグメント設定は静的リテラル必須。re-export すると build が落ちる（twitter-image）
- next/og の日本語は Google Fonts 取得に依存。サイト OG は英字にした
- 本番未確認のまま「完了」にしない

## 12. 実績と証拠

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| SEO-2 | `080ede1` | typecheck / biome / 1235 tests / build | noindex+follow + canonical |
| SEO-1 | `52bf0b9` | typecheck / biome / 1244 tests / build | JSON-LD / OG 1200×630 / sitemap 4 型 |
| 計画後始末 | (本コミット) | docs のみ | 本番目視はユーザー延期 |
