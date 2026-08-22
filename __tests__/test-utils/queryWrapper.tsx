/**
 * TanStack Query の QueryClientProvider を wrap する test helper (Sub-Phase 9-C.3)
 *
 * `renderHook(useX, { wrapper: createQueryWrapper() })` の形で使う。
 *
 * 各テストで新しい QueryClient を生成することで、テスト間でキャッシュが
 * 持ち越されないようにする (retry: false でリトライも封じ、失敗を素早く可視化)。
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: 0
      },
      mutations: {
        retry: false
      }
    }
  });
}

export function createQueryWrapper(client?: QueryClient) {
  const qc = client ?? createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}
