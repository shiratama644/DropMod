'use client';

// -----------------------------------------------------------------------------
// BottomSheet 共通コンポーネント (Phase 9.5-D → 9.5-G で修正)
//
// Modrinth モバイル UI の下部シート UX を DropMod で再現。
//
// 【9.5-G 修正点】(ユーザー要望):
//   1. Grabber ドラッグを安定化:
//      - 開始時に「現在の translate 位置」を基準にする (Anime.js との切り替えでの
//        ジャンプ除去)
//      - Pointer Move を rAF throttle + inline transform 直接書き込み (state 経由
//        の setState 連発を避ける)
//      - 非ドラッグ時は inline style を消し、Anime.js に完全に委ねる
//   2. 「close 動作が 2 回」問題:
//      - pathname watcher は「open 中に URL が変わった時のみ close」で残すが、
//        すでに close 遷移中 (isOpen=false) の時は何もしない
//      - onClose を親から複数経路で呼んでも Sheet 側は idempotent (isOpen が
//        false の間は close アニメは 1 回しか走らない)
//   3. safe-area 対応:
//      - `bottom-16` (64px) 固定だと iOS の env(safe-area-inset-bottom) 分だけ
//        BottomNav が下に伸びる分、Sheet の底が BottomNav に隠れる。
//      - inline style で `bottom: calc(4rem + env(safe-area-inset-bottom))` に
//        変更 (prop `bottomOffsetPx` で上書き可能、default 64)。
//
// - Anime.js v4 (`animate`) を dynamic import で bundle 分離
// - useModalA11y は再利用しない (Sheet 重ね対応で自前実装)
// - Reduced Motion で translateY アニメを 300 → 150ms に短縮
// - Sheet 内クリック時は伝播止め、背景クリックで close
//
// ⚠️ Rules of Hooks (React error #310 対策):
//   すべての hook は「早期 return より前」に置く。
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
   * BottomNav 高さぶんの下オフセット (px)。default 64 (4rem)。
   * 実際の bottom 値は `calc(${bottomOffsetPx}px + env(safe-area-inset-bottom, 0px))`。
   */
  bottomOffsetPx?: number;
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
  bottomOffsetPx = 64,
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
  // rAF throttle 用に ref も併用 (書き込み側)、state は render 抑制不要なので使わない。
  const dragYRef = useRef(0);
  const dragStartYRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

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
        // Anime.js が完了すると sheet の transform は translateY(0%) に固定される
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

    // ドラッグ中の inline transform を残したまま Anime.js を走らせると
    // Anime.js が上書きするので問題なし。ただし dragYRef はリセット。
    dragYRef.current = 0;

    void (async () => {
      const { animate } = await import('animejs');
      if (cancelled) return;
      const reduced = prefersReducedMotion();
      const duration = reduced ? 120 : 260;
      const promises: Promise<unknown>[] = [];
      if (sheetRef.current) {
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
  //
  // 【9.5-G 修正】: isOpen=false の間 (= 親側で既に close 遷移中) は何もしない。
  //   親側の handleLinkClick が Sheet を close 遷移させ、その後 <Link> が URL を
  //   変えると、ここで onClose() を再度呼んでいた → close 2 回問題。
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

  // ------- Grabber ドラッグで close (9.5-G で全面書き直し) -------
  //
  // 【方針】
  //   - Pointer Move は rAF throttle して inline style を直接書き換える
  //     (setState 経由の re-render を回避、jitter 除去)
  //   - Anime.js が sheet の transform を translateY(0%) に固定した状態を基準に、
  //     ドラッグ中は translateY(${dragYRef.current}px) で上書き
  //   - ドラッグ終了で閾値未満なら CSS transition で 0px に戻す (150ms)
  //   - 閾値超えなら onClose() → 親が isOpen=false → close アニメ発動、
  //     Anime.js が現在位置 (translateY(dragYpx)) からではなく '0%' → '100%' に
  //     アニメするので若干のジャンプがあるが、drag close は瞬時 → 気になりにくい
  const clearRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const applyDragTransform = useCallback((y: number) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = `translateY(${y}px)`;
    el.style.transition = 'none';
  }, []);

  const releaseDragTransform = useCallback((animated: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    if (animated) {
      // 閾値未満のリバウンド: 150ms で translateY(0) に戻す
      el.style.transition = 'transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = 'translateY(0px)';
      // アニメーション終了後に inline style を消して Anime.js に返却
      const cleanup = () => {
        if (!sheetRef.current) return;
        sheetRef.current.style.transition = '';
        sheetRef.current.style.transform = '';
        sheetRef.current.removeEventListener('transitionend', cleanup);
      };
      el.addEventListener('transitionend', cleanup);
    } else {
      // close 遷移: inline transform を残したまま Anime.js に上書きさせる。
      // Anime.js は translateY: ['0%', '100%'] で発火するので現在位置から
      // 微小にジャンプするが、閾値 60px 以上引いた後 → close は違和感少ない。
      el.style.transition = '';
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!grabberRef.current) return;
      // touch action もう既に none 指定済みだが、mouse でも動作させるため。
      try {
        grabberRef.current.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      dragStartYRef.current = e.clientY;
      isDraggingRef.current = true;
      dragYRef.current = 0;
      applyDragTransform(0);
    },
    [applyDragTransform]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || dragStartYRef.current === null) return;
      const delta = e.clientY - dragStartYRef.current;
      const clamped = Math.max(0, delta);
      dragYRef.current = clamped;

      // rAF throttle
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        applyDragTransform(dragYRef.current);
      });
    },
    [applyDragTransform]
  );

  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    dragStartYRef.current = null;
    clearRaf();

    const y = dragYRef.current;
    if (y >= DRAG_CLOSE_THRESHOLD) {
      // 閾値超え → close (Anime.js に inline transform を上書きさせる)
      releaseDragTransform(false);
      onClose();
    } else {
      // 閾値未満 → CSS transition で 0px に戻し、Anime.js 領域へ返却
      releaseDragTransform(true);
    }
    dragYRef.current = 0;
  }, [clearRaf, onClose, releaseDragTransform]);

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
      dragYRef.current = 0;
      clearRaf();
      // 元位置に戻す
      releaseDragTransform(true);
    },
    [clearRaf, releaseDragTransform]
  );
  // ---------------------------------------

  // unmount 時の rAF cleanup
  useEffect(() => {
    return () => {
      clearRaf();
    };
  }, [clearRaf]);

  if (!shouldMount) return null;

  // Sheet の bottom: safe-area 対応。BottomNav 分 + iOS home indicator 分。
  const sheetBottomStyle: React.CSSProperties = {
    bottom: `calc(${bottomOffsetPx}px + env(safe-area-inset-bottom, 0px))`,
  };

  return (
    // Phase 9.5-D (a11y): モーダル背景。Escape は自前 useEffect で処理。
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景
    // biome-ignore lint/a11y/useKeyWithClickEvents: 背景クリックのみ、Escape は自前
    <div
      ref={backdropRef}
      className={`fixed inset-0 ${zIndexClass} flex flex-col justify-end backdrop-blur-[2px] pointer-events-auto`}
      style={{ backgroundColor: 'var(--modal-overlay)', opacity: 0 }}
      onClick={handleBackdropClick}
    >
      {/* Sheet 本体を BottomNav の上端に接するよう bottom オフセット (safe-area 込み) */}
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
          // 初期表示位置は Anime.js が translateY: ['100%', '0%'] で上書き。
          // ここで明示的に translateY(100%) を指定しておくと、Anime.js dynamic
          // import 完了まで sheet が見えない (ちらつき防止)。
          transform: 'translateY(100%)',
        }}
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
