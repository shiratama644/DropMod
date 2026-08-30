'use client';

// -----------------------------------------------------------------------------
// DesktopSidebar (Phase 9.5-G 新規)
//
// PC (md 以上 = 768px+) 向けの左固定サイドバー。
// モバイルの BottomNav + BottomSheet + Header (mobile actions) を統合し、
// デスクトップ最適な縦積みナビ + アクション群として提供。
//
// 【デザイン方針】
//   - 左固定 fixed left-0 top-0 h-screen w-64
//   - モバイルは非表示 (`hidden md:flex`)
//   - Header はモバイルのみ表示 (`md:hidden`)
//   - スクロール hide しない (PC は常時表示)
//
// 【構成】
//   1. ロゴ (Link to /) — 左ペイン上部のブランド。PC の sticky Header とは別
//   2. メインナビ (Home / 探す / 現在のMod / 設定) — <Link>、active tab は緑
//   3. プロファイル切替 dropdown (CustomDropdown 再利用) + 新規作成ボタン
//   4. アクション群 (依存チェック / ZIP保存 primary / ZIP読込 / テーマ切替)
//
// - Sheet は使わない (デスクトップは十分な縦空間があるので折り畳み不要)
// - 「探す」は /mods にそのまま遷移 (モバイルのカテゴリ Sheet は PC 不要、
//   代わりに /mods ページ上部で type filter があれば十分)
// -----------------------------------------------------------------------------

import { SyncButton } from '@/components/SyncButton';
import { useFolderLinked } from '@/hooks/useFolderLinked';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Profile, TabName, ThemeMode } from '@/types';
import { CustomDropdown } from '../ui/CustomDropdown';

