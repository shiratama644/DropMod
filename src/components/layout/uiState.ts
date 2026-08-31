/**
 * UI グローバル状態 (Zustand) — BottomNav のモーダル連動
 *
 * 2026-08-27 追加: 「モーダル表示中はボトムナビゲーションを非表示にする」仕様。
 *
 * - モーダル (NewProfile / EditProfile / DependencyCheck / ZipProgress /
 *   ConfirmDialog / ModDetailModalShell / ScreenshotGallery) は open 中に
 *   openModal() を呼び、閉じたら closeModal() する (hooks/useModalUi.ts の
 *   useModalRegistration が代行)。
 * - BottomNav は openModalCount > 0 の間、画面外へスライドして隠れる
 *   (globals.css の #bottom-nav.nav-modal-hidden)。
 * - カウント方式にしているのは、モーダルを重ねられるため
 *   (例: 詳細モーダル → スクリーンショットギャラリー、確認ダイアログ)。
 *   最後の 1 枚が閉じた時点で初めてナビが戻る。
 * - BottomSheet (探す/メニュー) は BottomNav のトグルボタンで開閉するため
 *   対象外 (ナビが見えたままが正しい挙動)。
 */

'use client';

import { create } from 'zustand';

interface UiState {
  /** 現在 open しているモーダルの数 */
  openModalCount: number;
  /** モーダルが開いた時に +1 する */
  openModal: () => void;
  /** モーダルが閉じた時に -1 する (0 未満にはならない) */
  closeModal: () => void;
}

export const useUiState = create<UiState>((set) => ({
  openModalCount: 0,
  openModal: () => set((s) => ({ openModalCount: s.openModalCount + 1 })),
  closeModal: () =>
    set((s) => ({ openModalCount: Math.max(0, s.openModalCount - 1) }))
}));
