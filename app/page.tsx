// ============================================================================
// Landing Page (/) — Phase 9.5-B で骨組みを本格ランディングに刷新
//
// 従来 (Phase 9-F): 中央寄せの簡易ランディング (アイコン + タイトル + CTA 3 個)
// 新 (Phase 9.5-B): Modrinth トップページ相当の多段構成の骨組み
//   ├─ 1. Hero            (9.5-C で Three.js 3D シーンに置換予定)
//   ├─ 2. Feature Grid    (4 個の特徴カード)
//   ├─ 3. Stats Counter   (9.5-C で Anime.js count-up 予定)
//   ├─ 4. Screenshot Showcase (SVG プレースホルダー)
//   ├─ 5. Community       (GitHub リンク、star 数は静的表示)
//   └─ 6. Final CTA       (大型 CTA + fine print)
//
// Phase 9.5-B ではセクション枠 + テキストコンテンツのみ実装。
// アニメーション (Anime.js scroll reveal / Hero 3D / Stats count-up) は
// 全て Phase 9.5-C で追加する。
//
// 【重要】Phase 9.5-B の絶対原則:
//   - このページ (/) のみ AppShell 側で Header が非表示になる
//   - BottomNav は表示継続、ハンバーガーメニュー等はランディングでも使える
//   - SSR HTML に <h1>DropMod</h1> が必ず含まれる (SEO)
//   - 各セクションに適切な <h2>/<h3> 階層 (SEO + a11y)
// ============================================================================

import Link from 'next/link';

export const metadata = {
  title: 'DropMod - Minecraft Mod Downloader',
  description:
    'Modrinth から Mod を検索・追加・バージョン管理・ZIP エクスポートできる Web アプリ。プロファイル単位で Mod セットを管理し、依存関係チェックや Modpack 対応も予定。'
};

