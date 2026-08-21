// ============================================================================
// Home ページ プレースホルダ (Phase 2 版)
//
// Phase 3 で ISR + 実データ (Modrinth 検索結果) に差し替えます。
// 現段階は Phase 2 で移植した AppShell / Toast / Confirm / Header /
// BottomNav / モーダル群のうち、Server Component で描画可能な部分を
// 使い、Vite 版と同じ視覚テーマ (glass-panel / theme-* クラス) が
// 反映されていることを確認するためのショーケースです。
// ============================================================================

export default function HomePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 w-full">
      <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-4 border border-emerald-500/20 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="logo-icon w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-slate-950 font-black shadow-lg ring-1 ring-white/30">
            <i className="fa-solid fa-cube text-xl" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">DropMod</h1>
            <p className="text-xs theme-text-muted">
              Phase 2 完了 — 共通コンポーネント移植済み
            </p>
          </div>
        </div>

        <div className="border-t border-slate-500/20 pt-4 space-y-2">
          <p className="text-sm theme-text-secondary leading-relaxed">
            Phase 2 では以下を移植しました:
          </p>
          <ul className="text-xs theme-text-muted list-disc pl-5 space-y-1 font-mono">
            <li>types.ts / constants / utils</li>
            <li>hooks: useToasts / useConfirm / useModalA11y</li>
            <li>Header / BottomNav / Toast / Confirm / モーダル群 10 個</li>
            <li>lib/modrinth/client.ts (旧 services/api.ts)</li>
            <li>AppShell (Toast + Confirm + theme を統合する Client Shell)</li>
          </ul>
        </div>

        <div className="border-t border-slate-500/20 pt-4 flex flex-wrap gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 theme-text-brand border border-emerald-500/30">
            Next.js 16 + App Router
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 theme-text-blue border border-blue-500/30">
            React 19
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 theme-text-amber border border-amber-500/30">
            Tailwind 4
          </span>
        </div>

        <div className="border-t border-slate-500/20 pt-4">
          <p className="text-xs theme-text-muted">
            <i className="fa-solid fa-arrow-right theme-text-brand mr-1" aria-hidden />
            次: Phase 3 — Route Handlers + Home ページ ISR (初期 24 件を SSR)
          </p>
        </div>
      </div>
    </main>
  );
}
