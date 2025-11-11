// _worker.js

/**
 * gh-proxy 代理逻辑（Pages Functions 实现）
 * 移除了对 const ASSET_URL 的依赖
 */

const upstream = 'https://github.com';
const upstream_raw = 'https://raw.githubusercontent.com';

// 移除 ASSET_URL 依赖：Pages Functions 仅处理动态请求。
// 如果需要用户界面，应在Pages的静态部分提供 index.html 等文件。

const replace_dict = {
  '//github.com': `//${self.location.host}`,
  '//raw.githubusercontent.com': `//${self.location.host}/raw`,
  '//avatars.githubusercontent.com': `//${self.location.host}/avatar`,
  '//github.io': `//${self.location.host}/io`
};

/**
 * 构造代理URL
 * @param {URL} url 
 * @returns {string | null}
 */
function getTargetUrl(url) {
  const path = url.pathname.slice(1).split('/');
  const route = path[0];

  switch (route) {
    case 'raw':
      path.shift(); // 移除 'raw'
      return `${upstream_raw}/${path.join('/')}${url.search}`;
    case 'avatar':
      path.shift(); // 移除 'avatar'
      return `https://avatars.githubusercontent.com/${path.join('/')}${url.search}`;
    case 'io':
      path.shift(); // 移除 'io'
      return `https://${path.join('/')}${url.search}`;
    default:
      // 默认代理到 github.com
      return `${upstream}${url.pathname}${url.search}`;
  }
}

/**
 * 处理请求
 * @param {Request} request 
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrl = getTargetUrl(url);

  if (!targetUrl) {
    return new Response('404 Not Found', { status: 404 });
  }

  // 构建新的请求
  const newRequest = new Request(targetUrl, request);
  newRequest.headers.set('Host', new URL(targetUrl).host);

  let response = await fetch(newRequest);
  let newResponse = new Response(response.body, response);

  // 处理内容替换（仅对文本类型有效）
  const contentType = newResponse.headers.get('Content-Type');
  if (contentType && (contentType.includes('text/html') || contentType.includes('application/json') || contentType.includes('text/css') || contentType.includes('application/javascript'))) {
    let text = await newResponse.text();

    for (const [key, value] of Object.entries(replace_dict)) {
      // 使用正则全局替换，注意 key 是字符串，需要转义处理
      const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escapedKey, 'g');
      text = text.replace(regex, value);
    }
    newResponse = new Response(text, newResponse);
  }

  // 添加 CORS 头
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH');

  return newResponse;
}

/**
 * Pages Functions 的默认导出
 * @param {object} context 
 */
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  }
}

// Pages Functions 不再需要像 Workers 那样监听 addEventListener('fetch', ...)，
// 而是通过 default export 的 fetch 函数来处理请求。