export default function LandingPage() {
  return (
    <main className="flex-1 w-full">
      {/* ==================================================================
           1. Hero
           9.5-C で背景に Three.js 3D シーン (Minecraft cube ランダム配置) を
           dynamic import で追加予定。
           現状は静的 Hero (グラデーション背景 + 大きなタイトル + CTA)。
      ================================================================== */}
      <section
        className="relative overflow-hidden pt-12 sm:pt-20 pb-16 sm:pb-24"
        aria-labelledby="hero-title"
      >
        {/* 背景の subtle gradient (9.5-C で Three.js が上に乗る) */}
        <div
          className="absolute inset-0 -z-10 opacity-70"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(ellipse at top, rgba(16, 185, 129, 0.15), transparent 60%), radial-gradient(ellipse at bottom left, rgba(59, 130, 246, 0.08), transparent 50%)'
          }}
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 sm:space-y-8">
          {/* ロゴアイコン (9.5-C で 3D 化検討) */}
          <div className="inline-flex w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20 ring-1 ring-white/30">
            <i className="fa-solid fa-cube text-3xl sm:text-4xl" aria-hidden />
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h1
              id="hero-title"
              className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 bg-clip-text text-transparent"
            >
              DropMod
            </h1>
            <p className="text-base sm:text-xl lg:text-2xl theme-text-secondary max-w-3xl mx-auto leading-relaxed">
              Modrinth から Mod を検索・追加・バージョン管理・
              <br className="hidden sm:inline" />
              ZIP エクスポートできる Minecraft Mod プロファイルマネージャ
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <Link
              href="/mods"
              className="btn-hover-effect inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-base font-bold shadow-lg shadow-emerald-600/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
              <span>Mod を探す</span>
            </Link>
            <Link
              href="/profile"
              className="btn-hover-effect inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl glass-card theme-text-brand border border-emerald-500/30 text-base font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-cubes" aria-hidden />
              <span>プロファイルを見る</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ==================================================================
           2. Feature Grid
           4 個の特徴カード。9.5-C で scroll-triggered fade-up + stagger を追加。
      ================================================================== */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20"
        aria-labelledby="feature-title"
      >
        <div className="text-center mb-10 sm:mb-14">
          <h2
            id="feature-title"
            className="text-2xl sm:text-4xl font-extrabold tracking-tight"
          >
            Mod 管理を、もっとスマートに
          </h2>
          <p className="mt-3 text-sm sm:text-base theme-text-muted max-w-2xl mx-auto">
            必要な機能だけを、シンプルで洗練された UI に凝縮しました。
          </p>
        </div>

        <div
          data-reveal-container
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
        >
          <FeatureCard
            icon="fa-magnifying-glass"
            title="Modrinth 検索"
            description="人気順・更新順・カテゴリ・MC バージョン・ローダーで絞り込み。無限スクロール対応。"
          />
          <FeatureCard
            icon="fa-layer-group"
            title="プロファイル管理"
            description="Mod セットを名前付きで保存。MC バージョンやローダーごとに切り替え可能。"
          />
          <FeatureCard
            icon="fa-shield-halved"
            title="依存関係チェック"
            description="必須依存 Mod の欠落や競合を Modrinth API から自動検知。"
          />
          <FeatureCard
            icon="fa-file-zipper"
            title="ZIP エクスポート/インポート"
            description="mods フォルダに直接置ける ZIP を 1 クリックで生成。.mrpack 読込も対応。"
          />
        </div>
      </section>

      {/* ==================================================================
           3. Stats Counter
           9.5-C で Anime.js count-up アニメーション追加。
           現状は静的表示。
      ================================================================== */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20"
        aria-labelledby="stats-title"
      >
        <div className="text-center mb-10 sm:mb-14">
          <h2
            id="stats-title"
            className="text-2xl sm:text-4xl font-extrabold tracking-tight"
          >
            数字で見る DropMod
          </h2>
        </div>

        <div
          data-reveal-container
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto"
        >
          <StatCard
            value="100k+"
            label="Modrinth Mod にアクセス"
            icon="fa-cube"
          />
          <StatCard value="4" label="Loader 対応" icon="fa-code-branch" />
          <StatCard
            value="100%"
            label="オフライン対応 (IndexedDB)"
            icon="fa-wifi"
          />
        </div>
      </section>

      {/* ==================================================================
           4. Screenshot Showcase
           SVG プレースホルダー (計画書決定事項)。9.5-D で実キャプチャに置換。
           9.5-C で slide-in アニメーション追加。
      ================================================================== */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20"
        aria-labelledby="screenshot-title"
      >
        <div className="text-center mb-10 sm:mb-14">
          <h2
            id="screenshot-title"
            className="text-2xl sm:text-4xl font-extrabold tracking-tight"
          >
            美しく、機能的な UI
          </h2>
          <p className="mt-3 text-sm sm:text-base theme-text-muted max-w-2xl mx-auto">
            Modrinth 検索、Mod 詳細、プロファイル画面 — 全て統一されたデザイン言語で。
          </p>
        </div>

        <div
          data-reveal-container
          className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6"
        >
          <ScreenshotPlaceholder label="Modrinth 検索" />
          <ScreenshotPlaceholder label="Mod 詳細" />
          <ScreenshotPlaceholder label="プロファイル管理" />
        </div>
      </section>

      {/* ==================================================================
           5. Community / Open Source
           GitHub リンクのみ、star 数は静的表示なし (計画書決定事項)。
      ================================================================== */}
      <section
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20"
        aria-labelledby="community-title"
      >
        <div className="glass-panel rounded-3xl p-8 sm:p-12 border shadow-xl text-center space-y-5">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-white shadow-lg">
            <i className="fa-brands fa-github text-3xl" aria-hidden />
          </div>
          <div>
            <h2
              id="community-title"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight"
            >
              オープンソース
            </h2>
            <p className="mt-3 text-sm sm:text-base theme-text-muted max-w-xl mx-auto leading-relaxed">
              DropMod は MIT ライセンスの OSS プロジェクトです。
              Issue / PR / フィードバック大歓迎!
            </p>
          </div>
          <a
            href="https://github.com/shiratama644/DropMod"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-hover-effect inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-base font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-brands fa-github" aria-hidden />
            <span>GitHub で見る</span>
            <i
              className="fa-solid fa-arrow-up-right-from-square text-xs"
              aria-hidden
            />
          </a>
        </div>
      </section>

      {/* ==================================================================
           6. Final CTA
           大型 CTA + fine print
      ================================================================== */}
      <section
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center"
        aria-labelledby="cta-title"
      >
        <h2
          id="cta-title"
          className="text-3xl sm:text-5xl font-extrabold tracking-tight"
        >
          さあ、はじめよう
        </h2>
        <p className="mt-4 text-base sm:text-lg theme-text-muted max-w-2xl mx-auto leading-relaxed">
          アカウント登録不要。今すぐブラウザで Mod を探せます。
        </p>
        <div className="mt-8">
          <Link
            href="/mods"
            className="btn-hover-effect inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-lg font-bold shadow-lg shadow-emerald-600/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <span>Mod を探す</span>
          </Link>
        </div>

        <p className="mt-10 text-xs theme-text-muted max-w-xl mx-auto">
          DropMod は Mojang / Microsoft / Modrinth と提携していない個人プロジェクトです。
          <br />
          Minecraft is a trademark of Mojang Synergies AB.
        </p>
      </section>
    </main>
  );
}

