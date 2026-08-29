# 2026-08-27 Phase 12 概要説明 + 設計論点 6 件の確定

- 対応 task: Phase 12 着手前の地ならし（`PHASE12_PLAN.md` §12 の確定）
- ブランチ: `arena/01a04363-dropmod`

## 1. 指示内容 (Task Summary)

ユーザー指示:
1. 「次は Phase 12 に移りたいのでまずは具体的な概要を説明してください」
2. 「あと、Phase 12 の設計論点 6 件の確定もしたいです」

`PHASE12_PLAN.md` §12 に未チェックの設計論点が 6 件あり、これが P12-A 着手の
唯一のブロッカーだった。§4 禁止事項に「論点を推測で決めて実装しない — 停止して
質問する」とあるため、`ask_user` で 4 件 + 2 件に分けて確定した。

## 2. 実行内容 (Executed Actions)

### 2.1 計画書の誤参照を修正（DOC-6 の見落とし分）

`PHASE12_PLAN.md` の **§4 禁止事項**と **§7 停止条件**にも「§9 の設計論点」が
残っていた。§12 へ修正し、計画書内の設計論点参照を全て §12 に統一した。

### 2.2 設計論点 6 件を確定（`PHASE12_PLAN.md` §12 を書き換え）

| # | 論点 | 決定 |
|---|---|---|
| **D-1** | `Profile.environment` とローカル検出環境の不一致 | **ブロック**（Sync 禁止。mcVersion / loader / loaderVersion の 3 点で判定、loaderVersion だけ異なる場合も緩和せず一律ブロック） |
| **D-2** | readwrite 昇格失敗時の UX | **Read-only に fallback**（解析は継続、Sync ボタン無効化 + 理由表示。「ZIP で書き出す」を代替提示。**自動で ZipSink へは切り替えない**） |
| **D-3** | Modpack 更新時の同名 Mod 競合（`source: 'dropmod'`） | **都度ユーザーに選択**（Preview に競合一覧。Mod ごとに [ユーザー版を残す] / [Modpack 版に置換]。既定は「ユーザー版を残す」。判定は projectId 一致 + versionId 相違） |
| **D-4** | Sync 中のタブ close / クラッシュ | **検出して確認 → Rollback**（起動時に未完了 Journal を検出し確認ダイアログ。既定 Rollback。検出条件は `SyncTransaction.status === 'running'` の残存） |
| **D-5** | OPFS quota 逼迫時の削除順序 | **古い順、ただし直近 3 回は絶対に残す**（§10.4 の「直近 3 回 Undo 可能」を絶対に破らない。足らなければ Sync 自体を中断してユーザーに通知） |
| **D-6** | Modpack 解除時の `source: 'modpack'` | **全て `'import'` へ昇格**（ファイルは Profile に残す。以後は通常の Import 由来として扱い、削除時に確認を要求） |

§12 を「未解決の設計論点」から「**確定事項 D-1〜D-6**」へ書き換え、各決定に
理由と実装メモを付記した。あわせて冒頭状態行と §1 開始前確認を更新
（「P12-A から着手可能」）。

### 2.3 実装への影響を §12 末尾に明記

- Preview UI は §10.3 の 5 分類に**競合セクション（D-3）**と**環境不一致ブロック表示（D-1）**が加わり **6 セクション構成**になる
- `executeSync` は起動時の Journal 検査（D-4）を含む必要がある
- Backup の LRU 実装は「直近 3 回保護」（D-5）を必須条件としてテストする
- `.mrpack` unbind フロー（D-6）は P12-C の Modpack UI に含める

### 2.4 task-list.md に注記

Phase 12 表の下に「設計論点 6 件は 2026-08-27 に確定済み（§12 の D-1〜D-6）。
着手を妨げる未確定事項は無い」を追記。

## 3. 気づいたこと・知見 (Insights & Lessons Learned)

- **Phase 12 の安全設計は「削除の 3 条件」に集約される。**
  `ManagedFileRecord 存在` AND `Local fingerprint == ManagedFileRecord.sha1` AND
  `Profile が該当 projectId を持たない`。fingerprint が変わっていたら削除せず
  「外部変更検知」として保持する。実装時はこの 3 条件の unit test を最優先で書く。
- **Phase 11 の資産がそのまま接続できるよう意図的に設計されていた。**
  `ProjectItem.artifact { sha1, path, size }` は ManagedFileRecord の初期値へそのまま
  展開でき、`Profile` 末尾には `// linkedSource … は Phase 12 で追加` の予約コメントがある。
  SHA-1 Worker（concurrency 8 + main-thread fallback）も Diff の fingerprint 計算で再利用可能。
- **`EnvironmentSource`（read 系 4 メソッド）と対になる `EnvironmentSink` を設計する**のが
  P12-A/B の筋。`ZipSink` は既存 `useZipExport`（`computeConcurrency` あり）の拡張。
- **Sandbox では P12-B / P12-C の実機検証が不可能。** Chromium インストール不可のため
  E2E は CI 上のみ、Direct Write の実機確認はユーザー依頼になる。
  **P12-A（Diff Engine + 型 + Dexie v3 migration）は Unit / Component で完結できる**ため、
  Sandbox 内で完結できる範囲から着手するのが効率的。
- Dexie は現在 **v2**（`profiles` / `apiCache` / `meta`）。`dirHandles` /
  `ManagedFileRecord` / `SyncTransaction` を足すには **v3 migration** が必要。
  Phase 11 の v2 migration テスト（`dexie.migration.test`）がパターンとして使える。

## 4. 次にすべきこと (Next Actions)

1. **P12-A に着手可能**（設計論点は全て確定、依存の P11-E2E は完了済み）。
   着手順の推奨: `types.ts` の `linkedSource` → Dexie v3 migration →
   `ManagedFileRecord` → `computeSyncPlan()` の 5 分類 unit test。
2. P12-A の DoD は「Diff 全 5 分類 + fingerprint unchanged 検証を cover」。
   D-1〜D-6 のうち **A で直接効くのは D-1（環境不一致は Preview 前にブロック）** のみ。
   D-3〜D-6 は P12-B / C 段階。
3. 実装中に新しい設計論点が出たら **停止して質問する**（§4 禁止事項）。
4. `実環境検証待ち` の 3 件（`UIP-5` / `SEC-1` / `VER-2`）はユーザー実機・本番での確認が残る。
