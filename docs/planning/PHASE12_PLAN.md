# Phase 12: ローカル Minecraft 環境 Sync & Modrinth Modpack (Read/Write)

> 対応 task-list ID: `P12-A` 〜 `P12-C` ([docs/task-list.md](../task-list.md))
> 計画書テンプレート: [docs/planning/_TEMPLATE.md](./_TEMPLATE.md) 準拠
> **状態: 未着手** (2026-08-26 改定 / **2026-08-27 に §12 の設計論点 6 件をユーザーと確定済み**。
> P12-A から着手可能)

## 1. 開始前確認

- Phase 11 完了 (P11-E2E の CI green = VER-1) を確認
- 本書 §12 の設計論点は **2026-08-27 に確定済み**（実装時は §12 の決定に従う。新論点が出たら停止して質問）
- `git status` clean・skills/env-import.md を読む

## 2. 目的 (Why)

Phase 11 で構築した Profile を SSOT (Single Source of Truth) として、
**ローカル Minecraft 環境との差分を安全に反映**する。加えて **Modrinth Modpack
(.mrpack)** の Import と更新検知に対応する。

Phase 12 のキーワードは **「安全性」と「復旧可能性」**:
- 書き込む前に必ず Preview
- 削除する前に必ず fingerprint 検証
- クラッシュしても Rollback で復旧

Phase 11 は Read-only だったが、Phase 12 は**ユーザーの Minecraft 環境を実際に変更する**
ため、3 層の安全機構を全て実装してから初めて有効化する:
1. **SyncPlan の完全 Preview** (ユーザー承認前は実行しない)
2. **fingerprint unchanged 必須の自動削除** (外部変更検知で保持)
3. **Transaction Journal + Backup** (途中クラッシュから復旧可能)

## 3. 変更範囲 (Scope)

変更対象:
- `types.ts` (`linkedSource`) / `lib/db/dexie.ts` (`dirHandles` / `ManagedFileRecord` /
  `SyncTransaction` テーブル)
- `lib/env/` (`sink.ts` / `sink/filesystem.ts` / `backup.ts` / Diff Engine / Executor)
- `.mrpack` パーサ + Import フロー / Modpack タブ UI / Sync Preview・History UI
- `Provider` 抽象化 + `ModrinthProvider` (CurseForge は入り口のみ)

変更しない (境界外):
- CurseForge API / Murmur2 → Phase 13
- `.archive/vite/` 不変

## 4. 禁止事項

- Preview なしの書き込み・削除を実行しない
- **管理下にないファイル (Unmanaged) を削除しない**。管理下でも fingerprint が
  変わっていたら「外部変更あり」として保持する
- Sync 実行は fingerprint の再検証 (実行直前) を省略しない
- 論点 (§12) を推測で決めて実装しない — 停止して質問する

## 5. 完了条件 (DoD)

- [ ] P12-A: `computeSyncPlan()` の unit test が Diff 全 5 分類 (Additions / Updates /
      Deletions / Unchanged / Unmanaged) + fingerprint unchanged 検証を cover
- [ ] P12-B: Chromium で Direct Write が Transaction + Backup + Rollback 付きで動作
- [ ] P12-C: Firefox / Safari で ZipSink 経由の Sync が動作
- [ ] `.mrpack` Import → Profile 化 → Modpack 更新検知 → Preview → Sync が一貫して動作
- [ ] Sync 実行中のクラッシュから Rollback で復旧できることをテストで証明
- [ ] 4 検証全 pass・`.archive/vite/` 無変更・task-list 更新

## 6. テスト方法

| 層 | 実施 | 確認内容 |
|---|---|---|
| Unit (vitest) | 必須 | Diff Engine 全分類 / Journal / Rollback |
| Component (RTL) | 必須 | Preview UI (5 分類の表示・承認フロー) |
| E2E (CI) | 必須 | mock handle 経由の Sync 成功/失敗/復帰 |
| 実環境 | 必須 | 実機 Chromium での Direct Write・ユーザー確認 |

## 7. 停止条件

- §12 の設計論点に到達した場合 (実装前に確定済みのはず。新論点も停止して協議)
- ユーザーデータ (ローカル環境) の破壊が予期せず発生するリスクを検知した場合
- OPFS quota / パーミッション昇格が仕様どおり動作しない場合

## 8. 完了時に行うこと

各サブフェーズ: 4 検証 → コミット (`feat(P12-A): …`) → task-list 更新 → skills 反映。
**破壊的操作を含むため、各サブフェーズ完了時に実機での復旧手順確認を必ず行う。**

