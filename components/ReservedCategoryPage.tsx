import Link from 'next/link';

export interface ReservedCategoryPageProps {
  title: string;
  icon: string;
  /** `/discover/*` の検索フォールバック */
  searchType: 'modpack' | 'resourcepack' | 'shader';
  phaseLabel: 'Phase 11' | 'Phase 12';
  description: string;
}

/**
 * `/modpack` `/resourcepack` `/shader` の予約ページ。
 * 本実装は Phase 11 / 12。今は 404 にせずハブとして残す。
 */
export function ReservedCategoryPage({
  title,
  icon,
  searchType,
  phaseLabel,
  description
}: ReservedCategoryPageProps) {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-16 flex-1 w-full">
      <div className="glass-panel rounded-3xl border p-6 sm:p-10 text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 theme-text-brand flex items-center justify-center text-2xl">
          <i className={`fa-solid ${icon}`} aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider theme-text-muted">
            {`${phaseLabel} で本実装`}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-sm theme-text-muted leading-relaxed max-w-xl mx-auto">
            {description}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row justify-center gap-2.5 pt-2">
          <Link
            href={`/discover/${searchType}`}
            className="btn-hover-effect inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-sm font-bold shadow-lg shadow-emerald-600/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <span>Modrinth で探す</span>
          </Link>
          <Link
            href="/"
            className="btn-hover-effect inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl glass-card theme-text-brand border border-emerald-500/30 text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            ホームへ
          </Link>
        </div>
      </div>
    </main>
  );
}
