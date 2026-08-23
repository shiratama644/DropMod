'use client';

// -----------------------------------------------------------------------------
// BottomSheet 共通コンポーネント (Phase 9.5-D で全面リニューアル)
//
// Modrinth モバイル UI の下部シート UX を DropMod で再現。
//
// 【9.5-D 変更点】(ユーザー要望):
//   1. 開始位置を「BottomNav の上端」に変更 (画面下端ではない)
//   2. Sheet 内容は呼び出し側で 2 カラム grid + 小さめボタンで render (本体は柔軟)
//   3. 上部 grabber バーを touch/mouse で下方向に drag → close
//   4. Sheet 重ね置き対応: 前 Sheet が open のまま新 Sheet を上に重ねられる
//      本コンポーネントは 1 個の Sheet として自己完結。stack 管理は呼び出し側 (BottomNav)。
//   5. Close 時にも Anime.js で slide-down アニメ (以前は即 unmount)
//      → 呼び出し側 (BottomNav) が「アニメ完了後 unmount」できるよう
//         onCloseAnimationComplete callback を提供
//
// - Anime.js v4 (`animate`) を dynamic import で bundle 分離
// - useModalA11y は再利用しない (Sheet 重ね対応で自前実装)
// - usePathname で URL 変化を検知して自動 close (計画書 §6.2 決定事項)
// - Reduced Motion で translateY アニメを 300 → 150ms に短縮
// - Sheet 内クリック時は伝播止め、背景クリックで close
//
// ⚠️ Rules of Hooks (React error #310 対策):
//   すべての hook (useCallback / useEffect / useState / useRef / useId /
//   useModalA11y) は「早期 return より前」に置く。
// -----------------------------------------------------------------------------

import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface BottomSheetProps {
  /** 表示要求。true → open アニメ、false → close アニメ後 onCloseAnimationComplete */
  isOpen: boolean;
  /** ユーザーが close 操作をした時 (背景クリック / Escape / grabber drag)。
   *  isOpen を親側で false にすることで close アニメが走る */
  onClose: () => void;
  /** close アニメが完了して DOM から消えて良いタイミングで発火。
   *  親側で「アニメ完了後に unmount」する場合に使う (Sheet 重ね対応) */
  onCloseAnimationComplete?: () => void;
  children: React.ReactNode;
  /** aria-label for the dialog role */
  ariaLabel: string;
  /**
   * 内容部分の最大高さ (Tailwind クラス)。デフォルト `max-h-[60vh]`。
   * BottomNav の上に乗るので、画面下端到達の従来と比べて低くて OK。
   */
  maxHeightClass?: string;
  /**
   * z-index (Tailwind クラス、default 'z-[50]')。
   * Sheet 重ね置き時に 2 番目の Sheet は 'z-[52]' 等で上に重ねる。
   */
  zIndexClass?: string;
  /**
   * BottomNav 高さぶんの下オフセット (Tailwind クラス、default 'bottom-16')。
   * Sheet の底が BottomNav の上端に接するように配置。
   */
  bottomOffsetClass?: string;
}

