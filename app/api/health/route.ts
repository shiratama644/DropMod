// ============================================================================
// /api/health
//
// アプリケーションが応答可能な状態かの確認用エンドポイント。
// Vercel のヘルスチェック / 外部監視 / 手動確認で利用する。
//
// APP_PROFILE の解決結果 (production / development) も返す。
// セキュリティヘッダー (CSP/HSTS) は build 時に確定するため、ここは
// ランタイム側の解決結果である点に注意 (lib/platform/profile.ts 参照)。
//
// HEAD method も 200 で応答 (監視ツールは HEAD で叩くことが多い)。
// ============================================================================

import { getAppProfile } from '@/lib/platform/profile';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ok',
    service: 'DropMod Next API',
    profile: getAppProfile()
  });
}

export async function HEAD(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
