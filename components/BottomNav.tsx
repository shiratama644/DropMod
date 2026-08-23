'use client';

// -----------------------------------------------------------------------------
// BottomNav (Phase 9.5-A → 9.5-D で Sheet Stack 管理を追加)
//
// 従来 (Phase 9-F): 4 タブ全てが <Link>
//   Home / 探す / 現在のMod / 設定
//
// Phase 9.5-A 版: 3 主タブ (<Link>) + 2 疑似タブ (<button> で BottomSheet トリガー)
//   Home (Link) / 探す (button → BrowseSheet) / 現在のMod (Link) / メニュー (button → MenuSheet)
//
// 【9.5-D 追加要件】(ユーザー要望):
//   - Sheet を開いてる時に他 Sheet ボタンを押すと、旧 Sheet を close アニメ
//     走らせつつ mount 継続、新 Sheet は上に重ねる (z-index 一段上)
//   - 旧 Sheet は close アニメ完了で unmount
//   - Sheet の背景は BottomNav とページの間から出る (BottomSheet 側で bottom-16 で調整)
//
// 【9.5-D 追補】(ユーザー要望):
//   - BottomNav を BottomSheet より上に配置 (z-[60] > Sheet の z-[50]/[52]/[54])
//     → Sheet の暗い backdrop が BottomNav 領域を覆わず、BottomNav が常に前面。
//   - Sheet 内ボタンはアイコン横 + ラベルの横並びで縦幅を圧縮 (min-h-[52px])。
//   - backdrop-blur を `sm` (4px) → `[2px]` に弱め、背景ページの可視性向上。
//
// ⚠️ Rules of Hooks: hook は「早期 return より前」に全部書く。
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
  theme: ThemeMode;
  onToggleTheme: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Phase 9.5-E: 下スクロールで hide、上スクロールで show (AppShell で判定) */
  hidden?: boolean;
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

/**
 * Sheet Stack 内の各エントリの状態:
 *   - isOpen: true = open アニメ状態 or 開いた状態
 *             false = close アニメ中 (mount 継続)、完了で unmount 予定
 *   - key:    再 mount 判定用の unique key (連続開閉で同じ Sheet を再アニメ)
 */
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
}) => {
  // Sheet Stack: 手前 (末尾) が最新に開いた Sheet
  const [sheetStack, setSheetStack] = useState<SheetEntry[]>([]);
  // 各 Sheet mount の key を単調増加させる (連続開閉で React に別要素と認識させる)
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

  /** Sheet トリガーボタン (探す / メニュー) を押した時の挙動 */
  const handleSheetButtonClick = useCallback(
    (id: 'browse' | 'menu') => {
      setSheetStack((prev) => {
        // top (末尾) が同じ id かつ open → 閉じる (toggle)
        const top = prev[prev.length - 1];
        if (top && top.id === id && top.isOpen) {
          return prev.map((entry) =>
            entry === top ? { ...entry, isOpen: false } : entry
          );
        }
        // それ以外: 既存の同じ id エントリがあれば isOpen=false (二重 open 防止)、
        //   新規 entry を末尾に追加
        const closingOthers = prev.map((entry) =>
          entry.id === id || entry.isOpen === false
            ? entry
            : { ...entry, isOpen: false } // 他の open 中 Sheet を closing 状態に
        );
        // ただし「同じ id は既存 entry を破棄して新規 mount」させたい
        //   (mount 済みの Sheet を再利用すると変な状態になる可能性を回避)
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

  /** Link タブクリック時: 全 Sheet を close 遷移させる */
  const handleLinkClick = useCallback(
    (tabId: TabName) => {
      setSheetStack((prev) => prev.map((entry) => ({ ...entry, isOpen: false })));
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

  // どの Sheet が「最前面で open」か (BottomNav のアイコン切替判定に使う)
  const topOpenId: 'browse' | 'menu' | null = (() => {
    for (let i = sheetStack.length - 1; i >= 0; i--) {
      const entry = sheetStack[i];
      if (entry?.isOpen) return entry.id;
    }
    return null;
  })();

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
        className={`fixed bottom-0 left-0 right-0 z-[60] glass-panel border-t shadow-2xl transition-transform duration-300 will-change-transform ${
          hidden ? 'translate-y-full' : 'translate-y-0'
        }`}
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
            const isTopOpen = topOpenId === item.id;
            const isActive = isTopOpen || (item.matchTabs?.includes(activeTab) ?? false);
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

      {/* Sheet Stack: 手前 (末尾) ほど上に重ねる。z-index を stack index で加算。
          各 Sheet は自前で slide アニメ、close 完了で親に通知して unmount させる。
          Tailwind JIT scan の都合で動的クラスは使わず、明示マッピングで解決。 */}
      {sheetStack.map((entry, idx) => {
        // idx: 0 → z-[50], 1 → z-[52], 2 → z-[54] (通常 2 段まで、それ以上は同 z)
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
