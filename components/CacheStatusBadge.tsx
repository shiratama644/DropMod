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
  // B12 修正: SSR hydration mismatch 対策。
  //   従来 useState(() => Date.now()) では SSR 実行時刻 A ≠ client 実行時刻 B
  //   になり、hydration mismatch warning のリスク (実際は dataUpdatedAt=0 で
  //   非表示になるので発現しないが将来的リスク)。
  //   → useState(0) で SSR/client 両方 0 スタート、useEffect で client-side のみ
  //     Date.now() を tick。
  //
  // B13 修正: tick 間隔を動的化。
  //   従来 30 秒固定 → 「10 秒前 → 40 秒前」など label の遷移が最大 30 秒遅延
  //   → age に応じて動的に調整:
  //     - < 60 秒:      5 秒 tick (「X 秒前」の細かい表示)
  //     - < 1 時間:     30 秒 tick (「X 分前」表示、多少ずれても OK)
  //     - >= 1 時間:    5 分 tick (時間単位)
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    // SSR から client への hydration 完了後に初期時刻をセット
    setNow(Date.now());

    // 動的 interval: 現在の age に応じて次の tick 間隔を決定
    let timerId: ReturnType<typeof setTimeout>;
    const scheduleNextTick = () => {
      const ageMs = dataUpdatedAt > 0 ? Date.now() - dataUpdatedAt : 0;
      let interval = 30_000; // default 30s
      if (ageMs < 60_000) interval = 5_000;
      else if (ageMs < 60 * 60_000) interval = 30_000;
      else interval = 5 * 60_000;
      timerId = setTimeout(() => {
        setNow(Date.now());
        scheduleNextTick();
      }, interval);
    };
    scheduleNextTick();

    return () => clearTimeout(timerId);
  }, [dataUpdatedAt]);

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
