'use client';

// -----------------------------------------------------------------------------
// useScrollDirection (Phase 9.5-E)
//
// スクロール方向を検知する共通 hook。Header / BottomNav の
// 「下スクロールで hide / 上スクロールで show」UX に使う。
//
// 挙動:
//   - 上スクロール or ページ上端付近 (0-80px) → 'up' (= show 判定)
//   - 下スクロール かつ 80px 以下でない → 'down' (= hide 判定)
//   - スクロール量が閾値 (デフォルト 8px) 未満は前回値を維持 (jitter 回避)
//
// パフォーマンス:
//   - passive scroll listener
//   - rAF throttle (1 frame に 1 回だけ処理)
//   - deps 空、mount 時 1 回のみ subscribe
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react';

export type ScrollDirection = 'up' | 'down';

interface UseScrollDirectionOptions {
  /** show 状態を強制する top エリアの高さ (px)、default 80 */
  topAreaHeight?: number;
  /** jitter 回避の閾値 (px)、default 8 */
  threshold?: number;
}

export function useScrollDirection(
  options: UseScrollDirectionOptions = {}
): ScrollDirection {
  const { topAreaHeight = 80, threshold = 8 } = options;
  const [direction, setDirection] = useState<ScrollDirection>('up');

  // Phase 10-P5: mount 時 1 回 subscribe、以降 options 変更を想定しないので deps 空
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount 時 1 回のみ subscribe
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastY;

      // 上端エリアは強制 show
      if (currentY <= topAreaHeight) {
        setDirection('up');
        lastY = currentY;
        ticking = false;
        return;
      }

      // 閾値未満は前回値維持
      if (Math.abs(delta) < threshold) {
        ticking = false;
        return;
      }

      setDirection(delta > 0 ? 'down' : 'up');
      lastY = currentY;
      ticking = false;
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return direction;
}
