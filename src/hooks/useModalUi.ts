'use client';

/**
 * useModalRegistration — モーダルの開閉をグローバル UI 状態に登録する
 *
 * モーダルコンポーネントで:
 *   useModalRegistration(isOpen);
 * を呼ぶだけで、open 中は lib/store/uiState の openModalCount が +1 され、
 * 閉じる (isOpen false / unmount) で -1 される。
 *
 * 効果: openModalCount > 0 の間、モバイルの BottomNav が画面外へ
 * スライドして隠れる (globals.css `#bottom-nav.nav-modal-hidden`)。
 *
 * - isOpen が false の間は何もしない (カウントに影響しない)
 * - React Strict Mode の double-invoke でも open/close が対になり辻褄が合う
 *   (effect + cleanup で実装)
 * - 対象: NewProfileModal / EditProfileModal / DependencyCheckModal /
 *   ZipProgressModal / ConfirmDialog / ModDetailModalShell (modal variant) /
 *   ScreenshotGalleryModal
 */

import { useEffect } from 'react';
import { useUiState } from '@/components/layout/uiState';

export function useModalRegistration(isOpen: boolean): void {
  const openModal = useUiState((s) => s.openModal);
  const closeModal = useUiState((s) => s.closeModal);

  useEffect(() => {
    if (!isOpen) return;
    openModal();
    return () => closeModal();
  }, [isOpen, openModal, closeModal]);
}
