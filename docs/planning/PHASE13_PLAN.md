# Phase 13: SEO 改善（候補レジストリの実施）

> 対応 task-list ID: `SEO-2` / `SEO-1` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 着手** (2026-08-30 ユーザー確定: 旧 Phase 13 CurseForge 計画は
> `.archive/docs/planning/PHASE13_PLAN.md` へ退避。Phase 13 の正本は
> [SEO_CANDIDATES.md](./SEO_CANDIDATES.md) の実施計画である本書)
>
> 候補の詳細・優先度表は SEO_CANDIDATES.md を継承する。本書は着手用 DoD。

## 1. 開始前確認

- CurseForge 計画が `.archive/docs/planning/PHASE13_PLAN.md` にあること
- `SEO-2` は依存なし。`SEO-1` は 2-2 以降で Phase 12 完了後でも可
- AGENT.md §6 / `.agent/skills/routing-and-pages.md`

## 2. 目的 (Why)

同一プロジェクトにプレビュー URL と詳細 URL が並立し、検索エンジンが順位を
分散させる。詳細 `/<型>/<slug>` だけを index 対象にし、プレビュー直接 URL は
辿れても索引しない。

## 3. 変更範囲 (Scope)

変更対象:

- `app/discover/[type]/[slug]/page.tsx` — 直接アクセス用プレビュー
- `lib/server/project-detail.ts` — メタ生成の純関数（テスト可能に）
- `docs/task-list.md` / 本書 §12 / `docs/README.md`
- 回帰テスト

変更しない (境界外):

- `app/[projectType]/[slug]/page.tsx` の index（詳細は正。noindex しない）
- `/discover/<複数>` 一覧の index
- `@modal/(.)[slug]`（Intercept。クローラは直接ページを GET する）
- JSON-LD / 動的 OGP / sitemap 拡充 → `SEO-1`
- CurseForge → アーカイブ済み。再開は API キー取得後に別計画
- `.archive/vite/` 不変

## 4. 禁止事項

- 詳細ページ (`/<型>/<slug>`) に noindex を付けない（task-list 旧 DoD は誤記）
- 一覧を noindex しない
- Intercept ルートに `revalidate` 等のセグメント設定を置かない
- SEO-1 を同時に実装しない

## 5. 完了条件 (DoD)

- [x] `/discover/<複数>/<slug>` の metadata が `robots: { index: false, follow: true }`
- [x] 同一ページの canonical が `/<型>/<slug>`（詳細）を指す
- [x] 詳細ページ・一覧の robots は従来どおり index 可能
- [x] 純関数の unit test が上記を固定する
- [x] 4 検証 pass・`.archive/vite/` 無変更・task-list 更新

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | 必須 | noindex + canonical パス |
| Component | しない | メタは RSC |
| E2E | しない | Sandbox 不可。HTML の robots は本番後 |
| 実環境 | 本番後 | デプロイ後に meta robots を目視 |

## 7. 停止条件

- 詳細まで noindex したくなる判断（ユーザー確認）
- Intercept 側にも metadata が必要と分かった場合（通常不要）

## 8. 完了時に行うこと

4 検証 → `feat(SEO-2): …` → task-list 更新。SEO-1 は勝手に始めない。

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 |
|---|---|---|---|
| SEO-2 | 重複対策 (候補 2-1) | モーダル直接ページ noindex + canonical | なし |
| SEO-1 | JSON-LD / パンくず / 動的 OGP / sitemap / 見出し | 候補 2-2 以降 | SEO-2 |

## 10. 設計詳細・仕様

クローラは `/discover/mods/sodium` を GET すると
`app/discover/[type]/[slug]/page.tsx` が返る（Intercept ではない）。

```ts
robots: { index: false, follow: true }
alternates: { canonical: '/mod/sodium' }
```

`follow: true` で詳細・一覧へのリンクは辿れる。sitemap は既に詳細 URL のみ。

## 11. リスク・Gotchas

- Next.js のセグメント設定はリテラル必須。本タスクでは置かない
- 未知の discover segment では canonical を付けず noindex のみ

## 12. 実績と証拠 (実装後に記入)

| ID | コミット | テスト | 実測値・備考 |
|---|---|---|---|
| SEO-2 | `080ede1` | typecheck / biome / 1235 tests / build | noindex+follow + canonical |
| SEO-1 | (本コミット) | typecheck / biome / 1244 tests / build | JSON-LD / OG 1200×630 / sitemap 4 型 |
