// -----------------------------------------------------------------------------
// /mod/[slug] streaming fallback (Suspense boundary)
//
// RSC 側で fetch が完了するまでの間、シンプルなスケルトンを描画する。
// Modrinth API がレイテンシー高めの時 (地域によっては 400ms 超) に UX を担保。
// -----------------------------------------------------------------------------

export default function ModDetailLoading() {
  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <div className="mb-3">
        <div className="h-4 w-24 bg-slate-700/30 rounded animate-pulse" />
      </div>

      <div className="modal-card glass-panel w-full max-w-3xl mx-auto rounded-3xl border shadow-2xl relative flex flex-col overflow-hidden animate-pulse">
        <div className="flex items-start justify-between gap-3 border-b border-slate-500/20 p-4 sm:p-6 pb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-slate-700/50 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 bg-slate-700/50 rounded w-3/4" />
              <div className="h-3 bg-slate-700/30 rounded w-1/2" />
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="h-14 bg-slate-700/30 rounded-xl" />
            <div className="h-14 bg-slate-700/30 rounded-xl" />
            <div className="h-14 bg-slate-700/30 rounded-xl col-span-2 sm:col-span-1" />
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-slate-700/30 rounded w-1/3" />
            <div className="h-40 bg-slate-700/30 rounded-2xl" />
          </div>
        </div>
      </div>
    </main>
  );
}
