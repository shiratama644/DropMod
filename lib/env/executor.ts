/**
 * Sync Executor (Phase 12-B / PHASE12_PLAN.md §10.4)。
 *
 * Preview で承認された `SyncPlan` を、**Transaction Journal + Backup + Rollback** を
 * 伴って実行する。キーワードは「安全性」と「復旧可能性」(§2):
 *
 * 1. **fingerprint の実行直前再検証** — Preview → Apply の間に外部変更が入っていないか
 *    を各操作の直前に確認する。食い違ったらその操作は**スキップ**する (§4 禁止事項:
 *    再検証を省略しない)
 * 2. **Backup 先行** — update / delete は現ファイルを OPFS に退避してから実行する
 * 3. **操作ごとのジャーナル記録** — 1 操作ごとに即永続化し、idempotent に再実行できる
 * 4. **失敗時は逆順 Rollback** — 適用済み操作を Journal の逆順で巻き戻す
 * 5. **D-5: quota ゲート** — Backup 容量が足りなければ**何も触らずに中断**する
 *    (直近 `UNDO_KEEP_COUNT` 回の Sync は絶対に消さない)
 */

import {
  createSyncTransaction,
  getSyncTransaction,
  markOperationDone,
  updateSyncTransactionStatus,
  type SyncOperationJournalEntry
} from '@/lib/db/dexie';
import { calculateSha1 } from '@/lib/utils/hash';
import {
  selectEvictableTransactions,
  UNDO_KEEP_COUNT,
  type BackupStore
} from './backup';
import type { SyncPlan, SyncPlanEntry } from './diff';
import type { EnvironmentSink } from './sink';

/** 操作をスキップした理由 (UI でそのまま表示する) */
export type SyncSkipReason =
  /** 実行直前の再検証で fingerprint が食い違った (外部変更) */
  | 'externally-modified'
  /** 追加対象のパスに既にファイルが存在した */
  | 'unexpected-existing'
  /** 更新 / 削除対象のファイルが既に無かった */
  | 'missing'
  /** 書き込み先パスを確定できなかった */
  | 'unresolved-path';

export interface SyncSkippedEntry {
  path: string;
  reason: SyncSkipReason;
}

/** `resolveContent` の返り値 */
export interface ResolvedContent {
  data: Uint8Array;
  /**
   * 書き込み先パス。Plan 時点で `path` が未確定 (空) の追加操作では、
   * ダウンロード後に確定したパスをここで返す。
   */
  path?: string;
}

/** 書き込む実体を取得するコールバック (通常は Modrinth からのダウンロード) */
export type ResolveContent = (entry: SyncPlanEntry) => Promise<ResolvedContent>;

export interface ExecuteSyncOptions {
  profileId: string;
  plan: SyncPlan;
  sink: EnvironmentSink;
  backup: BackupStore;
  resolveContent: ResolveContent;
  onProgress?: (progress: { done: number; total: number; path: string }) => void;
  /**
   * OPFS の空きバイト数 (`navigator.storage.estimate()` の quota - usage)。
   * 省略時は容量チェックを行わない (テスト用)。
   */
  freeBytes?: number;
  /** 絶対に消してはいけない txId。省略時は「直近 3 件」を自動算出 (D-5) */
  keepTxIds?: ReadonlySet<string>;
}

export type ExecuteSyncOutcome =
  | 'completed'
  | 'rolled-back'
  /** D-5: Backup 容量が足りず、何も実行せずに中断した */
  | 'aborted-quota'
  | 'failed';

export interface ExecuteSyncResult {
  /** 作成したトランザクション ID (aborted-quota では未作成のため undefined) */
  transactionId?: string;
  outcome: ExecuteSyncOutcome;
  /** 実際に適用した操作数 */
  applied: number;
  skipped: SyncSkippedEntry[];
  error?: string;
}

export interface RollbackResult {
  /** Backup から復元したファイル数 */
  restored: number;
  /** 削除して元に戻したファイル数 (追加の巻き戻し / 元々無かったファイル) */
  removed: number;
  /**
   * 巻き戻しに失敗した操作の説明。
   * **Rollback は best-effort**: 途中で失敗しても残りの操作を続行し、
   * 例外は投げずにここに集める (1 件の失敗でトランザクションが
   * `running` のまま取り残されるのを防ぐ)。
   */
  errors: string[];
}

/** Journal 1 エントリと、それに対応する Plan エントリの組 */
export interface PreparedOperation {
  entry: SyncPlanEntry;
  op: SyncOperationJournalEntry;
}

