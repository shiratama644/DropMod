'use client';

import { useCallback, useRef, useState } from 'react';
import type { ConfirmDialogOptions } from '@/components/ConfirmDialog';

interface ConfirmState extends ConfirmDialogOptions {
  isOpen: boolean;
}

const INITIAL_STATE: ConfirmState = {
  isOpen: false,
  title: '',
  message: ''
};

/**
 * ネイティブ window.confirm() の Promise ベース代替。
 *
 * const { confirm, dialogProps } = useConfirm();
 * // ...
 * const ok = await confirm({ title: '削除しますか？', message: '...' });
 * if (ok) doIt();
 *
 * // JSX にダイアログを挿入:
 * <ConfirmDialog {...dialogProps} />
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(INITIAL_STATE);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // 前のダイアログが残っていれば false でクローズ
      if (resolveRef.current) {
        resolveRef.current(false);
        resolveRef.current = null;
      }
      resolveRef.current = resolve;
      setState({ ...options, isOpen: true });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleCancel = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    confirm,
    dialogProps: {
      ...state,
      onConfirm: handleConfirm,
      onCancel: handleCancel
    }
  };
}
