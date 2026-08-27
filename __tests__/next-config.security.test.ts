import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * next.config.mjs の APP_PROFILE 連動セキュリティヘッダーの回帰テスト。
 *
 * - production:  CSP Enforce + HSTS + upgrade-insecure-requests
 * - development: CSP Report-Only + HSTS なし + ws://localhost 許可
 *
 * next.config.mjs は module scope で resolveAppProfile(process.env) を
 * 評価するため、vi.stubEnv + vi.resetModules + 動的 import で
 * 各プロファイルの状態を再現する。
 */

interface HeaderEntry {
  key: string;
  value: string;
}

interface RouteRule {
  source: string;
  headers: HeaderEntry[];
}

interface NextConfigModule {
  default: {
    headers: () => Promise<RouteRule[]>;
  };
}

async function loadNextConfig(): Promise<NextConfigModule> {
  vi.resetModules();
  return (await import('../next.config.mjs')) as NextConfigModule;
}

async function getSecurityHeaders(): Promise<Record<string, string>> {
  const mod = await loadNextConfig();
  const rules = await mod.default.headers();
  const all = rules.find((r) => r.source === '/:path*');
  expect(all).toBeDefined();
  const map: Record<string, string> = {};
  for (const h of all?.headers ?? []) map[h.key] = h.value;
  return map;
}

function parseCspDirectives(csp: string): string[] {
  return csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
}

