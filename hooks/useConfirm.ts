'use client';

/**
 * useConfirm hook (Sub-Phase 8-C Step 2 + L7-2 修正)
 *
 * 内部実装は lib/store/confirm.ts に移行。
 * この hook は下位互換のための薄いアダプタで、既存呼び出し側は変更不要。
 *
 * L7-2 修正: hook インスタンスごとに Symbol の owner ID を持たせ、
 *   - confirm 呼び出し時に owner ID を store に伝える
 *   - unmount 時の cleanup では自 hook が開いた dialog のみ false で resolve
 *   → 複数コンポーネントで useConfirm を並行利用しても互いに干渉しなくなる
 */

import { useCallback, useEffect, useRef } from 'react';
import { useConfirmStore } from '@/lib/store/confirm';
import type { ConfirmDialogOptions } from '@/components/feedback/ConfirmDialog';

export function useConfirm() {
  // このインスタンス固有の Symbol (レンダー間で不変)
  const ownerIdRef = useRef<symbol | null>(null);
  if (ownerIdRef.current === null) {
    ownerIdRef.current = Symbol('useConfirm');
  }

  const state = useConfirmStore((s) => s.state);
  const storeConfirm = useConfirmStore((s) => s.confirm);
  const handleConfirm = useConfirmStore((s) => s.handleConfirm);
  const handleCancel = useConfirmStore((s) => s.handleCancel);
  const cleanup = useConfirmStore((s) => s.cleanup);

  const confirm = useCallback(
    (options: ConfirmDialogOptions) => storeConfirm(options, ownerIdRef.current ?? undefined),
    [storeConfirm]
  );

  // コンポーネントアンマウント時に、この hook が開いた dialog のみを false で resolve。
  // 他 hook が開いた dialog は保持される (L7-2 修正)。
  useEffect(() => {
    const ownerId = ownerIdRef.current;
    return () => {
      cleanup(ownerId ?? undefined);
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
