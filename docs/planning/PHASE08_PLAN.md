# Phase 8: パフォーマンス・オフライン化

> 対応 task-list ID: `P8-A` 〜 `P8-E` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 完了** (2026-08-23 計画・実施 / 証拠: [docs/complete/PHASE8_COMPLETE.md](../complete/PHASE8_COMPLETE.md))

## 1. 開始前確認

- ブランチ / HEAD / `git status` を確認 (未コミット変更があれば停止)
- Phase 7 (Next.js 移行) 完了を確認 — 移行計画書 [NEXTJS_MIGRATION_PLAN.md](./NEXTJS_MIGRATION_PLAN.md)
- AGENT.md §6 (React/Next 実装ルール) を読む

## 2. 目的 (Why)

Phase 7 までで「動くもの」は完成したが、**データ層・キャッシュ・回帰保証が Vite 版のまま**
だった。ユーザー体験と保守性の観点で:

- プロファイルが LocalStorage (同期 I/O・5 MB 制限) → 大量 Mod で容量とブロッキングの危険
- Modrinth API を毎回 fetch → 検索フィルタ変更のたび再取得
- オフラインで**完全に使えない**
- `AppContext` (30+ value の Fat Context) → 1 プロパティ更新で全消費者が再レンダー
- バグ修正が手動確認のみ → 回帰検出の仕組みなし

→ Dexie + TanStack Query + Zustand + テスト/CI で「速い・オフラインでも使える・回帰しない」状態にする。

## 3. 変更範囲 (Scope)

変更対象:
- `lib/db/` (Dexie スキーマ・LocalStorage 移行)、`lib/query/` (TanStack Query + persister)
- `lib/store/` (Zustand slice)、`hooks/` (shim 化)、`app/layout.tsx` (Provider)
- `vitest.config.ts` / `__tests__/` / `docs/ops/` (CI ワークフロー)
- 小改善バンドル (CSP Report-Only・オフラインバナー等)

変更しない (境界外):
- `.archive/vite/` (不変)
- Service Worker / CurseForge / i18n / 認証 (Non-Goals → Phase 9 以降)
- LocalStorage の完全削除 (Phase 8 では 7 日バックアップとして残す)

## 4. 禁止事項

- 移行中にユーザーデータを消失させない (LocalStorage はバックアップとして保持)
- Vite 版の同時修正をしない (`.archive/vite/` 不変)
- テストを通すためだけに期待値を実装へ合わせない
- 1 サブフェーズで複数テーマを同時に変更しない (直列でレビュー容易性優先)

## 5. 完了条件 (DoD)

- [x] `lib/db/dexie.ts` に profiles テーブル + LocalStorage → Dexie 自動移行 + 7 日バックアップ
- [x] `apiCache` テーブル + TanStack Query persister (24h TTL) でオフライン閲覧が可能
- [x] Zustand 4 slice + 既存 hooks は shim で API 維持
- [x] vitest + msw 導入、CI ワークフロー (`docs/ops/CI_WORKFLOW.yml`) 成形
- [x] First Load JS 目標に対する実測値を完了レポートに記録
- [x] `.archive/vite/` 無変更
- [x] `docs/complete/PHASE8_COMPLETE.md` 作成

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | ✅ | 移行ロジック (LocalStorage→Dexie)・store |
| Integration (msw) | ✅ | TanStack Query キャッシュ |
| 手動 | ✅ | オフライン時の既読詳細表示・バックアップ復元 |

## 7. 停止条件

- 移行で既存データの削除が必要になる場合
- Dexie スキーマ変更が既存ユーザーデータを壊す可能性がある場合
- 想定より変更範囲が広がる場合 (タスク分割を協議)

## 8. 完了時に行うこと

各サブフェーズ: 4 検証 → コミット (`feat(P8-A): …`) → task-list 更新 → 証拠記録。

## 9. サブタスク分割 (直列推奨)

| ID | テーマ | 主要成果物 | 依存 | 状態 |
|---|---|---|---|---|
| P8-A | Dexie (IndexedDB) 化 + LocalStorage 移行 | `lib/db/dexie.ts` / profiles / 移行 | - | 完了 |
| P8-B | TanStack Query + Dexie persister | `lib/query/` / apiCache | P8-A | 完了 |
| P8-C | Zustand 段階移行 (4 slice) | `lib/store/` + AppContext 段階削除 | P8-A/B | 完了 |
| P8-D | テスト導入 + CI | vitest / msw / CI ワークフロー | P8-C | 完了 |
| P8-E | 小改善バンドル | CSP Report-Only / オフラインバナー等 | 並行 | 完了 |

**順序の理由**: 8-A (Storage 層) → 8-B (Query 層が apiCache に依存) → 8-C (store が db/query を呼ぶ) → 8-D (対象が固まってからテスト) → 8-E は並行。

## 10. 設計詳細・仕様 (継承)

- **データモデル**: `dropmod_state_v2` (LocalStorage) → Dexie `profiles` テーブル。移行は
  初回 hydration 時に自動実行、旧データは 7 日間バックアップとして残し復元可能に。
- **キャッシュ戦略**: TanStack Query の `PersistQueryClient` + Dexie `apiCache` テーブル
  (24h TTL)。既読の Mod 詳細・検索結果がオフラインで表示できる。
- **状態管理**: `profiles` / `toast` / `confirm` / `operations` の 4 slice から開始
  (operations は Phase 9-B で 3 分割)。既存 hooks は shim パターンで署名維持。
- **目標値**: First Load JS ≤ 650 KB / LCP ≤ 2.5s / INP ≤ 200ms / CLS ≤ 0.1
  (実測値は PHASE8_COMPLETE.md 参照)。

## 11. リスク・Gotchas (継承)

- Dexie 失敗時のロールバック: LocalStorage バックアップが残るため useProfiles の
  旧ロジックに戻せる (完了レポート §11 の手順)
- jsdom は `indexedDB` 未実装 → `fake-indexeddb` を devDep に追加 (テスト基盤)
- 並行実施不可の組合せ (A×B、A×C は依存関係で不可) は計画 §4.2 の表を参照

## 12. 実績と証拠

| ID | コミット | テスト | 備考 |
|---|---|---|---|
| P8-A〜E | PR #1 内 (2026-08-20 マージ) | 完了時点で全 pass | 個別 SHA は PHASE8_COMPLETE.md |

Phase 9 実施結果の追記も PHASE8_COMPLETE.md にあり。
