import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetRateLimitForTesting,
  API_CORS_HEADERS,
  checkRateLimit,
  getClientIp
} from '@/lib/platform/rateLimit';
import { _resetAppProfileCacheForTesting } from '@/lib/platform/profile';

function resetAll(): void {
  _resetRateLimitForTesting();
  _resetAppProfileCacheForTesting();
}

describe('lib/platform/rateLimit — プロファイル連動レート制限', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetAll();
  });

  describe('production プロファイル', () => {
    beforeEach(() => {
      vi.stubEnv('APP_PROFILE', 'production');
      _resetAppProfileCacheForTesting();
    });

    it('上限内は許可し remaining が減る', () => {
      const r1 = checkRateLimit('modrinth', '1.2.3.4', 3);
      expect(r1).toEqual({ allowed: true, remaining: 2 });
      const r2 = checkRateLimit('modrinth', '1.2.3.4', 3);
      expect(r2).toEqual({ allowed: true, remaining: 1 });
    });

    it('上限を超えると 429 相当 (allowed=false, remaining=0)', () => {
      for (let i = 0; i < 5; i++) {
        const r = checkRateLimit('modrinth', '1.2.3.4', 3);
        if (i < 3) expect(r.allowed).toBe(true);
        else {
          expect(r.allowed).toBe(false);
          expect(r.remaining).toBe(0);
        }
      }
    });

    it('ウィンドウ経過後にカウントがリセットされる', () => {
      checkRateLimit('loaders', '1.2.3.4', 2);
      checkRateLimit('loaders', '1.2.3.4', 2);
      expect(checkRateLimit('loaders', '1.2.3.4', 2).allowed).toBe(false);

      vi.advanceTimersByTime(61_000);

      expect(checkRateLimit('loaders', '1.2.3.4', 2).allowed).toBe(true);
    });

    it('bucket が異なれば独立してカウントされる', () => {
      checkRateLimit('modrinth', '1.2.3.4', 1);
      expect(checkRateLimit('modrinth', '1.2.3.4', 1).allowed).toBe(false);
      // 別 bucket (loaders) は影響を受けない
      expect(checkRateLimit('loaders', '1.2.3.4', 1).allowed).toBe(true);
    });

    it('IP が異なれば独立してカウントされる', () => {
      checkRateLimit('modrinth', '1.2.3.4', 1);
      expect(checkRateLimit('modrinth', '5.6.7.8', 1).allowed).toBe(true);
    });

    it('マップ肥大化時の掃除ループが動作しても機能し続ける', () => {
      // RATE_LIMIT_CLEANUP_THRESHOLD (1000) を超えるユニーク IP で掃除分岐を実行
      for (let i = 0; i < 1002; i++) {
        const r = checkRateLimit('modrinth', `10.0.0.${i}`, 5);
        expect(r.allowed).toBe(true);
      }
    });
  });

  describe('development プロファイル', () => {
    it('レート制限が無効化され常に許可される', () => {
      vi.stubEnv('APP_PROFILE', 'development');
      _resetAppProfileCacheForTesting();

      for (let i = 0; i < 100; i++) {
        const r = checkRateLimit('modrinth', '1.2.3.4', 3);
        expect(r).toEqual({ allowed: true, remaining: 3 });
      }
    });
  });

  describe('getClientIp', () => {
    it('x-forwarded-for の先頭 (最初のプロキシ前 IP) を使う', () => {
      const req = new Request('https://dropmod.example/api/x', {
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }
      });
      expect(getClientIp(req)).toBe('203.0.113.7');
    });

    it('x-forwarded-for が無ければ x-real-ip を使う', () => {
      const req = new Request('https://dropmod.example/api/x', {
        headers: { 'x-real-ip': '198.51.100.9' }
      });
      expect(getClientIp(req)).toBe('198.51.100.9');
    });

    it('どちらも無ければ unknown', () => {
      const req = new Request('https://dropmod.example/api/x');
      expect(getClientIp(req)).toBe('unknown');
    });
  });

  describe('API_CORS_HEADERS', () => {
    it('Same-Origin 専用の CORS ヘッダー一式を返す', () => {
      expect(API_CORS_HEADERS).toEqual({
        'Access-Control-Allow-Origin': 'same-origin',
        Vary: 'Origin',
        'X-Content-Type-Options': 'nosniff'
      });
    });
  });
});
