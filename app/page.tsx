// ============================================================================
// Landing Page (/) — Phase 9.5-F 完成版
//
// 構成 (全て DropMod オリジナル文言・配色):
//   ├─ 1. Hero (見出し + 単語ローテーション + description + CTA)
//   ├─ 2. Inline 検索フォーム + 人気 6 件プレビュー
//   ├─ 3. 人気 Mod 自動横スクロール marquee
//   ├─ 4. Feature Grid (4 個、scroll-reveal + stagger)
//   ├─ 5. Stats Counter (3 個、count-up アニメ)
//   ├─ 6. Community (GitHub リンク、star 数は静的表示)
//   ├─ 7. Final CTA (大型 CTA)
//   └─ 8. Footer (サイト内 + 外部リンク一覧)
//
// 【重要】Phase 9.5 の絶対原則:
//   - このページ (/) のみ AppShell 側で Header が非表示になる
//   - BottomNav は表示継続、スクロールで hide (9.5-E)
//   - SSR HTML に <h1>DropMod</h1> が必ず含まれる (SEO)
//   - 各セクションに適切な <h2>/<h3> 階層 (SEO + a11y)
//   - Reduced Motion 環境では全アニメスキップ (WCAG 2.1 SC 2.3.3)
//   - Modrinth の LP をパクったと分からないよう、文言・配色は完全 DropMod オリジナル
//
// Client 経由の要素 (marquee / rotator / scroll-reveal / count-up / search)
// は個別に Client コンポーネントに切り出し、この page.tsx 自体は Server
// Component として SSR HTML の完全性を維持 (SEO + LCP)。
// ============================================================================

import { logger } from '@/lib/server/logger';
import Link from 'next/link';
import { fetchModrinthSearch } from '@/lib/modrinth/server';
import { RevealSection } from '@/components/landing/RevealSection';
import { AnimatedStats } from '@/components/landing/AnimatedStats';
import { HeroRotator } from '@/components/landing/HeroRotator';
import { LandingSearchForm } from '@/components/landing/LandingSearchForm';
import { PopularMarquee } from '@/components/landing/PopularMarquee';
import { PreviewCard } from '@/components/landing/PreviewCard';
import type { ModrinthHit } from '@/types';

export const metadata = {
  title: 'DropMod - Minecraft Mod Downloader',
  description:
    'Modrinth から Mod・リソースパック・シェーダーを検索し、プロファイル単位で構成を管理・ZIP エクスポートできる Web アプリ。'
};

// Modrinth 単語ローテーション (Hero、DropMod オリジナル文言に合わせて調整)
const ROTATOR_WORDS = [
  'Mods',
  'Modpacks',
  'Resource Packs',
  'Shaders',
] as const;

async function fetchLandingHits(sortBy: 'popular' | 'newest', limit: number): Promise<ModrinthHit[]> {
  try {
    const result = await fetchModrinthSearch({
      query: '',
      sortBy,
      limit,
      offset: 0,
      projectType: 'mod'
    });
    return result.hits;
  } catch (e) {
    logger.warn(`landing ${sortBy} fetch failed, using empty:`, e);
    return [];
  }
}

