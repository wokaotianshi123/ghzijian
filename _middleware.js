/**
 * Cloudflare Pages 版 gh-proxy
 * 完全去掉 https://hunshcn.github.io/gh-proxy 依赖
 * 静态文件走 Pages 自己托管
 */
const PREFIX = '/__gh_proxy__';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
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

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

// 默认首页 HTML
const HOME_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>gh-proxy</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="icon" href="/favicon.ico" />
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
    <input id="url" type="text" placeholder="https://github.com/xxx/xxx/releases/download/xxx.zip" />
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

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. CORS 预检
  if (request.method === 'OPTIONS')
    return new Response(null, { headers: CORS_HEADERS });

  // 2. 代理路由
  if (path.startsWith(PREFIX)) {
    const target = url.searchParams.get('url');
    if (!target)
      return jsonResponse({ error: '缺少 url 参数' }, 400);

    let t;
    try { t = new URL(target); } catch {
      return jsonResponse({ error: '无效 url' }, 400);
    }
    if (t.protocol !== 'http:' && t.protocol !== 'https:')
      return jsonResponse({ error: '仅支持 http(s)' }, 400);

    try {
      const res = await fetchWithRetry(target, {
        method: request.method,
        headers: {
          'user-agent': request.headers.get('user-agent') || 'CF-Pages-gh-proxy',
        },
      });
      // 把远端响应原样返回，加上 CORS
      const { readable, writable } = new TransformStream();
      res.body.pipeTo(writable);
      return new Response(readable, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), ...CORS_HEADERS },
      });
    } catch (e) {
      return jsonResponse({ error: '代理失败: ' + e.message }, 500);
    }
  }

  // 3. 根路径返回首页
  if (path === '/') {
    return new Response(HOME_HTML, {
      headers: { 'content-type': 'text/html;charset=utf-8', ...CORS_HEADERS },
    });
  }

  // 4. 其余路径（/favicon.ico、/robots.txt 等）直接让 Pages 的静态资源接管
  //    这里显式放过，Pages 会自动去 public/ 下找；找不到会 404。
  return await ctx.next();
}