describe('next.config.mjs — APP_PROFILE 連動セキュリティヘッダー', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('APP_PROFILE=production (既定・fail-secure)', () => {
    it('CSP が Enforce モードで付与される', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      const h = await getSecurityHeaders();
      expect(h['Content-Security-Policy']).toBeDefined();
      expect(h['Content-Security-Policy-Report-Only']).toBeUndefined();
    });

    it('upgrade-insecure-requests が含まれ ws://localhost は含まれない', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      const h = await getSecurityHeaders();
      const directives = parseCspDirectives(h['Content-Security-Policy'] ?? '');
      expect(directives).toContain('upgrade-insecure-requests');
      expect(directives.some((d) => d.includes('ws://localhost'))).toBe(false);
    });

    it('HSTS (2 年 + preload) が付与される', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      const h = await getSecurityHeaders();
      expect(h['Strict-Transport-Security']).toBe(
        'max-age=63072000; includeSubDomains; preload'
      );
    });

    it('共通セキュリティヘッダーが付与される', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      const h = await getSecurityHeaders();
      expect(h['X-Content-Type-Options']).toBe('nosniff');
      expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
      expect(h['Permissions-Policy']).toContain('camera=()');
      expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
      expect(h['X-DNS-Prefetch-Control']).toBe('on');
    });

    it('CSP の主要ディレクティブが維持されている (既存仕様の回帰防止)', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      const h = await getSecurityHeaders();
      const directives = parseCspDirectives(h['Content-Security-Policy'] ?? '');
      expect(directives).toContain("default-src 'self'");
      expect(directives).toContain("object-src 'none'");
      expect(directives).toContain("base-uri 'self'");
      expect(directives).toContain("form-action 'self'");
      expect(directives).toContain("frame-ancestors 'self'");
      expect(directives).toContain("worker-src 'self' blob:");
      expect(directives.some((d) => d.startsWith('connect-src '))).toBe(true);
    });

    it('APP_PROFILE 未設定 + NODE_ENV=test (vitest) は production になる (fail-secure)', async () => {
      vi.stubEnv('APP_PROFILE', '');
      const h = await getSecurityHeaders();
      expect(h['Content-Security-Policy']).toBeDefined();
      expect(h['Strict-Transport-Security']).toBeDefined();
    });

    it('不正な APP_PROFILE は production 扱いになる', async () => {
      vi.stubEnv('APP_PROFILE', 'staging');
      const h = await getSecurityHeaders();
      expect(h['Content-Security-Policy']).toBeDefined();
      expect(h['Content-Security-Policy-Report-Only']).toBeUndefined();
      expect(h['Strict-Transport-Security']).toBeDefined();
    });
  });

  describe('APP_PROFILE=development', () => {
    it('CSP が Report-Only モードになる (Enforce ヘッダーは無い)', async () => {
      vi.stubEnv('APP_PROFILE', 'development');
      const h = await getSecurityHeaders();
      expect(h['Content-Security-Policy-Report-Only']).toBeDefined();
      expect(h['Content-Security-Policy']).toBeUndefined();
    });

    it('HSTS は付与されない', async () => {
      vi.stubEnv('APP_PROFILE', 'development');
      const h = await getSecurityHeaders();
      expect(h['Strict-Transport-Security']).toBeUndefined();
    });

    it('upgrade-insecure-requests 無し・HMR websocket (ws://localhost) 許可あり', async () => {
      vi.stubEnv('APP_PROFILE', 'development');
      const h = await getSecurityHeaders();
      const directives = parseCspDirectives(h['Content-Security-Policy-Report-Only'] ?? '');
      expect(directives).not.toContain('upgrade-insecure-requests');
      expect(directives.some((d) => d.includes('ws://localhost:*'))).toBe(true);
      expect(directives.some((d) => d.includes('ws://127.0.0.1:*'))).toBe(true);
    });

    it('共通セキュリティヘッダーは production と同じ', async () => {
      vi.stubEnv('APP_PROFILE', 'development');
      const h = await getSecurityHeaders();
      expect(h['X-Content-Type-Options']).toBe('nosniff');
      expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
      expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    });
  });

  describe('フォールバック解決', () => {
    it('NODE_ENV=development (next dev 相当) は development プロファイル', async () => {
      vi.stubEnv('APP_PROFILE', '');
      vi.stubEnv('NODE_ENV', 'development');
      const h = await getSecurityHeaders();
      expect(h['Content-Security-Policy-Report-Only']).toBeDefined();
      expect(h['Strict-Transport-Security']).toBeUndefined();
    });

    it('VERCEL_ENV=preview は production プロファイル', async () => {
      vi.stubEnv('APP_PROFILE', '');
      vi.stubEnv('VERCEL_ENV', 'preview');
      const h = await getSecurityHeaders();
      expect(h['Content-Security-Policy']).toBeDefined();
      expect(h['Strict-Transport-Security']).toBeDefined();
    });

    it('VERCEL_ENV=development より APP_PROFILE=production が優先される', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      vi.stubEnv('VERCEL_ENV', 'development');
      const h = await getSecurityHeaders();
      expect(h['Content-Security-Policy']).toBeDefined();
      expect(h['Strict-Transport-Security']).toBeDefined();
    });
  });

  describe('静的画像の CORP ヘッダー (全プロファイル共通)', () => {
    it('画像拡張子の route に Cross-Origin-Resource-Policy: cross-origin が付く', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      const mod = await loadNextConfig();
      const rules = await mod.default.headers();
      const imageRule = rules.find((r) => r.source.includes('(png|jpg'));
      expect(imageRule).toBeDefined();
      expect(imageRule?.headers).toEqual([
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }
      ]);
    });
  });

  describe('プロファイルバナー (重複出力の回帰防止)', () => {
    // 背景: next build は main プロセス + jest-worker 子プロセスで next.config を
    // 再評価するため、ガードなしだと同じバナーが 3〜4 回出力されていた。
    // ここでは同一プロセス内での再 import をシミュレートして重複抑止を検証する
    // (子プロセス分は env 継承により同じガードが効く)。
    const BANNER_GUARD_KEY = '__DROPMOD_APP_PROFILE_BANNER_SHOWN';
    const INVALID_WARN_GUARD_KEY = '__DROPMOD_APP_PROFILE_INVALID_WARNED';
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      delete process.env[BANNER_GUARD_KEY];
      delete process.env[INVALID_WARN_GUARD_KEY];
      infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // バナーは process.env.VITEST が設定されていると抑制されるため外す
      vi.stubEnv('VITEST', '');
    });

    afterEach(() => {
      delete process.env[BANNER_GUARD_KEY];
      delete process.env[INVALID_WARN_GUARD_KEY];
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('通常の production バナーには警告が付かない', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      vi.stubEnv('NODE_ENV', 'production');
      await loadNextConfig();

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const msg = infoSpy.mock.calls[0]?.[0];
      expect(typeof msg === 'string' && msg.includes('APP_PROFILE=production')).toBe(true);
      expect(typeof msg === 'string' && msg.includes('⚠')).toBe(false);
    });

    it('本番ビルドを development で作る場合は ⚠ 警告が付く', async () => {
      vi.stubEnv('APP_PROFILE', 'development');
      vi.stubEnv('NODE_ENV', 'production');
      await loadNextConfig();

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const msg = infoSpy.mock.calls[0]?.[0];
      expect(typeof msg === 'string' && msg.includes('APP_PROFILE=development')).toBe(true);
      expect(typeof msg === 'string' && msg.includes('⚠')).toBe(true);
    });

    it('next dev 相当 (NODE_ENV=development) の development バナーには警告が付かない', async () => {
      vi.stubEnv('APP_PROFILE', 'development');
      vi.stubEnv('NODE_ENV', 'development');
      await loadNextConfig();

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const msg = infoSpy.mock.calls[0]?.[0];
      expect(typeof msg === 'string' && msg.includes('⚠')).toBe(false);
    });

    it('同一プロセスでの再評価ではバナーが重複しない', async () => {
      vi.stubEnv('APP_PROFILE', 'production');
      vi.stubEnv('NODE_ENV', 'production');
      await loadNextConfig();
      // next build の worker による config 再評価をシミュレート
      await loadNextConfig();
      await loadNextConfig();

      expect(infoSpy).toHaveBeenCalledTimes(1);
    });

    it('profile が変わった場合は新しいバナーが 1 回だけ出る', async () => {
      vi.stubEnv('APP_PROFILE', 'development');
      vi.stubEnv('NODE_ENV', 'development');
      await loadNextConfig();

      vi.stubEnv('APP_PROFILE', 'production');
      await loadNextConfig();

      expect(infoSpy).toHaveBeenCalledTimes(2);
      const secondMsg = infoSpy.mock.calls[1]?.[0];
      expect(typeof secondMsg === 'string' && secondMsg.includes('APP_PROFILE=production')).toBe(
        true
      );
    });

    it('不正な APP_PROFILE の警告も再評価で重複しない', async () => {
      vi.stubEnv('APP_PROFILE', 'staging');
      vi.stubEnv('NODE_ENV', 'production');
      await loadNextConfig();
      await loadNextConfig();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('APP_PROFILE');
    });
  });
});
