'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ModrinthProject, ModrinthVersion, ModrinthVersionFile } from '@/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { downloadAsBlob } from '@/lib/utils/download';
import { useModalA11y } from '@/hooks/useModalA11y';

// -----------------------------------------------------------------------------
// ModDetailModalShell (Phase 4)
//
// 既存 Vite 版 `src/components/ModDetailModal.tsx` の JSX を流用し、以下 2 系統の
// 表示バリアントを 1 コンポーネントで扱う:
//
//   variant="modal"  → `/@modal/(.)mod/[slug]` からインターセプトされて Home の
//                      上に「モーダル」として重ねて表示される。閉じるボタンや
//                      背景クリック時に `router.back()` で URL を元に戻す。
//   variant="page"   → `/mod/[slug]` を直接開いた場合のフルページ描画。
//                      背景・backdrop なし、閉じるボタンなし。SEO/OGP 対象。
//
// project / versions は Server Component 側 (RSC) が既に取得したものを
// props として受け取る (fetch 二重化を避けるため)。
//
// ⚠️ Rules of Hooks:
//   すべての useCallback / useEffect / useState / useRef / useId / useModalA11y
//   は「早期 return より前」に置く。過去にモーダル系で React error #310 を再発
//   させたため、この規約を厳守。
// -----------------------------------------------------------------------------

type Variant = 'modal' | 'page';

interface Props {
  project: ModrinthProject | null;
  versions: ModrinthVersion[];
  variant: Variant;
  /** 直接開かれた時 (variant="page") にホームへの導線を表示するか */
  slug: string;
}

