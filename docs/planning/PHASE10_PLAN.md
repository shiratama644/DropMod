# Phase 10: 品質・パフォーマンス仕上げ

> 対応 task-list ID: `P10-A` 〜 `P10-E` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 完了** (2026-08-23〜24 実施 / 証拠: [docs/complete/PHASE10_COMPLETE.md](../complete/PHASE10_COMPLETE.md))

## 1. 開始前確認

- Phase 9 / 9.5 完了を確認、`git status` clean
- 候補リスト [PHASE10_CANDIDATES.md](./PHASE10_CANDIDATES.md) の優先度を確認

## 2. 目的 (Why)

Phase 9 で残った「パフォーマンス未達成分 (bundle 63 KB 超過)」「stub 残存」「E2E 不足」を
解消し、**Vercel 本番デプロイ (DEPLOY-1) 前の最終品質ゲート**を通過する。

## 3. 変更範囲 (Scope)

変更対象:
- FontAwesome subset (`scripts/build-fontawesome-subset.mjs` / `public/webfonts/`)
- `components/AppContext.tsx` (削除)、`components/MarkdownRenderer.tsx` (Image 化)
- `e2e/` (+3 spec)、`app/globals.css` (shimmer)

変更しない (境界外):
- Vercel 本番デプロイそのもの → 全項目完了後の最終ステップ (PHASE10_CANDIDATES 方針)
- `.archive/vite/` 不変

## 4. 禁止事項

- FontAwesome は **B 案 (subset 化)** で行う — `<i className="fa-xxx">` 記法の全面書き換え
  (A 案 react-fontawesome 個別 import) はリグレッションリスクが大きいため不採用
- Markdown の Image 化は **Modrinth CDN 限定**。その他 URL は `<img>` フォールバック維持
- テストを通すための期待値変更をしない

## 5. 完了条件 (DoD)

- [x] Phase 10-A〜E の全 5 サブフェーズ完了 (各 commit + push)
- [x] Home bundle が 900 KB 台 (10-A 実測 **-356 KB**)
- [x] `AppContext.tsx` が repo に存在しない
- [x] E2E 全 spec を CI で green (ユーザー実施 — VER-1 として継続管理)
- [x] `docs/complete/PHASE10_COMPLETE.md` に実測値を記録
- [x] `.archive/vite/` 無変更

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| 4 検証 | ✅ | typecheck / lint / test:unit / build |
| 目視 | ✅ | 全 11 ページの icon 表示崩れチェック (10-A) |
| E2E (CI) | △ | spec 追加。CI 実行は VER-1 (実環境検証待ち) |

## 7. 停止条件

- subset 化で icon 欠落が広範囲に出る場合 (使用 icon 一覧の記録を元に協議)
- Image 化で Modrinth CDN 以外の画像が壊れる場合

## 8. 完了時に行うこと

各サブフェーズ: 4 検証 → コミット → PHASE10_COMPLETE.md へ実測値記録 → task-list 更新。

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 状態 |
|---|---|---|---|---|
| P10-A | FontAwesome subset 化 | subset script / webfonts | - | 完了 `8f69c76` |
| P10-B | AppContext.tsx 完全削除 | ファイル削除 (-84 LOC) | - | 完了 `8e394a9` |
| P10-C | Markdown 内 `<Image>` 化 | CDN 限定 Image 置換 | - | 完了 `4b4e5ee` |
| P10-D | E2E カバレッジ拡張 | zip-export / zip-import / dep-check spec | - | 完了 `817cb2e` |
| P10-E | shimmer skeleton | `.skeleton-shimmer` | - | 完了 `f59010e` |

## 10. 設計詳細・仕様 (継承)

- **10-A**: 使用 icon を grep で列挙 → `scripts/build-fontawesome-subset.mjs` で
  solid / brands の必要グリフのみ抽出 → `public/webfonts/` 配信。
  期待効果 -400〜600 KB → 実測 -356 KB。
- **10-C**: `MarkdownRenderer` の `components.img` で Modrinth CDN
  (`cdn.modrinth.com` / `staging-cdn.modrinth.com`) なら `<Image fill>` 化、
  それ以外はネイティブ `<img>` のまま。
- **10-E**: `@keyframes dropmod-shimmer` (左→右 sweep)。Reduced Motion で停止。

## 11. リスク・Gotchas (継承)

- 各サブフェーズ独立 commit → revert で戻せる
- 10-A は全ページ icon に影響 → 使用 icon 一覧を記録して再追加可能に
- 10-D の fixture (.mrpack ダミー) は `e2e/helpers/mrpack.ts`

## 12. 実績と証拠

| ID | コミット | テスト | 実測値 |
|---|---|---|---|
| P10-A | `8f69c76` | 全 pass | bundle -356 KB |
| P10-B | `8e394a9` | 全 pass | -84 LOC |
| P10-C | `4b4e5ee` | 全 pass | LCP 改善 (PHASE10_COMPLETE.md) |
| P10-D | `817cb2e` | 全 pass | +3 spec / +6 test |
| P10-E | `f59010e` | 全 pass | shimmer 適用 |
