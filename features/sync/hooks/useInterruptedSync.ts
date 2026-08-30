'use client';

/**
 * 中断された Sync の検出と復旧 (**D-4**)。
 *
 * アプリ起動時に未完了の Journal を探し、**ユーザーに確認する**。
 * 勝手に Rollback も再開もしない (D-4 の決定)。既定の選択肢は Rollback。
 *
 * ## 「勝手に再開しない」理由
 *
 * Sync は 1 本のトランザクション。途中から続けると Preview で見せた差分と
 * 実際に書いたものが食い違う。一度巻き戻して Sync し直すほうが安全。
 *
 * ## Rollback できない場合
 *
 * フォルダが開けない / 書き込み権限が取れない (**D-2**) ときは巻き戻せない。
 * この場合**状態を変えない**ので次回起動時にまた確認する (勝手に諦めない)。
 */

import { useCallback, useEffect, useState } from 'react';
import { openLinkedFolder } from '../link';
import {
  findInterruptedSyncs,
  recoverInterruptedSync,
  type InterruptedSyncChoice,
  type InterruptedSyncInfo
} from '../recovery';
import type { EnvironmentSink } from '../sink';
import { useProfilesStore } from '@/features/profiles';
import { useToastStore } from '@/components/feedback/toastStore';

export interface UseInterruptedSyncResult {
  /** 検出された中断 Journal。空なら何もしない */
  items: InterruptedSyncInfo[];
  checking: boolean;
  recovering: boolean;
  error: string | null;
  /** ユーザーの選択を適用する */
  resolve: (choice: InterruptedSyncChoice) => Promise<void>;
}

export function useInterruptedSync(): UseInterruptedSyncResult {
  const [items, setItems] = useState<InterruptedSyncInfo[]>([]);
  const [checking, setChecking] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 起動時に 1 回だけ確認する。deps は空が仕様 — プロファイルを切り替えるたびに
  // 「前回の同期が完了していません」を再表示しないため
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await findInterruptedSyncs();
        if (!cancelled) setItems(found);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolve = useCallback(
    async (choice: InterruptedSyncChoice) => {
      if (items.length === 0) return;
      setRecovering(true);

      const { profiles } = useProfilesStore.getState();
      // プロファイルごとに 1 回だけフォルダを開く
      const byProfile = new Map<string, InterruptedSyncInfo[]>();
      for (const item of items) {
        const list = byProfile.get(item.profileId);
        if (list) list.push(item);
        else byProfile.set(item.profileId, [item]);
      }

      const failures: string[] = [];
      for (const [profileId, list] of byProfile) {
        let sink: EnvironmentSink | undefined;

        if (choice === 'rollback') {
          // Rollback には書き込み先が要る。開けなければ sink 無しで呼び、
          // recoverInterruptedSync 側が失敗理由を返す (状態は変えない)
          const linked = profiles.find((p) => p.id === profileId)?.linkedSource;
          if (linked) {
            const opened = await openLinkedFolder(linked);
            if (opened) {
              // D-7: Undo と同じ経路で readwrite へ昇格させる
              const writable = await opened.sink.ensureWritable();
              if (writable) sink = opened.sink;
            }
          }
        }

        for (const item of list) {
          const result = await recoverInterruptedSync({
            transactionId: item.transactionId,
            choice,
            ...(sink ? { sink } : {})
          });
          if (!result.ok) failures.push(result.message ?? '不明な理由');
        }
      }

      const toast = useToastStore.getState().showToast;
      if (failures.length === 0) {
        toast(
          choice === 'rollback'
            ? `前回の同期を巻き戻しました (${items.length} 件)`
            : '前回の同期は中断したままにしました。',
          'success'
        );
      } else {
        toast(`${failures[0]}`, 'error');
      }

      setRecovering(false);
      // 巻き戻せなかった分が残っていればダイアログを出し続ける
      setItems(await findInterruptedSyncs().catch(() => [] as InterruptedSyncInfo[]));
    },
    [items]
  );

  return { items, checking, recovering, error, resolve };
}
