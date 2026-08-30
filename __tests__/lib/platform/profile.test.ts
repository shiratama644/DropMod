import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetAppProfileCacheForTesting,
  getAppProfile,
  resolveAppProfile,
  type ProfileEnv
} from '@/lib/platform/profile';

describe('lib/platform/profile — APP_PROFILE 解決', () => {
  describe('resolveAppProfile (純粋関数)', () => {
    it('APP_PROFILE=production を尊重する', () => {
      expect(resolveAppProfile({ APP_PROFILE: 'production' })).toBe('production');
    });

    it('APP_PROFILE=development を尊重する (NODE_ENV 未指定時)', () => {
      expect(resolveAppProfile({ APP_PROFILE: 'development' })).toBe('development');
    });

    it('APP_PROFILE=production が VERCEL_ENV=development より優先される', () => {
      expect(
        resolveAppProfile({ APP_PROFILE: 'production', VERCEL_ENV: 'development' })
      ).toBe('production');
    });

    it('NODE_ENV=development なら APP_PROFILE=development を尊重する (next dev)', () => {
      expect(
        resolveAppProfile({ APP_PROFILE: 'development', NODE_ENV: 'development' })
      ).toBe('development');
    });

    it('NODE_ENV=production では APP_PROFILE=development を無視して production (2026-08-27 修正)', () => {
      // next build / next start 相当。.env.local の開発緩和設定が本番ビルドへ
      // 漏れる footgun 対策 (警告 1 回 + fail-secure)。
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(
        resolveAppProfile({ APP_PROFILE: 'development', NODE_ENV: 'production' })
      ).toBe('production');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('next dev');
      // 警告は 1 回だけ (重複防止)
      resolveAppProfile({ APP_PROFILE: 'development', NODE_ENV: 'production' });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('APP_PROFILE=production は NODE_ENV=production でも尊重される', () => {
      expect(
        resolveAppProfile({ APP_PROFILE: 'production', NODE_ENV: 'production' })
      ).toBe('production');
    });

    it('APP_PROFILE は前後の空白と大文字小文字を許容する', () => {
      expect(resolveAppProfile({ APP_PROFILE: '  Development ' })).toBe('development');
      expect(resolveAppProfile({ APP_PROFILE: 'PRODUCTION' })).toBe('production');
    });

    it('不正な APP_PROFILE は fail-secure で production になる', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(resolveAppProfile({ APP_PROFILE: 'staging', NODE_ENV: 'development' })).toBe(
        'production'
      );
      // 警告は 1 回だけ (呼び出し毎の重複防止)
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('APP_PROFILE'));
      resolveAppProfile({ APP_PROFILE: 'other' });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('APP_PROFILE 未指定時は VERCEL_ENV にフォールバックする', () => {
      const env: ProfileEnv = {};
      expect(resolveAppProfile({ ...env, VERCEL_ENV: 'production' })).toBe('production');
      expect(resolveAppProfile({ ...env, VERCEL_ENV: 'preview' })).toBe('production');
      expect(resolveAppProfile({ ...env, VERCEL_ENV: 'development' })).toBe('development');
    });

    it('APP_PROFILE / VERCEL_ENV 未指定時は NODE_ENV にフォールバックする', () => {
      expect(resolveAppProfile({ NODE_ENV: 'development' })).toBe('development');
      expect(resolveAppProfile({ NODE_ENV: 'production' })).toBe('production');
      // NODE_ENV=test (vitest) や未設定も安全側の production
      expect(resolveAppProfile({ NODE_ENV: 'test' })).toBe('production');
      expect(resolveAppProfile({})).toBe('production');
    });
  });

  describe('getAppProfile (process.env 解決 + キャッシュ)', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      _resetAppProfileCacheForTesting();
    });

    it('process.env.APP_PROFILE から解決する', () => {
      vi.stubEnv('APP_PROFILE', 'development');
      expect(getAppProfile()).toBe('development');
    });

    it('結果はキャッシュされる (env 変更後は reset が必要)', () => {
      vi.stubEnv('APP_PROFILE', 'development');
      expect(getAppProfile()).toBe('development');
      vi.stubEnv('APP_PROFILE', 'production');
      // キャッシュされているため変化しない (サーバー起動時に 1 回確定する設計)
      expect(getAppProfile()).toBe('development');
      _resetAppProfileCacheForTesting();
      expect(getAppProfile()).toBe('production');
    });
  });
});
