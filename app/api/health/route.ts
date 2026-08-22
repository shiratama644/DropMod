// ============================================================================
// /api/health
//
// アプリケーションが応答可能な状態かの確認用エンドポイント。
// Vercel のヘルスチェック / 外部監視 / 手動確認で利用する。
//
// M4-8 修正: HEAD method も 200 で応答 (監視ツールは HEAD で叩くことが多い)。
// ============================================================================

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return Response.json({ status: 'ok', service: 'DropMod Next API' });
}

export async function HEAD(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
