import React, { useState, useEffect, useMemo, useId } from 'react';
import { Profile } from '../types';
import { CustomDropdown } from './CustomDropdown';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  mcVersions: string[];
  onSave: (name: string, mcVersion: string, loader: string, desc: string) => void;
}

const LOADER_OPTIONS = [
  { label: 'Fabric', value: 'Fabric' },
  { label: 'Forge', value: 'Forge' },
  { label: 'NeoForge', value: 'NeoForge' },
  { label: 'Quilt', value: 'Quilt' },
];

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  mcVersions,
  onSave,
}) => {
  const [name, setName] = useState(profile?.name || '');
  const [version, setVersion] = useState(profile?.mcVersion || '');
  const [loader, setLoader] = useState(profile?.loader || 'Fabric');
  const [desc, setDesc] = useState(profile?.description || '');

  const nameInputId = useId();
  const descInputId = useId();
  const modalTitleId = useId();

  // Reset form state when modal opens or profile changes
  useEffect(() => {
    if (isOpen && profile) {
      setName(profile.name || '');
      setVersion(profile.mcVersion || '');
      setLoader(profile.loader || 'Fabric');
      setDesc(profile.description || '');
    }
  }, [profile, isOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
      onSave(trimmedName, version, loader, desc.trim());
    }
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ backgroundColor: 'var(--modal-overlay)' }}
    >
      <div className="modal-card glass-panel w-full max-w-md rounded-3xl p-5 sm:p-6 border shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
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
            <label className="block text-xs font-semibold theme-text-secondary mb-1">
              Minecraft バージョン
            </label>
            <CustomDropdown
              options={versionOptions}
              selectedValue={version}
              onChange={setVersion}
              customClass="w-full"
              label="Minecraftバージョン選択"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold theme-text-secondary mb-1">
              Modローダー
            </label>
            <CustomDropdown
              options={LOADER_OPTIONS}
              selectedValue={loader}
              onChange={setLoader}
              customClass="w-full"
              label="Modローダー選択"
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