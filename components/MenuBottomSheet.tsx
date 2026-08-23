'use client';

// -----------------------------------------------------------------------------
// MenuBottomSheet (Phase 9.5-A → 9.5-D で 2 カラム + 小型化)
//
// BottomNav 右端のハンバーガーボタン用 Sheet。
// 添付画像の Modrinth モバイル UI (Sign in / Settings / Change theme) を
// DropMod 用に翻訳:
//   Sign in     → 🟢 ZIP 保存 (primary、DropMod の目玉機能)
//   Settings    → Settings (Link へ)
//   Change theme → Change theme (現在の theme で fa-moon / fa-sun 切替)
//   (追加)      → ZIP 読込 (hidden file input trigger)
//
// 【9.5-D 変更点】(ユーザー要望):
//   - 縦積み大型ボタン → 2 カラム grid + 小型ボタン
//   - primary ボタン (ZIP 保存) は 2 カラム片方に配置 (Modrinth の Sign in が
//     フル幅 primary だったのを 2 カラム化に合わせ調整、色で primary 感を維持)
//   - z-index / onCloseAnimationComplete などの props を親から受け取り、
//     Sheet 重ね置き対応
// -----------------------------------------------------------------------------

import type React from 'react';
import { useCallback, useRef } from 'react';
import Link from 'next/link';
import type { ThemeMode } from '@/types';
import { BottomSheet } from './BottomSheet';

interface MenuBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCloseAnimationComplete?: () => void;
  zIndexClass?: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onDownloadZip: () => void;
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const MenuBottomSheet: React.FC<MenuBottomSheetProps> = ({
  isOpen,
  onClose,
  onCloseAnimationComplete,
  zIndexClass,
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
      onClose();
    },
    [onImportZip, onClose]
  );

  const handleToggleThemeClick = useCallback(() => {
    onToggleTheme();
    // theme 切替は Sheet 開いたまま UI 変化を見せる
  }, [onToggleTheme]);

  const themeIcon = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  const themeLabel = theme === 'dark' ? 'ライト' : 'ダーク';

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      onCloseAnimationComplete={onCloseAnimationComplete}
      ariaLabel="メニュー"
      maxHeightClass="max-h-[35vh]"
      zIndexClass={zIndexClass}
    >
      <div className="grid grid-cols-2 gap-2">
        {/* Primary: ZIP 保存 (DropMod の目玉機能、色で primary 感) */}
        <button
          type="button"
          onClick={handleDownloadClick}
          className="btn-hover-effect flex flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.97] transition focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-md shadow-emerald-600/30 min-h-[52px]"
        >
          <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center text-base shrink-0">
            <i className="fa-solid fa-file-zipper" aria-hidden />
          </div>
          <span className="font-bold text-sm leading-tight truncate">
            ZIP 保存
          </span>
        </button>

        {/* Settings */}
        <Link
          href="/settings"
          onClick={onClose}
          className="flex flex-row items-center gap-3 px-3 py-2.5 rounded-xl glass-card border border-transparent hover:border-emerald-500/50 active:scale-[0.97] transition focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[52px]"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-500/15 flex items-center justify-center text-base shrink-0">
            <i className="fa-solid fa-gear" aria-hidden />
          </div>
          <span className="font-semibold text-sm leading-tight truncate">
            設定
          </span>
        </Link>

        {/* Change theme */}
        <button
          type="button"
          onClick={handleToggleThemeClick}
          className="flex flex-row items-center gap-3 px-3 py-2.5 rounded-xl glass-card border border-transparent hover:border-emerald-500/50 active:scale-[0.97] transition focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[52px]"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-500/15 flex items-center justify-center text-base shrink-0">
            <i className={themeIcon} aria-hidden />
          </div>
          <span className="font-semibold text-sm leading-tight truncate">
            {themeLabel}モード
          </span>
        </button>

        {/* ZIP 読込 (hidden input trigger) */}
        <label className="flex flex-row items-center gap-3 px-3 py-2.5 rounded-xl glass-card border border-transparent hover:border-emerald-500/50 active:scale-[0.97] transition cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500 min-h-[52px]">
          <div className="w-9 h-9 rounded-lg bg-slate-500/15 flex items-center justify-center text-base shrink-0">
            <i className="fa-solid fa-file-import" aria-hidden />
          </div>
          <span className="font-semibold text-sm leading-tight truncate">
            ZIP 読込
          </span>
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
