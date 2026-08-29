'use client';

/**
 * Sync ボタン + Preview モーダル (Phase 12-B / **D-8**, **D-9**, **D-10**)。
 *
 * 「ZIP保存」ボタンを置き換える共通部品。Settings の「環境との同期」セクション
 * (**D-9**) でも、ヘッダー / サイドバー / ツールバー (**D-8**) でも同じものを使う。
 *
 * ## 確定した差分をローカル state で持つ理由
 *
 * `useSync().outcome` でも同じ情報は取れるが、**モーダルの表示可否をそちらに
 * 依存させない**。`prepare()` の戻り値を直接持って描画することで、
 * 「ボタンを押した → 差分が出た → Preview を出す」が 1 本のデータフローになる。
 *
 * ## D-2 (書き込み権限の拒否)
 *
 * `prepare()` 後に `writable === false` だった場合、Preview は開くが
 * 「同期する」は押せない。加えて `onPrepared` で親に伝えるので、
 * 呼び出し側は ZIP 代替導線 (**D-10**) を出せる。
 */

import { useState } from 'react';
import { SyncPreviewModal } from '@/components/SyncPreviewModal';
import { useSync } from '@/hooks/useSync';
import type { PrepareSyncOutcome } from '@/lib/env/syncPrep';

export type SyncButtonVariant = 'primary' | 'primaryLg' | 'ghost' | 'icon';

const VARIANT_CLASS: Record<SyncButtonVariant, string> = {
  primary:
    'px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-xs font-bold rounded-xl shadow',
  /** サイドバー / ボトムシート用 (置き換える ZIP ボタンと同じ大きさ) */
  primaryLg:
    'w-full px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md shadow-emerald-600/20',
  ghost:
    'px-3.5 py-2 theme-sub-box text-xs font-semibold rounded-xl border border-transparent hover:border-emerald-500/50',
  icon:
    'w-9 h-9 rounded-xl theme-sub-box flex items-center justify-center text-sm hover:border-emerald-500/50 border border-transparent'
};

export interface SyncButtonProps {
  variant?: SyncButtonVariant;
  /** ボタンに表示するラベル (`variant: 'icon'` では無視) */
  label?: string;
  className?: string;
  /** 他の操作 (フォルダ選択中など) で押せなくする */
  disabled?: boolean;
  /**
   * `prepare()` の結果を親に伝える。
   * 呼び出し側は D-2 の ZIP 代替導線 (**D-10**) や理由表示に使える。
   */
  onPrepared?: (outcome: PrepareSyncOutcome | null) => void;
}

export function SyncButton({
  variant = 'ghost',
  label = '差分を確認して同期',
  className,
  disabled = false,
  onPrepared
}: SyncButtonProps) {
  const { phase, applyProgress, prepare, apply, reset } = useSync();
  /** `prepare()` が返した確定差分。null なら未取得 */
  const [prepared, setPrepared] = useState<Extract<PrepareSyncOutcome, { status: 'ready' }> | null>(
    null
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  const isPreparing = phase === 'preparing';
  const isRunning = phase === 'running';

  const close = () => {
    setPreviewOpen(false);
    setPrepared(null);
    reset();
  };

  /** 差分を計算して Preview を出す (この時点では書き込まない) */
  const handleSync = async () => {
    const next = await prepare();
    onPrepared?.(next);
    // **D-1**: 環境不一致 (blocked-environment) では Preview を出さない。
    // 理由は呼び出し側のセクション (またはトースト) に出る。
    if (next?.status === 'ready') {
      setPrepared(next);
      setPreviewOpen(true);
    }
  };

  const handleApply = async (excludedDeletionPaths: string[]) => {
    await apply(excludedDeletionPaths);
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleSync()}
        disabled={disabled || isPreparing || isRunning}
        aria-label={variant === 'icon' ? label : undefined}
        title={variant === 'icon' ? label : undefined}
        className={`btn-hover-effect transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          VARIANT_CLASS[variant]
        } ${className ?? ''}`}
      >
        <i
          className={`fa-solid ${isPreparing ? 'fa-spinner fa-spin' : 'fa-rotate'}`}
          aria-hidden="true"
        />
        {variant !== 'icon' ? (isPreparing ? '差分を確認中...' : label) : null}
      </button>

      {prepared ? (
        <SyncPreviewModal
          isOpen={previewOpen}
          plan={prepared.plan}
          rootName={prepared.rootName}
          writable={prepared.writable}
          writableReason={prepared.writableReason}
          scanSkipped={prepared.scanSkipped}
          running={isRunning}
          applyProgress={applyProgress}
          onClose={() => {
            if (!isRunning) close();
          }}
          onApply={(excluded) => void handleApply(excluded)}
        />
      ) : null}
    </>
  );
}
