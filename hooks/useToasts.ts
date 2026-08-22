'use client';

import { useState, useCallback } from 'react';
import type { Toast } from '@/types';

// Toast 保持上限を 3 → 5 に緩和。
// AutoFix や依存チェックのような連続 toast 発火が多いユースケースで
// 4-5 個目のメッセージが失われる問題を軽減。
const MAX_VISIBLE_TOASTS = 5;

export const useToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      const id = 'toast-' + Date.now() + '-' + Math.random();
      setToasts((prev) => [...prev, { id, message, type }].slice(-MAX_VISIBLE_TOASTS));
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
};
