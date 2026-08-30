'use client';

import type React from 'react';
import { useState, useEffect, useRef, useId } from 'react';
import { CustomDropdown } from '@/components/ui/CustomDropdown';
import type { ProjectItem, ProfileContentExtras, UnknownFile } from '@/types';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useModalRegistration } from '@/hooks/useModalUi';
import { supportsDirectoryPicker } from '@/lib/env/capabilities';
import { pickMinecraftDirectory, type PickedDirectory } from '@/features/env-import';
import { rootTypeLabel, type DetectedEnvironment } from '@/features/env-import';
import {
  analyzeEnvironmentSource,
  type AnalyzeProgress,
  type ImportAnalysis
} from '@/features/env-import';
import { analyzeImportHealth, type AnalysisIssue } from '@/lib/env/analysis';
import { generateProfileName } from '@/features/env-import';
import { LOADER_DROPDOWN_OPTIONS } from '../loaders/loaderVersions';
import { useLoaderVersionOptions } from '../hooks/useLoaderVersionOptions';
import type { PendingImportData } from '@/lib/store/zipImport';

interface NewProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  mcVersions: string[];
  initialImportData?: PendingImportData | null;
  onCreate: (
    name: string,
    mcVersion: string,
    loader: string,
    desc: string,
    mods?: ProjectItem[],
    loaderVersion?: string,
    extras?: ProfileContentExtras,
    // P12-D1: フォルダ選択 → 自動紐付け (作成時に linkedSource + dirHandles を保存)
    link?: { picked: PickedDirectory; detected: DetectedEnvironment }
  ) => void | Promise<void>;
}


// ---------------------------------------------------------------------------
// Phase 11: 解析結果の表示 (Analysis View、計画書 §6.1 / §6.2 相当)
// フォルダ解析 (folderAnalysis) と ZIP 環境取り込み (initialImportData) の
// 両経路で使う。Phase 11 は Read-only。
// ---------------------------------------------------------------------------

/**
 * ZIP 環境取り込み (pendingImportData) の表示件数。
 * フォルダ解析の scannedCounts (照合成功 + 未識別の合計) と同じ意味にするため、
 * 未識別ファイルは location からカテゴリ別に加算する。
 */
function countImportedContents(data: PendingImportData | null | undefined): {
  mods: number;
  resourcepacks: number;
  shaderpacks: number;
} {
  const unknown = data?.unknownFiles ?? [];
  return {
    mods: (data?.mods.length ?? 0) + unknown.filter((f) => f.location === 'mods').length,
    resourcepacks:
      (data?.resourcepacks?.length ?? 0) +
      unknown.filter((f) => f.location === 'resourcepacks').length,
    shaderpacks:
      (data?.shaderpacks?.length ?? 0) +
      unknown.filter((f) => f.location === 'shaderpacks').length
  };
}

const ANALYSIS_PHASE_LABELS: Record<AnalyzeProgress['phase'], string> = {
  detect: '環境検出',
  scan: 'ファイル走査',
  read: 'ファイル読み込み',
  hash: 'ハッシュ計算',
  resolve: 'Modrinth 照合'
};

