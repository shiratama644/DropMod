'use client';

// -----------------------------------------------------------------------------
// useCountUp (Phase 9.5-C)
//
// Stats Counter の数字を IntersectionObserver + Anime.js で 0 から目標値まで
// カウントアップ。Reduced Motion 環境では即座に最終値表示。
//
// 使い方:
//   const { ref, value } = useCountUp({ end: 100_000, suffix: '+' });
//   return <div ref={ref}>{value}</div>;
//
// 「100k+」のような接尾辞 or 接頭辞は render 側で display 整形する形も可能:
//   {value.toLocaleString()}+
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

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

  // Phase 10-P5: mount 時 1 回のみ observe、以降 end 等が変わっても再発火不要。
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount 時 1 回のみ実行
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;

    // Reduced Motion: 即座に最終値
    if (prefersReducedMotion()) {
      setValue(end);
      return;
    }

    let cancelled = false;

    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        void (async () => {
          const { animate } = await import('animejs');
          if (cancelled) return;
          // Anime.js v4 では object を animate できる
          const proxy = { n: 0 };
          animate(proxy, {
            n: end,
            duration,
            ease: 'outCubic',
            onUpdate: () => {
              if (!cancelled) setValue(Math.round(proxy.n));
            }
          });
        })();
        io.disconnect();
      },
      { threshold }
    );
    io.observe(el);

    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, []);

  return { ref, value };
}
