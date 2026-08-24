'use client';

// -----------------------------------------------------------------------------
// PreviewCard (Phase 9.5-F)
//
// LP の Inline 検索プレビュー用 (6 件表示)。
// 既存 ModCard は Profile 依存 + isAdded 判定などがあり重いので、LP 用に
// シンプルな読み取り専用カードを分離。
// -----------------------------------------------------------------------------

import type React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { shouldUnoptimizeImage } from '@/lib/utils/image';
import type { ModrinthHit } from '@/types';

interface PreviewCardProps {
  hit: ModrinthHit;
}

function formatDownloads(num: number): string {
  if (!num) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export const PreviewCard: React.FC<PreviewCardProps> = ({ hit }) => {
  const detailPath = `/mods/${hit.slug || hit.project_id}`;
  const title = hit.title || '(名称未設定)';
  const description = hit.description || '';

  return (
    <Link
      href={detailPath}
      data-reveal-item
      className="glass-card rounded-2xl p-4 sm:p-5 space-y-3 border hover:border-emerald-500/40 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center shrink-0 overflow-hidden border border-slate-700/50 relative">
          {hit.icon_url ? (
            <Image
              src={hit.icon_url}
              alt=""
              width={48}
              height={48}
              className="w-full h-full object-contain rounded-lg"
              unoptimized={shouldUnoptimizeImage(hit.icon_url)}
            />
          ) : (
            <i
              className="fa-solid fa-cube text-xl theme-text-brand"
              aria-hidden
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm sm:text-base truncate">
            {title}
          </div>
          <div className="text-xs theme-text-muted truncate">
            by {hit.author || 'Modrinth'}
          </div>
        </div>
      </div>
      {description && (
        <p className="text-xs sm:text-sm theme-text-muted line-clamp-2 leading-relaxed">
          {description}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-500/10 text-xs theme-text-muted">
        <span className="inline-flex items-center gap-1">
          <i className="fa-solid fa-download text-[10px]" aria-hidden />
          <span className="font-mono">{formatDownloads(hit.downloads)}</span>
        </span>
        <span className="theme-text-brand font-semibold">詳細 →</span>
      </div>
    </Link>
  );
};
