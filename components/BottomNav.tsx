'use client';

// -----------------------------------------------------------------------------
// BottomNav (Phase 9.5-A → 9.5-D → 9.5-G で問題修正 & PC 分離)
//
// 【9.5-G 修正点】(ユーザー要望):
//   1. 開いてる Sheet 対応ボタンだけを緑色 active に、Link タブの active 緑は消す
//      (topOpenId !== null の間、Link タブの isActive は強制 false)
//   2. Sheet の open 状態を親 (AppShell) に通知 → scroll hide 抑制
//      (Sheet 開いている間は BottomNav を hide しない = 消えない)
//   3. handleLinkClick から Sheet close 呼び出しを削除
//      (Link クリック → URL 変化 → BottomSheet の pathname watcher が自動 close
//       する。ここで close 呼ぶと close アニメが 2 重に走る)
//   4. モバイル (< md) 専用に。PC (md 以上) は DesktopSidebar に置き換わるので
//      `md:hidden` を付与、Sheet 群も同じく `md:hidden`
//
// hook 群は「早期 return より前」に全部配置 (React error #310 対策)。
// -----------------------------------------------------------------------------

import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { TabName, ThemeMode } from '@/types';
import { BrowseBottomSheet } from './BrowseBottomSheet';
import { MenuBottomSheet } from './MenuBottomSheet';

interface BottomNavProps {
  activeTab: TabName;
  onSwitchTab: (tab: TabName) => void;
  modCount: number;
  hasDepWarning: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Phase 9.5-E: 下スクロールで hide、上スクロールで show (AppShell で判定) */
  hidden?: boolean;
  /** Phase 9.5-G: 内部の Sheet stack が「1 個以上 open 中」の状態変化を親に通知。
   *  AppShell 側で「Sheet 開いてる間は scroll hide しない」判定に使う。 */
  onSheetOpenChange?: (isAnyOpen: boolean) => void;
}

interface LinkNavItem {
  kind: 'link';
  id: TabName;
  label: string;
  icon: string;
  href: string;
  showBadge?: boolean;
}

interface SheetNavItem {
  kind: 'sheet';
  id: 'browse' | 'menu';
  label: string;
  icon: string;
  activeIcon?: string;
  matchTabs?: TabName[];
}

type NavItem = LinkNavItem | SheetNavItem;