function AnalysisSection({
  issues,
  counts,
  environment,
  unknownFiles
}: {
  issues: AnalysisIssue[];
  counts: { mods: number; resourcepacks: number; shaderpacks: number };
  environment: {
    mcVersion?: string;
    loader?: string;
    loaderVersion?: string;
    rootType?: string;
  };
  unknownFiles: UnknownFile[];
}) {
  const envText =
    [
      environment.mcVersion ? `Minecraft ${environment.mcVersion}` : undefined,
      environment.loader,
      environment.loaderVersion
    ]
      .filter(Boolean)
      .join(' / ') || '未検出 (下で手動設定してください)';

  return (
    <div
      className="rounded-xl theme-sub-box border border-slate-500/20 p-3 space-y-2"
      role="status"
      aria-label="解析結果"
    >
      <div className="text-xs font-bold theme-text-secondary flex items-center gap-1.5">
        <i className="fa-solid fa-clipboard-check theme-text-brand" aria-hidden />
        解析結果 (Read-only)
      </div>
      <div className="text-[11px] theme-text-muted space-y-0.5">
        <div>
          <span className="font-semibold">環境: </span>
          {envText}
        </div>
        {environment.rootType && (
          <div>
            <span className="font-semibold">構造: </span>
            {rootTypeLabel(environment.rootType)}
          </div>
        )}
        <div>
          <span className="font-semibold">内容: </span>
          {counts.mods} 個のMod / {counts.resourcepacks} 個のリソースパック /{' '}
          {counts.shaderpacks} 個のシェーダー
          {unknownFiles.length > 0 && ` / 未識別 ${unknownFiles.length} 個`}
        </div>
      </div>
      <ul className="space-y-1">
        {issues.map((issue) => (
          <li key={issue.id} className="text-[11px] flex gap-1.5 items-start">
            <span
              aria-hidden
              className={
                issue.status === 'ok'
                  ? 'text-emerald-500 shrink-0'
                  : issue.status === 'warning'
                    ? 'text-amber-500 shrink-0'
                    : 'text-red-500 shrink-0'
              }
            >
              {issue.status === 'ok' ? '✓' : issue.status === 'warning' ? '⚠' : '✗'}
            </span>
            <span className="min-w-0">
              <span className="theme-text-secondary">{issue.message}</span>
              {issue.details.length > 0 && (
                <details className="theme-text-muted mt-0.5">
                  <summary className="cursor-pointer list-none underline decoration-dotted">
                    詳細 ({issue.details.length})
                  </summary>
                  <ul className="list-disc pl-4 mt-0.5 space-y-0.5 break-all">
                    {issue.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </details>
              )}
            </span>
          </li>
        ))}
      </ul>
      {unknownFiles.length > 0 && (
        <details className="text-[11px] theme-text-muted">
          <summary className="cursor-pointer list-none underline decoration-dotted">
            未識別ファイル一覧 ({unknownFiles.length})
          </summary>
          <ul className="list-disc pl-4 mt-0.5 space-y-0.5 break-all">
            {unknownFiles.map((file) => (
              <li key={file.id}>{file.path}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[10px] theme-text-muted leading-relaxed">
        ⓘ Phase 11 は読み取り専用です。ローカル環境への書き込み (同期) は Phase 12
        で実装予定です。
      </p>
    </div>
  );
}

export const NewProfileModal: React.FC<NewProfileModalProps> = ({
  isOpen,
  onClose,
  mcVersions,
  initialImportData,
  onCreate
}) => {
  const [name, setName] = useState('');
  const [version, setVersion] = useState(mcVersions[0] || '1.21.4');
  const [loader, setLoader] = useState('Fabric');
  const [loaderVersion, setLoaderVersion] = useState('');
  const [desc, setDesc] = useState('');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [canPickFolder, setCanPickFolder] = useState(() => supportsDirectoryPicker());
  // Phase 11: フォルダ解析 (Read-only Import)
  const [folderAnalysis, setFolderAnalysis] = useState<ImportAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalyzeProgress | null>(null);
  // P12-D1: 解析に成功したフォルダ (作成時に自動紐付けする)
  const [pickedFolder, setPickedFolder] = useState<PickedDirectory | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const wasOpenRef = useRef<boolean>(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: モーダル open 時のみ snapshot をロード
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    setCanPickFolder(supportsDirectoryPicker());
    setFolderName(null);
    setFolderError(null);
    setFolderAnalysis(null);
    setAnalyzing(false);
    setAnalysisProgress(null);
    setPickedFolder(null);

    if (initialImportData) {
      setName(initialImportData.name);
      if (initialImportData.mcVersion && mcVersions.includes(initialImportData.mcVersion)) {
        setVersion(initialImportData.mcVersion);
      } else {
        const first = mcVersions[0];
        if (first) setVersion(first);
      }
      if (initialImportData.loader) {
        setLoader(initialImportData.loader);
      }
      if (initialImportData.loaderVersion) {
        setLoaderVersion(initialImportData.loaderVersion);
      }
      if (initialImportData.source === 'duplicate') {
        setDesc(initialImportData.description ?? '');
      } else {
        setDesc(
          initialImportData.description ??
            `ZIPインポート (${initialImportData.mods.length} 個のMod入り)`
        );
      }
    } else {
      setName('');
      const first = mcVersions[0];
      if (first) setVersion(first);
      setLoader('Fabric');
      setLoaderVersion('');
      setDesc('');
    }
  }, [isOpen]);

  const { versions: loaderVersions, options: loaderVersionOptions } = useLoaderVersionOptions(
    loader,
    version,
    isOpen,
    initialImportData?.loaderVersion
  );

  useEffect(() => {
    if (!isOpen) return;
    if (loaderVersions.length === 0) {
      setLoaderVersion('');
      return;
    }
    if (!loaderVersion || !loaderVersions.includes(loaderVersion)) {
      setLoaderVersion(loaderVersions[0] ?? '');
    }
  }, [isOpen, loaderVersion, loaderVersions]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const nameInputId = useId();
  const versionSelectId = useId();
  const loaderSelectId = useId();
  const loaderVersionSelectId = useId();
  const descInputId = useId();
  useModalA11y(isOpen, onClose, dialogRef);
  // モーダル open 中は BottomNav を隠す (2026-08-27)
  useModalRegistration(isOpen);

  if (!isOpen) return null;

  const versionOptions = mcVersions.map((v) => ({
    label: `Minecraft ${v}${v === mcVersions[0] ? ' (最新版)' : ''}`,
    value: v
  }));

  const handlePickFolder = async () => {
    setFolderError(null);
    setFolderAnalysis(null);
    setPickedFolder(null);
    if (!supportsDirectoryPicker()) {
      setFolderError('このブラウザではフォルダ選択できません。Chrome / Edge をご利用ください。');
      return;
    }

    let picked: Awaited<ReturnType<typeof pickMinecraftDirectory>>;
    try {
      picked = await pickMinecraftDirectory();
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : 'フォルダを開けませんでした。');
      return;
    }
    if (!picked) return; // ユーザーキャンセル

    setFolderName(picked.source.rootName);
    setAnalyzing(true);
    setAnalysisProgress(null);
    try {
      const analysis = await analyzeEnvironmentSource(picked.source, (progress) =>
        setAnalysisProgress(progress)
      );
      setFolderAnalysis(analysis);
      // P12-D1: 解析に成功したときだけ紐付け対象として保持する
      // (解析失敗時に紐付けだけ残る状態を防ぐ)
      setPickedFolder(picked);

      // §6.1: 自動生成ルール (あくまでデフォルト値。ユーザーが編集可能)
      setName(generateProfileName(picked.source.rootName, analysis.environment));
      if (
        analysis.environment.mcVersion &&
        mcVersions.includes(analysis.environment.mcVersion)
      ) {
        setVersion(analysis.environment.mcVersion);
      }
      if (analysis.environment.loader) {
        setLoader(analysis.environment.loader);
      }
      if (analysis.environment.loaderVersion) {
        setLoaderVersion(analysis.environment.loaderVersion);
      }
      const total =
        analysis.mods.length +
        analysis.resourcepacks.length +
        analysis.shaderpacks.length;
      setDesc(
        `フォルダ取込 (${total} 個 / 未識別 ${analysis.unknownFiles.length} 個)`
      );
    } catch (e) {
      setFolderError(
        e instanceof Error ? `解析に失敗しました: ${e.message}` : '解析に失敗しました。'
      );
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || analyzing || submitting) {
      return;
    }
    // フォルダ解析結果 > ZIP/.mrpack 取り込みデータ > 空
    const mods = folderAnalysis?.mods || initialImportData?.mods || [];
    const extras: ProfileContentExtras = {
      resourcepacks:
        folderAnalysis?.resourcepacks ?? initialImportData?.resourcepacks,
      shaderpacks: folderAnalysis?.shaderpacks ?? initialImportData?.shaderpacks,
      unknownFiles: folderAnalysis?.unknownFiles ?? initialImportData?.unknownFiles
    };
    // P12-D1: フォルダ解析成功時のみ自動紐付け情報を渡す
    const link =
      folderAnalysis && pickedFolder
        ? { picked: pickedFolder, detected: folderAnalysis.environment }
        : undefined;
    // **P12-E2E 修正 (2026-08-29)**: onCreate を await してから閉じる。
    // 従来は `void onCreate(...)` で即 onClose() していたため、
    // (1) 作成 (即時永続化) が完了する前にモーダルが閉じ、
    // (2) onCreate が reject すると unhandled rejection になる。
    // Promise が解決 = 永続化完了 (useProfiles 側で Dexie 書込を await) を
    // 保証してから閉じることで、直後のページ遷移でも Profile が失われない。
    setSubmitting(true);
    try {
      await onCreate(
        trimmedName,
        version,
        loader,
        desc.trim(),
        mods,
        loaderVersion || undefined,
        extras,
        link
      );
      setName('');
      setDesc('');
      setFolderAnalysis(null);
      setFolderName(null);
      setPickedFolder(null);
      onClose();
    } catch (err) {
      // 失敗時はモーダルを閉じない (入力値を保持して再試行できるようにする)
      console.error('[DropMod] プロファイル作成に失敗:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景 (Escape で閉じる)
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 touch-action-none"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog 内バブル遮断のみ */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-card glass-panel w-full max-w-md rounded-3xl p-5 sm:p-6 border shadow-2xl relative space-y-4 modal-max-h overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-500/20 pb-3">
          <h3 id={titleId} className="font-bold text-base sm:text-lg flex items-center gap-2">
            <i className="fa-solid fa-folder-plus theme-text-brand"></i>
            {initialImportData?.source === 'duplicate'
              ? 'プロファイルを複製'
              : initialImportData
                ? 'ZIPからプロファイル作成'
                : '新規プロファイル作成'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="theme-text-muted hover:text-emerald-500 p-2 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {initialImportData && initialImportData.source !== 'duplicate' && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
            <div className="font-bold theme-text-brand flex items-center gap-1.5">
              <i className="fa-solid fa-file-zipper"></i> ZIP内の.jarハッシュ照合完了
            </div>
            <div className="theme-text-secondary">
              Modrinth上で特定された <span className="font-bold theme-text-brand">{initialImportData.mods.length} 個</span> のModを含むプロファイルを作成します。
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor={nameInputId}
              className="block text-xs font-semibold theme-text-secondary mb-1"
            >
              プロファイル名
            </label>
            <input
              id={nameInputId}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 最新 1.21.4 冒険パック"
              className="w-full rounded-xl px-3 py-2 text-xs sm:text-sm dynamic-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold theme-text-secondary mb-1">
              Minecraft フォルダ (任意・読み取り専用)
            </span>
            <button
              type="button"
              onClick={() => void handlePickFolder()}
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
                ? '.minecraft または Prism インスタンスを選ぶと、環境とファイルを自動解析します (読み取り専用)。'
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
            {folderError && (
              <p className="mt-1 text-[11px] theme-text-amber">{folderError}</p>
            )}
          </div>

          {(folderAnalysis || initialImportData?.analysisIssues) && (
            <AnalysisSection
              issues={
                folderAnalysis
                  ? analyzeImportHealth(folderAnalysis)
                  : (initialImportData?.analysisIssues ?? [])
              }
              counts={
                folderAnalysis
                  ? folderAnalysis.scannedCounts
                  : countImportedContents(initialImportData)
              }
              environment={
                folderAnalysis
                  ? folderAnalysis.environment
                  : {
                      mcVersion: initialImportData?.mcVersion,
                      loader: initialImportData?.loader,
                      loaderVersion: initialImportData?.loaderVersion,
                      rootType: initialImportData?.rootType
                    }
              }
              unknownFiles={
                folderAnalysis?.unknownFiles ?? initialImportData?.unknownFiles ?? []
              }
            />
          )}

          <div>
            <label
              htmlFor={versionSelectId}
              className="block text-xs font-semibold theme-text-secondary mb-1"
            >
              Minecraft バージョン
            </label>
            <CustomDropdown
              id={versionSelectId}
              options={versionOptions}
              selectedValue={version}
              onChange={setVersion}
              customClass="w-full"
              label="Minecraftバージョン"
            />
          </div>
          <div>
            <label
              htmlFor={loaderSelectId}
              className="block text-xs font-semibold theme-text-secondary mb-1"
            >
              Modローダー
            </label>
            <CustomDropdown
              id={loaderSelectId}
              options={LOADER_DROPDOWN_OPTIONS}
              selectedValue={loader}
              onChange={setLoader}
              customClass="w-full"
              label="Modローダー"
            />
          </div>
          <div>
            <label
              htmlFor={loaderVersionSelectId}
              className="block text-xs font-semibold theme-text-secondary mb-1"
            >
              ローダーバージョン
            </label>
            <CustomDropdown
              id={loaderVersionSelectId}
              options={loaderVersionOptions}
              selectedValue={loaderVersion}
              onChange={setLoaderVersion}
              customClass="w-full"
              label="ローダーバージョン"
            />
          </div>
          <div>
            <label
              htmlFor={descInputId}
              className="block text-xs font-semibold theme-text-secondary mb-1"
            >
              説明 (任意)
            </label>
            <input
              id={descInputId}
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="プロファイルの目的など"
              className="w-full rounded-xl px-3 py-2 text-xs sm:text-sm dynamic-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-500/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl theme-sub-box text-xs font-semibold focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={analyzing || submitting}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold shadow focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
            >
              {analyzing
                ? '解析中...'
                : submitting
                  ? '作成中...'
                  : initialImportData?.source === 'duplicate'
                    ? '複製する'
                    : '作成する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
