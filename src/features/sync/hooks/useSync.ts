'use client';

/**
 * Sync の UI ロジック (Phase 12-B / P12-D3)。
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
 *
 * ## P12-D3 (D-3): 競合選択の反映
 *
 * `apply(excluded, conflictChoices)` は replace が選ばれていれば、
 * `applyLockedVersionsToProfile` で更新後 Profile を構築し、
 * `computeSyncPlan` を**再計算**してから実行する。Sync が
 * **completed のときだけ**更新後 Profile を Zustand へ反映する
 * (rollback 時は元のまま = ファイルと Profile の整合を保つ)。
 */

import { useCallback, useRef, useState } from 'react';
import { applySync } from '../services/applySync';
import { prepareSync, type PrepareSyncOutcome } from '../services/syncPrep';
import type { ScanProgress } from '@/lib/env/scan';
import type { ExecuteSyncResult } from '../services/executor';
import { applyLockedVersionsToProfile, type ModpackConflictChoice } from '@/features/modpack';
import { computeSyncPlan } from '../utils/diff';
import { useProfilesStore } from '@/features/profiles';
import { useToastStore } from '@/components/feedback/toastStore';

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
   * @param conflictChoices **P12-D3**: 競合の選択 (projectId → keep/replace)。
   *   replace があれば更新後 Profile で plan を再計算してから実行する
   */
  apply: (
    excludedDeletionPaths?: readonly string[],
    conflictChoices?: ReadonlyMap<string, ModpackConflictChoice>
  ) => Promise<void>;
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

  const apply = useCallback(
    async (
      excludedDeletionPaths: readonly string[] = [],
      conflictChoices?: ReadonlyMap<string, ModpackConflictChoice>
    ) => {
      const prepared = outcomeRef.current;
      // D-2: 書き込み権限が無いときは実行しない (ボタンも無効化しているが二重で防ぐ)
      if (prepared?.status !== 'ready' || !prepared.writable) return;

      const { currentProfileId, profiles } = useProfilesStore.getState();
      const profile = profiles.find((p) => p.id === currentProfileId);
      if (!profile) {
        setError('プロファイルが選択されていません。');
        return;
      }

      // ------------------------------------------------------------------
      // P12-D3: 競合で「Modpack 版に置換」が選ばれた場合
      // ------------------------------------------------------------------
      // 更新後 Profile を構築し、localEntries / managed を使って plan を
      // 再計算する (resolveContent が更新後 Profile から fileUrl を引けるように)。
      const hasReplace = [...(conflictChoices ?? new Map()).values()].some(
        (c) => c === 'replace'
      );
      const profileForSync = hasReplace
        ? applyLockedVersionsToProfile(profile, conflictChoices ?? new Map())
        : profile;
      const plan =
        hasReplace && profileForSync !== profile
          ? computeSyncPlan({
              profile: profileForSync,
              managed: prepared.managed,
              local: prepared.localEntries,
              now: Date.now()
            })
          : prepared.plan;

      setPhase('running');
      setError(null);

      try {
        const { result: execResult, ledgerUpdated } = await applySync({
          profile: profileForSync,
          prepared: { ...prepared, plan },
          excludedDeletionPaths,
          onProgress: setApplyProgress
        });
        setResult(execResult);
        setPhase('finished');

        // P12-D3: completed のときだけ更新後 Profile を反映する。
        // rolled-back / aborted ではファイルが巻き戻っているので、
        // Profile を変えると実体とズレる (保持: 元のまま = 整合を保つ)。
        if (profileForSync !== profile && execResult.outcome === 'completed') {
          useProfilesStore
            .getState()
            .setProfiles((prev) =>
              prev.map((p) => (p.id === profile.id ? profileForSync : p))
            );
        }

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