interface DesktopSidebarProps {
  activeTab: TabName;
  onSwitchTab: (tab: TabName) => void;
  modCount: number;
  hasDepWarning: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  profiles: Profile[];
  currentProfileId: string;
  onSwitchProfile: (id: string) => void;
  onOpenNewProfileModal: () => void;
  onRunDependencyCheck: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface NavLinkItem {
  id: TabName;
  label: string;
  icon: string;
  href: string;
  showBadge?: boolean;
}

const NAV_ITEMS: readonly NavLinkItem[] = [
  { id: 'home', label: 'ホーム', icon: 'fa-solid fa-house', href: '/' },
  { id: 'mods', label: '探す', icon: 'fa-solid fa-magnifying-glass', href: '/discover/mods' },
  {
    id: 'profile',
    label: '現在のMod',
    icon: 'fa-solid fa-cubes',
    href: '/profile',
    showBadge: true,
  },
  { id: 'settings', label: '設定', icon: 'fa-solid fa-gear', href: '/settings' },
];

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onSwitchTab,
  modCount = 0,
  hasDepWarning = false,
  theme,
  onToggleTheme,
  profiles = [],
  currentProfileId,
  onSwitchProfile,
  onOpenNewProfileModal,
  onRunDependencyCheck,
  onDownloadZip,
  onImportZip,
}) => {
  const folderLinked = useFolderLinked();
  const pathname = usePathname();

  const safeModCount = Number.isFinite(modCount) ? Math.max(0, Math.floor(modCount)) : 0;
  const displayModCount = safeModCount > 999 ? '999+' : safeModCount.toString();

  const profileOptions = useMemo(() => {
    const safeProfiles = Array.isArray(profiles) ? profiles : [];
    return safeProfiles.map((p) => ({ label: p.name || '名称未設定', value: p.id }));
  }, [profiles]);

  const handleFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (typeof onImportZip === 'function') {
        onImportZip(e);
      }
    },
    [onImportZip]
  );

  const themeIcon = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  const themeLabel = theme === 'dark' ? 'ライトモード' : 'ダークモード';

  // active 判定: 詳細ページ (/<型>/<slug>)・モーダル/一覧 (/discover/...) は 'mods' 扱い
  const isNavActive = useCallback(
    (item: NavLinkItem) => {
      if (item.id === 'mods') {
        return (
          pathname === '/discover' ||
          (pathname?.startsWith('/discover/') ?? false) ||
          (/^\/(mod|modpack|resourcepack|shader)\//.test(pathname ?? '') ) ||
          activeTab === 'mods'
        );
      }
      return activeTab === item.id;
    },
    [pathname, activeTab]
  );

  return (
    <aside
      id="desktop-sidebar"
      aria-label="サイドナビゲーション"
      className="hidden md:flex fixed left-0 top-0 h-screen w-64 max-w-64 glass-panel border-r z-40 flex-col overflow-x-hidden"
    >
      {/* ロゴ (左ペイン上部。PC の sticky Header は出さない) */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-500/10">
        <Link
          href="/"
          onClick={() => onSwitchTab('home')}
          className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xl p-0.5"
          aria-label="ホームへ"
        >
          <div className="logo-icon w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 ring-1 ring-white/30">
            <i className="fa-solid fa-cube text-lg" aria-hidden="true" />
          </div>
          <div>
            <div className="font-extrabold text-base tracking-wider leading-none">
              DropMod
            </div>
            <div className="text-[10px] theme-text-muted mt-0.5">
              Mod Profile Manager
            </div>
          </div>
        </Link>
      </div>

      {/* メインナビ */}
      <nav className="px-3 py-3 flex flex-col gap-1" aria-label="メインナビ">
        {NAV_ITEMS.map((item) => {
          const isActive = isNavActive(item);
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={true}
              onClick={() => onSwitchTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isActive
                  ? 'bg-emerald-500/15 theme-text-brand'
                  : 'theme-text-muted hover:bg-slate-500/10 hover:theme-text-secondary'
              }`}
            >
              <i
                className={`${item.icon} text-base w-5 text-center`}
                aria-hidden="true"
              />
              <span className="flex-1">{item.label}</span>
              {item.showBadge && safeModCount > 0 && (
                <span
                  role="status"
                  aria-label={`${safeModCount}個のMod選択中`}
                  className="px-1.5 py-0.5 bg-emerald-500 text-slate-950 font-bold text-[10px] leading-none rounded-full min-w-[18px] text-center"
                >
                  {displayModCount}
                </span>
              )}
              {item.showBadge && hasDepWarning && (
                <span
                  role="img"
                  aria-label="警告あり"
                  className="w-2 h-2 rounded-full bg-red-500"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* プロファイル切替 (w-64 内に収める。長い名前は truncate) */}
      <div className="px-3 pt-3 pb-2 border-t border-slate-500/10 min-w-0">
        <div className="text-[10px] theme-text-muted font-bold uppercase tracking-wider px-1 mb-1.5">
          プロファイル
        </div>
        <div className="flex items-center gap-1 rounded-xl p-1 theme-sub-box min-w-0 max-w-full overflow-hidden">
          <i
            className="fa-solid fa-layer-group theme-text-brand text-xs ml-1.5 shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0 overflow-hidden">
            <CustomDropdown
              options={profileOptions}
              selectedValue={currentProfileId}
              onChange={onSwitchProfile}
              label="プロファイル切り替え"
              customClass="w-full min-w-0 max-w-full"
            />
          </div>
          <button
            type="button"
            onClick={onOpenNewProfileModal}
            title="新規プロファイル作成"
            aria-label="新規プロファイル作成"
            className="p-1.5 theme-text-secondary hover:text-emerald-500 rounded-lg transition shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* アクション群 (spacer で下寄せ) */}
      <div className="mt-auto px-3 pb-4 flex flex-col gap-1.5 border-t border-slate-500/10 pt-3">
        {/* D-8: フォルダ紐付け済みなら Sync に置き換える (プロファイルごと) */}
        {folderLinked ? (
          <SyncButton variant="primaryLg" label="フォルダへ同期 (全.jar)" />
        ) : (
          <button
            type="button"
            onClick={onDownloadZip}
            className="btn-hover-effect flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.98] transition font-semibold text-sm shadow-md shadow-emerald-600/20 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-file-zipper text-sm w-5 text-center" aria-hidden="true" />
            <span>ZIP 保存 (全.jar)</span>
          </button>
        )}

        {/* ZIP 読込 */}
        <label className="btn-hover-effect flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass-card border border-transparent hover:border-emerald-500/50 transition font-semibold text-sm cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500">
          <i
            className="fa-solid fa-file-import text-sm theme-text-brand w-5 text-center"
            aria-hidden="true"
          />
          <span>ZIP 読込</span>
          <input
            type="file"
            accept=".zip,.mrpack,application/zip"
            className="hidden"
            onChange={handleFileImport}
          />
        </label>

        {/* 依存・競合チェック */}
        <button
          type="button"
          onClick={onRunDependencyCheck}
          className="relative btn-hover-effect flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 theme-text-amber border border-amber-500/30 transition font-semibold text-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <i
            className="fa-solid fa-shield-halved text-sm w-5 text-center"
            aria-hidden="true"
          />
          <span>依存・競合チェック</span>
          {hasDepWarning && (
            <span
              role="img"
              aria-label="警告あり"
              className="ml-auto w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-900"
            />
          )}
        </button>

        {/* テーマ切替 */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={themeLabel}
          aria-label={themeLabel}
          className="btn-hover-effect flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass-card border border-transparent hover:border-emerald-500/50 transition font-semibold text-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <i className={`${themeIcon} text-sm w-5 text-center theme-text-brand`} aria-hidden="true" />
          <span>{themeLabel}</span>
        </button>
      </div>
    </aside>
  );
};
