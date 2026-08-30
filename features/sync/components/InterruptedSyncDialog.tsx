'use client';

/**
 * 中断された Sync の確認ダイアログ (Phase 12-B / **D-4**)。
 *
 * 前回の Sync が完了しないままタブが閉じられたとき、起動時に出す。
 * **勝手に Rollback も再開もしない** — ユーザーに選ばせる。
 * 既定 (Enter / 主ボタン) は「巻き戻す」。
 */

import type React from 'react';
import { useRef, useId } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useModalRegistration } from '@/hooks/useModalUi';
import { useInterruptedSync } from '@/hooks/useInterruptedSync';

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('ja-JP', { hour12: false });
}

export const InterruptedSyncDialog: React.FC = () => {
  const { items, checking, recovering, resolve } = useInterruptedSync();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isOpen = items.length > 0;

  useModalA11y(isOpen, () => undefined, dialogRef);
  useModalRegistration(isOpen);

  if (checking || !isOpen) return null;

  return (
    // 背景クリックでは閉じさせない (選択を必須にするため)。handler は付けていない
    <div
      className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-card glass-panel w-full max-w-md rounded-3xl p-5 sm:p-6 border shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-3 border-b border-slate-500/20 pb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/20 theme-text-amber">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          </div>
          <h3 id={titleId} className="font-extrabold text-base sm:text-lg">
            前回の同期が完了していません
          </h3>
        </div>

        <div className="space-y-2">
          <p className="text-xs theme-text-secondary leading-relaxed">
            {items.length} 件の同期が途中で止まっています。ファイルが一部だけ書き換わった
            状態になっている可能性があります。
          </p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.transactionId} className="rounded-xl theme-sub-box p-2.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <time
                    dateTime={new Date(item.startedAt).toISOString()}
                    className="font-mono theme-text-secondary"
                  >
                    {formatTime(item.startedAt)}
                  </time>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 theme-text-amber text-[10px] font-bold">
                    {item.status === 'pending' ? '開始前に中断' : '実行中に中断'}
                  </span>
                </div>
                <p className="theme-text-muted tabular-nums mt-1">
                  {item.applied} / {item.total} 件を適用した状態で停止
                </p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] theme-text-muted leading-relaxed">
            <strong>巻き戻す</strong>と、適用済みのファイルを元に戻します (推奨)。
            <br />
            <strong>このままにする</strong>と環境は変更しませんが、中途半端な状態が
            残ります。履歴には「失敗」として記録されます。
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-500/20">
          <button
            type="button"
            onClick={() => void resolve('keep')}
            disabled={recovering}
            className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            このままにする
          </button>
          <button
            type="button"
            onClick={() => void resolve('rollback')}
            disabled={recovering}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold shadow hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {recovering ? (
              <>
                <i className="fa-solid fa-spinner fa-spin mr-1.5" aria-hidden="true" />
                巻き戻し中…
              </>
            ) : (
              '巻き戻す (推奨)'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
