'use client';

import type { AnalyzeProgress } from '@/features/env-import';

const ANALYSIS_PHASE_LABELS: Record<AnalyzeProgress['phase'], string> = {
  detect: '環境検出',
  scan: 'ファイル走査',
  read: 'ファイル読み込み',
  hash: 'ハッシュ計算',
  resolve: 'Modrinth 照合'
};

// ---------------------------------------------------------------------------
// フォルダ選択 → 解析 (Phase 11) → 自動紐付け (P12-D1) の UI 表示部。
// 状態と解析フローは親 (NewProfileModal) が持ち、ここは表示と操作のみを担う。
// ---------------------------------------------------------------------------
export function FolderImportSection({
  canPickFolder,
  analyzing,
  folderName,
  analysisProgress,
  folderError,
  onPickFolder
}: {
  canPickFolder: boolean;
  analyzing: boolean;
  folderName: string | null;
  analysisProgress: AnalyzeProgress | null;
  folderError: string | null;
  onPickFolder: () => void;
}) {
  return (
    <div>
      <span className="block text-xs font-semibold theme-text-secondary mb-1">
        Minecraft フォルダ (任意)
      </span>
      <button
        type="button"
        onClick={onPickFolder}
        disabled={!canPickFolder || analyzing}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl theme-sub-box text-xs sm:text-sm font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
      >
        <span className="flex items-center gap-2 min-w-0">
          <i className="fa-solid fa-folder-open theme-text-brand" aria-hidden />
          <span className="truncate">
            {folderName ? folderName : canPickFolder ? 'フォルダを選択' : 'このブラウザでは非対応'}
          </span>
        </span>
        <i className="fa-solid fa-ellipsis theme-text-muted" aria-hidden />
      </button>
      <p className="mt-1 text-[11px] theme-text-muted leading-relaxed">
        {canPickFolder
          ? '.minecraft または Prism インスタンス などを選ぶと、環境とファイルを自動解析します。'
          : 'Firefox / Safari / モバイルはフォルダ選択非対応です。「.minecraft を ZIP 化して読み込む」をご利用ください。'}
      </p>
      {analyzing && (
        <p className="mt-1 text-[11px] theme-text-muted" role="status">
          <i className="fa-solid fa-spinner fa-spin mr-1" aria-hidden />
          解析中...{' '}
          {analysisProgress
            ? `${ANALYSIS_PHASE_LABELS[analysisProgress.phase]}${
                analysisProgress.total > 1
                  ? ` (${analysisProgress.done}/${analysisProgress.total})`
                  : ''
              }`
            : '準備中'}
        </p>
      )}
      {folderError && <p className="mt-1 text-[11px] theme-text-amber">{folderError}</p>}
    </div>
  );
}
