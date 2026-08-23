// ============================================================================
// Home (/) 簡易ランディングページ (Phase 9-F: URL 再設計)
//
// 従来: このページに Modrinth 検索 UI (HomeInteractive) を実装していた。
// Phase 9-F 以降: 検索 UI は /mods に移設。Home は「アプリの入り口」として
//                 主要導線 (Mod を探す / 現在のプロファイル / 設定) を提示する
//                 簡易ランディングに縮小。
//
// 本格的なランディング設計 (ヒーロービジュアル、機能紹介、CTA など) は
// 別 Phase (Phase 10 以降) で実装する予定。今回は最小限。
//
// SEO:
//   - Static Rendering (cookies() 不使用) で robots がクロール可能
//   - metadataBase + og:image は layout.tsx から継承
// ============================================================================

import Link from 'next/link';

export const metadata = {
  title: 'DropMod - Minecraft Mod Downloader',
  description:
    'Modrinth から Mod を検索・追加・バージョン管理・ZIP エクスポートできる Web アプリ。プロファイル単位で Mod セットを管理できます。'
};

export default function HomePage() {
  return (
    <main className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 pt-6 sm:pt-10 flex-1 w-full">
      <section className="glass-panel rounded-3xl p-6 sm:p-10 border shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto text-slate-950 shadow-lg shadow-emerald-500/20 ring-1 ring-white/30">
          <i className="fa-solid fa-cube text-3xl sm:text-4xl" aria-hidden />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            DropMod
          </h2>
          <p className="text-sm sm:text-base theme-text-muted max-w-xl mx-auto leading-relaxed">
            Modrinth から Mod を検索・追加・バージョン管理・
            <br className="hidden sm:inline" />
            ZIP エクスポートできる Minecraft Mod プロファイルマネージャ。
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3 pt-2">
          <Link
            href="/mods"
            className="btn-hover-effect inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-sm font-bold shadow-md shadow-emerald-600/20 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <span>Mod を探す</span>
          </Link>
          <Link
            href="/profile"
            className="btn-hover-effect inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl theme-sub-box theme-text-brand border border-emerald-500/30 text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-cubes" aria-hidden />
            <span>現在のプロファイル</span>
          </Link>
          <Link
            href="/settings"
            className="btn-hover-effect inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl theme-sub-box text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-gear" aria-hidden />
            <span>設定</span>
          </Link>
        </div>
      </section>

      <section className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 theme-text-brand flex items-center justify-center text-lg">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
          </div>
          <h3 className="font-bold text-sm">Modrinth で検索</h3>
          <p className="text-xs theme-text-muted leading-relaxed">
            人気順・更新順・カテゴリ・MC バージョン・ローダーで絞り込み。無限スクロール対応。
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 theme-text-brand flex items-center justify-center text-lg">
            <i className="fa-solid fa-layer-group" aria-hidden />
          </div>
          <h3 className="font-bold text-sm">プロファイル管理</h3>
          <p className="text-xs theme-text-muted leading-relaxed">
            複数プロファイルで Mod セットを保存。切替・複製・依存チェックが可能。
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 theme-text-brand flex items-center justify-center text-lg">
            <i className="fa-solid fa-file-zipper" aria-hidden />
          </div>
          <h3 className="font-bold text-sm">ZIP エクスポート</h3>
          <p className="text-xs theme-text-muted leading-relaxed">
            プロファイル全 .jar を並列 DL し 1 つの ZIP に。.mrpack / .jar ZIP インポートも対応。
          </p>
        </div>
      </section>
    </main>
  );
}
