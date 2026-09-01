import { describe, expect, it } from 'vitest';
import { formatOgDownloads } from '@/features/seo/utils/ogCopy';

describe('formatOgDownloads (SEO-1 / 2-3)', () => {
  it('百万単位を短縮する', () => {
    expect(formatOgDownloads(1_500_000)).toBe('1.5M DL');
  });
  it('不正値は 0 DL', () => {
    expect(formatOgDownloads(undefined)).toBe('0 DL');
  });
});
