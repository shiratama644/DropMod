// -----------------------------------------------------------------------------
// /mods/[slug] streaming fallback (Phase 10-P1: 新詳細ページ用スケルトン)
//
// Phase 9-F までは中央寄せカードのスケルトンだったが、Phase 10-P1 で
// フルページを ヒーロー + 2カラム 構成に刷新したため、それに合わせて
// スケルトンも「Hero → 統計 → 本文 + サイドバー」のシルエットに更新。
// -----------------------------------------------------------------------------

export default function ModDetailLoading() {
  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-8 flex-1 w-full">
      {/* パンくず */}
      <div className="mb-4">
        <div className="h-4 w-32 bg-slate-700/30 rounded animate-pulse" />
      </div>

      {/* Hero */}
      <div className="glass-panel rounded-3xl border shadow-xl overflow-hidden mb-4 animate-pulse">
        <div className="p-5 sm:p-8 flex flex-col md:flex-row gap-5 md:gap-7">
          <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl bg-slate-700/50 shrink-0" />
          <div className="flex-1 space-y-3 min-w-0">
            <div className="h-8 sm:h-10 bg-slate-700/50 rounded w-3/4" />
            <div className="h-4 bg-slate-700/30 rounded w-1/3" />
            <div className="h-4 bg-slate-700/30 rounded w-full max-w-2xl" />
            <div className="h-4 bg-slate-700/30 rounded w-4/5 max-w-2xl" />
            <div className="flex gap-2 pt-2">
              <div className="h-6 w-20 bg-slate-700/40 rounded-lg" />
              <div className="h-6 w-16 bg-slate-700/40 rounded-lg" />
              <div className="h-6 w-24 bg-slate-700/40 rounded-lg" />
            </div>
            <div className="flex gap-2 pt-3">
              <div className="h-10 w-36 bg-emerald-700/40 rounded-xl" />
              <div className="h-10 w-28 bg-blue-700/40 rounded-xl" />
            </div>
          </div>
        </div>
        {/* 統計 4 セル */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-500/20 border-t border-slate-500/20">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="theme-sub-box px-4 py-3 space-y-2">
              <div className="h-3 w-16 bg-slate-700/40 rounded" />
              <div className="h-4 w-20 bg-slate-700/50 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* 2 カラム */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 animate-pulse">
        {/* 本文 */}
        <div className="space-y-4 min-w-0">
          <div className="glass-panel rounded-3xl border shadow-lg p-5 sm:p-8 space-y-3">
            <div className="h-5 w-32 bg-slate-700/40 rounded" />
            <div className="h-3 bg-slate-700/30 rounded w-full" />
            <div className="h-3 bg-slate-700/30 rounded w-11/12" />
            <div className="h-3 bg-slate-700/30 rounded w-4/5" />
            <div className="h-3 bg-slate-700/30 rounded w-3/4" />
            <div className="h-40 bg-slate-700/30 rounded-2xl" />
          </div>
        </div>
        {/* サイドバー */}
        <div className="space-y-4 min-w-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="glass-panel rounded-2xl border shadow-md p-4 sm:p-5 space-y-2"
            >
              <div className="h-3 w-20 bg-slate-700/40 rounded" />
              <div className="h-3 bg-slate-700/30 rounded w-full" />
              <div className="h-3 bg-slate-700/30 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
