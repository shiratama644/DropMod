/**
 * lib/platform/siteUrl.ts test (COV-2)
 *
 * resolveSiteOrigin の env 優先順位: NEXT_PUBLIC_SITE_URL (末尾スラッシュ除去・不正時警告)
 * → VERCEL_URL (https:// 付与) → http://localhost:3000 フォールバック。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSiteOrigin } from '@/lib/platform/siteUrl';

describe('lib/platform/siteUrl — resolveSiteOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('NEXT_PUBLIC_SITE_URL が設定されていればその origin を返す', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com');
    expect(resolveSiteOrigin()).toBe('https://example.com');
  });

  it('NEXT_PUBLIC_SITE_URL の末尾スラッシュは除去される', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com/');
    expect(resolveSiteOrigin()).toBe('https://example.com');
  });

  it('NEXT_PUBLIC_SITE_URL が URL として不正なら警告を出して次の優先順位へ進む', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not-a-valid-url');
    vi.stubEnv('VERCEL_URL', 'dropmod.vercel.app');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveSiteOrigin()).toBe('https://dropmod.vercel.app');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('NEXT_PUBLIC_SITE_URL');
  });

  it('NEXT_PUBLIC_SITE_URL が無く VERCEL_URL があれば https:// を付けて返す', () => {
    vi.stubEnv('VERCEL_URL', 'dropmod-preview.vercel.app');
    expect(resolveSiteOrigin()).toBe('https://dropmod-preview.vercel.app');
  });

  it('どちらも無ければ http://localhost:3000 にフォールバックする', () => {
    expect(resolveSiteOrigin()).toBe('http://localhost:3000');
  });
});
