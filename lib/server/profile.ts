// ============================================================================
// APP_PROFILE 解決 (production | development)
//
// .env / 環境変数の APP_PROFILE でアプリ全体の挙動を切り替える:
//
//   | 項目                    | production        | development              |
//   |------------------------|-------------------|--------------------------|
//   | CSP                    | Enforce           | Report-Only (next.config) |
//   | HSTS                   | あり (2 年+preload) | なし (next.config)        |
//   | API レート制限           | あり               | 無効 (rate-limit.ts)      |
//   | サーバログ debug/info    | 抑制               | 出力 (logger.ts)          |
//
// 解決優先度 (lib/server/profile.ts と next.config.mjs の 2 箇所で同一ロジック):
//   1. APP_PROFILE            — 明示指定。常に最優先
//   2. VERCEL_ENV             — production|preview → production / development → development
//   3. NODE_ENV               — development → development / それ以外 → production
//
// 不正な APP_PROFILE 値は production 扱い (fail-secure: 安全側に倒す)。
//
// 注意: next.config.mjs のヘッダー (CSP/HSTS) は **build 時** に確定する。
// APP_PROFILE を変更したら `pnpm build` し直すこと (next dev は .env 変更で自動再起動)。
// ランタイム側 (ロガー / レート制限) はこの module が起動時に解決する。
// ============================================================================

export type AppProfile = 'production' | 'development';

export interface ProfileEnv {
  APP_PROFILE?: string | undefined;
  VERCEL_ENV?: string | undefined;
  NODE_ENV?: string | undefined;
}

/** APP_PROFILE が不正な値のときの警告を 1 回だけ出す (呼び出し毎の重複防止) */
let warnedInvalidProfile = false;

/**
 * 環境変数オブジェクトから AppProfile を解決する (純粋関数・テスト用)。
 *
 * @param env process.env と互換のオブジェクト (defaults: process.env)
 */
export function resolveAppProfile(env: ProfileEnv = process.env): AppProfile {
  const explicit = (env.APP_PROFILE ?? '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'development') {
    return explicit;
  }
  if (explicit) {
    if (!warnedInvalidProfile) {
      warnedInvalidProfile = true;
      console.warn(
        `[DropMod] APP_PROFILE="${env.APP_PROFILE}" は不正な値です。production | development のいずれかを指定してください (production として扱います)`
      );
    }
    return 'production';
  }

  const vercel = (env.VERCEL_ENV ?? '').trim().toLowerCase();
  if (vercel === 'development') return 'development';
  if (vercel === 'production' || vercel === 'preview') return 'production';

  return env.NODE_ENV === 'development' ? 'development' : 'production';
}

/** 解決結果のモジュールキャッシュ (サーバー起動時に 1 回確定すれば十分) */
let cachedProfile: AppProfile | null = null;

/** 実行環境の process.env から AppProfile を解決する (結果はキャッシュされる)。 */
export function getAppProfile(): AppProfile {
  if (cachedProfile === null) {
    cachedProfile = resolveAppProfile();
  }
  return cachedProfile;
}

/** テスト用: getAppProfile のキャッシュをクリア (vi.stubEnv 後に呼ぶ)。 */
export function _resetAppProfileCacheForTesting(): void {
  cachedProfile = null;
  warnedInvalidProfile = false;
}
