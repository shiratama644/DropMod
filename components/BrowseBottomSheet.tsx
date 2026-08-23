'use client';

// -----------------------------------------------------------------------------
// BrowseBottomSheet (Phase 9.5-A → 9.5-D で 2 カラム + 小型化)
//
// BottomNav の「探す」ボタン用 Sheet。Phase 11 で対応する 4 カテゴリ
// (Mods / Modpacks / ResourcePacks / Shaders) を 2×2 grid でコンパクトに配置。
//
// 各ボタン → `/mods?type=xxx` へ遷移。
//
// 【9.5-D 変更点】(ユーザー要望):
//   - 縦積み大型ボタン → 2 カラム grid + 小型ボタン
//   - 右矢印 chevron 削除 (小さくするため)
//   - z-index / onCloseAnimationComplete などの props を親から受け取り、
//     Sheet 重ね置き対応
// -----------------------------------------------------------------------------

import type React from 'react';
import Link from 'next/link';
import { BottomSheet } from './BottomSheet';

interface BrowseBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCloseAnimationComplete?: () => void;
  zIndexClass?: string;
}

interface CategoryItem {
  id: 'mod' | 'modpack' | 'resourcepack' | 'shader';
  label: string;
  icon: string;
  href: string;
}

const CATEGORIES: readonly CategoryItem[] = [
  { id: 'mod', label: 'Mods', icon: 'fa-solid fa-cube', href: '/mods' },
  {
    id: 'modpack',
    label: 'Modpacks',
    icon: 'fa-solid fa-boxes-stacked',
    href: '/mods?type=modpack',
  },
  {
    id: 'resourcepack',
    label: 'Resource Packs',
    icon: 'fa-solid fa-palette',
    href: '/mods?type=resourcepack',
  },
  {
    id: 'shader',
    label: 'Shaders',
    icon: 'fa-solid fa-wand-sparkles',
    href: '/mods?type=shader',
  },
];

export const BrowseBottomSheet: React.FC<BrowseBottomSheetProps> = ({
  isOpen,
  onClose,
  onCloseAnimationComplete,
  zIndexClass,
}) => {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      onCloseAnimationComplete={onCloseAnimationComplete}
      ariaLabel="カテゴリを選択"
      maxHeightClass="max-h-[45vh]"
      zIndexClass={zIndexClass}
    >
      <div className="grid grid-cols-2 gap-2.5">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            href={cat.href}
            onClick={onClose}
            className="flex flex-col items-center justify-center gap-1.5 px-3 py-3.5 rounded-xl glass-card border border-transparent hover:border-emerald-500/50 active:scale-[0.97] transition focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[76px]"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 theme-text-brand flex items-center justify-center text-base shrink-0">
              <i className={cat.icon} aria-hidden />
            </div>
            <div className="font-semibold text-xs text-center leading-tight">
              {cat.label}
            </div>
          </Link>
        ))}
      </div>
    </BottomSheet>
  );
};
