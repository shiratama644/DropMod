'use client';

// -----------------------------------------------------------------------------
// BrowseBottomSheet (Phase 9.5-A、Phase 11 準備)
//
// BottomNav の「探す」ボタンを押した時に下から出てくる Sheet。
// Phase 11 で対応する 4 カテゴリ (Mods / Modpacks / ResourcePacks / Shaders)
// を大きなカードで選択させる。
//
// 各カード → `/mods?type=xxx` へ遷移。実際の facets 対応は Phase 11 で。
// (Phase 9.5 の時点では `type=mod` 以外は Modrinth 検索側で無視される)
// -----------------------------------------------------------------------------

import type React from 'react';
import Link from 'next/link';
import { BottomSheet } from './BottomSheet';

interface BrowseBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CategoryItem {
  id: 'mod' | 'modpack' | 'resourcepack' | 'shader';
  label: string;
  icon: string;
  href: string;
}

const CATEGORIES: readonly CategoryItem[] = [
  {
    id: 'mod',
    label: 'Mods',
    icon: 'fa-solid fa-cube',
    href: '/mods',
  },
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
}) => {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="カテゴリを選択"
      maxHeightClass="max-h-[60vh]"
    >
      <div className="space-y-2">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            href={cat.href}
            onClick={onClose}
            className="flex items-center gap-4 w-full px-5 py-4 rounded-2xl glass-card border-2 border-transparent hover:border-emerald-500/50 active:scale-[0.98] transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 theme-text-brand flex items-center justify-center text-xl shrink-0">
              <i className={cat.icon} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm sm:text-base">{cat.label}</div>
            </div>
            <i
              className="fa-solid fa-chevron-right theme-text-muted text-xs"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </BottomSheet>
  );
};
