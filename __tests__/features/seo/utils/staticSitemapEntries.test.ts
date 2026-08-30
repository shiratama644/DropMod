import { describe, expect, it } from 'vitest';
import { staticSitemapEntries } from '@/features/seo/utils/staticSitemapEntries';

describe('staticSitemapEntries (SEO-1 / 2-5)', () => {
  it('4 型の discover 一覧を含む', () => {
    const entries = staticSitemapEntries('https://example.com', new Date('2026-08-30'));
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://example.com/discover/mods');
    expect(urls).toContain('https://example.com/discover/modpacks');
    expect(urls).toContain('https://example.com/discover/resourcepacks');
    expect(urls).toContain('https://example.com/discover/shaders');
    expect(urls).not.toContain('https://example.com/discover/mods/sodium');
  });
});
