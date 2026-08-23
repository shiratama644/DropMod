'use client';

// -----------------------------------------------------------------------------
// MenuBottomSheet (Phase 9.5-A)
//
// BottomNav 右端のハンバーガーボタンを押した時に下から出てくる Sheet。
// 添付画像の Modrinth モバイル UI (Sign in / Settings / Change theme) を
// DropMod 用に翻訳:
//   Sign in     → 🟢 ZIP 保存 (primary、DropMod の目玉機能)
//   Settings    → Settings (Link へ)
//   Change theme → Change theme (現在の theme で fa-moon / fa-sun 切替)
//   (追加)      → ZIP 読込 (hidden file input trigger)
//
// -----------------------------------------------------------------------------

import type React from 'react';
import { useCallback, useRef } from 'react';
import Link from 'next/link';
import type { ThemeMode } from '@/types';
import { BottomSheet } from './BottomSheet';

interface MenuBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const MenuBottomSheet: React.FC<MenuBottomSheetProps> = ({
  isOpen,
  onClose,
  theme,
  onToggleTheme,
  onDownloadZip,
  onImportZip,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadClick = useCallback(() => {
    onDownloadZip();
    onClose();
  }, [onDownloadZip, onClose]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onImportZip(e);
      // useZipImport 側で input 値クリア済み。Sheet は close。
      onClose();
    },
    [onImportZip, onClose]
  );

  const handleToggleThemeClick = useCallback(() => {
    onToggleTheme();
    // theme 切替は Sheet 開いたまま UI 変化を見せる (計画書 §4.4 特殊挙動)
  }, [onToggleTheme]);

  // 現在の theme に応じてアイコンとラベルを出し分け
  const themeIcon = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  const themeLabel = theme === 'dark' ? 'ライトモード' : 'ダークモード';

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="メニュー"
      maxHeightClass="max-h-[70vh]"
    >
      <div className="space-y-3">
        {/* Primary: ZIP 保存 (DropMod の目玉機能) */}
        <button
          type="button"
          onClick={handleDownloadClick}
          className="btn-hover-effect w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-base font-bold shadow-md shadow-emerald-600/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <i className="fa-solid fa-file-zipper text-lg" aria-hidden />
          <span>ZIP 保存 (全 .jar)</span>
        </button>

        {/* Settings */}
        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-2xl glass-card border-2 border-transparent hover:border-emerald-500/40 active:scale-[0.98] transition focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <i className="fa-solid fa-gear text-lg" aria-hidden />
          <span className="text-base font-bold">Settings</span>
        </Link>

        {/* Change theme (Sheet は閉じない、UI 変化を見せる) */}
        <button
          type="button"
          onClick={handleToggleThemeClick}
          className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-2xl glass-card border-2 border-transparent hover:border-emerald-500/40 active:scale-[0.98] transition focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <i className={`${themeIcon} text-lg`} aria-hidden />
          <span className="text-base font-bold">{themeLabel}</span>
        </button>

        {/* ZIP 読込 (hidden input trigger) */}
        <label className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-2xl glass-card border-2 border-transparent hover:border-emerald-500/40 active:scale-[0.98] transition cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500">
          <i className="fa-solid fa-file-import text-lg" aria-hidden />
          <span className="text-base font-bold">ZIP 読込</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.mrpack,application/zip"
            className="hidden"
            onChange={handleFileChange}
            onClick={handleImportClick}
          />
        </label>
      </div>
    </BottomSheet>
  );
};
