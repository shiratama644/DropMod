'use client';

// -----------------------------------------------------------------------------
// BottomSheet 共通コンポーネント (M3E GSAP 移行版)
//
// Modrinth モバイル UI の下部シート UX を DropMod で再現。
// GSAP を用いた物理ベースのアニメーション (バネ感) に移行。
// -----------------------------------------------------------------------------

import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCloseAnimationComplete?: () => void;
  children: React.ReactNode;
  ariaLabel: string;
  maxHeightClass?: string;
  zIndexClass?: string;
  bottomOffsetPx?: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const DRAG_CLOSE_THRESHOLD = 60;

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  onCloseAnimationComplete,
  children,
  ariaLabel,
  maxHeightClass = 'max-h-[60vh]',
  zIndexClass = 'z-[50]',
  bottomOffsetPx = 64,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const grabberRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  const initialPathnameRef = useRef<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const dragYRef = useRef(0);
  const dragStartYRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  const [shouldMount, setShouldMount] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setShouldMount(true);
  }, [isOpen]);

  // --- GSAP Animations ---
  useEffect(() => {
    if (!shouldMount) return;
    
    const ctx = gsap.context(() => {});
    
    if (isOpen) {
      // Open Animation
      ctx.add(() => {
        const reduced = prefersReducedMotion();
        if (sheetRef.current) {
          gsap.fromTo(sheetRef.current, 
            { yPercent: 100 }, 
            { 
              yPercent: 0, 
              duration: reduced ? 0.15 : 0.5, 
              ease: reduced ? 'power1.out' : 'back.out(1.2)' // M3E Spring-like ease
            }
          );
        }
        if (backdropRef.current) {
          gsap.fromTo(backdropRef.current,
            { opacity: 0 },
            { opacity: 1, duration: reduced ? 0.15 : 0.3, ease: 'power2.out' }
          );
        }
      });
    } else {
      // Close Animation
      dragYRef.current = 0;
      ctx.add(() => {
        const reduced = prefersReducedMotion();
        const tl = gsap.timeline({
          onComplete: () => {
            setShouldMount(false);
            onCloseAnimationComplete?.();
          }
        });
        
        if (sheetRef.current) {
          tl.to(sheetRef.current, {
            yPercent: 100,
            duration: reduced ? 0.12 : 0.3,
            ease: 'power3.in'
          }, 0);
        }
        if (backdropRef.current) {
          tl.to(backdropRef.current, {
            opacity: 0,
            duration: reduced ? 0.12 : 0.25,
            ease: 'power2.in'
          }, 0);
        }
      });
    }

    return () => ctx.revert();
  }, [isOpen, shouldMount, onCloseAnimationComplete]);

  // Escape キー
  useEffect(() => {
    if (!shouldMount || !isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldMount, isOpen, onClose]);

  // フォーカス管理
  useEffect(() => {
    if (!shouldMount) return;
    previousFocusRef.current = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    const raf = requestAnimationFrame(() => {
      const container = sheetRef.current;
      if (!container) return;
      const focusable = container.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
      } else {
        if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
        try { container.focus({ preventScroll: true }); } catch { /* noop */ }
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus(); } catch { /* noop */ }
      }
    };
  }, [shouldMount]);

  // URL 変化で自動 close
  useEffect(() => {
    if (!isOpen) {
      initialPathnameRef.current = null;
      return;
    }
    if (initialPathnameRef.current === null) {
      initialPathnameRef.current = pathname;
      return;
    }
    if (initialPathnameRef.current !== pathname) {
      onClose();
    }
  }, [isOpen, pathname, onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleSheetClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const clearRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const applyDragTransform = useCallback((y: number) => {
    const el = sheetRef.current;
    if (!el) return;
    // GSAP はインラインスタイルで `yPercent` などを書くため、GSAP で現在位置をセットする
    gsap.set(el, { y: y, yPercent: 0 }); // yPercent は 0 に戻して y ピクセルで制御
  }, []);

  const releaseDragTransform = useCallback((animated: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    if (animated) {
      // リバウンド (バネっぽく戻る)
      gsap.to(el, { y: 0, duration: 0.3, ease: 'back.out(1.5)' });
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!grabberRef.current) return;
    try { grabberRef.current.setPointerCapture(e.pointerId); } catch { /* noop */ }
    dragStartYRef.current = e.clientY;
    isDraggingRef.current = true;
    dragYRef.current = 0;
    applyDragTransform(0);
  }, [applyDragTransform]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || dragStartYRef.current === null) return;
    const delta = e.clientY - dragStartYRef.current;
    const clamped = Math.max(0, delta);
    dragYRef.current = clamped;

    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      applyDragTransform(dragYRef.current);
    });
  }, [applyDragTransform]);

  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    dragStartYRef.current = null;
    clearRaf();

    const y = dragYRef.current;
    if (y >= DRAG_CLOSE_THRESHOLD) {
      onClose(); // gsap の useEffect 側で cleanup される
    } else {
      releaseDragTransform(true);
    }
    dragYRef.current = 0;
  }, [clearRaf, onClose, releaseDragTransform]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (grabberRef.current) {
      try { grabberRef.current.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
    finishDrag();
  }, [finishDrag]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (grabberRef.current) {
      try { grabberRef.current.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
    isDraggingRef.current = false;
    dragStartYRef.current = null;
    dragYRef.current = 0;
    clearRaf();
    releaseDragTransform(true);
  }, [clearRaf, releaseDragTransform]);

  useEffect(() => {
    return () => clearRaf();
  }, [clearRaf]);

  if (!shouldMount) return null;

  const sheetBottomStyle: React.CSSProperties = {
    bottom: `calc(${bottomOffsetPx}px + env(safe-area-inset-bottom, 0px))`,
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景
    // biome-ignore lint/a11y/useKeyWithClickEvents: 背景クリックのみ、Escape は自前
    <div
      ref={backdropRef}
      className={`fixed inset-0 ${zIndexClass} flex flex-col justify-end pointer-events-auto`}
      style={{ backgroundColor: 'var(--modal-overlay)', opacity: 0 }}
      onClick={handleBackdropClick}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 伝播止めのみ (背景 click 発火防止) */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        className={`fixed left-0 right-0 glass-panel border-t rounded-t-3xl shadow-2xl mx-auto max-w-md ${maxHeightClass} overflow-hidden pointer-events-auto flex flex-col`}
        style={{
          ...sheetBottomStyle,
          transform: 'translateY(100%)', // GSAP で上書きされるまでの初期状態
        }}
        onClick={handleSheetClick}
      >
        <div
          ref={grabberRef}
          className="pt-3 pb-2 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          aria-hidden="true"
        >
          <div className="w-10 h-1.5 rounded-full bg-slate-500/50" />
        </div>
        <h2 id={titleId} className="sr-only">{ariaLabel}</h2>
        <div className="px-4 pb-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};
