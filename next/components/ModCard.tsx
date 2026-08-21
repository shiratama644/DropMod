'use client';

import React, { useState, useEffect } from 'react';
import { ModrinthHit, Profile } from '@/types';

interface ModCardProps {
  hit: ModrinthHit;
  profile: Profile;
  onOpenDetail: (id: string) => void;
  onToggleMod: (id: string, e: React.MouseEvent) => void;
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
  // icon_url が変わったら失敗フラグをリセット (プロジェクトIDが同じで
  // icon だけ差し替わったケースで古い fallback が残るのを防ぐ)
  useEffect(() => {
    setIconFailed(false);
  }, [hit.icon_url]);
  const showIcon = hit.icon_url && !iconFailed;

  return (
    <div
      className="mod-card-item glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between space-y-3 cursor-pointer hover:border-emerald-500/40 transition"
      onClick={() => onOpenDetail(hit.project_id)}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {showIcon ? (
              <img
                src={hit.icon_url}
                alt={hit.title}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain bg-slate-800/80 p-0.5 shadow-md shrink-0"
                onError={() => setIconFailed(true)}
                loading="lazy"
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
        onClick={(e) => e.stopPropagation()}
      >
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold theme-badge capitalize">
          {displayCategory}
        </span>

        {isAdded ? (
          <button
            onClick={(e) => onToggleMod(hit.project_id, e)}
            title="タップで削除"
            className="btn-hover-effect px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-500/20 theme-text-brand border border-emerald-500/40 text-xs font-bold hover:bg-red-500/20 hover:theme-text-red hover:border-red-500/40 transition flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-check"></i>
            <span>追加済み</span>
            <span className="ml-0.5 text-[10px] text-red-500 opacity-70 border-l border-emerald-500/40 pl-1.5"> ✕ 削除</span>
          </button>
        ) : (
          <button
            onClick={(e) => onToggleMod(hit.project_id, e)}
            className="btn-hover-effect px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-xs font-bold transition flex items-center gap-1 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-plus"></i> 追加
          </button>
        )}
      </div>
    </div>
  );
};