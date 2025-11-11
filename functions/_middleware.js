/**
 * Cloudflare Pages Functions —— 纯代理中间件
 * 部署后访问：
 *   https://你的项目.pages.dev/           -> 首页
 *   https://你的项目.pages.dev/https/*    -> 代理
 *   https://你的项目.pages.dev/http/*     -> 代理
 */

const HOSTS_TO_BLOCK = ['127.0.0.1', 'localhost', '0.0.0.0'];

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 1. 非代理路径直接交给 Pages 静态托管
  if (!url.pathname.startsWith('/https/') && !url.pathname.startsWith('/http/')) {
    return next();          // Pages 会自动返回 /static 里的文件
  }

  // 2. 解析要代理的真实地址
  const target = url.pathname.slice(1) + url.search; // 去掉开头的 /https/ 或 /http/
  let targetURL;
  try {
    targetURL = new URL(target);
  } catch {
    return new Response('Invalid target URL', { status: 400 });
  }

  // 3. 简单黑名单
  if (HOSTS_TO_BLOCK.includes(targetURL.hostname)) {
    return new Response('Blocked host', { status 403 });
  }

  // 4. 构造新请求
  const newReq = new Request(targetURL, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  // 5. 发送并返回响应
  const resp = await fetch(newReq);

  // 6. 克隆响应，去掉/set-cookie 等可能带域名绑定的头
  const newResp = new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
  newResp.headers.delete('set-cookie');
  newResp.headers.set('access-control-allow-origin', '*');

  return newResp;
}