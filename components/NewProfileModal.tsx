'use client';

import type React from 'react';
import { useState, useEffect, useRef, useId } from 'react';
import { CustomDropdown } from './CustomDropdown';
import type { ModItem } from '@/types';
import { useModalA11y } from '@/hooks/useModalA11y';
import { supportsDirectoryPicker } from '@/lib/env/capabilities';
import { getLoaderVersions, LOADER_DROPDOWN_OPTIONS } from '@/lib/constants/loaderVersions';

interface NewProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  mcVersions: string[];
  initialImportData?: {
    name: string;
    mods: ModItem[];
    mcVersion?: string;
    loader?: string;
    loaderVersion?: string;
  } | null;
  onCreate: (
    name: string,
    mcVersion: string,
    loader: string,
    desc: string,
    mods?: ModItem[],
    loaderVersion?: string
  ) => void;
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
      const versions = getLoaderVersions(initialImportData.loader || 'Fabric');
      const importedLoaderVer = initialImportData.loaderVersion;
      setLoaderVersion(
        importedLoaderVer && versions.includes(importedLoaderVer)
          ? importedLoaderVer
          : (versions[0] ?? '')
      );
      setDesc(`ZIPインポート (${initialImportData.mods.length} 個のMod入り)`);
    } else {
      setName('');
      const first = mcVersions[0];
      if (first) setVersion(first);
      setLoader('Fabric');
      setLoaderVersion(getLoaderVersions('Fabric')[0] ?? '');
      setDesc('');
    }
  }, [isOpen]);

  const loaderVersionOptions = getLoaderVersions(loader).map((v) => ({
    label: v,
    value: v
  }));

  useEffect(() => {
    if (!isOpen) return;
    const versions = getLoaderVersions(loader);
    if (versions.length === 0) {
      setLoaderVersion('');
      return;
    }
    if (!versions.includes(loaderVersion)) {
      setLoaderVersion(versions[0] ?? '');
    }
  }, [loader, isOpen, loaderVersion]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const nameInputId = useId();
  const versionSelectId = useId();
  const loaderSelectId = useId();
  const loaderVersionSelectId = useId();
  const descInputId = useId();
  useModalA11y(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  const versionOptions = mcVersions.map((v) => ({
    label: `Minecraft ${v}${v === mcVersions[0] ? ' (最新版)' : ''}`,
    value: v
  }));

  const handlePickFolder = async () => {
    setFolderError(null);
    if (!supportsDirectoryPicker()) {
      setFolderError('このブラウザではフォルダ選択できません。Chrome / Edge をご利用ください。');
      return;
    }
    const pick = window.showDirectoryPicker;
    if (!pick) {
      setFolderError('このブラウザではフォルダ選択できません。Chrome / Edge をご利用ください。');
      return;
    }
    try {
      const handle = await pick({ mode: 'read' });
      setFolderName(handle.name);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setFolderError('フォルダを開けませんでした。');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    onCreate(
      trimmedName,
      version,
      loader,
      desc.trim(),
      initialImportData?.mods || [],
      loaderVersion || undefined
    );
    setName('');
    setDesc('');
    onClose();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景 (Escape で閉じる)
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md touch-action-none"
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
        className="modal-card glass-panel w-full max-w-md rounded-3xl p-5 sm:p-6 border shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-500/20 pb-3">
          <h3 id={titleId} className="font-bold text-base sm:text-lg flex items-center gap-2">
            <i className="fa-solid fa-folder-plus theme-text-brand"></i>
            {initialImportData ? 'ZIPからプロファイル作成' : '新規プロファイル作成'}
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

        {initialImportData && (
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
              disabled={!canPickFolder}
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
                ? 'Chrome / Edge で .minecraft または Prism インスタンスを選べます。解析取り込みは Phase 11 で実装します。'
                : 'Firefox / Safari / モバイルはフォルダ選択非対応です。ZIP 読込をご利用ください。'}
            </p>
            {folderError && (
              <p className="mt-1 text-[11px] theme-text-amber">{folderError}</p>
            )}
          </div>

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
              options={
                loaderVersionOptions.length > 0
                  ? loaderVersionOptions
                  : [{ label: '未指定', value: '' }]
              }
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
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold shadow focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              作成する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