## 9. サブタスク分割

| ID | テーマ | 主要成果物 | 依存 |
|---|---|---|---|
| P12-A | 基盤 + Managed File + Diff Engine | linkedSource / dirHandles / ManagedFileRecord / computeSyncPlan | P11 完了 |
| P12-B | Preview UI + Transaction + Executor + Rollback | SyncTransaction / executeSync / OPFS Backup / History UI | P12-A |
| P12-C | ZipSink + ModrinthProvider + .mrpack | ZipSink / .mrpack パーサ / Modpack UI / CF 検出表示 | P12-B |

## 10. 設計詳細・仕様 (継承)

### 10.1 アーキテクチャ (Plan / Execute 分離)

```
Profile (SSOT) ── Diff Engine ──▶ SyncPlan ──▶ Preview UI ──▶ Executor
                                     │                            │
                              ManagedFileRecord          Transaction Journal
                                     │                            │
                              fingerprint 検証              Backup (Blob + OPFS)
                                                                  │
                                                               Rollback
```

- Chromium: リンクした handle を `requestPermission({ mode: 'readwrite' })` で昇格 →
  `FileSystemSink` による Direct Write
- Firefox / Safari / モバイル: `ZipSink` (既存 useZipExport の拡張)

### 10.2 Diff Engine (computeSyncPlan)

カテゴリ (mod / resourcepack / shader) ごとに独立実行:
1. **Additions**: Profile の `artifact.sha1` が Local に存在しない → add
2. **Updates**: 同じ contentId で sha1 が変わっている → update
3. **Deletions** (安全な削除条件 — 3 条件すべて満たす場合のみ):
   ```
   ManagedFileRecord が存在
     AND 現在の Local fingerprint == ManagedFileRecord.sha1  ← unchanged 必須
     AND Profile の該当カテゴリ配列が該当 projectId の ProjectItem を持たない
   ```
   **fingerprint が変わっていたら** → deletion に含めず `unchanged` + 「外部変更検知」フラグ
4. **Unchanged**: profile / local / managed で全て sha1 一致
5. **Unmanaged**: local にあるが管理外 → **削除対象外 (表示のみ)**

Local の SHA-1 計算は Phase 11 の Web Worker を再利用。

### 10.3 Sync Preview UI (実行前の必須ゲート)

Direct Write 実行前に必ず表示し、ユーザーが Apply を押すまで実行しない。
カテゴリごとに 5 分類 (🟢 追加 / 🟡 更新 / 🔴 削除 / 🔵 保持 / ⚠️ 外部変更検知) を
一覧表示し、合計サイズ変化と Backup サイズ (OPFS quota 意識) を表示する。

**重要な UI ルール**:
- 削除欄には必ず **source バッジ** ([DropMod 追加] / [Import 由来] / [Modpack 更新]) を表示
- Import 由来の削除はユーザー選択 ([削除する] / [保持する])
- 外部変更検知は独立セクションで警告 (削除保留・保持扱い)

### 10.4 Executor と Transaction Journal

```typescript
async function executeSync(tx: SyncTransaction, sink: EnvironmentSink) {
  await updateTxStatus(tx.id, 'running');
  for (const op of tx.operations) {
    // 1. Backup (delete/update 時): OPFS へ現ファイルを保管
    // 2. 実行: add/update → sink.write / delete → sink.remove
    // 3. 操作ごとに journal へ記録 (idempotent に再実行可能)
    // 4. 失敗時 → Rollback: journal を逆順で巻き戻し
  }
  await updateTxStatus(tx.id, 'completed');
}
```

- fingerprint を**実行直前に再検証** (Preview → Apply の間に外部変更が無いか)
- Rollback: Backup (Blob + OPFS) から復元。直近 3 回の Sync を Undo 可能
- Sync History UI を Settings ページに配置

### 10.5 Managed File Ownership Model

- Import 時の `ProjectItem.artifact` (sha1/path/size) を初期 `ManagedFileRecord` として展開
- `source`: `'import'` (手動追加) / `'modpack'` (Modpack 由来) / `'dropmod'` (ユーザー追加)
- ユーザーが追加していない (Import 由来) ファイルの削除は追加確認を要求

### 10.6 Modrinth Modpack (.mrpack)

- `.mrpack` (zip: `modrinth.index.json` + `overrides/`) を Import → Profile 化
- `modrinth.index.json`: files[] (project_id / version_id / sha1) + dependencies
- overrides のファイルは `source: 'modpack'` として ManagedFileRecord 化
- 更新検知: 現状より新しい version が Modrinth に存在するか (Analysis に追加)
- Modpack は Profile の **Source** (カテゴリではない)。`/modpack` 予約ハブを使用
- CurseForge `.zip` は検出して「未対応」表示のみ (Phase 13 で対応)

