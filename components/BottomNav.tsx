'use client';

import React from 'react';
import Link from 'next/link';
import { TabName } from '@/types';

interface BottomNavProps {
  activeTab: TabName;
  onSwitchTab: (tab: TabName) => void;
  modCount: number;
  hasDepWarning: boolean;
}

interface NavItemConfig {
  id: TabName;
  label: string;
  icon: string;
  href: string;
  showBadge?: boolean;
}

// H4-1 修正: <button onClick> ではなく <Link href> ベースに変更。
// 右クリック/中クリックで新規タブ、SEO クローラが辿れる、Next.js の自動 prefetch が
// 効くようになる。onClick は Link と併用可能 (スクロール制御のため残存)。
const NAV_ITEMS: readonly NavItemConfig[] = [
  { id: 'home', label: 'ホーム', icon: 'fa-solid fa-house', href: '/' },
  {
    id: 'mods',
    label: '選択中のMod',
    icon: 'fa-solid fa-cubes',
    href: '/mods',
    showBadge: true
  },
  { id: 'settings', label: '設定', icon: 'fa-solid fa-gear', href: '/settings' },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSwitchTab,
  modCount = 0,
  hasDepWarning = false,
}) => {
  const safeModCount = Number.isFinite(modCount) ? Math.max(0, Math.floor(modCount)) : 0;
  const displayModCount = safeModCount > 999 ? '999+' : safeModCount.toString();

  // onSwitchTab は AppShell 側でスクロールトップ処理を持つ。Link のデフォルト遷移と
  // 組み合わせるため、onClick で state 更新は行わず「スクロール」だけを補助する。
  const handleTabClick = (tabId: TabName) => {
    if (typeof onSwitchTab === 'function') {
      onSwitchTab(tabId);
    }
  };

  return (
    <nav
      id="bottom-nav"
      aria-label="メインナビゲーション"
      className="fixed bottom-0 left-0 right-0 z-40 glass-panel border-t shadow-2xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-md mx-auto grid grid-cols-3 h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={true}
              onClick={() => handleTabClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`tab-btn flex flex-col items-center justify-center gap-1 font-medium text-xs touch-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isActive ? 'active-tab-btn' : 'theme-text-muted'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <i className={`${item.icon} text-base sm:text-lg`} aria-hidden="true" />
                {item.showBadge && (
                  <>
                    <span
                      className="absolute -top-1.5 -right-3.5 px-1.5 py-0.5 bg-emerald-500 text-slate-950 font-bold text-[10px] leading-none rounded-full min-w-[16px] text-center shadow"
                      aria-label={`${safeModCount}個のMod選択中`}
                    >
                      {displayModCount}
                    </span>
                    {hasDepWarning && (
                      <span className="absolute -top-1.5 -right-5 flex h-2.5 w-2.5">
                        <span className="sr-only">依存関係の警告あり</span>
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                      </span>
                    )}
                  </>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