interface SheetEntry {
  id: 'browse' | 'menu';
  key: number;
  isOpen: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSwitchTab,
  modCount = 0,
  hasDepWarning = false,
  theme,
  onToggleTheme,
  onDownloadZip,
  onImportZip,
  hidden = false,
  onSheetOpenChange,
}) => {
  const [sheetStack, setSheetStack] = useState<SheetEntry[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const safeModCount = Number.isFinite(modCount) ? Math.max(0, Math.floor(modCount)) : 0;
  const displayModCount = safeModCount > 999 ? '999+' : safeModCount.toString();

  /** 指定 Sheet を close 遷移させる (isOpen = false にして close アニメ待ち) */
  const requestClose = useCallback((id: 'browse' | 'menu') => {
    setSheetStack((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, isOpen: false } : entry
      )
    );
  }, []);

  /** close アニメ完了通知 → 該当 entry を stack から除去 */
  const handleCloseAnimationComplete = useCallback(
    (id: 'browse' | 'menu', key: number) => {
      setSheetStack((prev) =>
        prev.filter((entry) => !(entry.id === id && entry.key === key))
      );
    },
    []
  );

  /** Sheet トリガーボタンを押した時の挙動 */
  const handleSheetButtonClick = useCallback(
    (id: 'browse' | 'menu') => {
      setSheetStack((prev) => {
        const top = prev[prev.length - 1];
        // top が同じ id かつ open → 閉じる (toggle)
        if (top && top.id === id && top.isOpen) {
          return prev.map((entry) =>
            entry === top ? { ...entry, isOpen: false } : entry
          );
        }
        // 他の open Sheet があれば close 遷移させる (mount は継続で unmount 待ち)
        const closingOthers = prev.map((entry) =>
          entry.id === id || entry.isOpen === false
            ? entry
            : { ...entry, isOpen: false }
        );
        // 同じ id は既存 entry を破棄して新規 mount
        const withoutSameId = closingOthers.filter((entry) => entry.id !== id);
        setNextKey((n) => n + 1);
        return [
          ...withoutSameId,
          { id, key: nextKey, isOpen: true },
        ];
      });
    },
    [nextKey]
  );

  /**
   * Link タブクリック時のハンドラ。
   *
   * 【9.5-G 修正】ここで Sheet を close 遷移させると、その後 <Link> が URL を
   *   変える → BottomSheet の pathname watcher が再度 close をトリガー → 二重。
   *   → Sheet close は pathname watcher に任せ、ここではタブ切替 (scrollTop) のみ。
   */
  const handleLinkClick = useCallback(
    (tabId: TabName) => {
      onSwitchTab(tabId);
    },
    [onSwitchTab]
  );

  const handleBrowseToggle = useCallback(
    () => handleSheetButtonClick('browse'),
    [handleSheetButtonClick]
  );
  const handleMenuToggle = useCallback(
    () => handleSheetButtonClick('menu'),
    [handleSheetButtonClick]
  );

  // どの Sheet が「最前面で open」か
  const topOpenId: 'browse' | 'menu' | null = (() => {
    for (let i = sheetStack.length - 1; i >= 0; i--) {
      const entry = sheetStack[i];
      if (entry?.isOpen) return entry.id;
    }
    return null;
  })();

  // 【9.5-G】 Sheet open 状態変化を親に通知
  useEffect(() => {
    onSheetOpenChange?.(topOpenId !== null);
  }, [topOpenId, onSheetOpenChange]);

  const NAV_ITEMS: readonly NavItem[] = [
    { kind: 'link', id: 'home', label: 'ホーム', icon: 'fa-solid fa-house', href: '/' },
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
        className={`md:hidden fixed bottom-0 left-0 right-0 z-[60] glass-panel border-t shadow-2xl transition-transform duration-300 will-change-transform ${
          hidden ? 'translate-y-full' : 'translate-y-0'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-md mx-auto grid grid-cols-4 h-16">
          {NAV_ITEMS.map((item) => {
            if (item.kind === 'link') {
              // 【9.5-G】 Sheet 開いてる間は Link タブの active 緑を消す
              //   (Sheet 対応ボタン側だけが緑になる)
              const isActive = topOpenId === null && activeTab === item.id;
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
            const isTopOpen = topOpenId === item.id;
            // 【9.5-G】 Sheet 開いてる時: そのボタンだけ緑。閉じてる時のみ matchTabs で active 判定。
            const isActive = isTopOpen || (topOpenId === null && (item.matchTabs?.includes(activeTab) ?? false));
            const iconClass =
              isTopOpen && item.activeIcon ? item.activeIcon : item.icon;
            const onClick =
              item.id === 'browse' ? handleBrowseToggle : handleMenuToggle;
            return (
              <button
                key={item.id}
                type="button"
                onClick={onClick}
                aria-expanded={isTopOpen}
                aria-controls={
                  item.id === 'browse' ? 'browse-bottom-sheet' : 'menu-bottom-sheet'
                }
                className={`tab-btn flex flex-col items-center justify-center gap-1 font-medium text-xs touch-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isActive ? 'active-tab-btn' : 'theme-text-muted'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <i
                    className={`${iconClass} text-base sm:text-lg transition-transform duration-200 ${isTopOpen ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sheet Stack: 手前 (末尾) ほど上に重ねる。Sheet 群も PC では非表示。
          `.md:hidden` は wrapper 側では効かないので Sheet 内部が md 以上で
          BottomNav 非表示 → Sheet トリガーも押せない → 実質 open 不可能。
          Sheet の md 分岐は不要 (open ボタン自体がモバイル専用) */}
      {sheetStack.map((entry, idx) => {
        const zIndexClass =
          idx === 0 ? 'z-[50]' : idx === 1 ? 'z-[52]' : 'z-[54]';
        if (entry.id === 'browse') {
          return (
            <BrowseBottomSheet
              key={`browse-${entry.key}`}
              isOpen={entry.isOpen}
              onClose={() => requestClose('browse')}
              onCloseAnimationComplete={() =>
                handleCloseAnimationComplete('browse', entry.key)
              }
              zIndexClass={zIndexClass}
            />
          );
        }
        return (
          <MenuBottomSheet
            key={`menu-${entry.key}`}
            isOpen={entry.isOpen}
            onClose={() => requestClose('menu')}
            onCloseAnimationComplete={() =>
              handleCloseAnimationComplete('menu', entry.key)
            }
            zIndexClass={zIndexClass}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onDownloadZip={onDownloadZip}
            onImportZip={onImportZip}
          />
        );
      })}
    </>
  );
};
