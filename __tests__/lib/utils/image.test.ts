import { describe, it, expect } from 'vitest';
import { isAnimatedImageUrl } from '@/lib/utils/image';

describe('isAnimatedImageUrl', () => {
  it('gif 拡張子を検出する', () => {
    expect(
      isAnimatedImageUrl(
        'https://cdn.modrinth.com/data/NNAgCjsB/images/65781fbd7cda31b8c8e4a8def40bf445c10a1562.gif'
      )
    ).toBe(true);
    expect(isAnimatedImageUrl('https://cdn.modrinth.com/shot.GIF?v=1')).toBe(true);
  });

  it('静止画は false', () => {
    expect(isAnimatedImageUrl('https://cdn.modrinth.com/data/x/images/a.png')).toBe(false);
    expect(isAnimatedImageUrl('https://cdn.modrinth.com/data/x/images/a.webp')).toBe(false);
  });

  it('空・不正は false', () => {
    expect(isAnimatedImageUrl(null)).toBe(false);
    expect(isAnimatedImageUrl(undefined)).toBe(false);
    expect(isAnimatedImageUrl('')).toBe(false);
  });
});
