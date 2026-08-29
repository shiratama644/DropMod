'use client';

// -----------------------------------------------------------------------------
// ModDetailPageView (Phase 10-P1)
//
// `/mods/[slug]` フルページ (直接アクセス / 共有 URL / 他ページからの遷移) 用の
// 「ちゃんとしたページとして整ったデザイン」を提供する Client Component。
//
// 経緯:
//   Phase 9-F までは `ModDetailModalShell` を variant="page" で兼用していたが、
//   中央寄せの max-w-3xl カードが並ぶだけで「モーダルを引き伸ばしただけ」の
//   見た目だった。詳細ページはランディング的な情報密度・SEO 訴求・PC ワイド
//   幅活用が求められるため、本コンポーネントで完全に別デザインとして刷新。
//
// レイアウト (デスクトップ):
//   ┌───────────────────────────────────────────────────────────┐
//   │  [← Mod 一覧に戻る]                                        │
//   │  ┌ Hero ───────────────────────────────────────────────┐  │
//   │  │ [icon] Title / description   [DL] [.jar] [Add/Remove]│  │
//   │  │        badges (loader/mc/license)                    │  │
//   │  └────────────────────────────────────────────────────┘  │
//   │  ┌ 統計バー ───────────────────────────────────────────┐  │
//   │  │ [DL数] [フォロワー] [作成日] [更新日]              │  │
//   │  └────────────────────────────────────────────────────┘  │
//   │  ┌──────────────┐  ┌────────────────────────────────┐   │
//   │  │ 本文 (Body)  │  │ サイドバー                     │   │
//   │  │ ギャラリー    │  │ - 対応バージョン (最新5+全件)  │   │
//   │  │              │  │ - カテゴリ                     │   │
//   │  │              │  │ - Client/Server 対応           │   │
//   │  │              │  │ - 外部リンク (Source/Issues/…) │   │
//   │  └──────────────┘  └────────────────────────────────┘   │
//   └───────────────────────────────────────────────────────────┘
//
// モバイルではサイドバーが本文の下に回り込む (Tailwind lg: breakpoint)。
//
// ⚠️ Rules of Hooks:
//   このコンポーネントは早期 return を持たない (project === null は上位で
//   notFound() 済み想定 + 念のためのプレースホルダーだけ)。それでも hook 呼び出しは
//   全て関数トップで宣言するポリシーを守る。
// -----------------------------------------------------------------------------

import { useCallback, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

import type { ModrinthProject, ModrinthVersion, ModrinthVersionFile } from '@/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ScreenshotGalleryModal } from './ScreenshotGalleryModal';
import { downloadAsBlob } from '@/lib/utils/download';
import { shouldUnoptimizeImage } from '@/lib/utils/image';
import { useCurrentProfileWithFallback } from '@/lib/store/useCurrentProfileWithFallback';
import { useAppAction } from '@/lib/store/appActions';
import { useToastStore } from '@/lib/store/toast';
import { useModpackAdd } from '@/hooks/useModpackAdd';
import { ModpackImportModal } from './ModpackImportModal';
import {
  discoverPathForType,
  discoverPathFromProjectType,
  modrinthProjectUrl,
  parseProjectType
} from '@/lib/constants/search';
import { projectTypeLabel } from '@/lib/seo/jsonld';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------
interface Props {
  project: ModrinthProject | null;
  versions: ModrinthVersion[];
  slug: string;
}

// -----------------------------------------------------------------------------
// ヘルパー (ModDetailModalShell と重複しているが、両者は今後別々に進化する想定
// なので DRY 化はあえて避けている。小さい pure 関数なので影響なし。)
// -----------------------------------------------------------------------------
function formatDownloads(num: number | undefined | null): string {
  if (!num || !Number.isFinite(num)) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '—';
  }
}

function pickPrimaryFile(v: ModrinthVersion | null): ModrinthVersionFile | null {
  if (!v) return null;
  const files = v.files ?? [];
  if (files.length === 0) return null;
  return files.find((f) => f.primary) || files[0] || null;
}

// Modrinth の loader 名を日本語風に整える (先頭大文字化のみ)
function displayLoader(loader: string): string {
  return loader.charAt(0).toUpperCase() + loader.slice(1);
}

