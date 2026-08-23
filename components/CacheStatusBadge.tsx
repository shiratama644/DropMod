'use client';

/**
 * CacheStatusBadge (Phase 9-E.1: E-2 実装)
 *
 * TanStack Query の結果に対して「キャッシュヒットで即座に返された」ことを
 * ユーザーに可視化する。
 *
 * 表示ルール:
 *   1. isFetching=true      → 🔄 「取得中…」 (青系、pulse)
 *   2. dataUpdatedAt が現在時刻 (<10s)  → 🌐 「今取得」 (緑系)
 *   3. dataUpdatedAt が古い (>=10s)    → 🌐 「X分前のキャッシュ」/「X秒前のキャッシュ」 (グレー系)
 *   4. dataUpdatedAt が 0 / null       → 何も表示しない
 *
 * デザインは既存の theme-badge クラスと同系統の淡色バッジ。
 * 極小 (px-2 py-0.5 text-[10px]) でヘッダ 1 行の右寄せに邪魔にならない位置に置く。
 */

import React, { useEffect, useState } from 'react';

interface CacheStatusBadgeProps {
  /** TanStack Query の dataUpdatedAt (ms epoch)、0 の場合は未取得 */
  dataUpdatedAt: number;
  /** TanStack Query の isFetching */
  isFetching: boolean;
  /** 追加 className (右寄せの余白等) */
  className?: string;
}

const FRESH_WINDOW_MS = 10 * 1000; // 10 秒以内は「今取得」扱い

/** 秒 or 分単位の相対時間 (X分前) */
function formatRelative(ageMs: number): string {
  if (ageMs < 60 * 1000) {
    const s = Math.max(1, Math.floor(ageMs / 1000));
    return `${s}秒前`;
  }
  if (ageMs < 60 * 60 * 1000) {
    const m = Math.floor(ageMs / (60 * 1000));
    return `${m}分前`;
  }
  const h = Math.floor(ageMs / (60 * 60 * 1000));
  return `${h}時間前`;
}

export const CacheStatusBadge: React.FC<CacheStatusBadgeProps> = ({
  dataUpdatedAt,
  isFetching,
  className = ''
}) => {
  // ⚠️ Date.now() を render 中に直接呼ぶと React 19 の react-hooks/impurity で
  //   検出される (render は pure でなければならない)。
  //   → useState + useEffect(setInterval) で「now を 30 秒ごとに tick する
  //     state 値」として扱う。tick が実際の再描画差を生むのは
  //     「X 秒前 → (X+30) 秒前」に切り替わるタイミングのみで十分。
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // 未取得は非表示
  if (!dataUpdatedAt && !isFetching) return null;

  if (isFetching) {
    return (
      <span
        aria-live="polite"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono theme-sub-box theme-text-brand animate-pulse ${className}`}
        title="Modrinth から取得中"
      >
        <i className="fa-solid fa-rotate fa-spin text-[9px]" aria-hidden />
        <span>取得中…</span>
      </span>
    );
  }

  const ageMs = Math.max(0, now - dataUpdatedAt);
  const isFresh = ageMs < FRESH_WINDOW_MS;

  if (isFresh) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 theme-text-brand border border-emerald-500/25 ${className}`}
        title="Modrinth から取得したての最新データ"
      >
        <i className="fa-solid fa-globe text-[9px]" aria-hidden />
        <span>今取得</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono theme-sub-box theme-text-muted ${className}`}
      title="TanStack Query / Dexie のキャッシュから即座に返されたデータ"
    >
      <i className="fa-solid fa-database text-[9px]" aria-hidden />
      <span>{formatRelative(ageMs)}のキャッシュ</span>
    </span>
  );
};
