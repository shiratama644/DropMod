'use client';

/**
 * Web Vitals 計測 (Sub-Phase 8-E: E-7)
 *
 * LCP / INP / CLS / FCP / TTFB / FID (deprecated) を計測し、コンソールと
 * (将来的に) Analytics に送信する。
 *
 * 現状の実装:
 *   - dev/production 両方でコンソールに console.info 出力 (デバッグ・調整用)
 *   - 将来 Vercel Analytics / GA4 を導入した際にここから送信するだけで済む
 *
 * 実装ポイント:
 *   - onXXX 関数は dynamic import で lazy load (SSR 影響なし)
 *   - useEffect 内 client-only、SSR 影響なし
 *   - 各 metric は 1 ページで 1 回だけ発火 (web-vitals 内部で dedupe)
 *
 * 参考: https://web.dev/articles/vitals
 */

import { useEffect } from 'react';

const RATING_EMOJI: Record<string, string> = {
  good: '🟢',
  'needs-improvement': '🟡',
  poor: '🔴'
};

export function WebVitalsReporter() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { onLCP, onINP, onCLS, onFCP, onTTFB } = await import('web-vitals');
        if (cancelled) return;

        const handler = (metric: { name: string; value: number; rating: string; id: string }) => {
          // 見やすい形式で console 出力
          const emoji = RATING_EMOJI[metric.rating] ?? '⚪';
          console.info(
            `%c[Web Vitals] ${emoji} ${metric.name}: ${metric.value.toFixed(1)}ms (${metric.rating})`,
            'color: #10b981; font-weight: bold;'
          );
          // TODO Phase 9: Analytics 送信 (Vercel Analytics / GA4)
        };

        onLCP(handler);
        onINP(handler);
        onCLS(handler);
        onFCP(handler);
        onTTFB(handler);
      } catch (e) {
        console.warn('[DropMod] Web Vitals 計測の初期化に失敗:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
