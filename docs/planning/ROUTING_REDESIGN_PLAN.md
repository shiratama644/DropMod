# URL ルーティング再設計 (型別 URL + モーダル/詳細維持)

> 対応 task-list ID: `ROUTE-1` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 完了** (2026-08-24 実施 / 証拠: `bd05b9b`)

## 1. 開始前確認

- Phase 9-F として分離した本タスク。`git status` clean
- 経緯: モーダル廃止を検討したが、スマホ UX から**モーダル存続**に決定 →
  URL 構造のみ整理 + 「詳細ページ」ボタン追加 (改定版)

## 2. 目的 (Why)

旧 URL 設計の問題を解消する:
- 詳細が `/mods/[slug]` のみで、Modpack / RP / Shader の型別 URL が無い
- モーダル URL (`/mods/@modal/(.)[slug]`) が特殊で共有・履歴に弱い
- 「検索」と「プロファイル管理」が同じ `/mods` に混在

→ **検索は複数形・詳細は型別単数形**に分離し、モーダル (一覧状態保持) と
フル詳細ページ (SEO・共有) の 2 経路を維持する。

## 3. 変更範囲 (Scope)

変更対象:
- `app/` ルート構成 (`discover/[type]` + `[projectType]/[slug]` + `@modal`)
- `lib/constants/search.ts` (URL 生成の一元化)
- `ModDetailModalShell` (詳細ページボタン追加) / `ModDetailPageView` (流用)

変更しない (境界外):
- `ModDetailModalShell` / `ModDetailPageView` の UI を大きく変えない
  (コンポーネント削除・書き換えではなく流用)
- 検索・プロファイルのロジック

## 4. 禁止事項

- モーダル経路を削除しない (スマホ UX の要)
- URL 生成を各コンポーネントで直組み立てしない (`lib/constants/search.ts` に一元化)
- 旧ルートを残したままにしない (リダイレクトで対応)

## 5. 完了条件 (DoD)

- [x] 検索 URL がすべて複数形 (`/discover/{mods,modpacks,resourcepacks,shaders}`)
- [x] 詳細 URL が型別単数形 (`/{mod,modpack,resourcepack,shader}/[slug]`)
- [x] モーダル URL が `/discover/<複数>/<slug>` (一覧状態を保持)
- [x] モーダルに「詳細ページ」ボタンあり (`/<型>/<slug>` へ遷移)
- [x] 旧 `app/mods/`・`app/discover/@modal/` が存在しない (`git ls-files` で 0 件)
- [x] URL 生成が `lib/constants/search.ts` に一元化
- [x] 4 検証全 pass・`.archive/vite/` 無変更・docs/README.md 目次反映

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| 4 検証 | ✅ | typecheck / lint / test:unit / build |
| E2E (CI) | ✅ | mod-detail-modal / smoke (既存 spec が新 URL で green) |
| 手動 | ✅ | モーダル→詳細→戻る、直 URL、共有 |

## 7. 停止条件

- モーダル維持が技術的に旧構成と両立しなくなった場合
- URL 変更で SEO 保全 (308) の設計判断が必要な場合

## 8. 完了時に行うこと

4 検証 → コミット → task-list 更新 → skills/routing-and-pages.md 更新。

## 9. 最終 URL 設計 (継承)

| URL | 役割 |
|---|---|
| `/discover` `/discover/<複数>` | 検索一覧 (4 型) |
| `/discover/<複数>/<slug>` | Intercepting モーダル (ソフトナビ。一覧状態保持) |
| `/<型>/<slug>` | 詳細フルページ (直接 URL・SEO・OGP) |
| `/profile` | 選択中プロファイル管理 |
| `/modpack` `/resourcepack` `/shader` | Phase 11/12 予約ハブ |
| `/mods` | 308 → `/discover/mods` (旧 URL 保全) |

「戻る」挙動: モーダルは `router.back()`、詳細ページは検索へ戻るリンク。

## 10. リスク・ロールバック (継承)

- ルート大量変更 → 小さいステップ (計画 §8) で実施し各段階で 4 検証
- 問題時は commit 単位の revert。旧 URL は 308 リダイレクトで被リンク価値を保全

## 11. 実績と証拠

| ID | コミット | テスト | 備考 |
|---|---|---|---|
| ROUTE-1 | `bd05b9b` | 全 pass | 計画書 `514020d` (案 B+) → 改定 `125df7c` → 実装 |