// カテゴリのアイコン風表示 (fa 依存しない、テキストバッジで統一)
const CLIENT_SERVER_LABEL: Record<string, { label: string; tone: 'brand' | 'amber' | 'muted' }> = {
  required: { label: '必須', tone: 'brand' },
  optional: { label: '任意', tone: 'amber' },
  unsupported: { label: '非対応', tone: 'muted' },
  unknown: { label: '不明', tone: 'muted' }
};

// -----------------------------------------------------------------------------
// 外部リンク集を統合的に扱う小ヘルパー
// -----------------------------------------------------------------------------
interface ExternalLink {
  label: string;
  href: string;
  icon: string;
}

function collectExternalLinks(project: ModrinthProject): ExternalLink[] {
  const links: ExternalLink[] = [];
  // Modrinth 上のプロジェクトページへのリンクは必ず提供する
  links.push({
    label: 'Modrinth で見る',
    href: modrinthProjectUrl(project.slug, project.project_type),
    icon: 'fa-solid fa-arrow-up-right-from-square'
  });
  if (project.source_url) {
    links.push({ label: 'Source', href: project.source_url, icon: 'fa-brands fa-github' });
  }
  if (project.issues_url) {
    links.push({ label: 'Issues', href: project.issues_url, icon: 'fa-solid fa-circle-exclamation' });
  }
  if (project.wiki_url) {
    links.push({ label: 'Wiki', href: project.wiki_url, icon: 'fa-solid fa-book' });
  }
  if (project.discord_url) {
    links.push({ label: 'Discord', href: project.discord_url, icon: 'fa-brands fa-discord' });
  }
  if (project.donation_urls && project.donation_urls.length > 0) {
    for (const d of project.donation_urls) {
      links.push({ label: d.platform || 'Donate', href: d.url, icon: 'fa-solid fa-heart' });
    }
  }
  return links;
}

