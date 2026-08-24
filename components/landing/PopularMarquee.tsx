'use client';

// -----------------------------------------------------------------------------
// PopularMarquee (Phase 9.5-F)
//
// 人気 Mod を横方向に無限スクロール表示 (Modrinth 風、独自デザイン)。
// CSS keyframes で `translateX` を無限ループ。Reduced Motion 環境では停止。
//
// 実装ポイント:
//   - 同じリストを 2 回連続で render し、-50% までスクロールしたら初期位置に
//     リセット (継ぎ目のない無限スクロール)
//   - CSS animation を使う (JS で毎フレーム更新しない、GPU 加速)
//   - hover で pause (視認性のため)
//   - Reduced Motion: JS 側で判定し、animation inline style を付けない
//     (CSS で inline style を上書きするには !important が必要になるため回避)
// -----------------------------------------------------------------------------

import type React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { shouldUnoptimizeImage } from '@/lib/utils/image';
import type { ModrinthHit } from '@/types';

interface PopularMarqueeProps {
  hits: ModrinthHit[];
  /** アニメ 1 周の秒数 (default 40) */
  durationSec?: number;
  ariaLabel?: string;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  return reduced;
}

export const PopularMarquee: React.FC<PopularMarqueeProps> = ({
  hits,
  durationSec = 40,
  ariaLabel = '新着の Mod',
}) => {
  const reduced = usePrefersReducedMotion();

  if (hits.length === 0) return null;

  return (
    // Phase 9.5-F (a11y): role="region" の推奨は <section>。SR は同等に landmark 認識。
    <section
      aria-label={ariaLabel}
      className="relative overflow-hidden"
      style={{
        maskImage:
          'linear-gradient(to right, transparent 0, black 6%, black 94%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0, black 6%, black 94%, transparent 100%)',
      }}
    >
      {/*
        marquee-track class + @keyframes は app/globals.css で定義済み
        (hover pause / durationSec は inline style で個別指定)。
        Reduced Motion 環境では animation inline style を付けず静止。
      */}
      <div
        className="flex gap-3 sm:gap-4 marquee-track w-max"
        style={
          reduced
            ? undefined
            : { animation: `marquee-scroll ${durationSec}s linear infinite` }
        }
      >
        {hits.map((hit) => (
          <MarqueeCard hit={hit} key={`front-${hit.project_id}`} />
        ))}
        {/* 2 周目 (無限ループの継ぎ目回避のため同リストを再 render) */}
        {hits.map((hit) => (
          <MarqueeCard hit={hit} key={`back-${hit.project_id}`} />
        ))}
      </div>
    </section>
  );
};

function MarqueeCard({ hit }: { hit: ModrinthHit }) {
  const detailPath = `/mods/${hit.slug || hit.project_id}`;
  const title = hit.title || '(名称未設定)';
  const description = hit.description || '';

  return (
    <Link
      href={detailPath}
      className="shrink-0 w-64 sm:w-72 glass-card rounded-2xl p-3.5 border hover:border-emerald-500/50 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-slate-800/80 flex items-center justify-center shrink-0 overflow-hidden border border-slate-700/50 relative">
          {hit.icon_url ? (
            <Image
              src={hit.icon_url}
              alt=""
              width={44}
              height={44}
              className="w-full h-full object-contain rounded-lg"
              unoptimized={shouldUnoptimizeImage(hit.icon_url)}
            />
          ) : (
            <i className="fa-solid fa-cube text-lg theme-text-brand" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate">{title}</div>
          <div className="text-xs theme-text-muted truncate">
            by {hit.author || 'Modrinth'}
          </div>
        </div>
      </div>
      {description && (
        <p className="mt-2.5 text-xs theme-text-muted line-clamp-2 leading-relaxed">
          {description}
        </p>
      )}
    </Link>
  );
}
