'use client';

/**
 * useConfirm hook (Sub-Phase 8-C Step 2: Zustand store の shim)
 *
 * 内部実装は lib/store/confirm.ts へ移行。
 * この hook は下位互換のための薄いアダプタで、既存呼び出し側は変更不要。
 *
 * アンマウント時に pending Promise を resolve するのは
 * useEffect で cleanup() を呼ぶことで実現。
 */

import { useEffect } from 'react';
import { useConfirmStore } from '@/lib/store/confirm';

export function useConfirm() {
  const state = useConfirmStore((s) => s.state);
  const confirm = useConfirmStore((s) => s.confirm);
  const handleConfirm = useConfirmStore((s) => s.handleConfirm);
  const handleCancel = useConfirmStore((s) => s.handleCancel);
  const cleanup = useConfirmStore((s) => s.cleanup);

  // コンポーネントアンマウント時に pending Promise を false で resolve。
  // これが無いと await confirm({...}) を呼んだ非同期関数が完了せず
  // メモリリーク + 後続処理が実行されないバグになる。
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    confirm,
    dialogProps: {
      ...state,
      onConfirm: handleConfirm,
      onCancel: handleCancel
    }
  };
}
