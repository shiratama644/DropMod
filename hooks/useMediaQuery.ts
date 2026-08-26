'use client';

/**
 * useMediaQuery — CSS media query を React state として購読する hook (Phase 11 UI)。
 *
 * - SSR / jsdom など matchMedia が無い環境では常に false を返す
 *   (初期 render は SSR HTML と一致し、hydration 後に実測値へ更新される)
 * - モバイル 3 カラムの compact カード切替 (ModCard) で使用
 *
 * テストでは window.matchMedia を差し替える
 * (__tests__/test-utils/browserApi.ts の stubMatchMedia) ことで
 * 両モードを検証できる。
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

/** モバイル (タブレット以下、< 768px) かどうか */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