function formatDownloads(num: number): string {
  if (!num) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

function pickPrimaryFile(v: ModrinthVersion | null): ModrinthVersionFile | null {
  if (!v || !v.files || v.files.length === 0) return null;
  return v.files.find((f) => f.primary) || v.files[0] || null;
}

export const ModDetailModalShell: React.FC<Props> = ({
  project,
  versions,
  variant,
  slug
}) => {
  const router = useRouter();

  // -------- Hook 群 (早期 return より前に全て) --------
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isModal = variant === 'modal';

  const [isVersionsExpanded, setIsVersionsExpanded] = useState(true);
  const [selectedGalleryImg, setSelectedGalleryImg] = useState<string | null>(null);
  const [isJarDownloading, setIsJarDownloading] = useState(false);

  const handleClose = useCallback(() => {
    if (!isModal) return;
    // Home からのソフトナビの場合 router.back() で URL 復元、
    // 直接 hard navigate の場合は back スタックが無いので Home へ push。
    // window.history の長さで判定 (SSR ガードあり)。
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }, [isModal, router]);

  // Esc キー・focus trap は modal バリアント時のみ有効
  useModalA11y(isModal, handleClose, dialogRef);

  // page バリアントに切り替わったタイミングでギャラリー展開をリセット
  useEffect(() => {
    setIsVersionsExpanded(true);
    setSelectedGalleryImg(null);
  }, [slug]);

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
  // ----------------------------------------------------

  // データが無い or 空 (SSR fetch 失敗時など) のガード。
  // page バリアントでは Server 側で notFound() を呼ぶ想定だが、
  // 万一 null が渡って来ても白画面にはしない。
  if (!project) {
    if (isModal) {
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md"
          style={{ backgroundColor: 'var(--modal-overlay)' }}
          onClick={handleClose}
        >
          <div className="glass-panel rounded-2xl p-6 text-center text-xs theme-text-muted">
            Mod 情報を読み込めませんでした。
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-3xl mx-auto p-6 text-center text-xs theme-text-muted">
        Mod 情報を読み込めませんでした。
      </div>
    );
  }

  const latestVersion = versions[0] ?? null;
  const latestFile = pickPrimaryFile(latestVersion);
  const displayedVersions = isVersionsExpanded ? versions : [];

  // -------- 内側カード (両バリアント共通) --------
  const innerCard = (
    <div
      ref={dialogRef}
      role={isModal ? 'dialog' : undefined}
      aria-modal={isModal ? 'true' : undefined}
      aria-labelledby={titleId}
      className={
        isModal
          ? 'modal-card glass-panel w-full max-w-3xl rounded-3xl border shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden'
          : 'modal-card glass-panel w-full max-w-3xl mx-auto rounded-3xl border shadow-2xl relative flex flex-col overflow-hidden'
      }
      onClick={(e) => {
        if (isModal) e.stopPropagation();
      }}
    >
      {/* 固定ヘッダー (題名) */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-500/20 p-4 sm:p-6 pb-4 shrink-0 bg-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 p-1 flex items-center justify-center shadow-lg shrink-0 overflow-hidden border border-slate-700/50">
            {project.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.icon_url}
                alt={project.title}
                className="w-full h-full object-contain rounded-xl"
              />
            ) : (
              <i className="fa-solid fa-cube text-2xl text-emerald-400" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="font-extrabold text-base sm:text-xl truncate">
              {project.title}
            </h3>
            <p className="text-xs theme-text-muted truncate">
              {`Slug: ${project.slug} • 作成: ${new Date(project.published).toLocaleDateString()}`}
            </p>
          </div>
        </div>
        {isModal && (
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="theme-text-muted hover:text-emerald-500 p-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg shrink-0"
          >
            <i className="fa-solid fa-xmark text-lg" aria-hidden />
          </button>
        )}
      </div>

      {/* スクロール可能コンテンツエリア */}
      <div
        className={
          isModal
            ? 'flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'p-4 sm:p-6 space-y-4'
        }
      >
        {/* 統計バー */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="theme-sub-box p-2.5 rounded-xl">
            <span className="text-xs theme-text-muted block font-semibold">
              ダウンロード数
            </span>
            <span className="font-bold theme-text-brand font-mono text-sm">
              {formatDownloads(project.downloads)}
            </span>
          </div>
          <div className="theme-sub-box p-2.5 rounded-xl">
            <span className="text-xs theme-text-muted block font-semibold">
              最終更新日
            </span>
            <span className="font-semibold font-mono text-sm">
              {new Date(project.updated).toLocaleDateString()}
            </span>
          </div>
          <div className="theme-sub-box p-2.5 rounded-xl col-span-2 sm:col-span-1">
            <span className="text-xs theme-text-muted block font-semibold">
              カテゴリ
            </span>
            <span className="font-semibold text-sm capitalize truncate block">
              {project.categories && project.categories.length > 0
                ? project.categories.join(', ')
                : 'mod'}
            </span>
          </div>
        </div>

        {/* ギャラリー画像 */}
        {project.gallery && project.gallery.length > 0 && (
          <div className="space-y-2 pt-1">
            <span className="text-xs font-bold uppercase tracking-wider theme-text-muted flex items-center gap-1.5">
              <i className="fa-solid fa-images theme-text-brand" aria-hidden />
              {`ギャラリー・スクリーンショット (${project.gallery.length})`}
            </span>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 touch-pan-x hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {project.gallery.map((img, idx) => (
                <div
                  key={`${img.url}-${idx}`}
                  onClick={() => setSelectedGalleryImg(img.url)}
                  className="w-32 sm:w-44 h-20 sm:h-28 rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900 shrink-0 cursor-pointer hover:border-emerald-500 transition shadow group relative"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.title || 'Gallery image'}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                  {img.title && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 to-transparent p-1 text-[10px] truncate text-white">
                      {img.title}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 拡大プレビュー */}
        {selectedGalleryImg && (
          <div
            className="p-2 rounded-2xl bg-slate-900/90 border border-emerald-500/40 relative shadow-xl space-y-2 cursor-pointer"
            onClick={() => setSelectedGalleryImg(null)}
          >
            <div className="flex justify-between items-center text-xs px-1">
              <span className="font-bold theme-text-brand">プレビュー</span>
              <button
                type="button"
                className="theme-text-muted hover:text-white"
              >
                閉じる ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedGalleryImg}
              alt=""
              className="max-h-72 w-full object-contain rounded-xl"
            />
          </div>
        )}

        {/* 本文 (Markdown) */}
        <div className="space-y-2 pt-2 border-t border-slate-500/10">
          <span className="text-xs font-bold uppercase tracking-wider theme-text-muted block">
            詳細説明 (Body)
          </span>
          <div
            className={
              isModal
                ? 'theme-sub-box p-4 rounded-2xl max-h-96 overflow-y-auto border border-slate-500/15 hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
                : 'theme-sub-box p-4 rounded-2xl border border-slate-500/15'
            }
          >
            {project.body ? (
              <MarkdownRenderer content={project.body} />
            ) : (
              <p className="text-xs theme-text-muted">
                {project.description || '詳細本文はありません。'}
              </p>
            )}
          </div>
        </div>

        {/* 対応バージョン一覧 */}
        <div className="space-y-2 pt-2 border-t border-slate-500/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider theme-text-muted">
              {`対応バージョン一覧 (${versions.length})`}
            </span>
            {versions.length > 0 && (
              <button
                type="button"
                onClick={() => setIsVersionsExpanded(!isVersionsExpanded)}
                className="text-xs font-bold theme-text-brand hover:underline flex items-center gap-1"
              >
                <span>
                  {isVersionsExpanded
                    ? '折りたたむ'
                    : `すべて表示 (${versions.length}件)`}
                </span>
                <i
                  className={`fa-solid fa-chevron-${
                    isVersionsExpanded ? 'up' : 'down'
                  } text-[10px]`}
                  aria-hidden
                />
              </button>
            )}
          </div>

          {isVersionsExpanded && displayedVersions.length > 0 && (
            <div
              className={
                isModal
                  ? 'flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pt-1 hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
                  : 'flex flex-wrap gap-1.5 pt-1'
              }
            >
              {displayedVersions.map((v) => (
                <span
                  key={v.id}
                  className="px-2.5 py-1 rounded-lg theme-badge text-xs font-mono flex items-center gap-1 shadow-sm"
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
          {versions.length === 0 && (
            <p className="text-xs theme-text-muted">
              このプロファイル向けの対応バージョンは見つかりませんでした。
            </p>
          )}
        </div>
      </div>

      {/* 固定フッターアクション */}
      <div className="flex justify-end gap-2 p-4 sm:p-6 pt-3 border-t border-slate-500/20 shrink-0 bg-transparent flex-wrap">
        {isModal ? (
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            閉じる
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500 flex items-center gap-1.5"
          >
            <i className="fa-solid fa-house" aria-hidden />
            ホームに戻る
          </button>
        )}
        {latestFile && (
          <button
            type="button"
            onClick={() => handleJarDownload(latestFile)}
            disabled={isJarDownloading}
            className="btn-hover-effect px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isJarDownloading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                DL中...
              </>
            ) : (
              <>
                <i className="fa-solid fa-download" aria-hidden />
                .jar 直DL
              </>
            )}
          </button>
        )}
        {/* Phase 5 で useProfiles と連携して「プロファイルに追加/削除」ボタンを復活予定 */}
      </div>
    </div>
  );
  // ----------------------------------------------

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md touch-action-none"
        style={{ backgroundColor: 'var(--modal-overlay)' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
        onTouchMove={(e) => {
          if (e.target === e.currentTarget) e.preventDefault();
        }}
      >
        {innerCard}
      </div>
    );
  }

  // variant="page": フルページ描画。上部にホームへのブレッドクラム的リンクを付与
  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <div className="mb-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="text-xs theme-text-muted hover:text-emerald-500 inline-flex items-center gap-1.5"
        >
          <i className="fa-solid fa-arrow-left" aria-hidden />
          ホームに戻る
        </button>
      </div>
      {innerCard}
    </main>
  );
};
