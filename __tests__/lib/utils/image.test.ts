import { describe, it, expect } from 'vitest';
import {
  isAnimatedImageUrl,
  isModrinthCdnUrl,
  shouldUnoptimizeImage
} from '@/lib/utils/image';

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

describe('isModrinthCdnUrl', () => {
  it('cdn.modrinth.com 由来を true とする (パス問わず)', () => {
    expect(
      isModrinthCdnUrl('https://cdn.modrinth.com/data/YL57xq9U/icon_96.webp')
    ).toBe(true);
    expect(
      isModrinthCdnUrl(
        'https://cdn.modrinth.com/data/cached_images/abc.png'
      )
    ).toBe(true);
  });

  it('Modrinth CDN 以外は false', () => {
    expect(isModrinthCdnUrl('https://raw.githubusercontent.com/x/y/a.png')).toBe(false);
    expect(isModrinthCdnUrl('https://i.imgur.com/abc.png')).toBe(false);
  });

  it('空・不正は false', () => {
    expect(isModrinthCdnUrl(null)).toBe(false);
    expect(isModrinthCdnUrl(undefined)).toBe(false);
    expect(isModrinthCdnUrl('/relative/path.png')).toBe(false);
    expect(isModrinthCdnUrl('not a url')).toBe(false);
  });
});

describe('shouldUnoptimizeImage', () => {
  it('GIF は最適化不要 (host 問わず)', () => {
    expect(shouldUnoptimizeImage('https://i.imgur.com/anim.gif')).toBe(true);
    expect(
      shouldUnoptimizeImage('https://cdn.modrinth.com/data/x/images/a.gif')
    ).toBe(true);
  });

  it('Modrinth CDN の静止画も最適化不要 (既に最適化済み)', () => {
    expect(
      shouldUnoptimizeImage('https://cdn.modrinth.com/data/x/icon_96.webp')
    ).toBe(true);
  });

  it('Modrinth 以外の静止画は最適化 ON のまま (false)', () => {
    expect(
      shouldUnoptimizeImage('https://raw.githubusercontent.com/x/y/a.png')
    ).toBe(false);
  });

  it('空・不正は false (= 最適化経路のまま)', () => {
    expect(shouldUnoptimizeImage(null)).toBe(false);
    expect(shouldUnoptimizeImage(undefined)).toBe(false);
  });
});
