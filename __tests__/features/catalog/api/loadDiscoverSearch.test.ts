/**
 * features/catalog/api/loadDiscoverSearch.ts test (COV-2)
 *
 * SSR discover 検索。dropmod_active_profile cookie → 検索条件へ反映。
 * cookie 無し / 破損 / 不正値は既定値 (1.20.1 / Fabric) にフォールバック。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDiscoverSearch } from '@/features/catalog/api/loadDiscoverSearch';
import { SEARCH_LIMIT } from '@/lib/constants/search';

const cookieValue = vi.hoisted(() => ({ value: undefined as string | undefined }));
const searchMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'dropmod_active_profile' && cookieValue.value !== undefined
        ? { name, value: cookieValue.value }
        : undefined
  })
}));

vi.mock('@/lib/modrinth/server', () => ({
  fetchModrinthSearch: searchMock
}));

function defaultSearchResult() {
  return { hits: [], total_hits: 0, offset: 0, limit: SEARCH_LIMIT };
}

describe('features/catalog/api/loadDiscoverSearch', () => {
  beforeEach(() => {
    cookieValue.value = undefined;
    searchMock.mockReset();
    searchMock.mockResolvedValue(defaultSearchResult());
  });

  it('cookie 無しなら既定の MC 1.20.1 / Fabric で検索する', async () => {
    const result = await loadDiscoverSearch('sodium', 'mod');
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'sodium',
        mcVersion: '1.20.1',
        loader: 'Fabric',
        projectType: 'mod',
        limit: SEARCH_LIMIT
      })
    );
    expect(result).toEqual({ hits: [], initialHasMore: false });
  });

  it('有効な cookie があればその MC / loader を使う', async () => {
    cookieValue.value = encodeURIComponent(
      JSON.stringify({ mcVersion: '1.21', loader: 'NeoForge' })
    );
    await loadDiscoverSearch('iris', 'mod');
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcVersion: '1.21', loader: 'NeoForge' })
    );
  });

  it('cookie 値が URL エンコードされていない (デコード失敗) 場合は既定値へ', async () => {
    // '%' 単体は decodeURIComponent が URIError を投げる
    cookieValue.value = '%';
    await loadDiscoverSearch('sodium', 'mod');
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcVersion: '1.20.1', loader: 'Fabric' })
    );
  });

  it('cookie が JSON でない場合は既定値へ', async () => {
    cookieValue.value = 'not-json';
    await loadDiscoverSearch('sodium', 'mod');
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcVersion: '1.20.1', loader: 'Fabric' })
    );
  });

  it('cookie の mcVersion が 32 文字以上なら不正として既定値へ', async () => {
    cookieValue.value = encodeURIComponent(
      JSON.stringify({ mcVersion: 'x'.repeat(32), loader: 'Fabric' })
    );
    await loadDiscoverSearch('sodium', 'mod');
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcVersion: '1.20.1', loader: 'Fabric' })
    );
  });

  it('cookie の loader が 32 文字以上なら不正として既定値へ', async () => {
    cookieValue.value = encodeURIComponent(
      JSON.stringify({ mcVersion: '1.20.1', loader: 'y'.repeat(32) })
    );
    await loadDiscoverSearch('sodium', 'mod');
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcVersion: '1.20.1', loader: 'Fabric' })
    );
  });

  it('検索が失敗したら空 hits + initialHasMore false を返す (SSR フォールバック)', async () => {
    searchMock.mockRejectedValue(new Error('ECONNRESET'));
    const result = await loadDiscoverSearch('sodium', 'mod');
    expect(result).toEqual({ hits: [], initialHasMore: false });
  });

  it('hits が SEARCH_LIMIT 以上なら initialHasMore を true にする', async () => {
    searchMock.mockResolvedValue({
      hits: Array.from({ length: SEARCH_LIMIT }, (_, i) => ({ slug: `mod-${i}` })),
      total_hits: 100,
      offset: 0,
      limit: SEARCH_LIMIT
    });
    const result = await loadDiscoverSearch('sodium', 'mod');
    expect(result.initialHasMore).toBe(true);
    expect(result.hits).toHaveLength(SEARCH_LIMIT);
  });
});
