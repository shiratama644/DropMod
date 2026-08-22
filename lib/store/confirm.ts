/**
 * confirm dialog Zustand store (Sub-Phase 8-C Step 2)
 *
 * ダイアログを Promise ベースで扱うための state を管理。
 * `resolve` 関数自体は Zustand state に入れない (シリアライズ不能、DevTools が壊れる)
 * ので module-level の Ref に持たせる。
 *
 * ⚠️ 1 セッション同時に開けるダイアログは 1 つのみ (既存 useConfirm の仕様と同じ)。
 * 2 個目の confirm(...) を呼ぶと 1 個目の resolve は false になる。
 */

'use client';

import { create } from 'zustand';
import type { ConfirmDialogOptions } from '@/components/ConfirmDialog';

export interface ConfirmState extends ConfirmDialogOptions {
  isOpen: boolean;
}

const INITIAL_STATE: ConfirmState = {
  isOpen: false,
  title: '',
  message: ''
};

interface ConfirmStoreState {
  state: ConfirmState;

  /**
   * ダイアログを開き、user 操作 (OK/Cancel/Escape/アンマウント) の結果を Promise で返す。
   */
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;

  /**
   * OK ボタン押下時 (ConfirmDialog の onConfirm から呼ぶ)。
   */
  handleConfirm: () => void;

  /**
   * Cancel/Escape/背景クリック時 (ConfirmDialog の onCancel から呼ぶ)。
   */
  handleCancel: () => void;

  /**
   * Provider アンマウント時に pending Promise を false で resolve するためのフック。
   */
  cleanup: () => void;
}

// module-level: resolve 関数は state に入れない (Zustand DevTools が破損するため)
let pendingResolve: ((v: boolean) => void) | null = null;

export const useConfirmStore = create<ConfirmStoreState>((set) => ({
  state: INITIAL_STATE,

  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      // 前のダイアログが残っていれば false でクローズ
      if (pendingResolve) {
        pendingResolve(false);
      }
      pendingResolve = resolve;
      set({ state: { ...options, isOpen: true } });
    }),

  handleConfirm: () => {
    if (pendingResolve) {
      pendingResolve(true);
      pendingResolve = null;
    }
    set((s) => ({ state: { ...s.state, isOpen: false } }));
  },

  handleCancel: () => {
    if (pendingResolve) {
      pendingResolve(false);
      pendingResolve = null;
    }
    set((s) => ({ state: { ...s.state, isOpen: false } }));
  },

  cleanup: () => {
    if (pendingResolve) {
      pendingResolve(false);
      pendingResolve = null;
    }
    set({ state: INITIAL_STATE });
  }
}));
