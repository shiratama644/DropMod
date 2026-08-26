'use client';

import type React from 'react';
import { useState, useEffect, useMemo, useRef, useId } from 'react';
import type { Profile } from '@/types';
import { CustomDropdown } from './CustomDropdown';
import { useModalA11y } from '@/hooks/useModalA11y';
import { LOADER_DROPDOWN_OPTIONS } from '@/lib/constants/loaderVersions';
import { useLoaderVersionOptions } from '@/hooks/useLoaderVersionOptions';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  mcVersions: string[];
  onSave: (name: string, mcVersion: string, loader: string, desc: string, loaderVersion?: string) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  mcVersions,
  onSave,
}) => {
  const [name, setName] = useState(profile?.name || '');
  const [version, setVersion] = useState(profile?.environment.mcVersion || '');
  const [loader, setLoader] = useState<string>(profile?.environment.loader || 'Fabric');
  const [loaderVersion, setLoaderVersion] = useState(
    profile?.environment.loaderVersion || ''
  );
  const [desc, setDesc] = useState(profile?.description || '');

  const nameInputId = useId();
  const descInputId = useId();
  const modalTitleId = useId();
  // Phase 10-P5 (a11y/noLabelWithoutControl): CustomDropdown を <label htmlFor>
  // で紐付けるため id を生成。CustomDropdown は id prop を受け付ける (10-P5 で追加)。
  const versionSelectId = useId();
  const loaderSelectId = useId();
  const loaderVersionSelectId = useId();

  // モーダルが「閉→開」になった瞬間のみプロファイル値でフォームを初期化。
  // 以前は deps に profile 全体が入っており、モーダルを開いている最中に
  // 別経路で profile が更新される (Mod 追加/削除など) と入力中の値が
  // 突然リセットされる不具合があった。
  //
  // Phase 10-P5 (useExhaustiveDependencies): profile.* を deps に含めないのは
  //   上記バグ回避のため意図的。wasEditOpenRef で「開いた瞬間のみ」1 回だけ
  //   実行する制御を effect 内で行っている。stale profile 参照になる可能性は
  //   あるが、モーダルが開いた時点の profile snapshot が正解 (以降の外部変更
  //   は無視すべき)。
  const wasEditOpenRef = useRef<boolean>(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: モーダル open 時のみ profile snapshot をロード (詳細は上コメント)
  useEffect(() => {
    if (!isOpen) {
      wasEditOpenRef.current = false;
      return;
    }
    if (wasEditOpenRef.current) return;
    wasEditOpenRef.current = true;

    if (profile) {
      setName(profile.name || '');
      setVersion(profile.environment.mcVersion || '');
      setLoader(profile.environment.loader || 'Fabric');
      setLoaderVersion(profile.environment.loaderVersion || '');
      setDesc(profile.description || '');
    }
  }, [isOpen]);

  const { versions: loaderVersions, options: loaderVersionOptions } = useLoaderVersionOptions(
    loader,
    version,
    isOpen,
    profile?.environment.loaderVersion
  );

  // a11y: Escape + フォーカストラップ (共通フックに統一)
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, onClose, dialogRef);

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

  // Safely construct version options with defensive array fallback
  const versionOptions = useMemo(() => {
    const safeVersions = Array.isArray(mcVersions) ? mcVersions : [];
    return safeVersions.map((v) => ({ label: `Minecraft ${v}`, value: v }));
  }, [mcVersions]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (typeof onSave === 'function') {
      onSave(trimmedName, version, loader, desc.trim(), loaderVersion || undefined);
    }
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    // Phase 10-P5 (a11y): モーダル背景 (Escape で閉じる、useModalA11y 参照)
    // biome-ignore lint/a11y/noStaticElementInteractions: モーダル背景
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        className="modal-card glass-panel w-full max-w-md rounded-3xl p-5 sm:p-6 border shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-500/20 pb-3">
          <h3 id={modalTitleId} className="font-bold text-base sm:text-lg flex items-center gap-2">
            <i className="fa-solid fa-pen-to-square theme-text-brand" aria-hidden="true" />
            <span>プロファイルを編集</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="theme-text-muted hover:text-emerald-500 p-2 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg transition-colors"
          >
            <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label htmlFor={nameInputId} className="block text-xs font-semibold theme-text-secondary mb-1">
              プロファイル名
            </label>
            <input
              id={nameInputId}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-xs sm:text-sm dynamic-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
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
              label="Minecraftバージョン選択"
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
              label="Modローダー選択"
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
              label="ローダーバージョン選択"
            />
          </div>

          <div>
            <label htmlFor={descInputId} className="block text-xs font-semibold theme-text-secondary mb-1">
              説明 (任意)
            </label>
            <input
              id={descInputId}
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
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
              保存する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};