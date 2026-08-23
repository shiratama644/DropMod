/**
 * confirm dialog Zustand store (Sub-Phase 8-C Step 2 + L7-2 + B18 キュー化)
 *
 * ダイアログを Promise ベースで扱うための state を管理。
 * `resolve` 関数自体は Zustand state に入れない (シリアライズ不能、DevTools が壊れる)
 * ので module-level に持たせる。
 *
 * B18: 2 個目以降の confirm() は 1 個目を false で潰さずキューに積む。
 * 前の dialog が閉じたあと FIFO で次を開く。
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
   * @param ownerId この confirm を呼び出した hook のインスタンス ID (cleanup 対象特定用)
   */
  confirm: (options: ConfirmDialogOptions, ownerId?: symbol) => Promise<boolean>;

  handleConfirm: () => void;
  handleCancel: () => void;

  /**
   * hook unmount 時に、その hook が開いた dialog / キュー項目のみ false で resolve する。
   */
  cleanup: (ownerId?: symbol) => void;
}

interface PendingConfirm {
  options: ConfirmDialogOptions;
  ownerId: symbol | null;
  resolve: (v: boolean) => void;
}

let pendingResolve: ((v: boolean) => void) | null = null;
let pendingOwner: symbol | null = null;
const confirmQueue: PendingConfirm[] = [];

function openNext(set: (partial: Partial<ConfirmStoreState> | ((s: ConfirmStoreState) => Partial<ConfirmStoreState>)) => void) {
  const next = confirmQueue.shift();
  if (!next) {
    pendingResolve = null;
    pendingOwner = null;
    set((s) => ({ state: { ...s.state, isOpen: false } }));
    return;
  }
  pendingResolve = next.resolve;
  pendingOwner = next.ownerId;
  set({ state: { ...next.options, isOpen: true } });
}

export const useConfirmStore = create<ConfirmStoreState>((set) => ({
  state: INITIAL_STATE,

  confirm: (options, ownerId) =>
    new Promise<boolean>((resolve) => {
      if (pendingResolve) {
        confirmQueue.push({
          options,
          ownerId: ownerId ?? null,
          resolve
        });
        return;
      }
      pendingResolve = resolve;
      pendingOwner = ownerId ?? null;
      set({ state: { ...options, isOpen: true } });
    }),

  handleConfirm: () => {
    if (pendingResolve) {
      pendingResolve(true);
      pendingResolve = null;
      pendingOwner = null;
    }
    openNext(set);
  },

  handleCancel: () => {
    if (pendingResolve) {
      pendingResolve(false);
      pendingResolve = null;
      pendingOwner = null;
    }
    openNext(set);
  },

  cleanup: (ownerId) => {
    if (ownerId === undefined) return;

    // キューに残っている自 hook の項目を false で捨てる
    for (let i = confirmQueue.length - 1; i >= 0; i--) {
      const item = confirmQueue[i];
      if (item && item.ownerId === ownerId) {
        item.resolve(false);
        confirmQueue.splice(i, 1);
      }
    }

    if (!pendingResolve) return;
    if (pendingOwner !== ownerId) return;
    pendingResolve(false);
    pendingResolve = null;
    pendingOwner = null;
    openNext(set);
  }
}));
