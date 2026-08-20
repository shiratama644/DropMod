// ============================================================================
// Home ページ プレースホルダ (Phase 1)
//
// Phase 3 で ISR + 実データ (Modrinth 検索結果) に差し替えます。
// 現段階は Next.js 骨組みが動くことの確認用。
// ============================================================================

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-4">
      <h1 className="text-4xl font-extrabold tracking-tight theme-text-brand">
        DropMod
      </h1>
      <p className="text-sm theme-text-muted">
        Next.js 15 (Phase 1: 骨組み) &mdash; まもなく Home ページに差し替わります
      </p>
      <div className="mt-6 flex gap-3 text-xs theme-text-muted">
        <span className="px-3 py-1 rounded-full theme-sub-box">
          Next.js 16 + App Router
        </span>
        <span className="px-3 py-1 rounded-full theme-sub-box">React 19</span>
        <span className="px-3 py-1 rounded-full theme-sub-box">Tailwind 4</span>
      </div>
    </main>
  );
}