/**
 * `SyncPlan` を Transaction Journal の操作列に変換する (pure function)。
 *
 * 順序は **追加 → 更新 → 削除**。削除を最後にするのは、
 * 途中で失敗した場合に「消えてしまったが追加されていない」状態を避けるため
 * (Rollback は逆順なので、削除から巻き戻される)。
 */
export function buildJournalOperations(plan: SyncPlan): PreparedOperation[] {
  const prepared: PreparedOperation[] = [];

  for (const entry of plan.additions) {
    prepared.push({
      entry,
      op: {
        kind: 'add',
        category: entry.category,
        path: entry.path,
        projectId: entry.projectId,
        sha1: entry.targetSha1,
        size: entry.size,
        done: false
      }
    });
  }

  for (const entry of plan.updates) {
    prepared.push({
      entry,
      op: {
        kind: 'update',
        category: entry.category,
        path: entry.path,
        projectId: entry.projectId,
        sha1: entry.targetSha1,
        expectedSha1: entry.localSha1,
        size: entry.size,
        done: false
      }
    });
  }

  for (const entry of plan.deletions) {
    prepared.push({
      entry,
      op: {
        kind: 'delete',
        category: entry.category,
        path: entry.path,
        projectId: entry.projectId,
        sha1: entry.localSha1,
        expectedSha1: entry.localSha1,
        size: entry.size,
        done: false
      }
    });
  }

  return prepared;
}

/**
 * SyncPlan を実行する。
 *
 * 例外を投げない設計: 失敗は `outcome` で返す
 * (`rolled-back` / `aborted-quota` / `failed`)。UI はこれをそのまま表示する。
 */
export async function executeSync(options: ExecuteSyncOptions): Promise<ExecuteSyncResult> {
  const {
    profileId,
    plan,
    sink,
    backup,
    resolveContent,
    onProgress,
    freeBytes,
    keepTxIds
  } = options;

  const prepared = buildJournalOperations(plan);
  if (prepared.length === 0) {
    return { outcome: 'completed', applied: 0, skipped: [] };
  }

  // ------------------------------------------------------------------
  // D-5: Backup 容量ゲート。**何も触る前**に判定する
  // ------------------------------------------------------------------
  const available = await backup.listTransactions();
  const keep =
    keepTxIds ??
    new Set(
      [...available]
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, UNDO_KEEP_COUNT)
        .map((t) => t.txId)
    );
  const decision = selectEvictableTransactions(
    available,
    keep,
    plan.totals.backupBytes,
    freeBytes ?? Number.POSITIVE_INFINITY
  );

  if (!decision.enough) {
    return {
      outcome: 'aborted-quota',
      applied: 0,
      skipped: [],
      error:
        `バックアップ用ストレージの空き容量が不足しています (必要 ${plan.totals.backupBytes} bytes / ` +
        `空き ${freeBytes ?? 0} bytes)。直近 ${UNDO_KEEP_COUNT} 回の Sync の復元データは保護されているため、` +
        'それ以上は自動的に削除できません。Sync History から古い履歴を削除してから再試行してください。'
    };
  }

  for (const txId of decision.evict) {
    await backup.removeTransaction(txId);
  }

  // ------------------------------------------------------------------
  // 実行
  // ------------------------------------------------------------------
  const transactionId = await createSyncTransaction(
    profileId,
    prepared.map((p) => p.op)
  );
  await updateSyncTransactionStatus(transactionId, 'running');

  let applied = 0;
  const skipped: SyncSkippedEntry[] = [];

  try {
    for (const [index, { entry, op }] of prepared.entries()) {
      const result = await applyOperation(entry, op, {
        sink,
        backup,
        transactionId,
        index,
        resolveContent
      });
      if (result.applied) {
        applied++;
      } else if (result.reason) {
        skipped.push({ path: op.path, reason: result.reason });
      }
      onProgress?.({ done: index + 1, total: prepared.length, path: op.path });
    }
    await updateSyncTransactionStatus(transactionId, 'completed');
    return { transactionId, outcome: 'completed', applied, skipped };
  } catch (e) {
    // §10.4: 失敗時は Journal を逆順で巻き戻す
    const message = e instanceof Error ? e.message : String(e);
    const rollback = await rollbackSync(transactionId, sink, backup);
    // 復旧そのものが失敗した場合は、その旨も Journal と UI に残す
    const detail =
      rollback.errors.length > 0
        ? `${message} (復旧時の失敗: ${rollback.errors.join(' / ')})`
        : message;
    await updateSyncTransactionStatus(transactionId, 'rolled-back', { error: detail });
    return { transactionId, outcome: 'rolled-back', applied, skipped, error: detail };
  }
}

