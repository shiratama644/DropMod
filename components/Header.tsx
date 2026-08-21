'use client';

import React, { useMemo, useCallback } from 'react';
import { Profile, ThemeMode } from '@/types';
import { CustomDropdown } from './CustomDropdown';

interface HeaderProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  profiles: Profile[];
  currentProfileId: string;
  onSwitchProfile: (id: string) => void;
  onOpenNewProfileModal: () => void;
  onRunDependencyCheck: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSwitchTab: (tab: 'home' | 'mods' | 'settings') => void;
  hasDepWarning: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  profiles = [],
  currentProfileId,
  onSwitchProfile,
  onOpenNewProfileModal,
  onRunDependencyCheck,
  onDownloadZip,
  onImportZip,
  onSwitchTab,
  hasDepWarning,
}) => {
  // Safely transform profiles with fallback guard
  const profileOptions = useMemo(() => {
    const safeProfiles = Array.isArray(profiles) ? profiles : [];
    return safeProfiles.map((p) => ({ label: p.name || '名称未設定', value: p.id }));
  }, [profiles]);

  // Wrap file input change to clear value after import (allows re-importing the same zip)
  const handleFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (typeof onImportZip === 'function') {
        onImportZip(e);
      }
      e.target.value = '';
    },
    [onImportZip]
  );

  const handleLogoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSwitchTab('home');
    }
  };

  return (
    <header id="app-header" className="sticky top-0 z-30 glass-panel">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center justify-between">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSwitchTab('home')}
            onKeyDown={handleLogoKeyDown}
            aria-label="ホーム画面へ移動"
            className="flex items-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xl p-0.5"
          >
            <div className="logo-icon w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20 ring-1 ring-white/30">
              <i className="fa-solid font-bold fa-cube text-lg sm:text-xl" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-extrabold text-base sm:text-lg tracking-wider flex items-center gap-1.5 leading-none">
                DropMod
              </h1>
              <p className="text-xs theme-text-muted mt-0.5">Minecraft Mod Profile Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleTheme}
              id="header-theme-toggle"
              title="テーマ切り替え"
              aria-label="テーマ切り替え"
              className="p-2 rounded-xl theme-sub-box theme-text-brand hover:opacity-80 transition flex items-center justify-center touch-target focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i
                id="header-theme-icon"
                className={`fa-solid ${theme === 'dark' ? 'fa-moon' : 'fa-sun'} text-sm`}
                aria-hidden="true"
              />
            </button>

            {/* Mobile actions */}
            <div className="flex sm:hidden items-center gap-1.5">
              <button
                type="button"
                onClick={onRunDependencyCheck}
                title="依存・競合チェック"
                aria-label="依存・競合チェック"
                className="relative p-2 text-xs font-semibold rounded-xl bg-amber-500/20 theme-text-amber border border-amber-500/30 active:bg-amber-500/30 transition flex items-center justify-center touch-target shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-shield-halved text-sm" aria-hidden="true" />
                {hasDepWarning && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              <button
                type="button"
                onClick={onDownloadZip}
                title="ZIP保存"
                aria-label="ZIP保存"
                className="p-2 text-xs font-semibold rounded-xl bg-emerald-600 active:bg-emerald-500 text-slate-950 transition flex items-center justify-center touch-target shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-download text-sm" aria-hidden="true" />
              </button>

              <label
                title="ZIP読込"
                aria-label="ZIP読込"
                className="p-2 text-xs font-semibold rounded-xl theme-sub-box theme-text-brand transition flex items-center justify-center cursor-pointer touch-target focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-file-import text-sm" aria-hidden="true" />
                <input
                  type="file"
                  accept=".zip,.mrpack,application/zip"
                  className="hidden"
                  onChange={handleFileImport}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Profile dropdown and Desktop actions */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          <div className="flex items-center rounded-xl p-1 theme-sub-box flex-1 sm:flex-none">
            <i className="fa-solid fa-layer-group theme-text-brand text-xs ml-2 mr-1" aria-hidden="true" />
            <div className="w-full sm:w-[190px]">
              <CustomDropdown
                options={profileOptions}
                selectedValue={currentProfileId}
                onChange={onSwitchProfile}
                label="プロファイル切り替え"
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

          <div className="hidden sm:flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRunDependencyCheck}
              className="relative btn-hover-effect px-3 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 theme-text-amber border border-amber-500/40 transition flex items-center gap-1.5 shadow-md shadow-amber-500/10 font-mono focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
              <span>依存・競合チェック</span>
              {hasDepWarning && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
              )}
            </button>

            <button
              type="button"
              onClick={onDownloadZip}
              className="btn-hover-effect px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 font-mono focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-file-zipper" aria-hidden="true" />
              <span>ZIP保存 (全.jar)</span>
            </button>

            <label className="btn-hover-effect px-3 py-1.5 text-xs font-semibold rounded-xl theme-sub-box transition flex items-center gap-1.5 cursor-pointer font-mono focus-visible:ring-2 focus-visible:ring-emerald-500">
              <i className="fa-solid fa-file-import theme-text-brand" aria-hidden="true" />
              <span>ZIP読込</span>
              <input
                type="file"
                accept=".zip,.mrpack,application/zip"
                className="hidden"
                onChange={handleFileImport}
              />
            </label>
          </div>
        </div>
      </div>
    </header>
  );
};