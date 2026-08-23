'use client';

// -----------------------------------------------------------------------------
// useScrollReveal (Phase 9.5-C)
//
// IntersectionObserver + Anime.js で「セクションが 20% 見えたら発火」
// する scroll-triggered reveal アニメーション。
//
// 使い方:
//   const containerRef = useScrollReveal('[data-reveal-item]');
//   ...
//   <section ref={containerRef}>
//     <div data-reveal-item>...</div>
//     <div data-reveal-item>...</div>
//   </section>
//
// - 各セクション mount 時に IntersectionObserver で observe
// - 20% 見えたら Anime.js で opacity 0 → 1, y: 40 → 0 (stagger 100ms)
// - Reduced Motion 環境では即座に最終状態を表示 (アニメスキップ)
// - 一度発火したら disconnect (再スクロールで再発火しない)
// -----------------------------------------------------------------------------

import { useEffect, useRef } from 'react';

/** Reduced Motion 判定 (Client only) */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param selector Anime 対象要素の CSS セレクタ (例: '[data-reveal-item]')
 * @param options.threshold IntersectionObserver の閾値 (default 0.2)
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  selector: string,
  options?: { threshold?: number }
) {
  const containerRef = useRef<T>(null);

  // Phase 10-P5 (useExhaustiveDependencies): selector / options.threshold は
  //   mount 時 1 回のみ evaluate すれば十分 (途中変更を想定しない reveal)。
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount 時 1 回のみ実行
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') return;

    const targets = Array.from(container.querySelectorAll<HTMLElement>(selector));
    if (targets.length === 0) return;

    // Reduced Motion: 即座に最終状態を表示 (opacity: 1、translate なし)
    if (prefersReducedMotion()) {
      for (const el of targets) {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }
      return;
    }

    // 初期スタイル (SSR HTML は opacity: 1 で描画されているので、
    // JS 実行時にリセットしてから observe → Intersection で animate)
    for (const el of targets) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(40px)';
      el.style.willChange = 'opacity, transform';
    }

    let cancelled = false;

    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        // dynamic import (Anime.js bundle 分離)
        void (async () => {
          const { animate, stagger } = await import('animejs');
          if (cancelled) return;
          animate(targets, {
            opacity: [0, 1],
            translateY: ['40px', '0px'],
            duration: 800,
            ease: 'outCubic',
            delay: stagger(100)
          });
        })();
        io.disconnect();
      },
      { threshold: options?.threshold ?? 0.2 }
    );
    io.observe(container);

    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, []);

  return containerRef;
}
