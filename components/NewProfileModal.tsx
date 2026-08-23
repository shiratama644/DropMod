'use client';

import type React from 'react';
import { useState, useEffect, useRef, useId } from 'react';
import { CustomDropdown } from './CustomDropdown';
import type { ModItem } from '@/types';
import { useModalA11y } from '@/hooks/useModalA11y';

interface NewProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  mcVersions: string[];
  initialImportData?: {
    name: string;
    mods: ModItem[];
    mcVersion?: string;
    loader?: string;
  } | null;
  onCreate: (name: string, mcVersion: string, loader: string, desc: string, mods?: ModItem[]) => void;
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
  const [desc, setDesc] = useState('');

  // ⚠️ 「モーダルが開いた瞬間のみ」フォームをリセットする。
  //     以前は deps に mcVersions / initialImportData を含めており、
  //     mcVersions のAPI非同期完了や親の再レンダーで initialImportData の
  //     参照が新しくなった際に、開いたままのモーダルで入力中の値が
  //     突然リセットされる不具合があった。
  //
  // Phase 10-P5 (useExhaustiveDependencies): mcVersions / initialImportData.* を
  //   deps に含めないのは上記バグ回避のため意図的。wasOpenRef で「開いた瞬間
  //   のみ」1 回だけ実行する制御を effect 内で行っている。stale 参照になる
  //   可能性はあるが、モーダルが開いた時点の snapshot が正解。
  const wasOpenRef = useRef<boolean>(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: モーダル open 時のみ snapshot をロード (詳細は上コメント)
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    // 既に開いていた (open→openの再レンダー) 場合はスキップ
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    if (initialImportData) {
      setName(initialImportData.name);
      if (initialImportData.mcVersion && mcVersions.includes(initialImportData.mcVersion)) {
        setVersion(initialImportData.mcVersion);
      } else {
        // mcVersions[0] は string | undefined
        const first = mcVersions[0];
        if (first) setVersion(first);
      }
      if (initialImportData.loader) {
        setLoader(initialImportData.loader);
      }
      setDesc(`ZIPインポート (${initialImportData.mods.length} 個のMod入り)`);
    } else {
      setName('');
      const first = mcVersions[0];
      if (first) setVersion(first);
      setLoader('Fabric');
      setDesc('');
    }
  }, [isOpen]);

  // a11y: role/aria + Escape + フォーカストラップ
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Phase 10-P5 (a11y/noLabelWithoutControl): 各フィールドに id を紐付けるため
  // useId() を活用。CustomDropdown は id prop を受け付ける (10-P5 で追加)。
  const nameInputId = useId();
  const versionSelectId = useId();
  const loaderSelectId = useId();
  const descInputId = useId();
  useModalA11y(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  const versionOptions = mcVersions.map((v) => ({
    label: `Minecraft ${v}${v === mcVersions[0] ? ' (最新版)' : ''}`,
    value: v
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // name / desc を trim() (EditProfileModal と一貫性)。
    // 空白のみのプロファイル名を防ぐ。
    const trimmedName = name.trim();
    if (!trimmedName) {
      // 空欄チェックは HTML5 required 属性が担うが二重防御
      return;
    }
    onCreate(trimmedName, version, loader, desc.trim(), initialImportData?.mods || []);
    setName('');
    setDesc('');
    onClose();
  };

  return (
    // Phase 10-P5 (a11y): モーダル背景は Escape (useModalA11y) で閉じる設計、
    //   キーボードで背景をクリックする必要はない。onClick は背景タップ→閉じる
    //   モバイル UX 用。
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
      {/* Phase 10-P5 (a11y): innerCard の onClick は背景 onClick への
          バブル遮断が目的 (stopPropagation)。keyboard の相当操作は不要。 */}
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
              options={[
                { label: 'Fabric', value: 'Fabric' },
                { label: 'Forge', value: 'Forge' },
                { label: 'NeoForge', value: 'NeoForge' },
                { label: 'Quilt', value: 'Quilt' }
              ]}
              selectedValue={loader}
              onChange={setLoader}
              customClass="w-full"
              label="Modローダー"
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