// ============================================================================
// 内部小コンポーネント (このファイル内限定)
// ============================================================================

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div
      data-reveal-item
      className="glass-card rounded-2xl p-5 sm:p-6 space-y-3 border hover:border-emerald-500/40 transition"
    >
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/15 theme-text-brand flex items-center justify-center text-xl">
        <i className={`fa-solid ${icon}`} aria-hidden />
      </div>
      <h3 className="font-bold text-base sm:text-lg">{title}</h3>
      <p className="text-xs sm:text-sm theme-text-muted leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function StatCard({
  value,
  label,
  icon
}: {
  value: string;
  label: string;
  icon: string;
}) {
  return (
    <div
      data-reveal-item
      className="glass-card rounded-2xl p-6 sm:p-8 text-center border"
    >
      <div className="w-12 h-12 rounded-xl bg-emerald-500/15 theme-text-brand flex items-center justify-center mx-auto text-xl mb-4">
        <i className={`fa-solid ${icon}`} aria-hidden />
      </div>
      <div className="font-extrabold text-3xl sm:text-4xl theme-text-brand mb-2 font-mono">
        {value}
      </div>
      <div className="text-xs sm:text-sm theme-text-muted">{label}</div>
    </div>
  );
}

/**
 * Phase 9.5-B: Screenshot プレースホルダー。
 * 9.5-D で実際のアプリキャプチャに差し替え予定。
 * 中身は SVG グラデーション + ラベル。
 */
function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div
      data-reveal-item
      className="glass-card rounded-2xl aspect-[9/16] border overflow-hidden relative group hover:border-emerald-500/40 transition"
    >
      {/* SVG プレースホルダー背景 */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 400 720"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.2)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0.1)" />
          </linearGradient>
        </defs>
        <rect width="400" height="720" fill={`url(#grad-${label})`} />
        <rect x="24" y="60" width="352" height="80" rx="16" fill="rgba(255,255,255,0.06)" />
        <rect x="24" y="160" width="240" height="24" rx="8" fill="rgba(255,255,255,0.08)" />
        <rect x="24" y="200" width="352" height="120" rx="16" fill="rgba(255,255,255,0.06)" />
        <rect x="24" y="340" width="352" height="120" rx="16" fill="rgba(255,255,255,0.06)" />
        <rect x="24" y="480" width="352" height="120" rx="16" fill="rgba(255,255,255,0.06)" />
      </svg>
      {/* ラベル */}
      <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-slate-950/80 to-transparent">
        <div className="text-sm font-bold text-white">{label}</div>
        <div className="text-[10px] text-slate-300 mt-0.5">プレビュー</div>
      </div>
    </div>
  );
}
