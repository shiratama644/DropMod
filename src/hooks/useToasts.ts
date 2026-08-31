'use client';

/**
 * useToasts hook (Sub-Phase 8-C Step 2: Zustand store の shim)
 *
 * 内部実装は lib/store/toast.ts に移し、この hook は下位互換のための薄いアダプタ。
 * 呼び出し側のコード変更なしで置換完了。
 */

import { useToastStore } from '@/components/feedback/toastStore';

export const useToasts = () => {
  const toasts = useToastStore((s) => s.toasts);
  const showToast = useToastStore((s) => s.showToast);
  const dismissToast = useToastStore((s) => s.dismissToast);

  return { toasts, showToast, dismissToast };
};