## 11. リスク・Gotchas (継承・実装時に追記)

- read handle → readwrite 昇格の失敗 UX (Read-only 解析への fallback)
- Sync 実行中にタブを閉じられた場合の resume
- OPFS quota 逼迫時の LRU 削除順序
- `dirHandles` の再許可フロー (Phase 11 から延期された課題)

## 12. 設計論点 — **2026-08-27 にユーザーと確定済み**

> 以下は `ask_user` でユーザーが選択した**確定事項**。実装時はこの決定に従うこと。
> 推測で変えない。変更が必要になったら停止してユーザーに確認する (§4 / §7)。

### D-1. `Profile.environment` とローカル検出環境の不一致 → **ブロック**

- **決定**: Sync 実行を**禁止**する。Preview にも到達させず、
  「Profile の環境（mcVersion / loader / loaderVersion）を実際の環境に合わせるか、
  別の Profile を選択してください」と促す。
- **理由**: 互換性のない Mod をインスタンスへ書き込むと起動不能になる。
  ユーザーデータの破壊リスクを最優先で防ぐ。
- **実装メモ**: 不一致の判定は mcVersion・loader・loaderVersion の 3 点。
  loaderVersion だけ異なる場合は「警告付きで許可」等の緩和は**しない**（一律ブロック）。

### D-2. readwrite 昇格失敗 → **Read-only に fallback**

- **決定**: 解析（Read-only）はそのまま利用可能。Sync ボタンは**無効化**し、
  理由（昇格が拒否された旨）を表示する。あわせて「**ZIP で書き出す**」を代替手段として提示する。
- **理由**: できることまで塞がない。ただし「書き込んだ」と誤解させないため
  自動で ZipSink へ切り替えることは**しない**（必ずユーザー操作で ZIP 出力を選ぶ）。

### D-3. Modpack 更新時の同名 Mod 競合（`source: 'dropmod'`） → **都度ユーザーに選択させる**

- **決定**: Preview に**競合一覧セクション**を設け、Mod ごとに
  `[ユーザー版を残す]` / `[Modpack 版に置換]` を選ばせる。既定値は「ユーザー版を残す」。
- **理由**: ユーザーが選んだ版が黙って消える事故を防ぐ。データ消失が起きない選択肢。
- **実装メモ**: 競合判定は projectId 一致 + versionId 相違。

### D-4. Sync 中のタブ close / クラッシュ → **検出して確認 → Rollback**

- **決定**: 起動時に**未完了の Journal** を検出し、
  「前回の Sync が中断されました。巻き戻しますか？」を表示する。**既定は Rollback**。
- **理由**: 自動 Rollback は何が起きたか把握しづらく、resume は中断中に環境が
  変わっているため危険。ユーザー判断を挟む。
- **実装メモ**: 検出は `SyncTransaction.status === 'running'` の残存レコード。

### D-5. OPFS quota 逼迫時の削除順序 → **古い順（ただし直近 3 回は絶対に残す）**

- **決定**: 最も古い Sync の Backup から削除する。ただし **§10.4 が約束する
  「直近 3 回の Sync を Undo 可能」は絶対に破らない**。
  それでも容量が足りない場合は **Sync 自体を中断**してユーザーに知らせる。
- **理由**: Undo 保証を優先。容量不足は「黙って保護を外す」のではなく显在化させる。

### D-6. Modpack 解除（unbind）時の `source: 'modpack'` → **全て `'import'` へ昇格**

- **決定**: Modpack の紐付けを外してもファイルは Profile に残り、
  `source` を `'modpack'` → `'import'` に書き換える。以後は通常の Import 由来ファイルとして
  扱い、**削除時には確認を要求**する（§10.5 のルールを継承）。
- **理由**: 解除＝即削除だとユーザーの環境から大量のファイルが消える。
  「紐付けだけ外して中身は残す」が安全側。

### 確定に伴う実装への影響（着手前に反映すべき点）

- Preview UI に**競合セクション（D-3）**と**環境不一致ブロック表示（D-1）**が増える。
  §10.3 の 5 分類表示に「競合」を加えた 6 セクション構成になる。
- `executeSync` は起動時の Journal 検査（D-4）を含む必要がある。
- Backup の LRU 実装は「直近 3 回保護」（D-5）を必須条件としてテストする。
- `.mrpack` unbind フロー（D-6）は P12-C の Modpack UI に含める。