export default async function LandingPage() {
  const [popularHits, newestHits] = await Promise.all([
    fetchLandingHits('popular', 6),
    fetchLandingHits('newest', 16)
  ]);
  const previewHits = popularHits.slice(0, 6);
  const marqueeHits = newestHits.slice(0, 16);

  return (
    <main className="flex-1 w-full">
      {/* ==================================================================
           1. Hero
      ================================================================== */}
      <section
        className="relative overflow-hidden pt-16 sm:pt-24 pb-10 sm:pb-14"
        aria-labelledby="hero-title"
      >
        {/* 背景の subtle grid pattern (Modrinth の maze 背景をヒントに、DropMod
            オリジナルの emerald グラデーション) */}
        <div
          className="absolute inset-0 -z-10 opacity-60"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(ellipse at top, rgba(16, 185, 129, 0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(59, 130, 246, 0.10), transparent 50%)',
          }}
        />
        {/* 微細な dot pattern */}
        <div
          className="absolute inset-0 -z-10 opacity-[0.15]"
          aria-hidden="true"
          style={{
            backgroundImage:
              'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            color: 'var(--color-text-muted, #64748b)',
          }}
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-5 sm:space-y-7">
          <div className="inline-flex w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/25 ring-1 ring-white/30">
            <i className="fa-solid fa-cube text-3xl sm:text-4xl" aria-hidden />
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h1
              id="hero-title"
              className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight"
            >
              <span className="block">Minecraft を彩る、</span>
              <span className="block">
                <HeroRotator words={ROTATOR_WORDS} />
                <span>の玄関口。</span>
              </span>
            </h1>
            <p className="text-base sm:text-lg lg:text-xl theme-text-secondary max-w-2xl mx-auto leading-relaxed">
              数万件の Mod・リソースパック・シェーダーをブラウザで探し、
              <br className="hidden sm:inline" />
              プロファイル単位で構成を管理できる、ミニマルな Mod マネージャ。
            </p>
          </div>

          <div className="pt-2">
            <LandingSearchForm placeholder="例: Sodium, Iris, Fabric API…" />
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-2.5 sm:gap-3 pt-2">
            <Link
              href="/discover/mods"
              className="btn-hover-effect inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-sm sm:text-base font-bold shadow-lg shadow-emerald-600/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-compass" aria-hidden />
              <span>すべての Mod を見る</span>
            </Link>
            <Link
              href="/profile"
              className="btn-hover-effect inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl glass-card theme-text-brand border border-emerald-500/30 text-sm sm:text-base font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <i className="fa-solid fa-cubes" aria-hidden />
              <span>マイプロファイル</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ==================================================================
           2. Inline 検索プレビュー (人気 6 件、SSR)
      ================================================================== */}
      {previewHits.length > 0 && (
        <section
          className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
          aria-labelledby="preview-title"
        >
          <div className="flex items-end justify-between mb-4 sm:mb-6 gap-3">
            <div>
              <h2
                id="preview-title"
                className="text-lg sm:text-2xl font-bold tracking-tight"
              >
                いま人気の Mod
              </h2>
              <p className="mt-1 text-xs sm:text-sm theme-text-muted">
                Modrinth のダウンロード数上位から自動更新
              </p>
            </div>
            <Link
              href="/discover/mods"
              className="text-xs sm:text-sm theme-text-brand hover:underline shrink-0 font-semibold"
            >
              もっと見る →
            </Link>
          </div>
          <RevealSection
            selector="[data-reveal-item]"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
          >
            {previewHits.map((hit) => (
              <PreviewCard key={hit.project_id} hit={hit} />
            ))}
          </RevealSection>
        </section>
      )}

      {/* ==================================================================
           3. Popular Marquee (自動横スクロール)
      ================================================================== */}
      {marqueeHits.length > 0 && (
        <section
          className="py-6 sm:py-10"
          aria-labelledby="marquee-title"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-4 sm:mb-5">
            <h2
              id="marquee-title"
              className="text-lg sm:text-2xl font-bold tracking-tight text-center"
            >
              続々と追加される新しい Mod
            </h2>
            <p className="mt-1 text-xs sm:text-sm theme-text-muted text-center">
              Modrinth の新着順。ホバーすると流れが止まります。
            </p>
          </div>
          <PopularMarquee hits={marqueeHits} ariaLabel="新着の Mod" />
        </section>
      )}

      {/* ==================================================================
           4. Feature Grid
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
            必要な機能だけを、シンプルに
          </h2>
          <p className="mt-3 text-sm sm:text-base theme-text-muted max-w-2xl mx-auto">
            Mod 探しから配布 zip 作成まで、面倒な作業をブラウザだけで完結。
          </p>
        </div>

        <RevealSection
          selector="[data-reveal-item]"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
        >
          <FeatureCard
            icon="fa-magnifying-glass"
            title="横断検索"
            description="人気・更新・カテゴリ・MC バージョン・ローダーで絞り込み。無限スクロールで軽快。"
          />
          <FeatureCard
            icon="fa-layer-group"
            title="プロファイル管理"
            description="複数の Mod セットを名前付きで保存。用途ごとに一瞬で切り替え。"
          />
          <FeatureCard
            icon="fa-shield-halved"
            title="依存関係チェック"
            description="必須依存の欠落や競合を検知し、事前に警告。プレイ中の事故を防ぐ。"
          />
          <FeatureCard
            icon="fa-file-zipper"
            title="ワンクリック配布"
            description="mods フォルダにそのまま置ける ZIP を 1 クリック生成。.mrpack 読込にも対応。"
          />
        </RevealSection>
      </section>

      {/* ==================================================================
           5. Stats Counter
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
        <AnimatedStats />
      </section>

      {/* ==================================================================
           6. Community / Open Source
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
              オープンに、みんなで作る
            </h2>
            <p className="mt-3 text-sm sm:text-base theme-text-muted max-w-xl mx-auto leading-relaxed">
              DropMod は MIT ライセンスの OSS プロジェクト。
              Issue / PR / フィードバックはいつでも歓迎です。
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
           7. Final CTA
      ================================================================== */}
      <section
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center"
        aria-labelledby="cta-title"
      >
        <h2
          id="cta-title"
          className="text-3xl sm:text-5xl font-extrabold tracking-tight"
        >
          さあ、次の Mod を探しに行こう。
        </h2>
        <p className="mt-4 text-base sm:text-lg theme-text-muted max-w-2xl mx-auto leading-relaxed">
          アカウント登録は不要。ブラウザを開けば、すぐに始められます。
        </p>
        <div className="mt-8">
          <Link
            href="/discover/mods"
            className="btn-hover-effect inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-lg font-bold shadow-lg shadow-emerald-600/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <span>Mod を探す</span>
          </Link>
        </div>
      </section>

      {/* ==================================================================
           8. Footer (サイト内 + 外部リンク一覧)
      ================================================================== */}
      <LandingFooter />
    </main>
  );
}

