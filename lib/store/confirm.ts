/**
 * confirm dialog Zustand store (Sub-Phase 8-C Step 2 + L7-2 修正)
 *
 * ダイアログを Promise ベースで扱うための state を管理。
 * `resolve` 関数自体は Zustand state に入れない (シリアライズ不能、DevTools が壊れる)
 * ので module-level の Map に持たせる。
 *
 * ⚠️ 1 セッション同時に開けるダイアログは 1 つのみ (既存 useConfirm の仕様と同じ)。
 * 2 個目の confirm(...) を呼ぶと 1 個目の resolve は false になる。
 *
 * L7-2 修正: 以前は cleanup が全 pending resolve を無条件で false にしていたため、
 *   複数コンポーネントから useConfirm が使われた際に、1 hook の unmount だけで
 *   他 hook が開いた dialog も強制キャンセルされていた。
 *   → 「開いた hook の owner ID」を管理し、cleanup は自 hook が開いた dialog
 *      のみ対象とする方式に変更。
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

  /**
   * OK ボタン押下時 (ConfirmDialog の onConfirm から呼ぶ)。
   */
  handleConfirm: () => void;

  /**
   * Cancel/Escape/背景クリック時 (ConfirmDialog の onCancel から呼ぶ)。
   */
  handleCancel: () => void;

  /**
   * hook unmount 時に、その hook が開いた dialog のみ false で resolve するためのフック。
   * ownerId が未指定 (undefined) の場合は自 hook 経由の呼び出しがなかったので何もしない。
   */
  cleanup: (ownerId?: symbol) => void;
}

// module-level: resolve 関数と owner id を state に入れない (Zustand DevTools が破損するため)
let pendingResolve: ((v: boolean) => void) | null = null;
let pendingOwner: symbol | null = null;

export const useConfirmStore = create<ConfirmStoreState>((set) => ({
  state: INITIAL_STATE,

  confirm: (options, ownerId) =>
    new Promise<boolean>((resolve) => {
      // 前のダイアログが残っていれば false でクローズ (owner に関係なく: 同一 UI で
      // 複数 dialog を同時表示する仕様ではないため)
      if (pendingResolve) {
        pendingResolve(false);
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
    set((s) => ({ state: { ...s.state, isOpen: false } }));
  },

  handleCancel: () => {
    if (pendingResolve) {
      pendingResolve(false);
      pendingResolve = null;
      pendingOwner = null;
    }
    set((s) => ({ state: { ...s.state, isOpen: false } }));
  },

  cleanup: (ownerId) => {
    // L7-2 修正: 自 hook が開いた dialog のみを対象にする。
    //   ownerId 未指定 or owner が異なる場合は何もしない (他 hook の dialog を尊重)。
    if (!pendingResolve) return;
    if (ownerId === undefined || pendingOwner === null) return;
    if (pendingOwner !== ownerId) return;
    pendingResolve(false);
    pendingResolve = null;
    pendingOwner = null;
    set({ state: INITIAL_STATE });
  }
}));
