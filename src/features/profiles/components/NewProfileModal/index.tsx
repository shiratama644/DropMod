'use client';

import type React from 'react';
import { useState, useEffect, useRef, useId } from 'react';
import type { ProjectItem, ProfileContentExtras } from '@/types';
import { useModalA11y } from '@/hooks/useModalA11y';
import { useModalRegistration } from '@/hooks/useModalUi';
import { supportsDirectoryPicker } from '@/lib/env/capabilities';
import {
  analyzeEnvironmentSource,
  generateProfileName,
  pickMinecraftDirectory,
  type AnalyzeProgress,
  type DetectedEnvironment,
  type ImportAnalysis,
  type PickedDirectory
} from '@/features/env-import';
import { analyzeImportHealth } from '@/lib/env/analysis';
import { useLoaderVersionOptions } from '../../hooks/useLoaderVersionOptions';
import type { PendingImportData } from '@/features/zip';
import { AnalysisSection, countImportedContents } from './AnalysisSection';
import { FolderImportSection } from './FolderImportSection';
import { ProfileFormFields } from './ProfileFormFields';

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
// プロファイル作成モーダル (フォーム本体 + フォルダ選択 → 解析 → 自動紐付け)。
// 責務ごとに分割した子コンポーネントを組み立てる:
//   - FolderImportSection: フォルダ選択 UI (解析進捗・エラー表示)
//   - AnalysisSection:    解析結果の Read-only 表示 (Phase 11)
//   - ProfileFormFields:  名前 / MC バージョン / ローダー / 説明の入力フィールド
// 状態管理とフロー制御 (pick/submit) は本コンポーネントが担う。
// ---------------------------------------------------------------------------
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
          <FolderImportSection
            canPickFolder={canPickFolder}
            analyzing={analyzing}
            folderName={folderName}
            analysisProgress={analysisProgress}
            folderError={folderError}
            onPickFolder={() => void handlePickFolder()}
          />

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

          <ProfileFormFields
            name={name}
            onNameChange={setName}
            version={version}
            versionOptions={versionOptions}
            onVersionChange={setVersion}
            loader={loader}
            onLoaderChange={setLoader}
            loaderVersion={loaderVersion}
            loaderVersionOptions={loaderVersionOptions}
            onLoaderVersionChange={setLoaderVersion}
            desc={desc}
            onDescChange={setDesc}
          />

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
