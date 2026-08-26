'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { ModrinthHit, Profile } from '@/types';
import {
  autoBannerHeightClass,
  autoCardSpanClass,
  modalPathFromProject,
  type SearchLayout
} from '@/lib/constants/search';
import { categoryLabel, primaryCategoryId } from '@/lib/constants/categories';
import { shouldUnoptimizeImage } from '@/lib/utils/image';

interface ModCardProps {
  hit: ModrinthHit;
  profile: Profile;
  /**
   * 追加/削除トグル。AppShell 側の handleToggleMod は Promise を返すため
   * 戻り値は緩めに unknown で受ける (React イベントは戻り値を無視するため
   * ランタイム上は問題なし)。
   */
  onToggleMod: (id: string, e?: React.MouseEvent, silent?: boolean) => unknown;
  layout?: SearchLayout;
}

function formatDownloads(num: number): string {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function clampClass(hit: ModrinthHit, layout: SearchLayout): string {
  if (layout === 'max') return 'line-clamp-3';
  if (layout === 'auto') {
    const len = hit.description?.length ?? 0;
    if (len > 180) return 'line-clamp-5';
    if (len > 90) return 'line-clamp-3';
    return 'line-clamp-2';
  }
  return 'line-clamp-2';
}

export const ModCard: React.FC<ModCardProps> = ({
  hit,
  profile,
  onToggleMod,
  layout = '3'
}) => {
  const isAdded = profile.mods.some(
    (m) => m.projectId === hit.project_id || m.slug === hit.slug
  );
  const displayCategory = categoryLabel(
    primaryCategoryId(hit.display_categories, hit.categories)
  );

  const [iconFailed, setIconFailed] = useState<boolean>(false);
  const [bannerFailed, setBannerFailed] = useState<boolean>(false);
  const [bannerAspect, setBannerAspect] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: icon_url 変更検知トリガーとして意図的
  useEffect(() => {
    setIconFailed(false);
  }, [hit.icon_url]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: featured_gallery 変更検知トリガーとして意図的
  useEffect(() => {
    setBannerFailed(false);
    setBannerAspect(null);
  }, [hit.featured_gallery]);
  const showIcon = hit.icon_url && !iconFailed;
  const showBanner =
    (layout === 'max' || layout === 'auto') &&
    Boolean(hit.featured_gallery) &&
    !bannerFailed;
  const forceBannerSlot = layout === 'max';
  const autoSpan =
    layout === 'auto'
      ? autoCardSpanClass({
          descriptionLength: hit.description?.length ?? 0,
          hasBanner: Boolean(hit.featured_gallery) && !bannerFailed,
          aspectRatio: bannerAspect
        })
      : '';
  const autoBannerHeight =
    layout === 'auto' ? autoBannerHeightClass(bannerAspect) : '';

  // 検索一覧のカード → プレビューモーダル (/discover/<複数>/<slug>)。
  // 一覧 (children) は Intercept で破棄されず、戻るで状態保持される。
  const detailPath = modalPathFromProject(
    hit.project_type,
    hit.slug || hit.project_id
  );

  const stopLinkNav = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <Link
      href={detailPath}
      className={`mod-card-item glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between space-y-3 cursor-pointer hover:border-emerald-500/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${autoSpan}`}
    >
      {forceBannerSlot && (
        <div className="relative -mx-3.5 -mt-3.5 sm:-mx-4 sm:-mt-4 h-28 sm:h-36 rounded-t-2xl overflow-hidden bg-gradient-to-br from-emerald-500/20 via-slate-800 to-slate-900">
          {showBanner && hit.featured_gallery ? (
            <Image
              src={hit.featured_gallery}
              alt=""
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
              unoptimized={shouldUnoptimizeImage(hit.featured_gallery)}
              onError={() => setBannerFailed(true)}
            />
          ) : showIcon && hit.icon_url ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Image
                src={hit.icon_url}
                alt=""
                width={72}
                height={72}
                className="w-16 h-16 rounded-2xl object-contain bg-slate-900/50 p-1 shadow-lg"
                onError={() => setIconFailed(true)}
                unoptimized={shouldUnoptimizeImage(hit.icon_url)}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center theme-text-brand">
              <i className="fa-solid fa-image text-3xl opacity-40" aria-hidden />
            </div>
          )}
        </div>
      )}
      {!forceBannerSlot && showBanner && hit.featured_gallery && (
        <div
          className={`relative -mx-3.5 -mt-3.5 sm:-mx-4 sm:-mt-4 rounded-t-2xl overflow-hidden ${
            layout === 'auto' ? autoBannerHeight : 'h-20'
          }`}
        >
          <Image
            src={hit.featured_gallery}
            alt=""
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            unoptimized={shouldUnoptimizeImage(hit.featured_gallery)}
            onError={() => setBannerFailed(true)}
            onLoad={(e) => {
              if (layout !== 'auto') return;
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setBannerAspect(img.naturalWidth / img.naturalHeight);
              }
            }}
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {showIcon && hit.icon_url ? (
              <Image
                src={hit.icon_url}
                alt={hit.title}
                width={40}
                height={40}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain bg-slate-800/80 p-0.5 shadow-md shrink-0"
                onError={() => setIconFailed(true)}
                unoptimized={shouldUnoptimizeImage(hit.icon_url)}
              />
            ) : (
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-slate-950 font-bold text-base sm:text-lg shadow-md shrink-0"
                aria-hidden="true"
              >
                <i className="fa-solid fa-cube"></i>
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm truncate" title={hit.title}>
                {hit.title}
              </h3>
              <div className="flex items-center gap-1.5 text-xs theme-text-muted">
                <span className="truncate">{hit.author || 'Modrinth'}</span>
                <span>•</span>
                <span>
                  <i className="fa-solid fa-download text-[10px] mr-0.5"></i>
                  {formatDownloads(hit.downloads)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <p className={`text-xs theme-text-muted leading-relaxed ${clampClass(hit, layout)}`}>
          {hit.description || '説明はありません。'}
        </p>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: <Link> バブル遮断 */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上 */}
      <div
        className="pt-2 border-t border-slate-500/10 flex items-center justify-between gap-2"
        onClick={stopLinkNav}
      >
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold theme-badge capitalize">
          {displayCategory}
        </span>

        {isAdded ? (
          <button
            type="button"
            onClick={(e) => {
              stopLinkNav(e);
              onToggleMod(hit.project_id, e);
            }}
            title="タップで削除"
            className="btn-hover-effect px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-500/20 theme-text-brand border border-emerald-500/40 text-xs font-bold hover:bg-red-500/20 hover:theme-text-red hover:border-red-500/40 transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-check"></i>
            <span>追加済み</span>
            <span className="ml-0.5 text-[10px] text-red-500 opacity-70 border-l border-emerald-500/40 pl-1.5"> ✕ 削除</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              stopLinkNav(e);
              onToggleMod(hit.project_id, e);
            }}
            className="btn-hover-effect px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-xs font-bold transition flex items-center gap-1 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-plus"></i> 追加
          </button>
        )}
      </div>
    </Link>
  );
};