// -----------------------------------------------------------------------------
// 本体
// -----------------------------------------------------------------------------
export const ModDetailPageView: React.FC<Props> = ({ project, versions, slug }) => {
  // --- Hook 群 (早期 return より前に全て) ---------------------------------
  const currentProfile = useCurrentProfileWithFallback();
  const handleToggleMod = useAppAction('handleToggleMod');
  // P12-D2 (bug 3): Modpack は中身 (files[]) を展開して競合を検出する
  const {
    plan: modpackPlan,
    preparing: modpackPreparing,
    addModpack,
    confirm: confirmModpackAdd,
    cancel: cancelModpackAdd
  } = useModpackAdd();

  const [isJarDownloading, setIsJarDownloading] = useState(false);
  const [isTogglePending, setIsTogglePending] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const handleJarDownload = useCallback(
    async (file: ModrinthVersionFile) => {
      if (isJarDownloading) return;
      setIsJarDownloading(true);
      try {
        const r = await downloadAsBlob(file.url, file.filename);
        if (!r.ok && r.error !== 'Aborted') {
          console.warn('[DropMod] jar direct download failed:', r);
        }
      } finally {
        setIsJarDownloading(false);
      }
    },
    [isJarDownloading]
  );

  // P12-D2: Modpack は mods[] に入らないため、modpackSource でも導入済み判定する
  const isAddedByMods =
    !!project &&
    (currentProfile.mods ?? []).some(
      (m) => m.projectId === project.id || (project.slug && m.slug === project.slug)
    );
  const modpackAdded =
    !!project && currentProfile.modpackSource?.projectId === project.id;

  const handleProfileToggle = useCallback(
    async (projectId: string, e: React.MouseEvent) => {
      if (isTogglePending) return;
      setIsTogglePending(true);
      try {
        // P12-D2 (bug 3): Modpack は mods[] トグルではなく中身を展開して追加する
        if (project?.project_type === 'modpack' && !isAddedByMods) {
          if (modpackAdded) {
            useToastStore.getState().showToast(
              'この Modpack は既に導入済みです。Modpack ハブから管理できます。',
              'info'
            );
            return;
          }
          await addModpack(project);
          return;
        }
        await handleToggleMod(projectId, e);
      } finally {
        setIsTogglePending(false);
      }
    },
    [addModpack, handleToggleMod, isAddedByMods, isTogglePending, modpackAdded, project]
  );
  // ------------------------------------------------------------------------

  // ガード: SSR fetch 失敗時のフォールバック (通常は上位で notFound())
  if (!project) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-sm theme-text-muted">
          {`Mod 情報を読み込めませんでした (slug: ${slug})。`}
        </p>
        <Link
          href={discoverPathFromProjectType(undefined)}
          className="mt-4 inline-flex items-center gap-1.5 text-xs theme-text-brand hover:underline"
        >
          <i className="fa-solid fa-arrow-left" aria-hidden />
          検索に戻る
        </Link>
      </main>
    );
  }

  // 派生データ
  // Phase 10-P1 修正: Modrinth API は array 系フィールドが欠落 (undefined) して返る
  // ことがある (categories / display_categories / gallery / files など)。ISR プレンダー中に
  // /mods/iris /mods/oculus 等で `Cannot read properties of undefined (reading 'length')`
  // で落ちたため、全ての配列アクセスを defensive にする。
  const safeVersions = versions ?? [];
  const latestVersion = safeVersions[0] ?? null;
  const latestFile = pickPrimaryFile(latestVersion);
  const isAdded = isAddedByMods || modpackAdded;
  const externalLinks = collectExternalLinks(project);

  // ローダー・MC バージョンは project 本体と最新 version の両方から採取して集約
  const loaderSet = new Set<string>();
  const mcVersionSet = new Set<string>();
  for (const l of project.loaders ?? []) loaderSet.add(l);
  for (const l of latestVersion?.loaders ?? []) loaderSet.add(l);
  for (const v of project.game_versions ?? []) mcVersionSet.add(v);
  for (const v of latestVersion?.game_versions ?? []) mcVersionSet.add(v);
  const loaderList = Array.from(loaderSet);
  const mcVersionList = Array.from(mcVersionSet);

  // カテゴリは display_categories を優先、なければ categories、両方 undefined でも空配列
  const categoriesList =
    (project.display_categories && project.display_categories.length > 0
      ? project.display_categories
      : project.categories) ?? [];

  const galleryList = project.gallery ?? [];

  const clientSide = project.client_side
    ? CLIENT_SERVER_LABEL[project.client_side]
    : undefined;
  const serverSide = project.server_side
    ? CLIENT_SERVER_LABEL[project.server_side]
    : undefined;

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-8 flex-1 w-full">
      {/* ========== パンくず (SEO-1 / 2-4) ========== */}
      <nav aria-label="パンくず" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs theme-text-muted">
          <li>
            <Link href="/" className="hover:text-emerald-500 transition">
              Home
            </Link>
          </li>
          <li aria-hidden className="theme-text-muted">
            /
          </li>
          <li>
            <Link
              href={discoverPathForType(parseProjectType(project.project_type))}
              className="hover:text-emerald-500 transition"
            >
              {projectTypeLabel(parseProjectType(project.project_type))}
            </Link>
          </li>
          <li aria-hidden className="theme-text-muted">
            /
          </li>
          <li className="theme-text-secondary font-semibold truncate max-w-[12rem] sm:max-w-xs">
            {project.title}
          </li>
        </ol>
      </nav>

      {/* ========== ヒーロー ========== */}
      <section className="glass-panel rounded-3xl border shadow-xl overflow-hidden mb-4">
        <div className="p-5 sm:p-8 flex flex-col md:flex-row gap-5 md:gap-7 items-start">
          {/* アイコン */}
          <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl bg-slate-800/80 p-1.5 flex items-center justify-center shadow-lg shrink-0 overflow-hidden border border-slate-700/50 relative">
            {project.icon_url ? (
              <Image
                src={project.raw_icon_url || project.icon_url}
                alt={project.title}
                width={112}
                height={112}
                className="w-full h-full object-contain rounded-2xl"
                priority
                // Modrinth CDN は既に最適化済み。プロキシ経由だと sharp 未導入環境で
                // 重くなるため直接 CDN から取得 (lib/utils/image.ts 参照)。
                unoptimized={shouldUnoptimizeImage(
                  project.raw_icon_url || project.icon_url
                )}
              />
            ) : (
              <i className="fa-solid fa-cube text-4xl sm:text-5xl text-emerald-400" aria-hidden />
            )}
          </div>

          {/* テキスト + アクション */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex flex-col gap-2">
              <h1 className="font-extrabold text-2xl sm:text-3xl md:text-4xl leading-tight break-words">
                {project.title}
              </h1>
              {project.author && (
                <p className="text-xs sm:text-sm theme-text-muted">
                  <span className="theme-text-secondary">by </span>
                  <span className="font-semibold">{project.author}</span>
                </p>
              )}
              <p className="text-sm sm:text-base theme-text-secondary leading-relaxed max-w-3xl">
                {project.description}
              </p>
            </div>

            {/* バッジ列 (ローダー / MC バージョン / ライセンス) */}
            {(loaderList.length > 0 || mcVersionList.length > 0 || project.license) && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {loaderList.slice(0, 4).map((l) => (
                  <span
                    key={`ld-${l}`}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 theme-text-brand border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider"
                  >
                    <i className="fa-solid fa-cubes mr-1" aria-hidden />
                    {displayLoader(l)}
                  </span>
                ))}
                {mcVersionList.length > 0 && (
                  <span className="px-2.5 py-1 rounded-lg theme-badge text-[11px] font-mono">
                    <i className="fa-solid fa-tag mr-1" aria-hidden />
                    {mcVersionList.length === 1
                      ? mcVersionList[0]
                      : `${mcVersionList[0]} 〜 ${mcVersionList[mcVersionList.length - 1]}`}
                  </span>
                )}
                {project.license && (
                  <span className="px-2.5 py-1 rounded-lg theme-sub-box border border-slate-500/30 text-[11px] font-semibold">
                    <i className="fa-solid fa-scale-balanced mr-1" aria-hidden />
                    {project.license.name || project.license.id}
                  </span>
                )}
              </div>
            )}

            {/* CTA 行 — デザインルール (skills/ui-layout.md):
                主操作 (追加) を右端に配置。緑の塗りつぶしは主操作のみで、
                ダウンロード / Modrinth は枠線 or ダークグレーに統一。
                全ボタン高さ 48px (h-12)・等幅 (flex-1) で均等に並べる。 */}
            <div className="mt-5 flex flex-wrap sm:flex-nowrap items-stretch gap-2">
              <a
                href={modrinthProjectUrl(project.slug, project.project_type)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Modrinth で見る"
                className="btn-hover-effect flex-1 min-w-0 max-w-56 h-12 rounded-xl theme-sub-box theme-text-secondary text-sm font-semibold hover:bg-slate-700/40 transition inline-flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
                Modrinth
              </a>
              {latestFile && (
                <button
                  type="button"
                  onClick={() => handleJarDownload(latestFile)}
                  disabled={isJarDownloading}
                  aria-label=".jar ファイルをダウンロード"
                  className="btn-hover-effect flex-1 min-w-0 max-w-56 h-12 rounded-xl glass-card border border-transparent hover:border-emerald-500/50 theme-text-secondary hover:theme-text-brand text-sm font-bold transition inline-flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isJarDownloading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                      DL中
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-download" aria-hidden />
                      ダウンロード
                    </>
                  )}
                </button>
              )}
              {modpackAdded ? (
                // P12-D2: Modpack は「source 1 件」。削除 (D-6 解除) は Modpack ハブが担う
                <button
                  type="button"
                  disabled
                  aria-label="導入済み"
                  title="Modpack ハブから管理できます"
                  className="btn-hover-effect flex-1 min-w-0 max-w-56 h-12 rounded-xl bg-emerald-500/20 theme-text-brand border border-emerald-500/40 text-sm font-bold transition inline-flex items-center justify-center gap-2 opacity-70 cursor-default"
                >
                  <i className="fa-solid fa-circle-check" aria-hidden />
                  導入済み
                </button>
              ) : isAdded ? (
                <button
                  type="button"
                  onClick={(e) => handleProfileToggle(project.id, e)}
                  disabled={isTogglePending}
                  aria-label="プロファイルから削除"
                  className="btn-hover-effect flex-1 min-w-0 max-w-56 h-12 rounded-xl bg-red-500/20 theme-text-red border border-red-500/40 text-sm font-bold hover:bg-red-500/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {isTogglePending ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                      処理中
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-trash-can" aria-hidden />
                      削除
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => handleProfileToggle(project.id, e)}
                  disabled={isTogglePending}
                  aria-label="プロファイルに追加"
                  className="btn-hover-effect flex-1 min-w-0 max-w-56 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-sm font-bold shadow-lg transition focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {isTogglePending || modpackPreparing ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                      {modpackPreparing ? '解析中' : '追加中'}
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-plus" aria-hidden />
                      追加
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ========== 統計バー (ヒーロー内) ========== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-500/20 border-t border-slate-500/20">
          <StatCell
            icon="fa-solid fa-download"
            label="ダウンロード"
            value={formatDownloads(project.downloads)}
          />
          {typeof project.followers === 'number' && (
            <StatCell
              icon="fa-solid fa-heart"
              label="フォロワー"
              value={formatDownloads(project.followers)}
            />
          )}
          <StatCell
            icon="fa-solid fa-calendar-plus"
            label="作成日"
            value={formatDate(project.published)}
          />
          <StatCell
            icon="fa-solid fa-arrows-rotate"
            label="更新日"
            value={formatDate(project.updated)}
          />
        </div>
      </section>

      {/* ========== 2 カラム ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
        {/* ---- 左カラム: 本文 + ギャラリー ---- */}
        <div className="space-y-4 min-w-0">
          {/* ギャラリー */}
          {galleryList.length > 0 && (
            <section className="glass-panel rounded-3xl border shadow-lg p-5 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider theme-text-muted flex items-center gap-2">
                  <i className="fa-solid fa-images theme-text-brand" aria-hidden />
                  ギャラリー
                  <span className="theme-text-muted font-normal">
                    {`(${galleryList.length})`}
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setIsGalleryOpen(true)}
                  className="btn-hover-effect px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold shadow flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <i className="fa-solid fa-images" aria-hidden />
                  ギャラリー・スクリーンショットを閲覧
                </button>
              </div>
              {/* ギャラリー: 1 行の横スクロール (折り返さない、モーダルと統一) */}
              <div className="flex items-center gap-2.5 overflow-x-auto pb-2 touch-pan-x hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {galleryList.map((img) => (
                  <figure
                    key={img.url}
                    className="relative w-48 sm:w-64 aspect-video rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-900 shrink-0 m-0"
                  >
                    <Image
                      src={img.url}
                      alt={img.title || 'Gallery image'}
                      fill
                      sizes="(min-width: 640px) 256px, 192px"
                      className="object-cover"
                      unoptimized={shouldUnoptimizeImage(img.url)}
                    />
                    {img.title && (
                      <figcaption className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 to-transparent p-2 text-[11px] truncate text-white z-10">
                        {img.title}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* 本文 (Markdown) */}
          <section className="glass-panel rounded-3xl border shadow-lg p-5 sm:p-8">
            <h2 className="text-sm font-bold uppercase tracking-wider theme-text-muted mb-4 flex items-center gap-2">
              <i className="fa-solid fa-file-lines theme-text-brand" aria-hidden />
              詳細説明
            </h2>
            <div className="theme-sub-box p-4 sm:p-6 rounded-2xl border border-slate-500/15 max-h-[70vh] overflow-y-auto overscroll-contain pr-1">
              {project.body ? (
                <MarkdownRenderer content={project.body} />
              ) : (
                <p className="text-sm theme-text-muted">
                  {project.description || '詳細本文はありません。'}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* ---- 右カラム: サイドバー ---- */}
        <aside className="space-y-4 min-w-0">
          {/* 対応バージョン */}
          <SidebarCard title="対応バージョン" icon="fa-solid fa-code-branch">
            {safeVersions.length === 0 ? (
              <p className="text-xs theme-text-muted">
                このプロファイル向けの対応バージョンは見つかりませんでした。
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto overscroll-contain pr-1">
                {safeVersions.map((v) => (
                  <span
                    key={v.id}
                    className="px-2 py-1 rounded-lg theme-badge text-[11px] font-mono flex items-center gap-1 shadow-sm"
                  >
                    <span>{v.version_number}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                        v.version_type === 'release'
                          ? 'bg-emerald-500/20 theme-text-brand border border-emerald-500/30'
                          : 'bg-amber-500/20 theme-text-amber border border-amber-500/30'
                      }`}
                    >
                      {v.version_type}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </SidebarCard>

          {/* カテゴリ */}
          {categoriesList.length > 0 && (
            <SidebarCard title="カテゴリ" icon="fa-solid fa-tags">
              <div className="flex flex-wrap gap-1.5">
                {categoriesList.map((c) => (
                  <span
                    key={c}
                    className="px-2 py-1 rounded-lg theme-sub-box border border-slate-500/30 text-[11px] font-semibold"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </SidebarCard>
          )}

          {/* Client / Server 対応 */}
          {(clientSide || serverSide) && (
            <SidebarCard title="動作環境" icon="fa-solid fa-desktop">
              <dl className="space-y-2 text-xs">
                {clientSide && (
                  <div className="flex justify-between items-center">
                    <dt className="theme-text-muted font-semibold">クライアント側</dt>
                    <dd>
                      <SideBadge tone={clientSide.tone}>{clientSide.label}</SideBadge>
                    </dd>
                  </div>
                )}
                {serverSide && (
                  <div className="flex justify-between items-center">
                    <dt className="theme-text-muted font-semibold">サーバー側</dt>
                    <dd>
                      <SideBadge tone={serverSide.tone}>{serverSide.label}</SideBadge>
                    </dd>
                  </div>
                )}
              </dl>
            </SidebarCard>
          )}

          {/* 外部リンク */}
          {externalLinks.length > 0 && (
            <SidebarCard title="リンク" icon="fa-solid fa-link">
              <ul className="space-y-1.5 text-xs">
                {externalLinks.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <i
                        className={`${l.icon} theme-text-brand w-4 text-center`}
                        aria-hidden
                      />
                      <span className="font-semibold flex-1 min-w-0 truncate">{l.label}</span>
                      <i
                        className="fa-solid fa-arrow-up-right-from-square text-[9px] theme-text-muted"
                        aria-hidden
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </SidebarCard>
          )}

          {/* メタ情報 */}
          <SidebarCard title="メタ情報" icon="fa-solid fa-circle-info">
            <dl className="space-y-1.5 text-xs">
              <MetaRow label="Slug" value={project.slug} mono />
              <MetaRow label="Project ID" value={project.id} mono />
              {project.project_type && (
                <MetaRow label="種別" value={project.project_type} />
              )}
            </dl>
          </SidebarCard>
        </aside>
      </div>

      <ScreenshotGalleryModal
        isOpen={isGalleryOpen}
        images={galleryList}
        onClose={() => setIsGalleryOpen(false)}
      />
      <ModpackImportModal
        isOpen={modpackPlan !== null}
        plan={modpackPlan}
        onConfirm={(choices) => {
          void confirmModpackAdd(choices);
        }}
        onClose={cancelModpackAdd}
      />
    </main>
  );
};

// -----------------------------------------------------------------------------
// 小コンポーネント (このファイル内限定)
// -----------------------------------------------------------------------------
const StatCell: React.FC<{ icon: string; label: string; value: string }> = ({
  icon,
  label,
  value
}) => (
  <div className="theme-sub-box px-4 py-3 flex flex-col gap-0.5">
    <span className="text-[10px] theme-text-muted font-semibold uppercase tracking-wider flex items-center gap-1.5">
      <i className={`${icon} theme-text-brand`} aria-hidden />
      {label}
    </span>
    <span className="font-bold font-mono text-sm sm:text-base truncate">{value}</span>
  </div>
);

const SidebarCard: React.FC<{
  title: string;
  icon: string;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <section className="glass-panel rounded-2xl border shadow-md p-4 sm:p-5">
    <h3 className="text-xs font-bold uppercase tracking-wider theme-text-muted mb-3 flex items-center gap-2">
      <i className={`${icon} theme-text-brand`} aria-hidden />
      {title}
    </h3>
    {children}
  </section>
);

const SideBadge: React.FC<{
  tone: 'brand' | 'amber' | 'muted';
  children: React.ReactNode;
}> = ({ tone, children }) => {
  const className =
    tone === 'brand'
      ? 'bg-emerald-500/20 theme-text-brand border-emerald-500/30'
      : tone === 'amber'
        ? 'bg-amber-500/20 theme-text-amber border-amber-500/30'
        : 'theme-sub-box theme-text-muted border-slate-500/30';
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${className}`}
    >
      {children}
    </span>
  );
};

const MetaRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono
}) => (
  <div className="flex justify-between items-center gap-2">
    <dt className="theme-text-muted font-semibold shrink-0">{label}</dt>
    <dd
      className={`min-w-0 truncate text-right ${mono ? 'font-mono text-[11px]' : 'font-semibold'}`}
      title={value}
    >
      {value}
    </dd>
  </div>
);
