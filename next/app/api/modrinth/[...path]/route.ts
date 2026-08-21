// ============================================================================
// /api/modrinth/[...path]
//
// Modrinth API 万能プロキシ (Vite 版 server/index.ts の Hono プロキシ相当)。
//
// 目的:
//   - ブラウザから直接 https://api.modrinth.com を叩く際の User-Agent 制約
//     (forbidden header) を回避
//   - CORS の煩わしさを排除
//   - サーバ側で meaningful UA を必ず付与しレートリミット緩和 & Modrinth 規約遵守
//
// セキュリティ:
//   - path traversal (..) と そのエンコード形式を reject
//   - URL 生成後にホスト検証 (api.modrinth.com のみ)
//   - 許可メソッドは GET / POST のみ (Modrinth 参照系のみを想定)
//
// パフォーマンス:
//   - レスポンスは Web Streams でパススルー (arrayBuffer 全ロードしない)
//   - Retry-After ヘッダは透過してクライアント側の 429 リトライで活用
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODRINTH_HOST = 'api.modrinth.com';
const MODRINTH_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)';

function isSafePath(segments: string[]): boolean {
  return !segments.some((s) => {
    const lower = decodeURIComponent(s).toLowerCase();
    return (
      lower.includes('..') ||
      lower.includes('%2e%2e') ||
      lower.includes('%2e.') ||
      lower.includes('.%2e')
    );
  });
}

async function handler(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await params;

  if (!Array.isArray(path) || path.length === 0) {
    return Response.json({ error: 'Missing modrinth endpoint path' }, { status: 400 });
  }

  if (!isSafePath(path)) {
    return Response.json(
      { error: 'Invalid path: traversal segments are not allowed' },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const target = `${MODRINTH_BASE}/${path.join('/')}${url.search}`;

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    return Response.json({ error: 'Invalid target URL' }, { status: 400 });
  }
  if (parsedTarget.host !== MODRINTH_HOST) {
    return Response.json({ error: 'Only api.modrinth.com is allowed' }, { status: 400 });
  }

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT
  };
  const contentType = req.headers.get('Content-Type');
  if (contentType) headers['Content-Type'] = contentType;

  const init: RequestInit = {
    method: req.method,
    headers
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // POST の body は事前取得 (fetch RequestInit の仕様)
    init.body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(parsedTarget.toString(), init);

    // 透過するのは Content-Type と (存在すれば) Retry-After のみ
    // (Set-Cookie 等の余計なヘッダは撒かない)
    const respHeaders = new Headers();
    const upstreamCt = upstream.headers.get('Content-Type');
    if (upstreamCt) respHeaders.set('Content-Type', upstreamCt);
    const retryAfter = upstream.headers.get('Retry-After');
    if (retryAfter) respHeaders.set('Retry-After', retryAfter);

    // ストリームでパススルー
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy Error';
    console.error('[DropMod] Modrinth proxy error:', err);
    return Response.json({ error: message }, { status: 502 });
  }
}

export { handler as GET, handler as POST };