/** Reduced Motion 判定 (Client only) */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Drag による close 判定の閾値 (px) */
const DRAG_CLOSE_THRESHOLD = 60;

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  onCloseAnimationComplete,
  children,
  ariaLabel,
  maxHeightClass = 'max-h-[60vh]',
  zIndexClass = 'z-[50]',
  bottomOffsetClass = 'bottom-16',
}) => {
  // -------- Hook 群 (早期 return より前に全て) --------
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const grabberRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  const initialPathnameRef = useRef<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Drag 中の translateY (px)。0 が open 完了位置、正の値だけ下に引く。
  const [dragY, setDragY] = useState(0);
  const dragStartYRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  // 「開閉アニメ動作中フラグ」ではなく、DOM に mount 継続すべきかの状態。
  // isOpen が true → mount 継続、false になっても close アニメが終わるまで mount 継続。
  const [shouldMount, setShouldMount] = useState(isOpen);

  // isOpen が true になったら即 mount。false になったら close アニメ後に unmount。
  useEffect(() => {
    if (isOpen) {
      setShouldMount(true);
    }
  }, [isOpen]);

  // Open アニメ (isOpen: false → true or 初回 mount)
  useEffect(() => {
    if (!isOpen || !shouldMount) return;
    let cancelled = false;

    void (async () => {
      const { animate } = await import('animejs');
      if (cancelled) return;
      const reduced = prefersReducedMotion();
      const duration = reduced ? 150 : 320;
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
          duration: Math.min(220, duration),
          ease: 'outQuad',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, shouldMount]);

  // Close アニメ (isOpen: true → false)
  //
  // Phase 9.5-D: onCloseAnimationComplete は identity 変化で再実行させたくない
  //   ため deps 外。stale closure リスクはあるが、close アニメの再発火を
  //   防ぐ方が UX 優先度が高い (親側で毎回 inline callback を渡してくる)。
  // biome-ignore lint/correctness/useExhaustiveDependencies: close アニメの再実行を防ぐため onCloseAnimationComplete は deps 外
  useEffect(() => {
    if (isOpen || !shouldMount) return;
    let cancelled = false;

    void (async () => {
      const { animate } = await import('animejs');
      if (cancelled) return;
      const reduced = prefersReducedMotion();
      const duration = reduced ? 120 : 260;
      const promises: Promise<unknown>[] = [];
      if (sheetRef.current) {
        // 現在位置 (drag 中なら dragY を反映) から 100% まで
        promises.push(
          animate(sheetRef.current, {
            translateY: ['0%', '100%'],
            duration,
            ease: 'inCubic',
          }).then(() => undefined)
        );
      }
      if (backdropRef.current) {
        promises.push(
          animate(backdropRef.current, {
            opacity: [1, 0],
            duration: Math.min(200, duration),
            ease: 'inQuad',
          }).then(() => undefined)
        );
      }
      await Promise.all(promises);
      if (cancelled) return;
      setShouldMount(false);
      setDragY(0);
      onCloseAnimationComplete?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, shouldMount]);

  // Escape キー
  useEffect(() => {
    if (!shouldMount || !isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shouldMount, isOpen, onClose]);

  // フォーカス管理: mount 時に previous focus 保存、内部 focusable に focus。
  //   unmount 時に previous focus 復元。
  useEffect(() => {
    if (!shouldMount) return;
    previousFocusRef.current =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;

    const raf = requestAnimationFrame(() => {
      const container = sheetRef.current;
      if (!container) return;
      const focusable = container.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
      } else {
        if (!container.hasAttribute('tabindex')) {
          container.setAttribute('tabindex', '-1');
        }
        try {
          container.focus({ preventScroll: true });
        } catch {
          /* noop */
        }
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus();
        } catch {
          /* noop */
        }
      }
    };
  }, [shouldMount]);

  // URL 変化で自動 close (計画書決定事項)
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

  // 背景クリックで close
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

  // ------- Grabber ドラッグで close -------
  //
  // Pointer Events を使い、mouse / touch / pen をまとめて処理。
  // 下方向にだけ引ける (dragY は 0 以上)。閾値超えたら close、超えなければ元に戻す。
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!grabberRef.current) return;
    grabberRef.current.setPointerCapture(e.pointerId);
    dragStartYRef.current = e.clientY;
    isDraggingRef.current = true;
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || dragStartYRef.current === null) return;
      const delta = e.clientY - dragStartYRef.current;
      // 下方向のみ (上方向 = dragY 負値は Sheet を過剰に上に押し上げるので 0 clamp)
      setDragY(Math.max(0, delta));
    },
    []
  );

  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    dragStartYRef.current = null;
    if (dragY >= DRAG_CLOSE_THRESHOLD) {
      // 閾値超え → close (translateY 位置は close アニメで 100% まで進める)
      onClose();
    } else {
      // 閾値未満 → 元に戻す
      setDragY(0);
    }
  }, [dragY, onClose]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (grabberRef.current) {
        try {
          grabberRef.current.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
      finishDrag();
    },
    [finishDrag]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (grabberRef.current) {
        try {
          grabberRef.current.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
      isDraggingRef.current = false;
      dragStartYRef.current = null;
      setDragY(0);
    },
    []
  );
  // ---------------------------------------

  if (!shouldMount) return null;

  // Sheet の transform: drag 中は dragY (px)、非 drag 時は Anime.js が制御。
  // dragY > 0 の間は inline style で上書き、それ以外は Anime.js のセットした値。
  const sheetStyle: React.CSSProperties = {
    // 初期表示位置は translateY(100%)、Anime.js が上書きする
    transform: dragY > 0 ? `translateY(${dragY}px)` : 'translateY(100%)',
    transition: dragY > 0 ? 'none' : undefined,
  };

  return (
    // Phase 9.5-D (a11y): モーダル背景。Escape は自前 useEffect で処理。
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景
    // biome-ignore lint/a11y/useKeyWithClickEvents: 背景クリックのみ、Escape は自前
    <div
      ref={backdropRef}
      className={`fixed inset-0 ${zIndexClass} flex flex-col justify-end backdrop-blur-sm pointer-events-auto`}
      style={{ backgroundColor: 'var(--modal-overlay)', opacity: 0 }}
      onClick={handleBackdropClick}
    >
      {/* Sheet 本体を BottomNav の上端に接するよう bottom オフセット */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 伝播止めのみ (背景 click 発火防止) */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        className={`fixed left-0 right-0 ${bottomOffsetClass} glass-panel border-t rounded-t-3xl shadow-2xl mx-auto max-w-md ${maxHeightClass} overflow-hidden pointer-events-auto flex flex-col`}
        style={sheetStyle}
        onClick={handleSheetClick}
      >
        {/* Grabber (Pointer Events で下方向 drag → close)
            Phase 9.5-D: Biome の a11y ルール (noStaticElementInteractions /
            useKeyWithClickEvents) は onClick 系のみ対象で、onPointerDown/Move/Up
            には反応しないので biome-ignore 不要。キーボードでの close は
            Escape (自前 useEffect) で代替済み。 */}
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
        {/* SR 用の見出し (visually-hidden) */}
        <h2 id={titleId} className="sr-only">
          {ariaLabel}
        </h2>
        <div className="px-4 pb-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};
