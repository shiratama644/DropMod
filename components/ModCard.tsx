'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ModrinthHit, Profile } from '@/types';

interface ModCardProps {
  hit: ModrinthHit;
  profile: Profile;
  onOpenDetail: (id: string) => void;
  /**
   * 追加/削除トグル。AppShell 側の handleToggleMod は Promise を返すため
   * 戻り値は緩めに unknown で受ける (React イベントは戻り値を無視するため
   * ランタイム上は問題なし)。
   */
  onToggleMod: (id: string, e?: React.MouseEvent, silent?: boolean) => unknown;
}

function formatDownloads(num: number): string {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export const ModCard: React.FC<ModCardProps> = ({ hit, profile, onOpenDetail, onToggleMod }) => {
  const isAdded = profile.mods.some((m) => m.id === hit.project_id || m.slug === hit.slug);
  const displayCategory =
    (hit.display_categories && hit.display_categories[0]) ||
    (hit.categories && hit.categories[0]) ||
    'mod';

  // 画像読み込み失敗時にプレースホルダーへ差し替え (L-10)
  const [iconFailed, setIconFailed] = useState<boolean>(false);
  useEffect(() => {
    setIconFailed(false);
  }, [hit.icon_url]);
  const showIcon = hit.icon_url && !iconFailed;

  // H4-1 修正: <div onClick> → <Link href> に変更 (SEO/新規タブ対応)。
  // 詳細 URL は slug 優先 (人間可読)、fallback で project_id。
  const detailPath = `/mod/${hit.slug || hit.project_id}`;

  // 内側の追加/削除ボタン領域では Link 遷移をキャンセル (Vite 版の onClick
  // stopPropagation と同等挙動)。Link は preventDefault で遷移を止める。
  const stopLinkNav = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <Link
      href={detailPath}
      onClick={() => onOpenDetail(hit.project_id)}
      className="mod-card-item glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between space-y-3 cursor-pointer hover:border-emerald-500/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {showIcon && hit.icon_url ? (
              // H4-3 修正: <img> → next/image で WebP/AVIF 自動変換 + srcset
              <Image
                src={hit.icon_url}
                alt={hit.title}
                width={40}
                height={40}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain bg-slate-800/80 p-0.5 shadow-md shrink-0"
                onError={() => setIconFailed(true)}
                unoptimized={false}
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
        <p className="text-xs theme-text-muted line-clamp-2 leading-relaxed">
          {hit.description || '説明はありません。'}
        </p>
      </div>

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
