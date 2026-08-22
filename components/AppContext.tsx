'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Profile, ThemeMode } from '@/types';
import type { ConfirmDialogOptions } from './ConfirmDialog';

// ============================================================================
// AppContext
//
// Vite 版の App.tsx がトップレベルで持っていた:
//   - useProfiles (プロファイル状態 + CRUD + Mod トグル + LocalStorage 永続化)
//   - useDependencyCheck (バックグラウンド依存チェック警告バッジ)
//   - useZipExport / useZipImport (ZIP 出力・取込)
//   - useToasts / useConfirm (Toast / 確認ダイアログ)
//   - theme (dark/light)
//   - モーダル open state (新規プロファイル / 編集 / 依存チェック / mrpack 取り込み後)
//
// これらを AppShell (Root Layout の Client 直下) に集約し、Home / Mods /
// Settings / ModDetail 全ページから Context 経由で参照する。
//
// なぜ Context か:
//   - Next.js App Router 下で Server Component (page.tsx) と Client
//     Component の混在があるため、Client 側の共有 state を props で
//     bucket brigade するのは現実的でない
//   - Zustand / Jotai を導入せずとも React 標準 (Context) で十分
//     (計画書 §5 の判断)
//   - useProfiles は 1 セッション 1 インスタンス必須 (LocalStorage の
//     hydration ガードのため二重マウントを避ける)
// ============================================================================

export interface AppContextValue {
  // Theme
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;

  // Profiles
  profiles: Profile[];
  currentProfileId: string;
  currentProfile: Profile;
  handleSwitchProfile: (id: string) => void;
  handleCreateProfile: (
    name: string,
    mcVersion: string,
    loader: string,
    description: string,
    mods?: import('@/types').ModItem[]
  ) => void;
  handleDuplicateProfile: () => void;
  handleSaveEditedProfile: (
    name: string,
    mcVersion: string,
    loader: string,
    description: string
  ) => void;
  // useProfiles 側は async 関数だが呼び出し側は Promise を待たない想定
  handleDeleteProfile: (id: string) => void | Promise<void>;
  handleToggleMod: (
    projectId: string,
    e?: React.MouseEvent,
    silent?: boolean
  ) => Promise<void>;
  handleUpdateModVersion: (projectId: string, versionId: string) => void | Promise<void>;
  handleRemoveAllMods: () => void | Promise<void>;

  // Dep check
  hasDepWarning: boolean;
  runBackgroundDepCheck: () => void;

  // ZIP export
  isZipModalOpen: boolean;
  zipProgress: number;
  zipStatusText: string;
  zipStatusCount: string;
  zipDetailText: string;
  handleDownloadZip: () => void;
  handleCancelZip: () => void;

  // ZIP import
  handleImportZipInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDropZip: (e: React.DragEvent) => void;

  // Toast / Confirm
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  confirm: (opts: ConfirmDialogOptions) => Promise<boolean>;

  // Modals (Header / Tab から呼び出し)
  openNewProfileModal: () => void;
  openEditProfileModal: () => void;
  openDependencyCheckModal: () => void;

  // Reset (Settings → データ初期化)
  handleResetData: () => void;

  // Fallback MC versions (Settings 等で使う)
  mcVersions: string[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error(
      'useAppContext must be used inside <AppShell> (Root Layout provides it)'
    );
  }
  return ctx;
}

interface ProviderProps {
  value: AppContextValue;
  children: ReactNode;
}

export function AppContextProvider({ value, children }: ProviderProps) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
