import { Hono } from 'hono';

const app = new Hono();
const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';

app.get('/api/health', (c) => c.json({ status: 'ok', service: 'CraftForge Hono API' }));

// Modrinth API への万能プロキシハンドラ
app.all('/api/modrinth/*', async (c) => {
  const path = c.req.path.replace(/^\/api\/modrinth/, '');
  const queryString = c.req.raw.url.includes('?') ? c.req.raw.url.slice(c.req.raw.url.indexOf('?')) : '';
  const targetUrl = `${MODRINTH_API_BASE}${path}${queryString}`;

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'CraftForge/1.1.0 (https://github.com/craftforge/craftforge-mod-manager; contact@craftforge.app)'
    };

    if (c.req.header('Content-Type')) {
      headers['Content-Type'] = c.req.header('Content-Type')!;
    }

    const init: RequestInit = {
      method: c.req.method,
      headers
    };

    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      init.body = await c.req.raw.arrayBuffer();
    }

    const res = await fetch(targetUrl, init);
    const data = await res.arrayBuffer();

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', res.headers.get('Content-Type') || 'application/json');

    return new Response(data, {
      status: res.status,
      headers: responseHeaders
    });
  } catch (err: any) {
    console.error('Proxy Error:', err);
    return c.json({ error: err.message || 'Proxy Error' }, 500);
  }
});

export default app;