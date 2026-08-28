'use client';

/**
 * Sync の UI ロジック (Phase 12-B)。
 *
 * 編成 (`prepareSync`) と実行 (`applySync`) は React 非依存の
 * `lib/env/syncPrep.ts` / `lib/env/applySync.ts` に置いてあり、
 * このフックは **状態管理とトースト通知だけ**を担う薄いラッパ。
 *
 * ## 状態遷移
 *
 * ```
 * idle ──prepare()──▶ preparing ──▶ ready | blocked | error
 *                                     │
 *                                  apply()
 *                                     ▼
 *                                  running ──▶ finished
 * ```
 *
 * `blocked` は D-1 (環境不一致) と D-2 (書き込み権限の拒否) の両方で使う。
 * どちらの場合も **Sync ボタンは無効化**し、理由と ZIP 代替導線を出す。
 */

import { useCallback, useRef, useState } from 'react';
import { applySync } from '@/lib/env/applySync';
import { prepareSync, type PrepareSyncOutcome } from '@/lib/env/syncPrep';
import type { ScanProgress } from '@/lib/env/scan';
import type { ExecuteSyncResult } from '@/lib/env/executor';
import { useProfilesStore } from '@/lib/store/profiles';
import { useToastStore } from '@/lib/store/toast';

export type SyncPhase = 'idle' | 'preparing' | 'ready' | 'running' | 'finished';

export interface ApplyProgress {
  done: number;
  total: number;
  path: string;
}

export interface UseSyncResult {
  phase: SyncPhase;
  /** `prepare()` の結果。null なら未取得 */
  outcome: PrepareSyncOutcome | null;
  scanProgress: ScanProgress | null;
  applyProgress: ApplyProgress | null;
  result: ExecuteSyncResult | null;
  error: string | null;
  /**
   * Preview 用の SyncPlan を用意する (書き込みは行わない)。
   * @returns 用意した結果。呼び出し側は `status === 'ready'` のときだけ Preview を出す
   */
  prepare: () => Promise<PrepareSyncOutcome | null>;
  /**
   * Preview を承認して実行する。
   * @param excludedDeletionPaths 「保持」を選んだ削除予定のパス (§10.3)
   */
  apply: (excludedDeletionPaths?: readonly string[]) => Promise<void>;
  reset: () => void;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useSync(): UseSyncResult {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [outcome, setOutcome] = useState<PrepareSyncOutcome | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null);
  const [result, setResult] = useState<ExecuteSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * `apply()` が `prepare()` の結果を参照するための ref。
   *
   * **レンダー時に代入しない。** レンダー時代入だと `prepare()` と `apply()` を
   * 同じ tick で呼んだ場合に再レンダーが間に合わず stale な null を掴む。
   * `prepare()` 内で state と同時に書き、`reset()` で消す。
   */
  const outcomeRef = useRef<PrepareSyncOutcome | null>(null);

  const reset = useCallback(() => {
    outcomeRef.current = null;
    setPhase('idle');
    setOutcome(null);
    setScanProgress(null);
    setApplyProgress(null);
    setResult(null);
    setError(null);
  }, []);

  const prepare = useCallback(async () => {
    const { currentProfileId, profiles } = useProfilesStore.getState();
    const profile = profiles.find((p) => p.id === currentProfileId);
    if (!profile) {
      setError('プロファイルが選択されていません。');
      setPhase('idle');
      return null;
    }

    setPhase('preparing');
    setError(null);
    setResult(null);
    setApplyProgress(null);

    try {
      const next = await prepareSync({ profile, onScanProgress: setScanProgress });
      outcomeRef.current = next;
      setOutcome(next);
      if (next.status === 'blocked-environment') {
        setPhase('idle');
        setError(next.check.message ?? '環境が一致しないため Sync できません。');
        return next;
      }
      setPhase('ready');
      return next;
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      setPhase('idle');
      useToastStore.getState().showToast(`Sync の準備に失敗しました: ${message}`, 'error');
      return null;
    }
  }, []);

  const apply = useCallback(async (excludedDeletionPaths: readonly string[] = []) => {
    const prepared = outcomeRef.current;
    // D-2: 書き込み権限が無いときは実行しない (ボタンも無効化しているが二重で防ぐ)
    if (prepared?.status !== 'ready' || !prepared.writable) return;

    const { currentProfileId, profiles } = useProfilesStore.getState();
    const profile = profiles.find((p) => p.id === currentProfileId);
    if (!profile) {
      setError('プロファイルが選択されていません。');
      return;
    }

    setPhase('running');
    setError(null);

    try {
      const { result: execResult, ledgerUpdated } = await applySync({
        profile,
        prepared,
        excludedDeletionPaths,
        onProgress: setApplyProgress
      });
      setResult(execResult);
      setPhase('finished');

      const toast = useToastStore.getState().showToast;
      switch (execResult.outcome) {
        case 'completed':
          toast(
            `Sync が完了しました (${execResult.applied} 件を適用${
              execResult.skipped.length > 0 ? `、${execResult.skipped.length} 件をスキップ` : ''
            })`,
            'success'
          );
          break;
        case 'rolled-back':
          toast(
            `Sync に失敗したため、変更を巻き戻しました。${execResult.error ?? ''}`,
            'error'
          );
          break;
        case 'aborted-quota':
          toast(execResult.error ?? 'バックアップ用ストレージの空きが足りず中断しました。', 'warning');
          break;
        default:
          toast(`Sync に失敗しました。${execResult.error ?? ''}`, 'error');
      }

      // 台帳を更新できたかどうかは履歴 UI の Undo 可否に関わるので、
      // 完了時のみ静かに記録する (失敗しても Sync の結果は有効)
      if (!ledgerUpdated && execResult.outcome === 'completed') {
        toast('台帳の更新に失敗しました。次回 Sync で差分が再表示される場合があります。', 'warning');
      }
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      setPhase('finished');
      useToastStore.getState().showToast(`Sync に失敗しました: ${message}`, 'error');
    }
  }, []);

  return { phase, outcome, scanProgress, applyProgress, result, error, prepare, apply, reset };
}
