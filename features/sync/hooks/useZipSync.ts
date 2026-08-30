'use client';

/**
 * ZIP への Sync フック (Phase 12-C / §10.1・DoD)。
 *
 * File System Access API が無いブラウザ (Firefox / Safari / モバイル) では
 * フォルダへ直接書き込めない。このフックは **ZipSink 経由で Sync を実行し、
 * 結果を ZIP としてダウンロードさせる**。
 *
 * ## D-2: 自動では切り替えない
 *
 * Direct Write が使える環境で勝手に ZIP へ落とすことはしない。
 * 呼び出し側は「非対応ブラウザのときだけ」この導線を出すこと。
 *
 * ## 既存の「ZIP で書き出す」との違い
 *
 * `useZipExport` は Profile の全 Mod を並べるだけの一方通行。
 * こちらは **Sync の Plan を通す**ので、差分 (addition / update / deletion) が
 * 反映され、失敗したら Rollback され、台帳も更新される。
 */

import { useCallback, useRef, useState } from 'react';
import { prepareZipSync, applyZipSync } from '../zipSync';
import type { PrepareZipSyncOutcome } from '../zipSync';
import { useProfilesStore } from '@/features/profiles';
import { useToastStore } from '@/components/feedback/toastStore';

export interface ZipSyncState {
  /** 実行中 (編成 + 適用の両方) */
  running: boolean;
  error: string | null;
  /** 直近の結果 */
  result: {
    fileName: string;
    bytes: number;
    applied: number;
    skipped: number;
  } | null;
}

const INITIAL: ZipSyncState = { running: false, error: null, result: null };

export interface UseZipSyncReturn extends ZipSyncState {
  /**
   * Sync 内容を ZIP として書き出す。
   *
   * @param seedFile 既存の .minecraft ZIP (任意)。渡すと Local として差分し、
   *                 3 カテゴリ外のファイルも保持する。
   */
  exportSyncAsZip: (seedFile?: File) => Promise<void>;
  dismissError: () => void;
}

/** Blob をブラウザにダウンロードさせる */
function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 即 revoke すると Safari でダウンロードが失敗することがあるので遅延させる
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useZipSync(): UseZipSyncReturn {
  const currentProfile = useProfilesStore((s) =>
    s.profiles.find((p) => p.id === s.currentProfileId)
  );
  const showToast = useToastStore((s) => s.showToast);

  const [state, setState] = useState<ZipSyncState>(INITIAL);
  /** 二重実行を防ぐ (state は非同期更新なので ref で見る) */
  const inFlightRef = useRef(false);

  const dismissError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const exportSyncAsZip = useCallback(
    async (seedFile?: File): Promise<void> => {
      if (inFlightRef.current) {
        showToast('書き出し中です。完了してから再試行してください', 'warning');
        return;
      }
      if (!currentProfile) {
        showToast('プロファイルが選択されていません', 'warning');
        return;
      }

      inFlightRef.current = true;
      setState({ running: true, error: null, result: null });

      try {
        // ① 編成 (Plan + ZipSink)
        const prepared: PrepareZipSyncOutcome = await prepareZipSync({
          profile: currentProfile,
          seedBlob: seedFile,
          rootName: seedFile ? seedFile.name.replace(/\.[^/.]+$/, '') : 'minecraft-sync'
        });

        if (prepared.status === 'blocked-environment') {
          const message =
            prepared.check.message ??
            '選択した ZIP の環境がプロファイルと一致しないため Sync できません';
          setState({ running: false, error: message, result: null });
          showToast(message, 'error');
          return;
        }

        const total =
          prepared.prepared.plan.totals.counts.addition +
          prepared.prepared.plan.totals.counts.update +
          prepared.prepared.plan.totals.counts.deletion;

        if (total === 0) {
          setState({ running: false, error: null, result: null });
          showToast('書き出す変更がありません', 'info');
          return;
        }

        // ② 適用 (Direct Write と同じ applySync 経路)
        const applied = await applyZipSync({
          profile: currentProfile,
          prepared: prepared.prepared,
          sink: prepared.sink
        });

        if (applied.result.outcome !== 'completed' || !applied.blob) {
          const message =
            applied.result.error ?? 'Sync に失敗したため ZIP を書き出せませんでした';
          setState({ running: false, error: message, result: null });
          showToast(message, 'error');
          return;
        }

        // ③ ダウンロード
        triggerDownload(applied.blob, prepared.rootName);

        const result = {
          fileName: prepared.rootName,
          bytes: applied.bytes,
          applied: applied.result.applied,
          skipped: applied.result.skipped.length
        };
        setState({ running: false, error: null, result });
        showToast(
          `${applied.result.applied} 件を反映した ZIP を書き出しました。展開して反映してください`,
          'success'
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : 'ZIP の書き出しに失敗しました';
        setState({ running: false, error: message, result: null });
        showToast(message, 'error');
      } finally {
        inFlightRef.current = false;
      }
    },
    [currentProfile, showToast]
  );

  return { ...state, exportSyncAsZip, dismissError };
}
