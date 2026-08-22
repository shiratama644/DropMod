'use client';

/**
 * オフライン検出バナー (Sub-Phase 8-B + 8-E)
 *
 * navigator.onLine === false の間、ページ上部に固定バナーを表示。
 * オンラインに戻るとフェードアウトして消える。
 *
 * 実装ポイント:
 *   - online/offline イベントは window に発火 (navigator.connection ではない)
 *   - SSR では navigator.onLine が undefined なので初期値は true (online) 扱い
 *   - AppShell の中で <Header> の前に配置
 */

import { useEffect, useState } from 'react';

export function OfflineBanner() {
  // SSR / 初回描画では online 扱い (offline なら hydration 後に切替)
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHasHydrated(true);
    // hydration 直後の実際の状態を反映
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      setIsOnline(navigator.onLine);
    }
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // hydration 前は絶対に表示しない (SSR/CSR ミスマッチ回避)
  if (!hasHydrated) return null;
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full bg-amber-500/90 backdrop-blur-md text-slate-950 text-xs sm:text-sm font-semibold text-center py-2 px-3 shadow-md"
    >
      <i className="fa-solid fa-wifi-slash mr-1.5" aria-hidden />
      オフライン中: キャッシュされた情報を表示しています
    </div>
  );
}
