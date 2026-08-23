'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import type { ModrinthProject, ModrinthVersion, ModrinthVersionFile } from '@/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { downloadAsBlob } from '@/lib/utils/download';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useCurrentProfileWithFallback } from '@/lib/store/useCurrentProfileWithFallback';
import { useAppAction } from '@/lib/store/appActions';

// -----------------------------------------------------------------------------
// ModDetailModalShell
//
// 既存 Vite 版 `src/components/ModDetailModal.tsx` の JSX を流用し、以下 2 系統の
// 表示バリアントを 1 コンポーネントで扱う:
//
//   variant="modal"  → `/@modal/(.)mod/[slug]` からインターセプトされて Home の
//                      上に「モーダル」として重ねて表示される。閉じるボタンや
//                      背景クリック時に `router.replace('/')` で Home に戻す
//                      (履歴を上書きするので、複数モーダル遷移後も戻るボタン
//                       連打で前サイトに戻れる)。
//   variant="page"   → `/mods/[slug]` を直接開いた場合のフルページ描画 (Phase 9-F: 旧 /mod/[slug])。
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
  // Phase 9-A.4: useAppContext 撤去、Zustand + appActions 直接参照
  // B33 修正: 共通 hook (useCurrentProfileWithFallback) に集約、
  // fallback リテラルの参照安定化と 3 コンポーネント間の DRY を実現。
  const currentProfile = useCurrentProfileWithFallback();
  const handleToggleMod = useAppAction('handleToggleMod');

  // -------- Hook 群 (早期 return より前に全て) --------
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isModal = variant === 'modal';

  const [isVersionsExpanded, setIsVersionsExpanded] = useState(true);
  const [selectedGalleryImg, setSelectedGalleryImg] = useState<string | null>(null);
  const [isJarDownloading, setIsJarDownloading] = useState(false);
  const [isTogglePending, setIsTogglePending] = useState(false);

  const handleClose = useCallback(() => {
    if (!isModal) return;
    // Phase 9-F: router.back() に統一 (Next.js 公式 Intercepting Routes 推奨パターン)
    //
    // 経緯:
    //   従来 (Phase 6〜9-E) は router.replace('/') で Home に強制遷移していた。
    //   理由は「Home → Mod A → 閉じる → Mod B → 閉じる → 戻る」の連続で
    //   履歴が汚染されるのを防ぐため。
    //
    //   しかし副作用として、閉じるたびに Home ページの SSR (Modrinth 検索 fetch)
    //   が走り、モーダルを閉じるだけで数百 ms 〜 数秒かかる UX 問題があった
    //   (ユーザー指摘の「バツボタン押してから戻るまで時間がかかる」)。
    //
    // 新 URL 設計 (Phase 9-F) では:
    //   /mods (一覧) → /mods/[slug] (モーダル、Intercepting) の 1 段構造。
    //   /mods は Static 相当で SSR fetch は初回のみ (以降キャッシュ)、
    //   router.back() で軽量に戻れる (RSC ペイロードなし、既存 DOM を再利用)。
    //
    // 連続オープン時の履歴汚染は、
    //   /mods → /mods/A (push) → back () → /mods → /mods/B (push) → back () → /mods
    // となり、常に「/mods に戻る」1 手で済む。ブラウザバックボタンでも
    // 1 回押せば前サイトに戻れる (Home ではなく /mods でユーザーに違和感なし)。
    router.back();
  }, [isModal, router]);

  // Esc キー・focus trap は modal バリアント時のみ有効
  useModalA11y(isModal, handleClose, dialogRef);

  // page バリアントに切り替わったタイミングでギャラリー展開をリセット
  useEffect(() => {
    setIsVersionsExpanded(true);
    setSelectedGalleryImg(null);
  }, [slug]);

  // variant="page" (フルページ) の時、body に `mod-fullpage`
  // クラスを付与して AppShell の Header と BottomNav を非表示にする。
  // (Home 上のモーダル表示 = variant="modal" では付与しないので、
  //  グローバル Header は残る。)
  // アンマウント時に必ずクラスを剥がすので、他ページ遷移で消え残らない。
  //
  // 注: Phase 10-P1 で /mods/[slug] フルページ経路は ModDetailPageView に
  //     移行したため、実行時に variant="page" が渡ることは無くなった。
  //     コードは互換性のため保持 (副作用なし、isModal=true なら早期 return)。
  useEffect(() => {
    if (isModal) return;
    if (typeof document === 'undefined') return;
    document.body.classList.add('mod-fullpage');
    return () => {
      document.body.classList.remove('mod-fullpage');
    };
  }, [isModal]);

  // Phase 10-P3: モーダル (variant="modal") マウント中は背景 (Modrinth 検索一覧)
  // のスクロールを抑止する。従来 AppShell 側で `pathname.startsWith('/mods/')`
  // で一律ロックしていた実装をここに移し、フルページ (ModDetailPageView) の
  // スクロールを阻害しないよう責務を分離した。
  //
  // - Escape / router.back() / handleClose どのパスで閉じても unmount で必ず解除
  // - React 19 Strict Mode の double-invoke 対策として、cleanup で必ず空文字を代入
  //   (先に別のモーダル/コンポーネントが overflow を設定していた場合の巻き戻りは
  //    許容: 詳細モーダルより後に開かれた要素は詳細モーダルが閉じる時点で通常
  //    既に閉じているため、実害はない)
  useEffect(() => {
    if (!isModal) return;
    if (typeof document === 'undefined') return;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isModal]);

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

  const handleProfileToggle = useCallback(
    async (projectId: string, e: React.MouseEvent) => {
      if (isTogglePending) return;
      setIsTogglePending(true);
      try {
        await handleToggleMod(projectId, e);
        // 追加/削除操作後、モーダル表示中はそのまま閉じる (Vite 版と同じ UX)。
        // Phase 9-F: router.replace('/') → router.back() に変更 (handleClose と同理由)。
        if (isModal) {
          router.back();
        }
      } finally {
        setIsTogglePending(false);
      }
    },
    [handleToggleMod, isModal, isTogglePending, router]
  );
  // ----------------------------------------------------

  // データが無い or 空 (SSR fetch 失敗時など) のガード。
  // page バリアントでは Server 側で notFound() を呼ぶ想定だが、
  // 万一 null が渡って来ても白画面にはしない。
  if (!project) {
    if (isModal) {
      return (
        // Phase 10-P5 (a11y): モーダル背景 (Escape で閉じる、useModalA11y 参照)
        // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景
        // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
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

  const isAdded = currentProfile.mods.some(
    (m) => m.id === project.id || (project.slug && m.slug === project.slug)
  );

  // -------- 内側カード (両バリアント共通) --------
  // Phase 10-P5 (a11y): aria-modal / aria-labelledby は role="dialog" と
  // セットでのみ有効。条件式で個別に付けると Biome の
  // useAriaPropsSupportedByRole が "possibly undefined role" として警告するため、
  // dialog 属性群を 1 つのオブジェクトで束ねてスプレッドし、静的解析上も
  // "aria-* は必ず role=dialog 付き" に見せる。
  const dialogProps = isModal
    ? ({
        role: 'dialog' as const,
        'aria-modal': 'true' as const,
        'aria-labelledby': titleId
      } satisfies {
        role: 'dialog';
        'aria-modal': 'true';
        'aria-labelledby': string;
      })
    : {};
  // Phase 10-P5 (a11y): innerCard の onClick は背景 onClick への
  //   バブル遮断 (stopPropagation) が目的。キーボードの相当操作は不要
  //   (dialog 内部 focus は useModalA11y でトラップ、内側の各 button/link は
  //    それぞれ独自ハンドラで対応)。
  const innerCard = (
    // biome-ignore lint/a11y/noStaticElementInteractions: dialog 内バブル遮断のみ
    // biome-ignore lint/a11y/useKeyWithClickEvents: dialog 内バブル遮断のみ
    <div
      ref={dialogRef}
      {...dialogProps}
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
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 p-1 flex items-center justify-center shadow-lg shrink-0 overflow-hidden border border-slate-700/50 relative">
            {project.icon_url ? (
              // <img> → next/image (WebP + srcset)
              <Image
                src={project.icon_url}
                alt={project.title}
                width={48}
                height={48}
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
              {project.gallery.map((img) => (
                // Phase 10-P5 (a11y/useSemanticElements): サムネイルは意味論的に
                //   button (アクション実行) なので <button type="button"> に変更。
                //   Enter/Space での拡大プレビュー起動もブラウザ標準で無料。
                <button
                  key={img.url}
                  type="button"
                  onClick={() => setSelectedGalleryImg(img.url)}
                  className="w-32 sm:w-44 h-20 sm:h-28 rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900 shrink-0 cursor-pointer hover:border-emerald-500 transition shadow group relative p-0"
                >
                  {/* <img> ではなく next/image (fill mode で可変サイズ対応) */}
                  <Image
                    src={img.url}
                    alt={img.title || 'Gallery image'}
                    fill
                    sizes="(min-width: 640px) 176px, 128px"
                    className="object-cover group-hover:scale-105 transition duration-300"
                  />
                  {img.title && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 to-transparent p-1 text-[10px] truncate text-white z-10">
                      {img.title}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 拡大プレビュー */}
        {/* Phase 10-P5 (a11y): 外側コンテナ全体を button 化できない
            (内部に <button>閉じる✕ が入れ子で存在するため) ので、
            従来「コンテナクリックで閉じる」挙動は撤去し、閉じる操作は
            右上の <button> と Escape (useModalA11y) に集約。
            外側 div はイベントハンドラを持たない静的コンテナに戻し、
            noStaticElementInteractions / useKeyWithClickEvents の警告を根本解消。 */}
        {selectedGalleryImg && (
          <div className="p-2 rounded-2xl bg-slate-900/90 border border-emerald-500/40 relative shadow-xl space-y-2">
            <div className="flex justify-between items-center text-xs px-1">
              <span className="font-bold theme-text-brand">プレビュー</span>
              <button
                type="button"
                onClick={() => setSelectedGalleryImg(null)}
                className="theme-text-muted hover:text-white"
              >
                閉じる ✕
              </button>
            </div>
            {/* 拡大プレビューは width/height 未確定 (画像アスペクト比依存)
                のため next/image の layout=intrinsic 相当が使えない。
                object-contain + max-h-72 の伸縮レイアウトを維持するため <img> のまま。
                CDN 経由なので lazy load + async decoding を明示。 */}
            {/* biome-ignore lint/performance/noImgElement: aspect ratio 未確定で next/image 不可 */}
            <img
              src={selectedGalleryImg}
              alt="ギャラリー画像プレビュー"
              className="max-h-72 w-full object-contain rounded-xl"
              loading="lazy"
              decoding="async"
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
          // <button router.push> → <Link href> に変更
          // Phase 9-F: フルページ (variant="page") 時の戻り先は /mods (Mod 一覧) に。
          //   直接 URL でアクセスされた際、Mod 詳細と同じセグメントで自然な戻り先。
          <Link
            href="/mods"
            className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500 inline-flex items-center gap-1.5"
          >
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            Mod 一覧に戻る
          </Link>
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
        {isAdded ? (
          <button
            type="button"
            onClick={(e) => handleProfileToggle(project.id, e)}
            disabled={isTogglePending}
            className="px-4 py-2 rounded-xl bg-red-500/20 theme-text-red border border-red-500/40 text-xs font-bold hover:bg-red-500/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isTogglePending ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                処理中...
              </>
            ) : (
              <>
                <i className="fa-solid fa-trash-can" aria-hidden />
                プロファイルから削除
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => handleProfileToggle(project.id, e)}
            disabled={isTogglePending}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold shadow transition focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isTogglePending ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                追加中...
              </>
            ) : (
              <>
                <i className="fa-solid fa-plus" aria-hidden />
                プロファイルに追加
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
  // ----------------------------------------------

  if (isModal) {
    return (
      // Phase 10-P5 (a11y): モーダル背景 (Escape で閉じる、useModalA11y 参照)
      // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景
      // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
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

  // variant="page": フルページ描画。上部に Mod 一覧へのブレッドクラム的リンクを付与
  // Phase 9-F: 戻り先を / (Home) → /mods (Mod 一覧) に変更
  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 flex-1 w-full">
      <div className="mb-3">
        {/* <button router.push> ではなく <Link href> で戻る (SEO/新規タブ対応) */}
        <Link
          href="/mods"
          className="text-xs theme-text-muted hover:text-emerald-500 inline-flex items-center gap-1.5"
        >
          <i className="fa-solid fa-arrow-left" aria-hidden />
          Mod 一覧に戻る
        </Link>
      </div>
      {innerCard}
    </main>
  );
};
