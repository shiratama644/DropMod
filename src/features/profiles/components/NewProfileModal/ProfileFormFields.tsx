'use client';

import { useId } from 'react';
import { CustomDropdown } from '@/components/ui/CustomDropdown';
import { LOADER_DROPDOWN_OPTIONS } from '../../constants/loaderVersionTables';

interface ProfileFormFieldsProps {
  name: string;
  onNameChange: (name: string) => void;
  version: string;
  versionOptions: Array<{ label: string; value: string }>;
  onVersionChange: (version: string) => void;
  loader: string;
  onLoaderChange: (loader: string) => void;
  loaderVersion: string;
  loaderVersionOptions: Array<{ label: string; value: string }>;
  onLoaderVersionChange: (loaderVersion: string) => void;
  desc: string;
  onDescChange: (desc: string) => void;
}

// ---------------------------------------------------------------------------
// プロファイル作成フォームの入力フィールド群 (名前 / MC バージョン / ローダー /
// ローダーバージョン / 説明)。状態は親 (NewProfileModal) が持ち、表示のみを担う。
// id はフィールドごとに useId で自己完結させる。
// ---------------------------------------------------------------------------
export function ProfileFormFields({
  name,
  onNameChange,
  version,
  versionOptions,
  onVersionChange,
  loader,
  onLoaderChange,
  loaderVersion,
  loaderVersionOptions,
  onLoaderVersionChange,
  desc,
  onDescChange
}: ProfileFormFieldsProps) {
  const nameInputId = useId();
  const versionSelectId = useId();
  const loaderSelectId = useId();
  const loaderVersionSelectId = useId();
  const descInputId = useId();

  return (
    <>
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
          onChange={(e) => onNameChange(e.target.value)}
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
          onChange={onVersionChange}
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
          onChange={onLoaderChange}
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
          onChange={onLoaderVersionChange}
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
          onChange={(e) => onDescChange(e.target.value)}
          placeholder="プロファイルの目的など"
          className="w-full rounded-xl px-3 py-2 text-xs sm:text-sm dynamic-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
      </div>
    </>
  );
}
