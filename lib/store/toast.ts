/**
 * toast Zustand store (Sub-Phase 8-C Step 2)
 *
 * 従来 useToasts hook (useState + useCallback) だったものを Zustand に置換。
 * shim パターンで既存 API (showToast/dismissToast) はそのまま維持。
 *
 * 2026-08-27: トースト通知の ON/OFF 設定を追加 (設定ページ)。
 *   - localStorage 'dropmod_toast_enabled' ('true' / 'false') で永続化
 *   - enabled = false の間は showToast が何もしない (通知ゼロ)
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

export const TOAST_ENABLED_STORAGE_KEY = 'dropmod_toast_enabled';

/** localStorage からトースト設定を読む (未設定 = 有効)。SSR / 破損値は true。 */
export function readToastEnabledPref(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return true;
  }
  try {
    return localStorage.getItem(TOAST_ENABLED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writeToastEnabledPref(enabled: boolean): void {
  try {
    localStorage.setItem(TOAST_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // localStorage 不使用環境では永続化しない (メモリ上のみ)
  }
}

export interface ToastState {
  toasts: Toast[];
  /** トースト通知の表示 ON/OFF (設定ページから切替) */
  enabled: boolean;

  showToast: (
    message: string,
    type?: 'info' | 'success' | 'warning' | 'error'
  ) => void;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
  setToastEnabled: (enabled: boolean) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  // モジュール読み込み時 (client) に localStorage の設定を反映。
  // SSR では readToastEnabledPref が true を返すため安全。
  enabled: readToastEnabledPref(),

  showToast: (message, type = 'info') => {
    // 設定で OFF の間は通知しない (呼び出し側はそのまま使える)
    if (!useToastStore.getState().enabled) return;
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

  clearAllToasts: () => set({ toasts: [] }),

  setToastEnabled: (enabled) => {
    writeToastEnabledPref(enabled);
    set({ enabled, ...(enabled ? {} : { toasts: [] }) });
  }
}));
