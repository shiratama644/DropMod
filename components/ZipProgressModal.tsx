'use client';

import type React from 'react';
import { useRef, useId } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';

interface ZipProgressModalProps {
  isOpen: boolean;
  onCancel: () => void;
  progressPercent: number;
  statusText: string;
  statusCount: string;
  detailText: string;
}

export const ZipProgressModal: React.FC<ZipProgressModalProps> = ({
  isOpen,
  onCancel,
  progressPercent,
  statusText,
  statusCount,
  detailText
}) => {
  // a11y: role/aria + Escape (キャンセル扱い) + フォーカストラップ
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(isOpen, onCancel, dialogRef);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-card glass-panel w-full max-w-md rounded-3xl p-5 sm:p-6 border shadow-2xl space-y-4 relative"
      >
        <div className="flex items-center gap-3 border-b border-slate-500/20 pb-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 theme-text-brand flex items-center justify-center font-bold text-lg shrink-0">
            <i className="fa-solid fa-file-zipper"></i>
          </div>
          <div>
            <h3 id={titleId} className="font-extrabold text-base">
              ZIPファイルを生成中
            </h3>
            <p className="text-xs theme-text-muted">Mod (.jar) のダウンロードと圧縮</p>
          </div>
        </div>

        <div className="space-y-2">
          <div
            className="flex justify-between items-center text-xs font-semibold"
            aria-live="polite"
          >
            <span className="theme-text-secondary truncate max-w-[200px]">{statusText}</span>
            <span className="font-mono theme-text-brand font-bold">{statusCount}</span>
          </div>
          <div
            className="w-full h-2.5 rounded-full bg-slate-700/50 overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-emerald-500 transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        <p className="text-xs theme-text-muted truncate">{detailText}</p>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-xl theme-sub-box theme-text-muted hover:theme-text-red text-xs font-semibold transition"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};