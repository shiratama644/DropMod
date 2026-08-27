# Phase 9: テスト・品質強化 + アーキテクチャ青写し

> 対応 task-list ID: `P9-A` 〜 `P9-E` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 完了** (2026-08-23 計画・実施 / 証拠: [PHASE9_COMPLETE.md](../complete/PHASE9_COMPLETE.md) / [PHASE9_C_COMPLETE.md](../complete/PHASE9_C_COMPLETE.md) / [PHASE9_PROFILER.md](../complete/PHASE9_PROFILER.md))

## 1. 開始前確認

- Phase 8 完了 (Dexie / TanStack Query / Zustand 土台) を確認
- `git status` が clean であること
- AGENT.md §6 (React 実装ルール) を読む

## 2. 目的 (Why)

Phase 8 の積み残し 2 点を解消する:

1. **AppContext が Fat (30+ フィールド)** — 4 コンポーネントが `useAppContext()` 経由で消費、
   1 フィールド更新で全 consumer が再レンダー
2. **テストカバレッジ 6%** — lib/store は高くても hooks / components / Modrinth client が未テストで
   回帰保証が実質ゼロ

→ Zustand 直接参照化 + store 分割で再レンダーを構造的に削減し、msw + RTL で
回帰検出可能なテスト基盤を作る。**「再レンダーが減った」を主観でなく Profiler で実測**する。

## 3. 変更範囲 (Scope)

変更対象:
- `components/` (AppContext 消費 4 コンポーネントの Zustand 直接参照化)
- `lib/store/` (operationsStore を zipExport / zipImport / depCheck に 3 分割)
- `__tests__/` (msw handlers・hooks/components/modrinth テスト)、`vitest.config.ts` (thresholds)
- `docs/` (diff・profiler レポート)

変更しない (境界外):
- Bundle 削減 (FontAwesome) → Phase 10
- Vercel 本番デプロイ → Phase 10 以降
- CSP Enforce 化 → Phase 10 以降 (Report-Only の違反収集期間が必要)
- カバレッジ 75%+ → 60% 目標 (現実的ライン)

## 4. 禁止事項

- AppContext 撤去と operationsStore 分割を 1 コミットに混ぜない (直列)
- shim hook の公開 API (引数・戻り値) を変えない
- テスト通過のためだけの期待値変更をしない
- `.archive/vite/` 不変

## 5. 完了条件 (DoD)

- [x] `useAppContext()` 呼び出し 0 件 (`AppContext.tsx` は stub 化、Phase 10-B で削除)
- [x] operationsStore 3 分割 (zipExport / zipImport / depCheck) + shim hooks
- [x] カバレッジ 60% 達成 (per-module thresholds: store 90% / hooks 70% / components 50% / modrinth 65%)
- [x] msw 導入 (Modrinth API を network レベルで mock)
- [x] Profiler による before/after 再レンダー数値を `PHASE9_PROFILER.md` に記録
- [x] 4 検証 (typecheck / lint / test:unit / build) 全 pass
- [x] `.archive/vite/` 無変更

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest + msw) | ✅ | hooks / store / Modrinth client・server |
| Component (RTL) | ✅ | 主要コンポーネントの描画・interaction |
| 実測 (Profiler) | ✅ | 再レンダー回数 before/after |
| E2E | △ (既存 smoke 系のみ) | 拡張は Phase 10-D |

## 7. 停止条件

- store 分割で既存 hook 署名を維持できなくなる場合
- テスト対象の設計変更が必要になる場合
- カバレッジ戦略 (thresholds) の見直しが必要な場合

## 8. 完了時に行うこと

各サブフェーズ: 4 検証 → コミット (`feat(P9-C): …`) → task-list / 完了レポート更新。

## 9. サブタスク分割 (直列推奨)

| ID | テーマ | 主要成果物 | 依存 | 状態 |
|---|---|---|---|---|
| P9-A | AppContext 撤去 + Zustand 直接参照化 | 4 コンポーネント修正・stub 化 | P8-C | 完了 |
| P9-B | operationsStore 3 分割 | 3 store + shim hooks | P9-A | 完了 |
| P9-C | テスト強化 (msw) | 275 tests / stmts 91.34% | P9-A/B | 完了 |
| P9-D | 再レンダー検証 | PHASE9_PROFILER.md | P9-A/B | 完了 |
| P9-E | 小改善バンドル | キャッシュヒットバッジ等 | 並行 | 完了 |

## 10. 設計詳細・仕様 (継承)

- **shim パターン**: 既存 `useZipExport` 等 hooks の署名を維持したまま内部を store 参照に。
  consumer を一斉に書き換えず段階移行できる。
- **msw**: `__tests__/mocks/` に handlers/server。`/api/modrinth/*` を network レベルで mock。
- **coverage**: `vitest.config.ts` に per-module thresholds を設定 (Phase 9-C 時点で
  29 files / 275 tests / statements 91.34% を達成 — PHASE9_C_COMPLETE.md)。
- **E-2 キャッシュバッジ**: 「🌐 X 分前のキャッシュ / 🔄 取得中」の視覚化。

## 11. リスク・Gotchas (継承)

- 9-A のロールバック: AppContext 復活 + Zustand 残存の並存状態に戻す手順を完了レポート §11 に記録
- msw の path-only override 仕様 (`/api/modrinth/version_files`、`/v2` 無し) — skills/testing.md 参照
- React error #310 対策 (hooks を早期 return の前に) — AGENT.md §6.4

## 12. 実績と証拠

| ID | コミット | テスト | 備考 |
|---|---|---|---|
| P9-A〜E | PR #1 内 (2026-08-20 マージ) | 275 tests / stmts 91.34% | PHASE9_COMPLETE.md に個別記録 |

Phase 9 監査で 39 バグ発見・修正 (`docs/audit/issues-phase9.md`)。URL 再設計 (Phase 9-F) は
[ROUTING_REDESIGN_PLAN.md](./ROUTING_REDESIGN_PLAN.md) として分離。