// ============================================================================
// 内部小コンポーネント
// ============================================================================

function FeatureCard({
  icon,
  title,
  description,
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

/**
 * LP 専用フッター (Phase 9.5-F 新設)。
 *
 * 4 カラム構成 (mobile では折りたたみ):
 *   ├─ ブランド (ロゴ + 一言)
 *   ├─ サイト内リンク
 *   ├─ Mod カテゴリ
 *   └─ 外部リンク + ライセンス
 */
function LandingFooter() {
  return (
    <footer className="mt-8 border-t border-slate-500/20 bg-slate-900/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-slate-950 shadow ring-1 ring-white/30">
                <i className="fa-solid fa-cube text-lg" aria-hidden />
              </div>
              <span className="font-extrabold text-base tracking-wider">
                DropMod
              </span>
            </Link>
            <p className="mt-3 text-xs theme-text-muted leading-relaxed max-w-xs">
              Minecraft Mod プロファイルマネージャ。
              Modrinth と連携して、面倒な Mod 管理をブラウザで完結。
            </p>
          </div>

          {/* サイト内リンク */}
          <FooterColumn title="サイト">
            <FooterLink href="/">ホーム</FooterLink>
            <FooterLink href="/discover/mods">Mod を探す</FooterLink>
            <FooterLink href="/profile">マイプロファイル</FooterLink>
            <FooterLink href="/settings">設定</FooterLink>
          </FooterColumn>

          {/* Mod カテゴリ */}
          <FooterColumn title="カテゴリ">
            <FooterLink href="/discover/mods">Mods</FooterLink>
            <FooterLink href="/discover/modpacks">Modpacks</FooterLink>
            <FooterLink href="/discover/resourcepacks">Resource Packs</FooterLink>
            <FooterLink href="/discover/shaders">Shaders</FooterLink>
          </FooterColumn>

          {/* 外部リンク */}
          <FooterColumn title="外部リンク">
            <FooterExtLink href="https://modrinth.com">Modrinth</FooterExtLink>
            <FooterExtLink href="https://www.minecraft.net">
              Minecraft 公式
            </FooterExtLink>
            <FooterExtLink href="https://github.com/shiratama644/DropMod">
              GitHub
            </FooterExtLink>
            <FooterExtLink href="https://github.com/shiratama644/DropMod/blob/main/LICENSE">
              License (MIT)
            </FooterExtLink>
          </FooterColumn>
        </div>

        {/* 下部 fine print */}
        <div className="mt-10 pt-6 border-t border-slate-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs theme-text-muted text-center sm:text-left">
            © 2026 DropMod. MIT License. Not affiliated with Mojang, Microsoft, or Modrinth.
          </p>
          <p className="text-xs theme-text-muted">
            Minecraft is a trademark of Mojang Synergies AB.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider theme-text-muted mb-3">
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm hover:theme-text-brand transition focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
      >
        {children}
      </Link>
    </li>
  );
}

function FooterExtLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm hover:theme-text-brand transition inline-flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
      >
        <span>{children}</span>
        <i
          className="fa-solid fa-arrow-up-right-from-square text-[10px] theme-text-muted"
          aria-hidden
        />
      </a>
    </li>
  );
}
