// ============================================================================
// APP_PROFILE 解決 (production | development)
//
// .env / 環境変数の APP_PROFILE でアプリ全体の挙動を切り替える:
//
//   | 項目                    | production        | development              |
//   |------------------------|-------------------|--------------------------|
//   | CSP                    | Enforce           | Report-Only (next.config) |
//   | HSTS                   | あり (2 年+preload) | なし (next.config)        |
//   | API レート制限           | あり               | 無効 (rateLimit.ts)      |
//   | サーバログ debug/info    | 抑制               | 出力 (logger.ts)          |
//
// ■ development が有効なのは next dev (NODE_ENV=development) のみ (2026-08-27 修正)
//
//   APP_PROFILE=development は NODE_ENV=production のコンテキスト
//   (next build / next start / Vercel 本番ランタイム) では **無視** され、
//   常に production として扱われる (fail-secure + 警告 1 回)。
//
//   背景: Next.js の .env.local は next dev だけでなく next build にも適用される
//   ため、開発緩和用に .env.local へ APP_PROFILE=development を書くと、そのまま
//   本番ビルド (CSP Report-Only / HSTS なし / レート制限なし) が作成されて
//   しまう重大な footgun があった。ランタイム側でもビルド済み成果物との
//   プロファイル混在を防ぐため、production コンテキストでは一律 production。
//
// 解決優先度 (lib/platform/profile.ts と next.config.mjs の 2 箇所で同一ロジック):
//   1. APP_PROFILE — 明示指定 (development は NODE_ENV !== production のみ有効)
//   2. VERCEL_ENV  — production|preview → production / development → development
//   3. NODE_ENV    — development → development / それ以外 → production
//
// 不正な APP_PROFILE 値は production 扱い (fail-secure: 安全側に倒す)。
//
// 注意: next.config.mjs のヘッダー (CSP/HSTS) は **build 時** に確定する。
// next dev は .env 変更で自動再起動するため即反映される。
// ============================================================================

export type AppProfile = 'production' | 'development';

export interface ProfileEnv {
  APP_PROFILE?: string | undefined;
  VERCEL_ENV?: string | undefined;
  NODE_ENV?: string | undefined;
}

/** 警告を 1 回だけ出すためのフラグ (呼び出し毎の重複防止) */
let warnedInvalidProfile = false;
let warnedDevIgnored = false;

/**
 * 環境変数オブジェクトから AppProfile を解決する (純粋関数・テスト用)。
 *
 * @param env process.env と互換のオブジェクト (defaults: process.env)
 */
export function resolveAppProfile(env: ProfileEnv = process.env): AppProfile {
  const explicit = (env.APP_PROFILE ?? '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'development') {
    // development 指定は開発ランタイム (next dev) でのみ有効。
    // NODE_ENV=production (= next build / next start) では、.env.local 等に
    // 書かれた開発緩和設定が本番ビルド・本番ランタイムへ漏れるのを防ぐため
    // 無視して production として扱う (2026-08-27 修正)。
    if (explicit === 'development' && env.NODE_ENV === 'production') {
      if (!warnedDevIgnored) {
        warnedDevIgnored = true;
        console.warn(
          '[DropMod] APP_PROFILE=development は next dev (NODE_ENV=development) でのみ有効です。' +
            'このプロセスは NODE_ENV=production のため production として扱います ' +
            '(.env.local に書いた場合も build / start には反映されません)'
        );
      }
      return 'production';
    }
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
  warnedDevIgnored = false;
}
