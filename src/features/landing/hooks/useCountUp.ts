'use client';

// -----------------------------------------------------------------------------
// useCountUp (M3E 移行版)
//
// Stats Counter の数字を IntersectionObserver + GSAP で 0 から目標値まで
// カウントアップ。Reduced Motion 環境では即座に最終値表示。
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface UseCountUpOptions {
  /** カウント終値 */
  end: number;
  /** カウント時間 (ms、default 1500) */
  duration?: number;
  /** IntersectionObserver 閾値 (default 0.4) */
  threshold?: number;
}

export function useCountUp<T extends HTMLElement = HTMLDivElement>(
  options: UseCountUpOptions
) {
  const { end, duration = 1500, threshold = 0.4 } = options;
  const ref = useRef<T>(null);
  const [value, setValue] = useState<number>(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount 時 1 回のみ実行
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;

    if (prefersReducedMotion()) {
      setValue(end);
      return;
    }

    let io: IntersectionObserver | null = null;
    const ctx = gsap.context(() => {}); // gsap context for cleanup

    io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        
        ctx.add(() => {
          const proxy = { n: 0 };
          gsap.to(proxy, {
            n: end,
            duration: duration / 1000,
            ease: 'power3.out',
            onUpdate: () => {
              setValue(Math.round(proxy.n));
            }
          });
        });
        io?.disconnect();
      },
      { threshold }
    );
    io.observe(el);

    return () => {
      io?.disconnect();
      ctx.revert();
    };
  }, []);

  return { ref, value };
}
