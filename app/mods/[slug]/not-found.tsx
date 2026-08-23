// -----------------------------------------------------------------------------
// /mods/[slug] 404 ページ (Phase 9-F: URL 再設計で旧 /mod/[slug] から移動)
//
// Modrinth に存在しない slug (削除・改名・タイポ) を直接開いた場合の表示。
// -----------------------------------------------------------------------------

import Link from 'next/link';

export default function ModNotFound() {
  return (
    <main className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 pt-12 flex-1 w-full text-center">
      <div className="glass-panel rounded-3xl p-8 sm:p-12 border shadow-xl space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 theme-text-amber flex items-center justify-center mx-auto text-3xl">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden />
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold">Mod が見つかりません</h1>
        <p className="text-xs sm:text-sm theme-text-muted max-w-md mx-auto break-words">
          指定された Mod は Modrinth に存在しないか、削除された可能性があります。
        </p>
        <div>
          <Link
            href="/discover/mods"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            Mod 一覧に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
