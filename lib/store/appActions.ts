/**
 * appActions Zustand store (Phase 9-A: AppContext 撤去用のブリッジ)
 *
 * 従来 useAppContext 経由で 4 コンポーネント (Settings/Mods/Home/ModDetail) に
 * 届けていた「AppShell 内 hooks 由来の関数群」を Zustand store に登録する。
 *
 * 設計の背景:
 *   - Server Component (app/settings/page.tsx など) から Client Component に
 *     関数 props を渡すことは Next.js 仕様上不可
 *   - useAppContext は Context の性質上、value のどれか 1 つが変わると
 *     全 consumer が再レンダーする問題があった
 *   - Zustand 直接参照にすれば細粒度 subscription + Server 境界も超えられる
 *
 * この store の役割:
 *   AppShell が `useEffect` で hook 呼び出しの戻り値 (handleXxx 関数群) を
 *   store に登録 → 下流コンポーネントは Zustand selector で必要な action のみ購読
 *
 * 注意:
 *   - actions は「AppShell がマウントされている間だけ有効」
 *   - AppShell アンマウント時は cleanup で null に戻す
 *   - 未登録 (null) の action を呼ぶと no-op + console.warn
 */

'use client';

import { create } from 'zustand';
import type { Profile, ModItem } from '@/types';
import type { ConfirmDialogOptions } from '@/components/ConfirmDialog';

// ============================================================================
// Actions 型
// ============================================================================

/**
 * AppShell が hook から取得して store に登録する actions 一式。
 * 全て optional (registerAppActions が呼ばれる前は null)。
 */
export interface AppActions {
  // Profiles (useProfiles hook 由来、Modrinth 連携 + Ref パターン + confirmDialog を含む)
  handleSwitchProfile: (id: string) => void;
  handleCreateProfile: (
    name: string, mcVersion: string, loader: string, description: string,
    mods?: ModItem[]
  ) => void;
  handleDuplicateProfile: () => void;
  handleSaveEditedProfile: (
    name: string, mcVersion: string, loader: string, description: string
  ) => void;
  handleDeleteProfile: (id: string) => void | Promise<void>;
  handleToggleMod: (
    projectId: string, e?: React.MouseEvent, silent?: boolean
  ) => Promise<void>;
  handleUpdateModVersion: (projectId: string, versionId: string) => void | Promise<void>;
  handleRemoveAllMods: () => void | Promise<void>;

  // Dep check (useDependencyCheck hook 由来)
  runBackgroundDepCheck: () => void;

  // ZIP export (useZipExport hook 由来、AbortController が hook 内 Ref)
  handleDownloadZip: () => void;
  handleCancelZip: () => void;

  // ZIP import (useZipImport hook 由来、inFlight ガードが hook 内 Ref)
  handleImportZipInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDropZip: (e: React.DragEvent) => void;

  // Modals (AppShell 局所 useState 由来)
  openNewProfileModal: () => void;
  openEditProfileModal: () => void;
  openDependencyCheckModal: () => void;

  // Reset (AppShell 局所 handleResetData useCallback 由来)
  handleResetData: () => void;

  // Fallback MC versions (AppShell の mcVersions state 由来)
  mcVersions: string[];

  // 現在プロファイル (selector で計算、AppShell が useMemo)
  currentProfile: Profile | undefined;
}

// ============================================================================
// Store
// ============================================================================

export interface AppActionsStoreState {
  actions: AppActions | null;
  registerAppActions: (actions: AppActions) => void;
  unregisterAppActions: () => void;
}

export const useAppActionsStore = create<AppActionsStoreState>((set) => ({
  actions: null,

  registerAppActions: (actions) => set({ actions }),

  unregisterAppActions: () => set({ actions: null })
}));

// ============================================================================
// 便利 selector: 未登録時に warning を出す fallback wrapper
// ============================================================================

/**
 * 指定 field の action を取得。未登録なら no-op を返す。
 * 生の `useAppActionsStore((s) => s.actions?.xxx)` より安全。
 *
 * ⚠️ SSR / hydration 中は AppShell の register useEffect がまだ走っていないため
 *    action は必ず null。ここで warning を出すと SSR ログが noisy になるため
 *    warning は client-side かつ **hydration 完了後の 2 回目以降のレンダー**でのみ発火。
 */
export function useAppAction<K extends keyof AppActions>(key: K): AppActions[K] {
  const fn = useAppActionsStore((s) => s.actions?.[key]);
  if (fn !== undefined) return fn;

  // 未登録 no-op (warning は出さない: SSR/初回 hydration では通常発生する状態)
  return ((..._args: unknown[]) => {}) as unknown as AppActions[K];
}

/**
 * profile など「値」の field 用: 未登録時のデフォルトを指定できる版
 */
export function useAppActionValue<K extends keyof AppActions>(
  key: K,
  fallback: AppActions[K]
): AppActions[K] {
  const value = useAppActionsStore((s) => s.actions?.[key]);
  return value ?? fallback;
}

// ============================================================================
// 型 re-export
// ============================================================================

export type { ConfirmDialogOptions };