/**
 * トランザクションを巻き戻す。
 *
 * **Journal の逆順**に、`done === true` の操作だけを戻す。
 * 各操作は冪等 (存在しないファイルの削除は成功扱い、書き込みは上書き) なので
 * 二度実行しても安全。**状態の更新は呼び出し側の責任**
 * (D-4 の復帰フローと executeSync の失敗フローで扱いが異なるため)。
 */
export async function rollbackSync(
  transactionId: string,
  sink: EnvironmentSink,
  backup: BackupStore
): Promise<RollbackResult> {
  const tx = await getSyncTransaction(transactionId);
  if (!tx) return { restored: 0, removed: 0, errors: [] };

  let restored = 0;
  let removed = 0;
  const errors: string[] = [];

  for (let i = tx.operations.length - 1; i >= 0; i--) {
    const op = tx.operations[i];
    if (!op?.done) continue;
    const path = op.appliedPath ?? op.path;
    if (!path) continue;

    try {
      if (op.kind === 'add') {
        // 追加したファイルは消す
        await sink.removeFile(path);
        removed++;
      } else if (op.backupId) {
        const data = await backup.load(op.backupId);
        if (data) {
          await sink.writeFile(path, data);
          restored++;
        } else {
          // Backup が失われている = 元々ファイルが無かった扱いで削除
          await sink.removeFile(path);
          removed++;
        }
      } else {
        // Backup が無い update / delete は元々ファイルが無かったため、削除して戻す
        await sink.removeFile(path);
        removed++;
      }
    } catch (e) {
      // best-effort: 1 件の失敗で残りの復旧を止めない
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`${path}: ${message}`);
    }
  }

  return { restored, removed, errors };
}

// ============================================================================
// 内部ヘルパ
// ============================================================================

interface ApplyContext {
  sink: EnvironmentSink;
  backup: BackupStore;
  transactionId: string;
  index: number;
  resolveContent: ResolveContent;
}

type ApplyResult = { applied: true } | { applied: false; reason: SyncSkipReason };

async function applyOperation(
  entry: SyncPlanEntry,
  op: SyncOperationJournalEntry,
  ctx: ApplyContext
): Promise<ApplyResult> {
  const { sink, backup, transactionId, index, resolveContent } = ctx;

  // ---------------- 追加 ----------------
  if (op.kind === 'add') {
    let path = op.path;
    let data: Uint8Array;

    if (path) {
      // 既存ファイルを上書きしない (外部変更の保護)
      if (await sink.exists(path)) {
        await markOperationDone(transactionId, index, {
          done: false,
          skippedReason: 'unexpected-existing'
        });
        return { applied: false, reason: 'unexpected-existing' };
      }
      data = (await resolveContent(entry)).data;
    } else {
      // Plan 時点でパス未確定。ダウンロード後に確定させる
      const resolved = await resolveContent(entry);
      data = resolved.data;
      path = resolved.path ?? '';
      if (!path) {
        await markOperationDone(transactionId, index, {
          done: false,
          skippedReason: 'unresolved-path'
        });
        return { applied: false, reason: 'unresolved-path' };
      }
      if (await sink.exists(path)) {
        await markOperationDone(transactionId, index, {
          done: false,
          skippedReason: 'unexpected-existing'
        });
        return { applied: false, reason: 'unexpected-existing' };
      }
    }

    await sink.writeFile(path, data);
    await markOperationDone(transactionId, index, { appliedPath: path });
    return { applied: true };
  }

  // ---------------- 更新 / 削除 ----------------
  const current = await sink.readFile(op.path);
  if (!current) {
    await markOperationDone(transactionId, index, { done: false, skippedReason: 'missing' });
    return { applied: false, reason: 'missing' };
  }

  // §10.4 / §4: fingerprint を**実行直前に再検証**する (省略しない)。
  // calculateSha1 が throw (非 Secure Context 等) した場合は上位へ伝播させ、
  // トランザクション全体を Rollback する = 検証できないなら実行しない。
  const currentSha1 = await calculateSha1(current.slice().buffer);
  if (op.expectedSha1 && currentSha1 !== op.expectedSha1) {
    await markOperationDone(transactionId, index, {
      done: false,
      skippedReason: 'externally-modified'
    });
    return { applied: false, reason: 'externally-modified' };
  }

  // Backup 先行 (上書き・削除の前に現ファイルを退避)
  const backupId = await backup.save(transactionId, op.path, current);

  if (op.kind === 'update') {
    const data = (await resolveContent(entry)).data;
    await sink.writeFile(op.path, data);
  } else {
    await sink.removeFile(op.path);
  }

  await markOperationDone(transactionId, index, { backupId });
  return { applied: true };
}
