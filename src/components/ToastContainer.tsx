import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Toast } from '../types';

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      id="toast-container"
      className="fixed bottom-20 right-3 sm:right-6 z-50 flex flex-col items-end gap-2.5 pointer-events-none max-w-[calc(100vw-1.5rem)]"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (elRef.current) {
      gsap.fromTo(
        elRef.current,
        { opacity: 0, x: 40, scale: 0.9 },
        { opacity: 1, x: 0, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }
      );
    }

    const timer = setTimeout(() => {
      if (elRef.current) {
        gsap.to(elRef.current, {
          opacity: 0,
          x: 30,
          scale: 0.9,
          duration: 0.25,
          ease: 'power2.in',
          onComplete: onDismiss
        });
      } else {
        onDismiss();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  let bgClass = 'glass-panel border-slate-500/40';
  let icon = 'fa-circle-info theme-text-blue';

  if (toast.type === 'success') {
    bgClass = 'glass-panel border-brand-500/60';
    icon = 'fa-circle-check theme-text-brand';
  } else if (toast.type === 'warning') {
    bgClass = 'glass-panel border-amber-500/60';
    icon = 'fa-triangle-exclamation theme-text-amber';
  }

  return (
    <div
      ref={elRef}
      className={`pointer-events-auto px-3.5 py-2.5 rounded-2xl border shadow-2xl text-xs font-semibold flex items-center gap-2.5 text-left w-auto max-w-[85vw] sm:max-w-md ${bgClass}`}
    >
      <i className={`fa-solid ${icon} text-sm shrink-0`}></i>
      <span className="break-words leading-tight text-left">{toast.message}</span>
    </div>
  );
};