'use client';

/**
 * TanStack Query の Provider ラッパー。
 *
 * Sub-Phase 8-B: AppShell の中に配置し、下流の全 Client Component が
 * useQuery / useInfiniteQuery / useMutation を使えるようにする。
 *
 * 実装ポイント:
 *   - QueryClient は useState の initializer で「1 セッション 1 インスタンス」を保証
 *     (関数呼び出しで new すると再レンダーで毎回作り直され、キャッシュが消える)
 *   - persister は useEffect で attach、unmount で detach
 *   - ReactQueryDevtools は dev のみ動的 import (production bundle 除外)
 *     next/dynamic に process.env.NODE_ENV を渡し dead-code elimination で除去
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, attachPersister } from '@/lib/query/client';

// process.env.NODE_ENV は Next.js の compiler が静的置換するため、
// production ビルドでは `const enableDevtools = false;` に定数畳み込みされ、
// 続く三項の false 側 (null) だけが残り、devtools の dynamic import は
// 完全にツリーシェイクされる。
const enableDevtools = process.env.NODE_ENV === 'development';

const ReactQueryDevtools = enableDevtools
  ? dynamic(
      () =>
        import('@tanstack/react-query-devtools').then((mod) => mod.ReactQueryDevtools),
      { ssr: false }
    )
  : null;

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  const [client] = useState(() => createQueryClient());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    unsubscribeRef.current = attachPersister(client);
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [client]);

  return (
    <QueryClientProvider client={client}>
      {children}
      {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
