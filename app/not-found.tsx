// -----------------------------------------------------------------------------
// L4-1 修正: グローバル 404 ページ (日本語化)
//
// /nonexistent など全ページのマッチしない URL に対する Next.js デフォルト 404
// (英語) を、日本語カスタム UI に置換。
// `app/mod/[slug]/not-found.tsx` は Mod 詳細専用なのでこちらは全般用。
// -----------------------------------------------------------------------------

import Link from 'next/link';

export const metadata = {
  title: 'ページが見つかりません',
  description: '指定された URL のページは存在しません。'
};

export default function NotFound() {
  return (
    <main className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 pt-12 flex-1 w-full text-center">
      <div className="glass-panel rounded-3xl p-8 sm:p-12 border shadow-xl space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 theme-text-amber flex items-center justify-center mx-auto text-3xl">
          <i className="fa-solid fa-map-location-dot" aria-hidden />
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold">ページが見つかりません (404)</h1>
        <p className="text-xs sm:text-sm theme-text-muted max-w-md mx-auto break-words">
          お探しの URL のページは存在しないか、URL が変更・削除された可能性があります。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-house" aria-hidden />
            ホームに戻る
          </Link>
          <Link
            href="/mods"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-cubes" aria-hidden />
            選択中の Mod
          </Link>
        </div>
      </div>
    </main>
  );
}
