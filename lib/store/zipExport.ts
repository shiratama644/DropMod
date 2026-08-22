/**
 * zipExport Zustand store (Sub-Phase 9-B.1)
 *
 * 従来 useZipExport hook (useState + useCallback) の内部 state を Zustand slice に分離。
 * shim パターンで既存 hook API (`handleDownloadZip`, `handleCancelZip`) は維持。
 *
 * 設計方針:
 *   - **State (progress など)** は Zustand に置く → 複数コンポーネント (AppShell/Settings) から参照可能に
 *   - **AbortController** は Zustand には置かない (シリアライズ不能、hook ライフサイクル依存)
 *     → useZipExport hook 内で useRef で保持
 *   - **cancelRequested フラグ** を追加: hook 内の DL loop が subscribe して停止判定
 *
 * これにより:
 *   - Settings/Header の「ZIP DL 進捗表示」を Zustand 直接 subscribe で実現
 *   - AppShell → SettingsPageClient への props 渡し (Server Component 境界を超える) が不要に
 */

'use client';

import { create } from 'zustand';

// ============================================================================
// State と Actions の型
// ============================================================================

export interface ZipProgressState {
  isOpen: boolean;
  progress: number;
  statusText: string;
  statusCount: string;
  detailText: string;
}

const INITIAL_STATE: ZipProgressState = {
  isOpen: false,
  progress: 0,
  statusText: '',
  statusCount: '',
  detailText: ''
};

export interface ZipExportStoreState {
  // ---- Data ----
  zipState: ZipProgressState;
  cancelRequested: boolean;

  // ---- Actions ----
  updateZipState: (patch: Partial<ZipProgressState>) => void;
  resetZipState: () => void;
  openZipModal: () => void;
  closeZipModal: () => void;

  // cancel フローは hook 側で AbortController を管理するが、
  // subscribe 経路で通知するために store にもフラグを置く
  requestCancel: () => void;
  clearCancelRequest: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useZipExportStore = create<ZipExportStoreState>((set) => ({
  zipState: INITIAL_STATE,
  cancelRequested: false,

  updateZipState: (patch) =>
    set((s) => ({ zipState: { ...s.zipState, ...patch } })),

  resetZipState: () => set({ zipState: INITIAL_STATE, cancelRequested: false }),

  openZipModal: () =>
    set((s) => ({ zipState: { ...s.zipState, isOpen: true } })),

  closeZipModal: () =>
    set((s) => ({ zipState: { ...s.zipState, isOpen: false } })),

  requestCancel: () => set({ cancelRequested: true }),

  clearCancelRequest: () => set({ cancelRequested: false })
}));

// ============================================================================
// Selector helpers (再レンダー最適化用)
// ============================================================================

/** progress のみを購読 (isOpen 等他 field 変更で再レンダーしない) */
export const selectZipProgress = (s: ZipExportStoreState): number => s.zipState.progress;

/** isOpen のみを購読 */
export const selectZipIsOpen = (s: ZipExportStoreState): boolean => s.zipState.isOpen;
