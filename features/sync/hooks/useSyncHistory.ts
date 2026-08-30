'use client';

/**
 * Sync History と Undo (Phase 12-B / PHASE12_PLAN.md §9.1)。
 *
 * **直近 `UNDO_KEEP_COUNT` (3) 件**を表示する。これは D-5 (OPFS 容量逼迫時に
 * 古いバックアップから追い出す) で「絶対に保護される件数」と同じ値にしてある —
 * **Undo ボタンを出しているのにバックアップが消えている**状態を作らないため。
 *
 * ## Undo の前提条件
 *
 * 1. プロファイルにフォルダが紐付いている (紐付け先が消えていたら復元できない)
 * 2. フォルダを開ける
 * 3. **書き込み権限が取れる** (D-7 / D-2: Sync 時に readwrite へ昇格させる方式なので
 *    Undo も同じ経路を通す。取れなければ理由を出して諦める)
 * 4. `status === 'completed'` (undoSync 側でも再チェック)
 */

import { useCallback, useEffect, useState } from 'react';
import { listSyncTransactions, type SyncTransactionRow } from '../db';
import { openLinkedFolder } from '../link';
import { undoSync } from '../undo';
import { UNDO_KEEP_COUNT } from '../backup';
import { useProfilesStore } from '@/features/profiles';
import { useToastStore } from '@/components/feedback/toastStore';

export interface SyncHistoryItem {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: SyncTransactionRow['status'];
  /** 実際に適用された操作数 */
  applied: number;
  /** スキップされた操作数 (外部変更検知など) */
  skipped: number;
  /** Journal に入った操作の総数 */
  total: number;
  error?: string;
  /** Undo ボタンを出してよいか */
  canUndo: boolean;
}

function toItem(row: SyncTransactionRow): SyncHistoryItem {
  const applied = row.operations.filter((op) => op.done && !op.skippedReason).length;
  const skipped = row.operations.filter((op) => op.skippedReason).length;
  return {
    id: row.id,
    startedAt: row.startedAt,
    ...(row.finishedAt !== undefined ? { finishedAt: row.finishedAt } : {}),
    status: row.status,
    applied,
    skipped,
    total: row.operations.length,
    ...(row.error !== undefined ? { error: row.error } : {}),
    canUndo: row.status === 'completed'
  };
}

export interface UseSyncHistoryResult {
  items: SyncHistoryItem[];
  loading: boolean;
  error: string | null;
  /** Undo 実行中の txId (スピナー用)。null なら実行中ではない */
  undoingId: string | null;
  refresh: () => Promise<void>;
  undo: (transactionId: string) => Promise<void>;
}

export function useSyncHistory(profileId: string | undefined): UseSyncHistoryResult {
  const [items, setItems] = useState<SyncHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listSyncTransactions(profileId);
      // D-5 で保護される件数だけを表示する (それより古いものは Undo できない)
      setItems(rows.slice(0, UNDO_KEEP_COUNT).map(toItem));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  // refresh は profileId にだけ依存するので、プロファイル切替時に自動で再取得される
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const undo = useCallback(
    async (transactionId: string) => {
      const { currentProfileId, profiles } = useProfilesStore.getState();
      const profile = profiles.find((p) => p.id === currentProfileId);
      const linked = profile?.linkedSource;
      const toast = useToastStore.getState().showToast;

      if (!linked) {
        toast('フォルダが紐付いていないため取り消せません。', 'error');
        return;
      }

      setUndoingId(transactionId);
      try {
        const opened = await openLinkedFolder(linked);
        if (!opened) {
          toast('フォルダを開けませんでした。もう一度お試しください。', 'error');
          return;
        }
        // D-7: Undo も書き込み権限の昇格を通す。取れなければ諦める (D-2)
        const writable = await opened.sink.ensureWritable();
        if (!writable) {
          toast('書き込み権限が得られないため取り消せません。', 'error');
          return;
        }

        const result = await undoSync({ transactionId, sink: opened.sink });
        if (result.ok) {
          toast(
            `Sync を取り消しました (復元 ${result.restored} 件 / 削除 ${result.removed} 件)`,
            'success'
          );
        } else {
          toast(result.message ?? 'Sync を取り消せませんでした。', 'error');
        }
      } catch (e) {
        toast(
          `Sync の取り消しに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
          'error'
        );
      } finally {
        setUndoingId(null);
        await refresh();
      }
    },
    [refresh]
  );

  return { items, loading, error, undoingId, refresh, undo };
}
