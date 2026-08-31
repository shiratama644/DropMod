'use client';

/**
 * TanStack Query の Provider ラッパー。
 *
 * Sub-Phase 8-B: AppShell の中に配置し、下流の全 Client Component が
 * useQuery / useInfiniteQuery / useMutation を使えるようにする。
 *
 * H7-2 修正: PersistQueryClientProvider に置き換え
 *   以前は QueryClientProvider + useEffect で persistQueryClient() を呼び、
 *   restore 完了 Promise を待たなかったため初回 query が cache 未 restore で
 *   fetch されていた。公式推奨の PersistQueryClientProvider に切替、
 *   `onSuccess` で restore 完了を認識してから children を通常レンダリング。
 *
 * 実装ポイント:
 *   - QueryClient は useState の initializer で「1 セッション 1 インスタンス」を保証
 *   - persister は useMemo で 1 セッション 1 個
 *   - ReactQueryDevtools は dev のみ動的 import (production bundle 除外)
 */

import { useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createQueryClient, createDexiePersister, persistOptions } from '@/lib/query/client';

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
  const persister = useMemo(() => createDexiePersister(), []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister, ...persistOptions }}
    >
      {children}
      {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </PersistQueryClientProvider>
  );
}
