/**
 * lib/query/hooks.tsx test (Sub-Phase 9-C.5)
 *
 * useProjectQuery / useVersionsQuery / useProjectsBatchQuery が queryClient を
 * 経由してキャッシュされ、msw で mock した Modrinth API 応答を返すことを検証。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/__tests__/mocks/server';
import {
  useProjectQuery,
  useVersionsQuery,
  useProjectsBatchQuery
} from '@/lib/query/hooks';
import { clearApiCache } from '@/lib/modrinth/client';
import { createQueryWrapper, createTestQueryClient } from '@/__tests__/test-utils/queryWrapper';

describe('lib/query/hooks', () => {
  beforeEach(() => {
    clearApiCache();
  });

  describe('useProjectQuery', () => {
    it('slug=null なら enabled=false (isLoading=false / no fetch)', async () => {
      let hits = 0;
      server.use(
        http.get('/api/modrinth/project/:slug', () => {
          hits++;
          return HttpResponse.json({ id: 'x', slug: 'x' });
        })
      );
      const { result } = renderHook(() => useProjectQuery(null), {
        wrapper: createQueryWrapper()
      });
      // 少し待って fetch されないことを確認
      await new Promise((r) => setTimeout(r, 50));
      expect(result.current.isFetching).toBe(false);
      expect(hits).toBe(0);
    });

    it('slug が渡ればデータを取得できる', async () => {
      const { result } = renderHook(() => useProjectQuery('sodium'), {
        wrapper: createQueryWrapper()
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.slug).toBe('sodium');
    });

    it('同じ queryClient で 2 回呼ぶとキャッシュヒットで fetch は 1 回', async () => {
      let hits = 0;
      server.use(
        http.get('/api/modrinth/project/:slug', () => {
          hits++;
          return HttpResponse.json({ id: 'x', slug: 'sodium', title: 'X' });
        })
      );
      const qc = createTestQueryClient();
      const wrapper = createQueryWrapper(qc);
      const h1 = renderHook(() => useProjectQuery('sodium'), { wrapper });
      await waitFor(() => expect(h1.result.current.isSuccess).toBe(true));
      // 2 個目 (別 renderHook でも同じ QueryClient)
      const h2 = renderHook(() => useProjectQuery('sodium'), { wrapper });
      await waitFor(() => expect(h2.result.current.isSuccess).toBe(true));
      expect(hits).toBe(1);
    });

    it('fetch エラーは error state に反映される', async () => {
      server.use(
        http.get('/api/modrinth/project/:slug', () =>
          new HttpResponse('down', { status: 500 })
        ),
        http.get('https://api.modrinth.com/v2/project/:slug', () =>
          new HttpResponse('down', { status: 500 })
        )
      );
      const { result } = renderHook(() => useProjectQuery('dead'), {
        wrapper: createQueryWrapper()
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe('useVersionsQuery', () => {
    it('mcVersion / loader が params に付く', async () => {
      let captured = '';
      server.use(
        http.get('/api/modrinth/project/:slug/version', ({ request }) => {
          captured = request.url;
          return HttpResponse.json([]);
        })
      );
      const { result } = renderHook(
        () => useVersionsQuery('sodium', { mcVersion: '1.20.1', loader: 'Fabric' }),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const url = new URL(captured);
      expect(url.searchParams.get('game_versions')).toBe('["1.20.1"]');
      expect(url.searchParams.get('loaders')).toBe('["fabric"]');
    });

    it('slug 未指定なら enabled=false で fetch されない', async () => {
      let hits = 0;
      server.use(
        http.get('/api/modrinth/project/:slug/version', () => {
          hits++;
          return HttpResponse.json([]);
        })
      );
      renderHook(() => useVersionsQuery(null), { wrapper: createQueryWrapper() });
      await new Promise((r) => setTimeout(r, 50));
      expect(hits).toBe(0);
    });
  });

  describe('useProjectsBatchQuery', () => {
    it('ids=[] なら enabled=false', async () => {
      let hits = 0;
      server.use(
        http.get('/api/modrinth/projects', () => {
          hits++;
          return HttpResponse.json([]);
        })
      );
      renderHook(() => useProjectsBatchQuery([]), { wrapper: createQueryWrapper() });
      await new Promise((r) => setTimeout(r, 50));
      expect(hits).toBe(0);
    });

    it('複数 id を batch 取得できる', async () => {
      const { result } = renderHook(
        () => useProjectsBatchQuery(['sodium', 'lithium']),
        { wrapper: createQueryWrapper() }
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(2);
    });

    it('ids の順序が違っても canonical key で同じキャッシュを共有', async () => {
      let hits = 0;
      server.use(
        http.get('/api/modrinth/projects', ({ request }) => {
          hits++;
          const idsParam = new URL(request.url).searchParams.get('ids') ?? '[]';
          const ids = JSON.parse(idsParam) as string[];
          return HttpResponse.json(ids.map((id) => ({ id, slug: id })));
        })
      );
      const qc = createTestQueryClient();
      const wrapper = createQueryWrapper(qc);
      const h1 = renderHook(() => useProjectsBatchQuery(['sodium', 'lithium']), {
        wrapper
      });
      await waitFor(() => expect(h1.result.current.isSuccess).toBe(true));
      // 順序を入れ替え → hits は増えない (sort で normalize)
      const h2 = renderHook(() => useProjectsBatchQuery(['lithium', 'sodium']), {
        wrapper
      });
      await waitFor(() => expect(h2.result.current.isSuccess).toBe(true));
      expect(hits).toBe(1);
    });
  });
});
