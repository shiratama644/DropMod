'use client';

import { useEffect, useRef } from 'react';

// ------------------------------------------------------------------
// モーダル共通アクセシビリティフック
//
// - Escape キーで onClose を呼ぶ (M-9)
// - モーダル内にフォーカスを閉じ込める (M-8, WCAG 2.1 SC 2.4.3)
// - モーダルを開いたときに最初の focusable 要素へ自動フォーカス
// - モーダルを閉じたときに以前のフォーカスに戻す
// - モーダルが重なっているとき、最も上のモーダルだけが Escape を消費 (スタック)
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

// モーダルスタック (グローバル)。同一フックインスタンスIDを LIFO で積む。
// 最上位 (末尾) のモーダルだけが Escape を処理する。
const modalStack: string[] = [];
let uidCounter = 0;

export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>
): void {
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const uidRef = useRef<string>(`modal-${++uidCounter}`);

  // モーダルスタックへの登録
  useEffect(() => {
    if (!isOpen) return;
    const uid = uidRef.current;
    modalStack.push(uid);
    return () => {
      const idx = modalStack.lastIndexOf(uid);
      if (idx >= 0) modalStack.splice(idx, 1);
    };
  }, [isOpen]);

  // Escape キー & Tab フォーカストラップ
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // スタック最上位のモーダルだけが処理する
      if (modalStack[modalStack.length - 1] !== uidRef.current) return;

      if (e.key === 'Escape') {
        // モーダル内で開かれている CustomDropdown 等の子ポータル UI が
        // 先に Escape を消費できるよう、開いていれば無視する。
        const openDropdownPortal = document.querySelector('.custom-dropdown-menu-portal');
        if (openDropdownPortal) return;
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(
        (el) => !el.hasAttribute('disabled') && (el as HTMLElement).offsetParent !== null
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // L6-3 (noUncheckedIndexedAccess) 対応: length===0 は上で return したが
      // 配列インデックスの戻り値は T | undefined 型なので明示ガード。
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, containerRef]);

  // オープン時: 最初の focusable にフォーカス / クローズ時: 元に戻す
  //
  // ⚠️ 「最初の focusable」が「閉じるボタン」だと Enter で閉じ動作が起きて
  //    しまうため、ボタンは意図的にスキップし、input/textarea/select や
  //    tabindex=0 の要素を優先する。存在しなければコンテナ自体を仮フォーカス。
  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const raf = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      // 入力系を最優先
      const input = container.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])'
      );
      if (input) {
        input.focus();
        return;
      }
      // 次に role=combobox など tabindex=0 要素
      const combobox = container.querySelector<HTMLElement>(
        '[role="combobox"], [tabindex="0"]:not(button)'
      );
      if (combobox) {
        combobox.focus();
        return;
      }
      // フォールバック: コンテナ自身にフォーカス (tabindexを一時付与)
      if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
      }
      try {
        container.focus({ preventScroll: true });
      } catch {
        /* noop */
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      const prev = previousActiveElement.current;
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus();
        } catch {
          /* noop */
        }
      }
    };
  }, [isOpen, containerRef]);
}
