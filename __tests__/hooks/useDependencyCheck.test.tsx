/**
 * useDependencyCheck integration test (Sub-Phase 9-C.3)
 *
 * - QueryClient wrapper で hook を回し、msw で /versions batch を mock
 * - useDepCheckStore の hasDepWarning が期待通り更新されるか検証
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';
import { useDepCheckStore } from '@/lib/store/depCheck';
import { clearApiCache } from '@/lib/modrinth/client';
import { createQueryWrapper } from '../test-utils/queryWrapper';
import type { Profile } from '@/types';

function makeProfile(mods: Profile['mods']): Profile {
  return {
    id: 'p1',
    name: 'Test',
    environment: { mcVersion: '1.20.1', loader: 'Fabric' },
    description: '',
    mods
  };
}

describe('useDependencyCheck', () => {
  beforeEach(() => {
    useDepCheckStore.getState().reset();
    clearApiCache();
  });

  it('mods が空なら hasDepWarning=false を即セットする', async () => {
    const profile = makeProfile([]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    expect(useDepCheckStore.getState().hasDepWarning).toBe(false);
    expect(useDepCheckStore.getState().lastCheckAt).not.toBeNull();
  });

  it('依存が全て満たされていれば false', async () => {
    server.use(
      http.get('/api/modrinth/versions', () =>
        HttpResponse.json([
          {
            id: 'v-a',
            project_id: 'proj-a',
            version_number: '1.0.0',
            files: [],
            dependencies: [
              { project_id: 'proj-b', dependency_type: 'required' }
            ]
          }
        ])
      )
    );
    const profile = makeProfile([
      {
        projectId: 'proj-a',
        name: 'A',
        type: 'mod',
        description: '',
        versionId: 'v-a'
      },
      {
        projectId: 'proj-b',
        name: 'B',
        type: 'mod',
        description: '',
        versionId: 'v-b'
      }
    ]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    expect(useDepCheckStore.getState().hasDepWarning).toBe(false);
  });

  it('required 依存が未インストールなら true', async () => {
    server.use(
      http.get('/api/modrinth/versions', () =>
        HttpResponse.json([
          {
            id: 'v-a',
            project_id: 'proj-a',
            version_number: '1.0.0',
            files: [],
            dependencies: [
              { project_id: 'proj-missing', dependency_type: 'required' }
            ]
          }
        ])
      )
    );
    const profile = makeProfile([
      { projectId: 'proj-a', name: 'A', type: 'mod', description: '', versionId: 'v-a' }
    ]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    expect(useDepCheckStore.getState().hasDepWarning).toBe(true);
  });

  it('incompatible な依存が入っていれば true', async () => {
    server.use(
      http.get('/api/modrinth/versions', () =>
        HttpResponse.json([
          {
            id: 'v-a',
            project_id: 'proj-a',
            version_number: '1.0.0',
            files: [],
            dependencies: [
              { project_id: 'proj-b', dependency_type: 'incompatible' }
            ]
          }
        ])
      )
    );
    const profile = makeProfile([
      { projectId: 'proj-a', name: 'A', type: 'mod', description: '', versionId: 'v-a' },
      { projectId: 'proj-b', name: 'B', type: 'mod', description: '', versionId: 'v-b' }
    ]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    expect(useDepCheckStore.getState().hasDepWarning).toBe(true);
  });

  it('optional な依存不足は無視する (hasDepWarning=false)', async () => {
    server.use(
      http.get('/api/modrinth/versions', () =>
        HttpResponse.json([
          {
            id: 'v-a',
            project_id: 'proj-a',
            version_number: '1.0.0',
            files: [],
            dependencies: [
              { project_id: 'proj-optional', dependency_type: 'optional' }
            ]
          }
        ])
      )
    );
    const profile = makeProfile([
      { projectId: 'proj-a', name: 'A', type: 'mod', description: '', versionId: 'v-a' }
    ]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    expect(useDepCheckStore.getState().hasDepWarning).toBe(false);
  });

  it('selectedVersionId が "latest" の mod は versionIds から除外される', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/modrinth/versions', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    const profile = makeProfile([
      { projectId: 'proj-a', name: 'A', type: 'mod', description: '', versionId: 'latest' },
      { projectId: 'proj-b', name: 'B', type: 'mod', description: '', versionId: 'v-b' }
    ]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    // versions=["v-b"] だけが叩かれる
    // msw が受け取った request.url は絶対 URL (jsdom は http://localhost 基準)
    const idsParam = new URL(capturedUrl).searchParams.get('ids');
    // JSON.stringify(['v-b']) === '["v-b"]'
    expect(idsParam).toBe(JSON.stringify(['v-b']));
  });

  it('B22 修正: /versions が 500 を返しても前回の hasDepWarning を保持する', async () => {
    // proxy + direct の両方を 500 で落とす (client の fallback 経路を封じる)
    server.use(
      http.get('/api/modrinth/versions', () =>
        new HttpResponse('boom', { status: 500 })
      ),
      http.get('https://api.modrinth.com/v2/versions', () =>
        new HttpResponse('boom', { status: 500 })
      )
    );
    useDepCheckStore.getState().setHasDepWarning(true); // 前回値
    const profile = makeProfile([
      { projectId: 'proj-a', name: 'A', type: 'mod', description: '', versionId: 'v-a' }
    ]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    // B22 修正後: catch で早期 return され、前回値 true が保持される
    expect(useDepCheckStore.getState().isChecking).toBe(false);
    expect(useDepCheckStore.getState().lastCheckAt).not.toBeNull();
    // ✅ 前回値 true が保持される (仕様修正)
    expect(useDepCheckStore.getState().hasDepWarning).toBe(true);
  });

  it('B23 修正: 全 mod が selectedVersionId="latest" のとき前回警告を保持', async () => {
    useDepCheckStore.getState().setHasDepWarning(true); // 前回警告あり
    const profile = makeProfile([
      { projectId: 'proj-a', name: 'A', type: 'mod', description: '', versionId: 'latest' },
      { projectId: 'proj-b', name: 'B', type: 'mod', description: '', versionId: 'latest' }
    ]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    // versionIds が空 → 判定不能 → 前回値 (true) を保持
    expect(useDepCheckStore.getState().hasDepWarning).toBe(true);
    expect(useDepCheckStore.getState().lastCheckAt).not.toBeNull();
  });

  it('runBackgroundDepCheck 完了で isChecking が false / lastCheckAt が更新される', async () => {
    const profile = makeProfile([]);
    const { result } = renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    await act(async () => {
      await result.current.runBackgroundDepCheck();
    });
    const s = useDepCheckStore.getState();
    expect(s.isChecking).toBe(false);
    expect(s.lastCheckAt).not.toBeNull();
  });

  it('自動デバウンス実行: mods 変更 → 1200ms 後に走る', async () => {
    let called = 0;
    server.use(
      http.get('/api/modrinth/versions', () => {
        called++;
        return HttpResponse.json([]);
      })
    );
    const profile = makeProfile([
      { projectId: 'proj-a', name: 'A', type: 'mod', description: '', versionId: 'v-a' }
    ]);
    renderHook(() => useDependencyCheck(profile), {
      wrapper: createQueryWrapper()
    });
    // デバウンスは 1200ms → waitFor で最大 3s 待つ
    await waitFor(() => expect(called).toBeGreaterThanOrEqual(1), { timeout: 3000 });
  });
});
