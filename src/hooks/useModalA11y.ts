import { useEffect, useRef } from 'react';

// ------------------------------------------------------------------
// モーダル共通アクセシビリティフック
//
// - Escape キーで onClose を呼ぶ (M-9)
// - モーダル内にフォーカスを閉じ込める (M-8, WCAG 2.1 SC 2.4.3)
// - モーダルを開いたときに最初の focusable 要素へ自動フォーカス
// - モーダルを閉じたときに以前のフォーカスに戻す
//
// 使い方:
//   const modalRef = useRef<HTMLDivElement>(null);
//   useModalA11y(isOpen, onClose, modalRef);
//   ...
//   <div ref={modalRef} role="dialog" aria-modal="true" ...>
// ------------------------------------------------------------------

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>
): void {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Escape キー & Tab フォーカストラップ
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null // 表示中のみ
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        // Shift+Tab: 先頭ならラップして末尾へ
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: 末尾ならラップして先頭へ
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, containerRef]);

  // オープン時: 初回 focusable にフォーカス移動 / クローズ時: 元に戻す
  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    // レンダー直後にフォーカスを移すため次フレームで実行
    const raf = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      focusable?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      // 閉じたら元の要素にフォーカスを戻す
      const prev = previousActiveElement.current;
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus();
        } catch {
          // 削除済み要素などは無視
        }
      }
    };
  }, [isOpen, containerRef]);
}
