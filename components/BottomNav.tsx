'use client';

// -----------------------------------------------------------------------------
// BottomNav (Phase 9.5-A で再設計)
//
// 従来 (Phase 9-F): 4 タブ全てが <Link>
//   Home / 探す / 現在のMod / 設定
//
// 新 (Phase 9.5): 3 主タブ (<Link>) + 2 疑似タブ (<button> で BottomSheet トリガー)
//   Home (Link) / 探す (button → BrowseSheet) / 現在のMod (Link) / メニュー (button → MenuSheet)
//
// 添付画像の Modrinth モバイル UI 準拠:
//   - 右端をハンバーガー化 (isMenuOpen で ≡ ⇔ ✕ 切替)
//   - 「探す」も同じ Sheet UX で 4 カテゴリ (Mods/Modpacks/RP/Shader) を選択
//     (Phase 11 の 4 カテゴリ対応の準備)
//
// ⚠️ Rules of Hooks: hook は「早期 return より前」に全部書く (React error #310 対策)。
// -----------------------------------------------------------------------------

import type React from 'react';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import type { TabName, ThemeMode } from '@/types';
import { BrowseBottomSheet } from './BrowseBottomSheet';
import { MenuBottomSheet } from './MenuBottomSheet';

interface BottomNavProps {
  activeTab: TabName;
  onSwitchTab: (tab: TabName) => void;
  modCount: number;
  hasDepWarning: boolean;
  // Phase 9.5-A 追加: MenuBottomSheet 用
  theme: ThemeMode;
  onToggleTheme: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Link ベースの nav item (Home / 現在のMod) */
interface LinkNavItem {
  kind: 'link';
  id: TabName;
  label: string;
  icon: string;
  href: string;
  showBadge?: boolean;
}

/** Sheet トリガーの nav item (探す / メニュー) */
interface SheetNavItem {
  kind: 'sheet';
  id: 'browse' | 'menu';
  label: string;
  icon: string;
  activeIcon?: string;
  matchTabs?: TabName[]; // どの TabName の時に active 表示するか
}

type NavItem = LinkNavItem | SheetNavItem;

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSwitchTab,
  modCount = 0,
  hasDepWarning = false,
  theme,
  onToggleTheme,
  onDownloadZip,
  onImportZip,
}) => {
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const safeModCount = Number.isFinite(modCount) ? Math.max(0, Math.floor(modCount)) : 0;
  const displayModCount = safeModCount > 999 ? '999+' : safeModCount.toString();

  const handleLinkClick = useCallback(
    (tabId: TabName) => {
      // 別 Sheet が開いていたら閉じる
      setIsBrowseOpen(false);
      setIsMenuOpen(false);
      onSwitchTab(tabId);
    },
    [onSwitchTab]
  );

  const handleBrowseToggle = useCallback(() => {
    setIsMenuOpen(false); // 排他制御
    setIsBrowseOpen((prev) => !prev);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setIsBrowseOpen(false); // 排他制御
    setIsMenuOpen((prev) => !prev);
  }, []);

  // "探す" は URL /mods 系の時に active。"メニュー" は /settings の時に active。
  // これで従来 4 タブから 2 タブが sheet に移動しても UX 上の連続性を保つ。
  const NAV_ITEMS: readonly NavItem[] = [
    {
      kind: 'link',
      id: 'home',
      label: 'ホーム',
      icon: 'fa-solid fa-house',
      href: '/',
    },
    {
      kind: 'sheet',
      id: 'browse',
      label: '探す',
      icon: 'fa-solid fa-magnifying-glass',
      matchTabs: ['mods'],
    },
    {
      kind: 'link',
      id: 'profile',
      label: '現在のMod',
      icon: 'fa-solid fa-cubes',
      href: '/profile',
      showBadge: true,
    },
    {
      kind: 'sheet',
      id: 'menu',
      label: 'メニュー',
      icon: 'fa-solid fa-bars',
      activeIcon: 'fa-solid fa-xmark',
      matchTabs: ['settings'],
    },
  ];

  return (
    <>
      <nav
        id="bottom-nav"
        aria-label="メインナビゲーション"
        className="fixed bottom-0 left-0 right-0 z-40 glass-panel border-t shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-md mx-auto grid grid-cols-4 h-16">
          {NAV_ITEMS.map((item) => {
            if (item.kind === 'link') {
              const isActive = activeTab === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={true}
                  onClick={() => handleLinkClick(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`tab-btn flex flex-col items-center justify-center gap-1 font-medium text-xs touch-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isActive ? 'active-tab-btn' : 'theme-text-muted'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <i
                      className={`${item.icon} text-base sm:text-lg`}
                      aria-hidden="true"
                    />
                    {item.showBadge && (
                      <>
                        <span
                          role="status"
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
            }

            // Sheet トリガー item
            const isOpen =
              (item.id === 'browse' && isBrowseOpen) ||
              (item.id === 'menu' && isMenuOpen);
            const isActive =
              isOpen ||
              (item.matchTabs?.includes(activeTab) ?? false);
            const iconClass = isOpen && item.activeIcon ? item.activeIcon : item.icon;
            const onClick =
              item.id === 'browse' ? handleBrowseToggle : handleMenuToggle;
            return (
              <button
                key={item.id}
                type="button"
                onClick={onClick}
                aria-expanded={isOpen}
                aria-controls={
                  item.id === 'browse' ? 'browse-bottom-sheet' : 'menu-bottom-sheet'
                }
                className={`tab-btn flex flex-col items-center justify-center gap-1 font-medium text-xs touch-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isActive ? 'active-tab-btn' : 'theme-text-muted'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <i
                    className={`${iconClass} text-base sm:text-lg transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bottom Sheets */}
      <BrowseBottomSheet
        isOpen={isBrowseOpen}
        onClose={() => setIsBrowseOpen(false)}
      />
      <MenuBottomSheet
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onDownloadZip={onDownloadZip}
        onImportZip={onImportZip}
      />
    </>
  );
};
