# Phase 13: CurseForge 完全対応

> 対応 task-list ID: `P13-A` / `P13-B` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 保留** (Phase 12 完了後に詳細計画を策定する — 本書は暫定版)

## 1. 開始前確認

- Phase 12 完了 (Provider 抽象化 + `ModrinthProvider` 実装済み) を確認
- **Phase 12 の実装経験を踏まえて本書を改訂してから着手する**
- CurseForge API 利用規約 / API key 運用を確認

## 2. 目的 (Why)

Phase 12 で Provider 抽象化 (`CurseForgeProvider` stub) を準備済み。Phase 13 では
**`CurseForgeProvider` を完全実装**し、以下を提供する:

1. CurseForge Mod / RP / Shader の Import (fingerprint 照合)
2. CurseForge Modpack (.zip) の完全 Import
3. CurseForge Modpack の更新検知 + Sync

**Phase 12 の原則を継承**: 不正確な推測による誤マッチングは絶対に行わない。
危険パターン (ユーザー方針 2026-08-24: 「不正確な推測による自動マッチングより、
未対応として安全に止めることを優先する」):
- 同名 Mod で違う project (Modrinth "Sodium" vs CurseForge "Sodium Extra")
- 別 version が入る (0.5.9 のつもりが 0.6.0 になる)

→ CurseForge API + **Murmur2 fingerprint** による正確な照合のみで実装する。

## 3. 変更範囲 (Scope)

変更対象:
- `app/api/curseforge/[...path]/route.ts` (API proxy)
- `lib/providers/` (CurseForgeProvider) / Murmur2 計算 (Web Worker)
- Import フロー・Modpack Import・更新検知 (Phase 12 の Provider IF に乗せる)

変更しない (境界外):
- Modrinth 側のロジック変更 (Provider IF のみ共有)
- `.archive/vite/` 不変

## 4. 禁止事項

- 名前ベースの推測マッチングをしない (Murmur2 + API 照合のみ)
- CurseForge 利用規約に反するキャッシュ・API key のクライアント露出をしない

## 5. 完了条件 (DoD) — 暫定

- [ ] CurseForge 個別 Mod / RP / Shader が fingerprint 照合で Import できる
- [ ] CurseForge Modpack (.zip) が完全 Import できる
- [ ] Provider 混在 Profile (Modrinth + CurseForge) の Sync が動作する
- [ ] Modpack 更新検知 + Sync が動作する
- [ ] 4 検証全 pass・`.archive/vite/` 無変更
- [ ] 詳細計画を本形式で改訂済み (Phase 12 完了時)

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit | 必須 | Murmur2 計算・Provider 変換 |
| E2E (CI) | 必須 | Import → Sync 一貫フロー |
| 実環境 | 必須 | 実 CurseForge ファイルでの照合 |

## 7. 停止条件

- CurseForge API の利用規約・認証まわりで判断が必要な場合
- Murmur2 照合の精度に問題が発覚した場合 (推測マッチへの fallback は禁止)

## 8. 完了時に行うこと

4 検証 → コミット (`feat(P13-A): …`) → task-list 更新 → DEPLOY-1 (Vercel 本番
デプロイ) の着手判断。

## 9. サブタスク分割 (暫定)

| ID | テーマ | 主要成果物 | 依存 |
|---|---|---|---|
| P13-A | 基盤 + Provider 完成 | CF API proxy / Murmur2 Worker / 個別 Import | P12-C |
| P13-B | Modpack + 更新検知 | .zip Import / 混在 Profile Sync | P13-A |

## 10. 設計詳細・仕様 (継承)

- **CurseForge API**: proxy Route Handler 経由 (API key はサーバ側のみ。
  Modrinth プロキシと同じ CORS / レート制限方針を適用)
- **Murmur2**: CurseForge の fingerprint アルゴリズム。Web Worker で並列計算
  (Phase 11 の SHA-1 Worker と同じ設計)
- **Modpack (.zip)**: `manifest.json` + overrides 構造のパーサ
- **Provider 混在 Profile**: `ProjectItem.source` で Modrinth / CurseForge を区別

## 11. リスク・Gotchas

- API key の入手とレート制限 (CurseForge 側) — 着手前にユーザー確認
- 詳細は Phase 12 実装後の改訂時に充実させる

## 12. 実績と証拠

未着手 (保留)。Phase 12 完了後に本書を改訂してから task-list を `未着手` に戻す。
