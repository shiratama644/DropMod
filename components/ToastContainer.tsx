'use client';

import type React from 'react';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { Toast } from '@/types';

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      id="toast-container"
      // safe-area-inset-bottom を持つ端末 (iPhone 14 Pro 等) で
      // BottomNav (bottom-0 + h-16=64px + safe-area) と Toast (bottom-20=80px)
      // が近接・重複する問題を解消。BottomNav の実効高 + マージンで固定。
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      className="fixed right-3 sm:right-6 z-50 flex flex-col items-end gap-2.5 pointer-events-none max-w-[calc(100vw-1.5rem)]"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const elRef = useRef<HTMLDivElement>(null);
  // onDismiss は親で毎レンダー新規参照になる可能性があるため Ref に固定
  // (これを deps に入れると 3秒タイマーが毎レンダーでリセットされ、
  //  トーストが延々と消えなくなる不具合があった)
  // render 中同期セットで race を最小化
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // toast.id が変わる度のみ、タイマーとアニメを再初期化する。
  // 親再レンダーでのタイマーリセットを防ぐため onDismiss を deps から除外し、
  // onDismissRef.current 経由で常に最新の関数を呼ぶ設計。
  //
  // Phase 10-P5 (useExhaustiveDependencies): toast.id 自体は effect 本体で
  //   直接参照していないが、「toast.id 変更 = 別 toast」という意味で
  //   タイマー再初期化トリガーとして意図的に含めている。
  // biome-ignore lint/correctness/useExhaustiveDependencies: toast.id はタイマー再初期化トリガーとして意図的
  useEffect(() => {
    const el = elRef.current;
    if (el) {
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { opacity: 0, x: 40, scale: 0.9 },
        { opacity: 1, x: 0, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }
      );
    }

    const timer = setTimeout(() => {
      const cur = elRef.current;
      if (cur) {
        gsap.killTweensOf(cur);
        gsap.to(cur, {
          opacity: 0,
          x: 30,
          scale: 0.9,
          duration: 0.25,
          ease: 'power2.in',
          onComplete: () => onDismissRef.current()
        });
      } else {
        onDismissRef.current();
      }
    }, 3000);

    return () => {
      clearTimeout(timer);
      if (el) gsap.killTweensOf(el);
    };
  }, [toast.id]);

  let bgClass = 'glass-panel border-slate-500/40';
  let iconClass = 'fa-solid fa-circle-info theme-text-blue';

  if (toast.type === 'success') {
    bgClass = 'glass-panel border-brand-500/60';
    iconClass = 'fa-solid fa-circle-check theme-text-brand';
  } else if (toast.type === 'warning') {
    bgClass = 'glass-panel border-amber-500/60';
    iconClass = 'fa-solid fa-triangle-exclamation theme-text-amber';
  } else if (toast.type === 'error') {
    bgClass = 'glass-panel border-red-500/60';
    iconClass = 'fa-solid fa-circle-xmark theme-text-red';
  }

  return (
    <div
      ref={elRef}
      // 2026-08-27: スクリーンリーダー / E2E から通知を検出できるよう role を付与。
      // error は alert (assertive)、それ以外は status (polite)。
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      className={`pointer-events-auto px-3.5 py-2.5 rounded-2xl border shadow-2xl text-xs font-semibold flex items-center gap-2.5 text-left w-auto max-w-[85vw] sm:max-w-md ${bgClass}`}
    >
      <i className={`${iconClass} text-sm shrink-0`} aria-hidden />
      <span className="break-words leading-tight text-left">{toast.message}</span>
    </div>
  );
};