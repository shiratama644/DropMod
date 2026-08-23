'use client';

// -----------------------------------------------------------------------------
// BottomSheet 共通コンポーネント (Phase 9.5-A)
//
// Modrinth モバイルの下部シート UX を DropMod で再現する共通コンポーネント。
// BottomNav (fixed 下部) の直上に、下からスライドアップして表示される。
//
// 特徴:
//   - Anime.js v4 (`animate`) で translateY 300ms + opacity 200ms のトランジション
//   - useModalA11y で Escape / focus trap / 元 focus 復元 を再利用
//   - usePathname で URL 変化を検知して自動 close (計画書 §6.2 決定事項)
//   - z-[50] (BottomNav z-40 と ConfirmDialog z-[60] の間、計画書 §8.4)
//   - Reduced Motion で translateY アニメを 200ms に短縮 (完全停止ではない)
//   - 背景 backdrop クリックで close (BottomNav 領域はクリックしても閉じない)
//   - 上部に grabber (視覚ヒント、Phase 9.5 ではドラッグ操作は実装しない)
//
// ⚠️ Rules of Hooks (React error #310 対策):
//   すべての hook (useCallback / useEffect / useState / useRef / useId /
//   useModalA11y) は「早期 return より前」に置く。
// -----------------------------------------------------------------------------

import type React from 'react';
import { useCallback, useEffect, useId, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useModalA11y } from '@/hooks/useModalA11y';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** aria-label for the dialog role */
  ariaLabel: string;
  /**
   * 内容部分の最大高さ (Tailwind クラス)。デフォルト `max-h-[70vh]`。
   * Modrinth 準拠で「必要な高さだけ」を推奨。
   */
  maxHeightClass?: string;
}

/** Reduced Motion 判定 (Client only) */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  ariaLabel,
  maxHeightClass = 'max-h-[70vh]',
}) => {
  // -------- Hook 群 (早期 return より前に全て) --------
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  const initialPathnameRef = useRef<string | null>(null);

  // Escape + focus trap
  useModalA11y(isOpen, onClose, sheetRef);

  // 開閉アニメーション (Anime.js v4)
  //   open : translateY: 100% -> 0, backdrop opacity: 0 -> 1
  //   close: 逆
  // 実行タイミング:
  //   isOpen: false -> true で mount 直後に anime を kick
  //   isOpen: true -> false で anime.finished を待たずに unmount (React 側で)
  //     つまり open アニメのみ Anime.js、close は CSS transition or 即座 unmount。
  //   → シンプルさ優先で、open のみ Anime.js、close は state 変化で即 unmount。
  //     (Modrinth も close 時のアニメは短いか無いに近い)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    // dynamic import (bundle 分離、計画書 §2.2)
    void (async () => {
      const { animate } = await import('animejs');
      if (cancelled) return;
      const reduced = prefersReducedMotion();
      const duration = reduced ? 150 : 300;
      if (sheetRef.current) {
        animate(sheetRef.current, {
          translateY: ['100%', '0%'],
          duration,
          ease: 'outCubic',
        });
      }
      if (backdropRef.current) {
        animate(backdropRef.current, {
          opacity: [0, 1],
          duration: Math.min(200, duration),
          ease: 'outQuad',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // URL 変化で自動 close (計画書 §6.2 決定事項)
  //
  // Sheet を開いた時点の pathname を記録し、変化を検知したら onClose を呼ぶ。
  // 単純に pathname が変わったら close する実装だと、Sheet が閉じた後の
  // URL 変化にも反応してしまうので initialPathnameRef で参照比較。
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

  // 背景クリックで close (Sheet 内クリックは伝播止め済みなので発火しない)
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Sheet 内クリックの伝播を止める (背景 click 発火防止)
  const handleSheetClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);
  // ----------------------------------------------------

  if (!isOpen) return null;

  return (
    // Phase 9.5-A (a11y): モーダル背景 (Escape で閉じる、useModalA11y 参照、
    //   背景クリックで close は onClick で個別実装)
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景
    // biome-ignore lint/a11y/useKeyWithClickEvents: 背景クリックのみ、Escape は useModalA11y
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[50] flex flex-col justify-end backdrop-blur-sm pointer-events-auto"
      style={{ backgroundColor: 'var(--modal-overlay)', opacity: 0 }}
      onClick={handleBackdropClick}
    >
      {/* Phase 9.5-A (a11y): Sheet 本体は dialog role + aria-modal */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 伝播止めのみ (背景 click 発火防止) */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        className={`glass-panel border-t rounded-t-3xl shadow-2xl w-full ${maxHeightClass} overflow-y-auto pointer-events-auto`}
        style={{
          // 開始位置は translateY(100%)。Anime.js が上書きする。
          transform: 'translateY(100%)',
          // BottomNav (h-16 + safe-area) を避けるため下パディング
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4rem + 1rem)',
        }}
        onClick={handleSheetClick}
      >
        {/* Grabber (視覚ヒント、ドラッグ操作は Phase 9.5 では未実装) */}
        <div className="pt-3 pb-1 flex justify-center" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-slate-500/40" />
        </div>
        {/* SR 用の見出し (実際は visually-hidden) */}
        <h2 id={titleId} className="sr-only">
          {ariaLabel}
        </h2>
        <div className="px-4 py-3">{children}</div>
      </div>
    </div>
  );
};
