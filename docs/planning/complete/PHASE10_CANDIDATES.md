# Phase 10 候補リスト (候補レジストリ)

> 対応 task-list ID: `P10-A`〜`P10-E` / `DEPLOY-1` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 確定済み** (2026-08-23 選定 / 2026-08-24 方針更新 / 全候補の採否が確定)

本書は Phase 9 完了時点で Phase 10 に実施するかを検討した**候補の採否記録**。
採択された 5 項目の実施詳細は [PHASE10_PLAN.md](./PHASE10_PLAN.md)、
実績は [docs/planning/complete/PHASE10_COMPLETE.md](../complete/PHASE10_COMPLETE.md)。

## 候補の採否一覧

| 候補 | 判定 | task-list ID | 理由 |
|---|---|---|---|
| FontAwesome subset 化 | **採択** | P10-A | Phase 9 の bundle 900 KB 目標を +63 KB 超過中 → 主目的 |
| AppContext.tsx 完全削除 | **採択** | P10-B | stub 残存の整理。消費者ゼロでリスクなし |
| Markdown 内 `<Image>` 化 (CDN 限定) | **採択** | P10-C | Phase 9-E で見送り。LCP 100〜300ms 改善見込み |
| E2E カバレッジ拡張 (zip×2 / dep-check) | **採択** | P10-D | リグレッション検出強化 |
| shimmer skeleton | **採択** | P10-E | 知覚パフォーマンス向上 |
| **Vercel 本番デプロイ** | **保留** | DEPLOY-1 | 2026-08-24 方針変更: **最終ステップに配置** (後述) |
| `optimizePackageImports` 追加 (web-vitals 等) | 却下 | - | 効果小。FA subset とセットで評価し不要と判断 |
| Storybook | 却下 | - | 小規模個人開発では維持コスト過大 (Phase 9 クイズ回答) |
| React Server Actions | 却下 | - | Route Handlers で十分。本フローに不要 |
| Suspense + streaming SSR 全面採用 | 却下 | - | 「初期 24 件 SSR + CSR 追加ロード」現行方針を維持 |

## 保留: Vercel 本番デプロイ (DEPLOY-1) の配置方針

> **重要方針 (2026-08-24)**: Vercel Hobby プランのリソース制約
> (100k Function Invocations / 月・100 GB Bandwidth / 月) により、
> **Phase 10 全項目 + Phase 11 + 12 + 13 完了後の最終ステップ**として実施する。

- 開発中はローカル + CI のみで検証
- 全機能揃った状態で Vercel Preview → Production の 2 段階 deploy
- 意図せぬ消費で上限を使い切るリスクを最小化

実施手順は [docs/ops/DEPLOY.md](../ops/DEPLOY.md)。

## 採択項目の推奨実施順 (当時)

1. FontAwesome subset 化 → 2. AppContext 削除 → 3. Markdown Image 化 →
4. E2E 拡張 → 5. shimmer → (Phase 11 → 12 → 13) → 🚀 Vercel デプロイ

---

*本レジストリは候補採否の記録として保存する。新たな候補は task-list.md に新 ID で
登録する (本書の ID は再利用しない)。*
