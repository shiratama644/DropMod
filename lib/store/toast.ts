/**
 * toast Zustand store (Sub-Phase 8-C Step 2)
 *
 * 従来 useToasts hook (useState + useCallback) だったものを Zustand に置換。
 * shim パターンで既存 API (showToast/dismissToast) はそのまま維持。
 */

'use client';

import { create } from 'zustand';
import type { Toast } from '@/types';
import { generateId } from '@/lib/utils/id';

/**
 * Toast 保持上限。
 * AutoFix や依存チェックのような連続 toast 発火が多いユースケースで
 * 4-5 個目のメッセージが失われないよう 5 に設定。
 */
const MAX_VISIBLE_TOASTS = 5;

export interface ToastState {
  toasts: Toast[];

  showToast: (
    message: string,
    type?: 'info' | 'success' | 'warning' | 'error'
  ) => void;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message, type = 'info') => {
    // B16 修正: id 生成を generateId (crypto.randomUUID 優先) に変更。
    //   従来 'toast-' + Date.now() + '-' + Math.random().slice(2, 8) では
    //   Strict Mode double-invoke で ms 単位同時発火時に低確率で衝突リスク。
    //   → 2^122 の UUID v4 空間に置換して事実上衝突ゼロに。
    const id = generateId('toast');
    set((s) => ({
      toasts: [...s.toasts, { id, message, type }].slice(-MAX_VISIBLE_TOASTS)
    }));
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clearAllToasts: () => set({ toasts: [] })
}));
