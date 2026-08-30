// ============================================================================
// API Route Handler 共通ガード — CORS ヘッダー + レート制限 + クライアント IP
//
// 2026-08-27 までは app/api/modrinth と app/api/loaders に同じ実装が
// 重複していたのを lib/platform に集約した (Phase: APP_PROFILE 対応)。
//
// - CORS: Same-Origin のみ (外部サイトからの API 悪用を防止)。
//   'Access-Control-Allow-Origin: same-origin' は仕様上どの Origin とも
//   一致しないため、実質「クロスオリジン読み取りを常に拒否」になる。
// - レート制限: in-memory・single instance 用。Vercel の serverless は
//   instance 毎に独立するため完全ではないが、悪用の抑止には有効。
//   本格運用は Upstash Redis 等を推奨。
// - APP_PROFILE=development ではレート制限を無効化する
//   (ローカル開発・デバッグで自己遮断しないため。E2E は本番 build で
//   走るため影響を受けない)。
// ============================================================================

import { getAppProfile } from './profile';

/** 全 API Route で共通の CORS / 基本セキュリティヘッダー。 */
export const API_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'same-origin',
  Vary: 'Origin',
  'X-Content-Type-Options': 'nosniff'
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
/** エントリ掃除を実行するサイズ閾値 (メモリリーク対策) */
const RATE_LIMIT_CLEANUP_THRESHOLD = 1000;

// bucket ('modrinth' / 'loaders' 等) + IP 単位でカウントする共有マップ
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/** テスト用: 全 bucket のカウントを初期化。 */
export function _resetRateLimitForTesting(): void {
  rateLimitMap.clear();
}

/**
 * レート制限チェック。
 *
 * @param bucket 論理バケット名 (例: 'modrinth' / 'loaders') — 同一 IP でも
 *               エンドポイント群ごとに独立カウントするための識別子
 * @param ip     クライアント IP
 * @param max    windowMs 内の許容リクエスト数
 * @param windowMs ウィンドウ長 (既定 60s)
 */
export function checkRateLimit(
  bucket: string,
  ip: string,
  max: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): RateLimitResult {
  // development プロファイルではレート制限をスキップ
  if (getAppProfile() === 'development') {
    return { allowed: true, remaining: max };
  }

  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    // 期限切れエントリの掃除 (メモリリーク対策)
    if (rateLimitMap.size > RATE_LIMIT_CLEANUP_THRESHOLD) {
      for (const [k, val] of rateLimitMap) {
        if (val.resetAt < now) rateLimitMap.delete(k);
      }
    }
    return { allowed: true, remaining: max - 1 };
  }
  entry.count++;
  return {
    allowed: entry.count <= max,
    remaining: Math.max(0, max - entry.count)
  };
}

/** プロキシ背後 (Vercel 等) のクライアント IP を取得する。 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
