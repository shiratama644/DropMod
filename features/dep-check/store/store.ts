/**
 * depCheck Zustand store (Sub-Phase 9-B.3)
 *
 * 従来 useDependencyCheck hook (useState) の内部 state (hasDepWarning) を
 * Zustand slice に分離。shim パターンで既存 hook API は維持。
 *
 * 設計方針:
 *   - hasDepWarning: BottomNav / Header の警告バッジで表示される boolean
 *     → 複数コンポーネント (BottomNav / Header / DependencyCheckModal) が
 *       購読するため store 化のメリット大
 *   - lastCheckAt / isChecking: 進捗表示や連続実行防止用の付加情報 (拡張余地)
 *   - queryClient / profileRef は hook 内に維持 (react-query の hook + stale
 *     closure 対策 Ref)
 */

'use client';

import { create } from 'zustand';

// ============================================================================
// State と Actions の型
// ============================================================================

export interface DepCheckStoreState {
  /** 依存関係の不整合 (required 未インストール / incompatible 同居) を検出したか */
  hasDepWarning: boolean;
  /** 最後に依存チェックが完了した時刻 (Date.now()、未実行なら null) */
  lastCheckAt: number | null;
  /** 依存チェック実行中か (連続 profile 変更時の UI インジケーター用) */
  isChecking: boolean;

  // ---- Actions ----
  setHasDepWarning: (v: boolean) => void;
  setChecking: (v: boolean) => void;
  markChecked: () => void;
  reset: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useDepCheckStore = create<DepCheckStoreState>((set) => ({
  hasDepWarning: false,
  lastCheckAt: null,
  isChecking: false,

  setHasDepWarning: (v) => set({ hasDepWarning: v }),

  setChecking: (v) => set({ isChecking: v }),

  markChecked: () => set({ lastCheckAt: Date.now(), isChecking: false }),

  reset: () => set({ hasDepWarning: false, lastCheckAt: null, isChecking: false })
}));
