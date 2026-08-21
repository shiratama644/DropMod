// ============================================================================
// /api/health
//
// アプリケーションが応答可能な状態かの確認用エンドポイント。
// Vercel のヘルスチェック / 外部監視 / 手動確認で利用する。
// ============================================================================

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return Response.json({ status: 'ok', service: 'DropMod Next API' });
}
