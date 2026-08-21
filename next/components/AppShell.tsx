'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { ThemeMode } from '@/types';
import { useToasts } from '@/hooks/useToasts';
import { useConfirm } from '@/hooks/useConfirm';
import { ToastContainer } from './ToastContainer';
import { ConfirmDialog } from './ConfirmDialog';

// ============================================================================
// AppShell (Phase 2 版)
//
// Root Layout の中で「Client 側で管理する共通 UI 要素」を束ねる。
// Phase 3-5 の各ページ (Home / mods / settings / mod/[slug]) が children
// として差し込まれ、Phase 4 で modal スロットも受け取るように拡張予定。
//
// 現在ここで管理しているもの:
//   - Toast (useToasts)
//   - ConfirmDialog (useConfirm)
//   - Theme state (dark/light) と html クラス切替
//
// Header / BottomNav はプロファイル依存 (useProfiles) が必要なため、
// Phase 5 で useProfiles を移植した後に AppShell 内に取り込む予定。
// 現在は最小構成 (Toast + Confirm + theme) のみを提供。
// ============================================================================

interface Props {
  children: ReactNode;
}

export const AppShell: React.FC<Props> = ({ children }) => {
  // Toast は Phase 5 で useProfiles / useModSearch などから使えるように
  // Context 化する予定。現段階では AppShell 内で完結。
  const { toasts, dismissToast } = useToasts();

  // Confirm ダイアログ (window.confirm 置換)
  const { dialogProps: confirmDialogProps } = useConfirm();

  // Theme (dark/light) — 現状は dark 固定。Phase 5 で Settings と連携
  const [theme] = useState<ThemeMode>('dark');
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'light') html.classList.remove('dark');
    else html.classList.add('dark');
  }, [theme]);

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {children}
      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
};
