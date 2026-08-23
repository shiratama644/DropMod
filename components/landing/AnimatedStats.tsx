'use client';

// -----------------------------------------------------------------------------
// AnimatedStats (Phase 9.5-C)
//
// Stats Counter セクションの 3 個の数字カード。
// IntersectionObserver + Anime.js で 0 → 目標値までカウントアップ。
//
// カード内容 (計画書 §3.1 §3.3):
//   - 100,000+ (Modrinth Mod にアクセス)
//   - 4       (Loader 対応)
//   - 100%    (オフライン対応)
//
// %/+ の suffix は useCountUp の value を render 側で整形して表示。
// -----------------------------------------------------------------------------

import { useCountUp } from '@/hooks/useCountUp';

interface StatItem {
  end: number;
  format: (n: number) => string;
  label: string;
  icon: string;
}

const STATS: readonly StatItem[] = [
  {
    end: 100_000,
    // 100000 → "100k+"、途中経過も "80k+" 等で見せる
    format: (n) => {
      if (n >= 1000) return `${Math.floor(n / 1000)}k+`;
      return `${n}+`;
    },
    label: 'Modrinth Mod にアクセス',
    icon: 'fa-cube'
  },
  {
    end: 4,
    format: (n) => `${n}`,
    label: 'Loader 対応',
    icon: 'fa-code-branch'
  },
  {
    end: 100,
    format: (n) => `${n}%`,
    label: 'オフライン対応 (IndexedDB)',
    icon: 'fa-wifi'
  }
];

export function AnimatedStats() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
      {STATS.map((stat, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 固定 3 要素の module-level 定数、再順序化なし
        <AnimatedStatCard key={i} stat={stat} />
      ))}
    </div>
  );
}

function AnimatedStatCard({ stat }: { stat: StatItem }) {
  const { ref, value } = useCountUp<HTMLDivElement>({
    end: stat.end,
    duration: 1500,
    threshold: 0.4
  });
  return (
    <div
      ref={ref}
      className="glass-card rounded-2xl p-6 sm:p-8 text-center border"
    >
      <div className="w-12 h-12 rounded-xl bg-emerald-500/15 theme-text-brand flex items-center justify-center mx-auto text-xl mb-4">
        <i className={`fa-solid ${stat.icon}`} aria-hidden />
      </div>
      <div className="font-extrabold text-3xl sm:text-4xl theme-text-brand mb-2 font-mono">
        {stat.format(value)}
      </div>
      <div className="text-xs sm:text-sm theme-text-muted">{stat.label}</div>
    </div>
  );
}
