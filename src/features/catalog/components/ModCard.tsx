'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { MuiLink as Link } from '@/components/ui/MuiLink';
import Image from 'next/image';
import type { ModrinthHit, Profile } from '@/types';
import { modalPathFromProject, type SearchLayout } from '@/lib/constants/search';
import { categoryLabel, primaryCategoryId } from '../constants/categories';
import { shouldUnoptimizeImage } from '@/lib/utils/image';
import { useIsMobile } from '@/hooks/useMediaQuery';

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
  void hit;
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: icon_url 変更検知トリガーとして意図的
  useEffect(() => {
    setIconFailed(false);
  }, [hit.icon_url]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: featured_gallery 変更検知トリガーとして意図的
  useEffect(() => {
    setBannerFailed(false);
  }, [hit.featured_gallery]);
  const showIcon = hit.icon_url && !iconFailed;
  const showBanner =
    layout === 'max' && Boolean(hit.featured_gallery) && !bannerFailed;

  // モバイルの 3 カラムは独自の compact カード (Modrinth のグリッド卡片風)。
  // スマホでも 3 カラム表示するため、PC 版カードを縮小しただけでは
  // 情報が潰れる → アイコン + タイトル + 追加ボタンのみの最小構成にする。
  const isMobile = useIsMobile();
  const compact = layout === '3' && isMobile;

  // モバイルの 2 カラムはカード幅が狭く作者名が圧縮・折り返しで潰れるため、
  // ダウンロード数のみ表示する (2026-08-27 ユーザー指定)。
  // PC の 2 カラム・モバイルの max/1 カラムは幅に余裕があるので作者も出す。
  // (compact 3 カラムは元々 DL 数のみのため対象外)
  const showAuthor = !(layout === '2' && isMobile);

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

  const handleToggle = (e: React.MouseEvent) => {
    stopLinkNav(e);
    onToggleMod(hit.project_id, e);
  };

  // -----------------------------------------------------------------
  // モバイル 3 カラム compact カード
  // -----------------------------------------------------------------
  if (compact) {
    return (
      <Link
        href={detailPath}
        className="mod-card-item glass-card rounded-xl p-1.5 flex flex-col gap-1.5 cursor-pointer hover:border-emerald-500/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-slate-800/80 shrink-0">
          {showIcon && hit.icon_url ? (
            <Image
              src={hit.icon_url}
              alt={hit.title}
              fill
              sizes="(max-width: 767px) 33vw, 120px"
              className="object-contain p-1"
              onError={() => setIconFailed(true)}
              unoptimized={shouldUnoptimizeImage(hit.icon_url)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center theme-text-brand">
              <i className="fa-solid fa-cube text-2xl opacity-50" aria-hidden />
            </div>
          )}
        </div>
        <h3
          className="text-[11px] font-bold leading-snug line-clamp-2 min-h-[2.6em]"
          title={hit.title}
        >
          {hit.title}
        </h3>
        <div className="text-[10px] theme-text-muted flex items-center gap-1">
          <i className="fa-solid fa-download text-[9px]" aria-hidden />
          <span className="truncate">{formatDownloads(hit.downloads)}</span>
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: <Link> バブル遮断 */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上 */}
        <div onClick={stopLinkNav}>
          {isAdded ? (
            <button
              type="button"
              onClick={handleToggle}
              title="プロファイルから削除"
              aria-label="プロファイルから削除"
              className="w-full h-7 rounded-lg bg-red-500/20 theme-text-red border border-red-500/40 hover:bg-red-500/30 text-[10px] font-bold transition inline-flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95"
            >
              <i key="on" className="fa-solid fa-trash-can icon-swap" aria-hidden />
              削除
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggle}
              aria-label="プロファイルに追加"
              className="w-full h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[10px] font-bold shadow transition inline-flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95"
            >
              <i key="off" className="fa-solid fa-plus icon-swap" aria-hidden />
              追加
            </button>
          )}
        </div>
      </Link>
    );
  }

  // -----------------------------------------------------------------
  // 標準カード (PC 全レイアウト / モバイルの max・1・2 カラム)
  // -----------------------------------------------------------------
  return (
    <Link
      href={detailPath}
      className="mod-card-item glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between space-y-3 cursor-pointer hover:border-emerald-500/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      {layout === 'max' && (
        // 「最大」: ヘッダー画像を大きく表示 (2026-08-27: h-28/sm:h-36 →
        // h-44/sm:h-60 に拡大。Card 全体がヘッダー主導のレイアウトになる)
        <div className="relative -mx-3.5 -mt-3.5 sm:-mx-4 sm:-mt-4 h-44 sm:h-60 rounded-t-2xl overflow-hidden bg-gradient-to-br from-emerald-500/20 via-slate-800 to-slate-900">
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
                width={96}
                height={96}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-contain bg-slate-900/50 p-1 shadow-lg"
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
                {showAuthor && (
                  <>
                    <span className="truncate">{hit.author || 'Modrinth'}</span>
                    <span>•</span>
                  </>
                )}
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
        {/* バッジは狭いカード (モバイル 2 カラム等) で途切れる余地を持たせる。
            追加ボタンを優先して全体を表示し、右寄せで配置する。 */}
        <span className="min-w-0 truncate px-2 py-0.5 rounded-lg text-[10px] font-semibold theme-badge capitalize">
          {displayCategory}
        </span>

        {/* 追加状態でカード寸法が変わらないよう、両ボタンを同寸 (h-9・min-w) に統一。
            2026-08-27: 追加済みは「追加済み」表示から削除操作のトグルボタン
            (赤枠 + 削除) に変更。詳細モーダル / 詳細ページの 削除 ボタンと
            同じ色・アイコンで統一 (緑の塗りは主操作=追加のみ)。 */}
        {isAdded ? (
          <button
            type="button"
            onClick={handleToggle}
            title="プロファイルから削除"
            aria-label="プロファイルから削除"
            className="btn-hover-effect shrink-0 h-8 sm:h-9 min-w-0 sm:min-w-[7rem] px-2 sm:px-3 rounded-xl bg-red-500/20 theme-text-red border border-red-500/40 hover:bg-red-500/30 text-[10px] sm:text-xs font-bold transition inline-flex items-center justify-center gap-1 sm:gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95"
          >
            <i key="on" className="fa-solid fa-trash-can icon-swap" aria-hidden />
            <span>削除</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleToggle}
            aria-label="プロファイルに追加"
            className="btn-hover-effect shrink-0 h-8 sm:h-9 min-w-0 sm:min-w-[7rem] px-2 sm:px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-[10px] sm:text-xs font-bold transition inline-flex items-center justify-center gap-1 sm:gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95"
          >
            <i key="off" className="fa-solid fa-plus icon-swap" aria-hidden />
            <span>追加</span>
          </button>
        )}
      </div>
    </Link>
  );
};
