// -----------------------------------------------------------------------------
// M4-4 修正: Intercepting Modal ISR MISS 時の Suspense fallback (スケルトン)
//
// Home でクリック直後、キャッシュ MISS 時に RSC ペイロード fetch (通常 200-500ms)
// を待つ間の無音を回避。モーダル外枠 (fixed inset-0 + backdrop) 込みの skeleton
// を返してユーザーに「モーダルを開こうとしている」ことを可視化する。
// -----------------------------------------------------------------------------

export default function InterceptedModLoading() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      aria-hidden="true"
    >
      <div className="modal-card glass-panel w-full max-w-3xl rounded-3xl border shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden animate-pulse">
        {/* ヘッダ skeleton */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-500/20 p-4 sm:p-6 pb-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-slate-700/50 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 bg-slate-700/50 rounded w-3/4" />
              <div className="h-3 bg-slate-700/30 rounded w-1/2" />
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-700/30 shrink-0" />
        </div>

        {/* コンテンツ skeleton */}
        <div className="flex-1 p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="h-14 bg-slate-700/30 rounded-xl" />
            <div className="h-14 bg-slate-700/30 rounded-xl" />
            <div className="h-14 bg-slate-700/30 rounded-xl col-span-2 sm:col-span-1" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-slate-700/30 rounded w-1/3" />
            <div className="h-32 bg-slate-700/30 rounded-2xl" />
          </div>
        </div>

        {/* フッタ skeleton */}
        <div className="flex justify-end gap-2 p-4 sm:p-6 pt-3 border-t border-slate-500/20 shrink-0">
          <div className="h-8 w-20 bg-slate-700/30 rounded-xl" />
          <div className="h-8 w-32 bg-slate-700/30 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
