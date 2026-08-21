import { Hono } from 'hono';

const app = new Hono();
const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
const MODRINTH_HOST = 'api.modrinth.com';

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'DropMod Hono API' }));

// -----------------------------------------------------------------------
// Modrinth API プロキシ
//
// セキュリティ強化 (L-1, L-2):
//   - `..` を含むパスは reject (path traversal 対策)
//   - 生成後の URL のホストが api.modrinth.com であることを再検証
//   - 許可 HTTP メソッドは GET / POST のみ (Modrinth 参照系のみを想定)
//
// パフォーマンス (L-3):
//   - `arrayBuffer()` の full-load を廃止し、Web Streams でパススルー
// -----------------------------------------------------------------------
app.on(['GET', 'POST'], '/api/modrinth/*', async (c) => {
  const rawPath = c.req.path.replace(/^\/api\/modrinth/, '');

  // path traversal 防止 (エンコード済みパターンも検出)
  const lowered = rawPath.toLowerCase();
  if (
    lowered.includes('..') ||
    lowered.includes('%2e%2e') ||
    lowered.includes('%2e.') ||
    lowered.includes('.%2e')
  ) {
    return c.json({ error: 'Invalid path: traversal segments are not allowed' }, 400);
  }

  const queryString = c.req.raw.url.includes('?')
    ? c.req.raw.url.slice(c.req.raw.url.indexOf('?'))
    : '';
  const targetUrl = `${MODRINTH_API_BASE}${rawPath}${queryString}`;

  // URL パース後にホストを再検証 (二重防御)
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return c.json({ error: 'Invalid target URL' }, 400);
  }
  if (parsedTarget.host !== MODRINTH_HOST) {
    return c.json({ error: 'Only api.modrinth.com is allowed' }, 400);
  }

  try {
    const headers: Record<string, string> = {
      // Modrinth API はレートリミット観点で meaningful UA を推奨
      'User-Agent': 'DropMod/1.1.0 (https://github.com/shiratama644/DropMod)'
    };

    const contentType = c.req.header('Content-Type');
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    const init: RequestInit = {
      method: c.req.method,
      headers
    };

    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      // POST の body だけは事前に取得する必要がある (fetch RequestInit の仕様)
      init.body = await c.req.raw.arrayBuffer();
    }

    const res = await fetch(parsedTarget.toString(), init);

    // レスポンスヘッダは Content-Type と (存在すれば) Retry-After を透過
    const responseHeaders = new Headers();
    const resContentType = res.headers.get('Content-Type');
    if (resContentType) responseHeaders.set('Content-Type', resContentType);
    const retryAfter = res.headers.get('Retry-After');
    if (retryAfter) responseHeaders.set('Retry-After', retryAfter);

    // res.body はストリーム。arrayBuffer() で全ロードせずそのまま流す。
    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders
    });
  } catch (err: any) {
    console.error('[DropMod] Modrinth proxy error:', err);
    return c.json({ error: err?.message || 'Proxy Error' }, 502);
  }
});

export default app;
