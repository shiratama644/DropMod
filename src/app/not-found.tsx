// -----------------------------------------------------------------------------
// グローバル 404 ページ (2026-08-27 リニューアル)
//
// Modrinth / GitHub の 404 を参考にした構成:
//   - アイコンイラスト (Minecraft の「missing texture」ブロック = マゼンタ×黒
//     チェッカー。「存在しないもの」を示す Minecraft 界隈の定番ビジュアル)
//   - 大きな 404 + 簡潔なメッセージ (GitHub 風)
//   - 明確な CTA 2 択 (Modrinth 風): 補助 (Mod を探す) → 主操作 (ホームに戻る・緑)
//
// アニメーション (globals.css の not-found-* キーフレーム):
//   - カード・テキスト・CTA の順に 0.08s 差でフェードイン上昇 (nf-rise)
//   - ブロックがゆっくり浮遊 (nf-float、prefers-reduced-motion で停止)
//
// 全ルートの notFound() (不明な URL / 存在しない slug 等) がここを表示する。
// Server Component のまま (Client JS 不要)。
// -----------------------------------------------------------------------------

import Link from 'next/link';

export const metadata = {
  title: 'ページが見つかりません (404)',
  description: '指定された URL のページは存在しません。'
};

export default function NotFound() {
  return (
    <main className="max-w-xl mx-auto px-3 sm:px-6 pt-10 sm:pt-16 flex-1 w-full">
      <div className="not-found-rise glass-panel rounded-3xl border shadow-xl px-5 sm:px-8 py-10 sm:py-14 flex flex-col items-center text-center gap-6">
        {/* Minecraft「missing texture」ブロック (装飾・画面読み上げ対象外) */}
        <div
          className="not-found-block w-24 h-24 sm:w-28 sm:h-28 rounded-xl border border-slate-500/20 shadow-lg shadow-fuchsia-500/20"
          aria-hidden="true"
        />

        <div className="not-found-rise-2 space-y-2">
          <p className="font-mono font-black text-5xl sm:text-6xl leading-none tracking-tight theme-text-brand">
            404
          </p>
          <h1 className="text-lg sm:text-xl font-extrabold">ページが見つかりません</h1>
          <p className="text-xs sm:text-sm theme-text-muted max-w-md mx-auto leading-relaxed break-words">
            お探しのページは存在しないか、移動・削除された可能性があります。
            URL が正しいかご確認ください。
          </p>
        </div>

        {/* CTA — デザインルール (skills/ui-layout.md):
            主操作 (ホームに戻る・緑) を右端 / 下端に 1 つだけ、ページ CTA は h-12 */}
        <div className="not-found-rise-3 flex flex-col sm:flex-row items-stretch gap-2 w-full max-w-md">
          <Link
            href="/discover/mods"
            className="inline-flex items-center justify-center gap-1.5 px-5 h-12 rounded-xl theme-sub-box theme-text-secondary text-sm font-semibold hover:border-emerald-500/50 hover:theme-text-brand transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            Mod を探す
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-1.5 px-5 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-sm font-bold shadow-lg shadow-emerald-600/20 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-house" aria-hidden />
            ホームに戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
