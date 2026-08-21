import React, { useRef, useId } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // true にすると赤系のスタイル
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  danger = false,
  onConfirm,
  onCancel
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(isOpen, onCancel, dialogRef);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-md"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-card glass-panel w-full max-w-sm rounded-3xl p-5 sm:p-6 border shadow-2xl relative space-y-4"
      >
        <div className="flex items-center gap-3 border-b border-slate-500/20 pb-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
              danger
                ? 'bg-red-500/20 theme-text-red'
                : 'bg-amber-500/20 theme-text-amber'
            }`}
          >
            <i
              className={`fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}`}
              aria-hidden="true"
            />
          </div>
          <h3 id={titleId} className="font-extrabold text-base sm:text-lg">
            {title}
          </h3>
        </div>

        <p className="text-xs sm:text-sm theme-text-secondary leading-relaxed break-words whitespace-pre-line">
          {message}
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-500/20">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-bold shadow focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              danger
                ? 'bg-red-500 hover:bg-red-400 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
