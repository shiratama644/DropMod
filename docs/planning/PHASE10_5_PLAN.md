# Phase 10.5 (Emergency): カバレッジ回復 — vitest 4 アップグレード対応

> 対応 task-list ID: `P105-T` / `P105-A` 〜 `P105-E` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 完了** (2026-08-26 実施 / A〜C 完了・D/E は対象外)

## 1. 開始前確認

- Phase 10 完了・`git status` clean
- vitest 4 へのアップグレード (P105-T) が先決

## 2. 目的 (Why)

vitest 3 → 4 アップグレードでカバレッジ集計が変わり、**global branches が 60% threshold を割った**
(実測 59.23%)。CI の threshold green を回復し、Phase 11 (Import) 実装前の安全網を張る。
「Emergency」= 品質ゲートが赤のまま新機能を実装する状態を避けるため。

## 3. 変更範囲 (Scope)

変更対象:
- `__tests__/test-utils/browserApi.ts` (matchMedia / IntersectionObserver / anime.js mock 基盤)
- `__tests__/` (hooks 3 種・components 10 ファイル・confirm.ts)
- `vitest.config.ts` (coverage.exclude の調整)

変更しない (境界外):
- アプリ実コードのロジック変更 (mock・テスト追加が主体)
- BottomSheet 本体 (P105-D は対象外)、server 層 (P105-E は対象外)

## 4. 禁止事項

- threshold を下げて green にしない (テストで満たす)
- テスト対象外にしたいファイルは「除外の根拠 (E2E 担保等)」を設定ファイルの
  コメントに残した上で行う
- 実コードをテストのために書き換えない

## 5. 完了条件 (DoD)

- [x] vitest 4.1.11 で全テスト pass (P105-T `ccd5f98`)
- [x] global branches 60% 超 (実測で回復)
- [x] hooks / components / lib/store の per-module threshold green
- [x] 4 検証全 pass・`.archive/vite/` 無変更

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit/Component | ✅ | fake timers・mock matchMedia・IntersectionObserver stub 経由 |
| Coverage | ✅ | `pnpm test:coverage` で全 threshold green 確認 |

## 7. 停止条件

- mock しきれない実装 (Side Effect の塊) に当たった場合 — 除外判断はユーザーと協議

## 8. 完了時に行うこと

各サブフェーズ: 4 検証 → コミット (`test(P105-A): …`) → task-list 更新。

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 | 状態 |
|---|---|---|---|---|
| P105-T | vitest 3 → 4 アップグレード | 4.1.11 + 互換修正 | - | 完了 `ccd5f98` |
| P105-A | browser API mock 基盤 + hooks 3 種 | `test-utils/browserApi.ts` | P105-T | 完了 `57d5bc9` |
| P105-B | 軽量 components 10 ファイル | next/navigation mock 含む | P105-A | 完了 `115e44b` |
| P105-C | confirm.ts cleanup 分岐 | lib/store branches 80%+ | P105-B | 完了 `29469c7` |
| P105-D | BottomSheet 本体テスト | - | - | 対象外 (任意扱い。E2E 担保方針) |
| P105-E | server 層テスト | - | - | 対象外 (任意扱い。Phase 12 計画時に再検討) |

## 10. 設計詳細・仕様 (継承)

- **mock 基盤** (`__tests__/test-utils/browserApi.ts`):
  - `mockMatchMedia(matches)` — jsdom 未実装。reduced-motion 両モード切替
  - `createIntersectionObserverStub()` — `trigger(entry)` で手動発火
  - anime.js mock — dynamic import も intercept
- **測定値 (計画時)**: hooks br 54.86 → 62%± / components stmt 47.08 → 62%± / lib/store br 76.06 → 80%+
- **除外ポリシー**: `app/**/layout.tsx` を coverage.exclude に追加 (server wrapper は E2E 担保。
  既存の `app/layout.tsx` 除外と同根拠)
- **対象外の判断 (D/E)**: 計画段階から「必須ではない」位置づけ。D は BottomSheet が
  Phase 11 で再利用される可能性に対する品質強化、E は server 層の安全網。しきい値は
  B で超えているため実施せず、理由を残して対象外とした (記事の「ID 再利用禁止・中止は
  理由を残す」規則に従い task-list.md に記録)。

## 11. リスク・Gotchas (継承)

- vitest 4 の mocker 競合 (同一モジュールの並行 dynamic import) → IO instance は
  1 つずつ `await act()` で逐次 trigger
- jsdom の File は `arrayBuffer()` 未実装 → Fake File System は互換オブジェクトを返す
- `vi.unstubAllEnvironments` は存在しない (正: `vi.unstubAllEnvs()`)

## 12. 実績と証拠

| ID | コミット | テスト | 備考 |
|---|---|---|---|
| P105-T | `ccd5f98` | 全 pass | vitest 4.1.11 |
| P105-A | `57d5bc9` | +10-12 件 | hooks br 60% 超 |
| P105-B | `115e44b` | +15-20 件 | components 60% 超 |
| P105-C | `29469c7` | +2-3 件 | 全 threshold green |
