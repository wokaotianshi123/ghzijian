/**
 * Cloudflare Pages Functions
 * 零依赖 GitHub 文件代理
 * 文件路径：functions/[[path]].js
 */
const PREFIX = '/__gh_proxy__';

const CORS_HEADERS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
};

async function fetchWithRetry(url, options = {}, retries = 3) {
  try {
    const res = await fetch(url, options);
    if (res.status >= 200 && res.status < 300) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw e;
  }
}

const HOME_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>gh-proxy</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;padding:2rem}
    input{width:100%;max-width:420px;padding:.5rem;margin:.5rem 0}
    button{padding:.5rem 1rem}
  </style>
</head>
<body>
  <h1>gh-proxy</h1>
  <p>零依赖版 GitHub 文件代理（Cloudflare Pages）</p>
  <form id="form">
    <input id="url" type="text" placeholder="https://github.com/xxx/xxx/releases/download/xxx.zip"/>
    <button type="submit">代理下载</button>
  </form>
  <script>
    document.getElementById('form').onsubmit=(e)=>{
      e.preventDefault();
      const u=document.getElementById('url').value.trim();
      if(!u)return;
      location.href='/__gh_proxy__?url='+encodeURIComponent(u);
    };
  </script>
</body>
</html>`;

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // 1. CORS 预检
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  // 2. 代理路由
  if (url.pathname.startsWith(PREFIX)) {
    const target = url.searchParams.get('url');
    if (!target) return new Response('缺少 url 参数', { status: 400 });

    let t;
    try { t = new URL(target); } catch {
      return new Response('无效 url', { status: 400 });
    }
    if (t.protocol !== 'http:' && t.protocol !== 'https:')
      return new Response('仅支持 http(s)', { status: 400 });

    try {
      const res = await fetchWithRetry(target, {
        method: request.method,
        headers: {
          'user-agent': request.headers.get('user-agent') || 'CF-Pages-gh-proxy',
        },
      });
      const { readable, writable } = new TransformStream();
      res.body.pipeTo(writable);
      return new Response(readable, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), ...CORS_HEADERS },
      });
    } catch (e) {
      return new Response('代理失败: ' + e.message, { status: 500 });
    }
  }

  // 3. 首页
  if (url.pathname === '/') {
    return new Response(HOME_HTML, {
      headers: { 'content-type': 'text/html;charset=utf-8', ...CORS_HEADERS },
    });
  }

  // 4. 其它路径交给 Pages 静态资源（或 404）
  return next();
}
