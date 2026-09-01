'use client';

// -----------------------------------------------------------------------------
// useScrollReveal (M3E 移行版)
//
// IntersectionObserver + GSAP で「セクションが 20% 見えたら発火」
// する scroll-triggered reveal アニメーション。
// -----------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param selector GSAP 対象要素の CSS セレクタ (例: '[data-reveal-item]')
 * @param options.threshold IntersectionObserver の閾値 (default 0.2)
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  selector: string,
  options?: { threshold?: number }
) {
  const containerRef = useRef<T>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount 時 1 回のみ実行
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') return;

    const targets = gsap.utils.toArray<HTMLElement>(selector, container);
    if (targets.length === 0) return;

    if (prefersReducedMotion()) {
      for (const el of targets) {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }
      return;
    }

    // 初期スタイル (SSR HTML は opacity: 1 で描画されているので、JS 実行時にリセット)
    gsap.set(targets, { opacity: 0, y: 40 });

    let io: IntersectionObserver | null = null;
    const ctx = gsap.context(() => {});

    io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        
        ctx.add(() => {
          gsap.to(targets, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out', // Expressive Standard に近い ease
            stagger: 0.1,
          });
        });
        
        io?.disconnect();
      },
      { threshold: options?.threshold ?? 0.2 }
    );
    io.observe(container);

    return () => {
      io?.disconnect();
      ctx.revert();
    };
  }, []);

  return containerRef;
}
