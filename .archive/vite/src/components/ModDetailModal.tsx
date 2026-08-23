import React, { useEffect, useRef, useState, useId } from 'react';
import { Profile, ModrinthProject, ModrinthVersion } from '../types';
import { fetchModrinth, fetchStableModVersion } from '../services/api';
import { MarkdownRenderer } from './MarkdownRenderer';
import { downloadAsBlob } from '../utils/download';
import { useModalA11y } from '../hooks/useModalA11y';

interface ModDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
  profile: Profile;
  onToggleMod: (id: string, e: React.MouseEvent) => void;
}

function formatDownloads(num: number): string {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export const ModDetailModal: React.FC<ModDetailModalProps> = ({
  isOpen,
  onClose,
  projectId,
  profile,
  onToggleMod
}) => {
  const [project, setProject] = useState<ModrinthProject | null>(null);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [targetVersion, setTargetVersion] = useState<ModrinthVersion | null>(null);
  const [loading, setLoading] = useState(false);
  // 対応バージョン一覧は「デフォルトで展開状態」で表示。
  // モーダルを開いた瞬間から全件が見え、明示的に折りたたむこともできる。
  const [isVersionsExpanded, setIsVersionsExpanded] = useState(true);
  const [selectedGalleryImg, setSelectedGalleryImg] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // ⚠️ Rules of Hooks: 早期リターン (下の `if (!isOpen ...) return null`)
  //    より前で、すべてのフック呼び出しを終わらせておく必要がある。
  //    以前は useRef/useId/useModalA11y を return 後に置いていたため、
  //    isOpen トグルで React が「レンダー毎のフック数変化」を検知して
  //    アプリ全体をクラッシュさせていた (真っ暗の原因)。
  // ---------------------------------------------------------------------
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(isOpen, onClose, dialogRef);

  useEffect(() => {
    if (!isOpen || !projectId) {
      // モーダルが閉じたら以前のデータを完全にクリア
      // (次に別のModで開いた際に前回情報がチラつくのを防ぐ)
      setProject(null);
      setVersions([]);
      setTargetVersion(null);
      setLoading(false);
      // 次回オープン時もデフォルトで展開状態にリセット
      setIsVersionsExpanded(true);
      setSelectedGalleryImg(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // モーダルを別のMod用に開き直したときも展開状態でスタート
    setIsVersionsExpanded(true);
    setSelectedGalleryImg(null);
    setProject(null);
    setVersions([]);
    setTargetVersion(null);
    Promise.all([
      fetchModrinth<ModrinthProject>(`/project/${projectId}`),
      fetchStableModVersion(projectId, profile)
    ])
      .then(([pData, verRes]) => {
        if (cancelled) return;
        setProject(pData);
        if (verRes) {
          setVersions(verRes.allVersions);
          setTargetVersion(verRes.targetVersion);
        }
      })
      .catch((e) => {
        if (!cancelled) console.error('[DropMod] Mod detail fetch failed:', e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // profile 全体ではなく loader/mcVersion のみを見て不要な再フェッチを避ける
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, profile.mcVersion, profile.loader]);

  if (!isOpen || !projectId) return null;

  const isAdded = profile.mods.some(
    (m) => m.id === projectId || (project && m.slug === project.slug)
  );

  const latestFile =
    targetVersion && targetVersion.files && targetVersion.files[0]
      ? targetVersion.files.find((f) => f.primary) || targetVersion.files[0]
      : null;

  // 初期状態（折りたたみ時）は0件、展開時にすべてのバージョンを表示
  const displayedVersions = isVersionsExpanded ? versions : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md touch-action-none"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-card glass-panel w-full max-w-3xl rounded-3xl border shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 固定ヘッダー（題名） */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-500/20 p-4 sm:p-6 pb-4 shrink-0 bg-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 p-1 flex items-center justify-center shadow-lg shrink-0 overflow-hidden border border-slate-700/50">
              {project?.icon_url ? (
                <img
                  src={project.icon_url}
                  alt={project.title}
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <i className="fa-solid fa-cube text-2xl text-emerald-400"></i>
              )}
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="font-extrabold text-base sm:text-xl truncate">
                {loading ? '読み込み中...' : project?.title}
              </h3>
              <p className="text-xs theme-text-muted truncate">
                {project ? `Slug: ${project.slug} • 作成: ${new Date(project.published).toLocaleDateString()}` : '...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="theme-text-muted hover:text-emerald-500 p-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg shrink-0"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* スクロール可能コンテンツエリア（スクロールバー非表示） */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* 統計バー */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="theme-sub-box p-2.5 rounded-xl">
              <span className="text-xs theme-text-muted block font-semibold">ダウンロード数</span>
              <span className="font-bold theme-text-brand font-mono text-sm">
                {project ? formatDownloads(project.downloads) : '0'}
              </span>
            </div>
            <div className="theme-sub-box p-2.5 rounded-xl">
              <span className="text-xs theme-text-muted block font-semibold">最終更新日</span>
              <span className="font-semibold font-mono text-sm">
                {project ? new Date(project.updated).toLocaleDateString() : '----/--/--'}
              </span>
            </div>
            <div className="theme-sub-box p-2.5 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-xs theme-text-muted block font-semibold">カテゴリ</span>
              <span className="font-semibold text-sm capitalize truncate block">
                {project?.categories ? project.categories.join(', ') : 'mod'}
              </span>
            </div>
          </div>

          {/* ギャラリー画像 */}
          {project?.gallery && project.gallery.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold uppercase tracking-wider theme-text-muted flex items-center gap-1.5">
                <i className="fa-solid fa-images theme-text-brand"></i> ギャラリー・スクリーンショット ({project.gallery.length})
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 touch-pan-x hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {project.gallery.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedGalleryImg(img.url)}
                    className="w-32 sm:w-44 h-20 sm:h-28 rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900 shrink-0 cursor-pointer hover:border-emerald-500 transition shadow group relative"
                  >
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
              className="p-2 rounded-2xl bg-slate-900/90 border border-emerald-500/40 relative shadow-xl space-y-2"
              onClick={() => setSelectedGalleryImg(null)}
            >
              <div className="flex justify-between items-center text-xs px-1">
                <span className="font-bold theme-text-brand">プレビュー</span>
                <button className="theme-text-muted hover:text-white">閉じる ✕</button>
              </div>
              <img src={selectedGalleryImg} alt="" className="max-h-72 w-full object-contain rounded-xl" />
            </div>
          )}

          {/* 本文 (Body / Markdown / YouTube) セクション */}
          <div className="space-y-2 pt-2 border-t border-slate-500/10">
            <span className="text-xs font-bold uppercase tracking-wider theme-text-muted block">
              詳細説明 (Body)
            </span>
            <div className="theme-sub-box p-4 rounded-2xl max-h-96 overflow-y-auto border border-slate-500/15 hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {loading ? (
                <div className="py-8 text-center theme-text-muted text-xs">
                  <i className="fa-solid fa-spinner fa-spin theme-text-brand text-lg mb-2"></i>
                  <p>詳細本文を読み込んでいます...</p>
                </div>
              ) : project?.body ? (
                <MarkdownRenderer content={project.body} />
              ) : (
                <p className="text-xs theme-text-muted">{project?.description || '詳細本文はありません。'}</p>
              )}
            </div>
          </div>

          {/* 対応バージョン一覧 (全折りたたみ / 全表示) */}
          <div className="space-y-2 pt-2 border-t border-slate-500/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider theme-text-muted">
                対応バージョン一覧 ({versions.length})
              </span>
              {versions.length > 0 && (
                <button
                  onClick={() => setIsVersionsExpanded(!isVersionsExpanded)}
                  className="text-xs font-bold theme-text-brand hover:underline flex items-center gap-1"
                >
                  <span>{isVersionsExpanded ? '折りたたむ' : `すべて表示 (${versions.length}件)`}</span>
                  <i className={`fa-solid fa-chevron-${isVersionsExpanded ? 'up' : 'down'} text-[10px]`}></i>
                </button>
              )}
            </div>

            {isVersionsExpanded && displayedVersions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pt-1 hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
          </div>
        </div>

        {/* 固定フッターアクション */}
        <div className="flex justify-end gap-2 p-4 sm:p-6 pt-3 border-t border-slate-500/20 shrink-0 bg-transparent">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            閉じる
          </button>
          <div className="flex items-center gap-2">
            {latestFile && (
              <button
                type="button"
                onClick={async () => {
                  const r = await downloadAsBlob(latestFile.url, latestFile.filename);
                  if (!r.ok && r.error !== 'Aborted') {
                    console.warn('[DropMod] jar direct download failed:', r);
                  }
                }}
                className="btn-hover-effect px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <i className="fa-solid fa-download"></i> .jar 直DL
              </button>
            )}
            {isAdded ? (
              <button
                onClick={(e) => {
                  onToggleMod(projectId, e);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-red-500/20 theme-text-red border border-red-500/40 text-xs font-bold hover:bg-red-500/30 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                プロファイルから削除
              </button>
            ) : (
              <button
                onClick={(e) => {
                  onToggleMod(projectId, e);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold shadow transition focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                プロファイルに追加
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};