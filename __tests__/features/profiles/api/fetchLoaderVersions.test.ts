import { describe, it, expect } from 'vitest';
import { fetchLoaderVersions } from '@/features/profiles/api/fetchLoaderVersions';

describe('fetchLoaderVersions', () => {
  it('API が 0.19.3 を返せば含める', async () => {
    const list = await fetchLoaderVersions('Fabric', '1.21.1');
    expect(list[0]).toBe('0.19.3');
    expect(list).toContain('0.19.3');
  });

  it('preferred がリストに無くても残す', async () => {
    const list = await fetchLoaderVersions('Fabric', '1.21.1', '0.12.12');
    expect(list[0]).toBe('0.12.12');
  });
});
