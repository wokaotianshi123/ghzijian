// Cloudflare Pages Functions (Functions 是 Pages 部署的后端逻辑)

// 定义配置变量
// 注意：Pages Functions 不像 Workers 可以直接访问 HTML 文件。
// 最简单的 Pages 部署通常是静态文件。对于 gh-proxy 这种需要
// 动态处理请求的，使用 Functions 是最合适的，它本质上是一个 Worker。

// 移除了 const ASSET_URL = 'https://hunshcn.github.io/gh-proxy/'; 依赖。
// Pages Functions 部署不需要外部的 JS 或 CSS 文件来运行核心逻辑。

// 代理的目标主机名（GitHub Raw/Blob）
const HOSTS = [
  'raw.githubusercontent.com',
  'github.com',
  'codeload.github.com',
];

// 默认的 HTML 内容
const HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GitHub Proxy</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 30px auto; padding: 0 20px; }
    h1 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    p { margin-bottom: 1em; }
    code { background: #f4f4f4; padding: 2px 4px; border-radius: 4px; }
    .container { padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9; }
    .example { margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 15px; }
    .url-input { width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    .url-button { padding: 10px 15px; background: #42b983; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .footer { margin-top: 30px; font-size: 0.9em; color: #777; text-align: center; }
  </style>
</head>
<body>
  <h1>GitHub Proxy for Cloudflare Pages</h1>
  <div class="container">
    <p>本项目旨在提供 GitHub 文件和仓库的代理服务，以加速访问速度。</p>
    <p><strong>使用方法:</strong></p>
    <p>将需要代理的 GitHub URL 粘贴到下方，点击生成代理链接。</p>
    <input type="text" id="github-url" class="url-input" placeholder="例如: https://github.com/hunshcn/gh-proxy/blob/master/index.html">
    <button class="url-button" onclick="generateProxyUrl()">生成代理链接</button>
    <p class="example">
      <strong>代理链接:</strong> <code id="proxy-url"></code>
    </p>
    <p><strong>注意:</strong></p>
    <ul>
      <li>Pages Functions 具有请求体大小限制。</li>
      <li>如果直接访问本页面，代理逻辑在 JavaScript 中，仅供参考。</li>
      <li>实际的代理功能是通过访问 <code>/目标URL</code> 来触发 Pages Functions。</li>
    </ul>
  </div>

  <div class="footer">
    <p>基于 hunshcn/gh-proxy 项目的 Cloudflare Pages Functions 实现。</p>
  </div>

  <script>
    function generateProxyUrl() {
      const input = document.getElementById('github-url');
      const output = document.getElementById('proxy-url');
      const githubUrl = input.value.trim();

      if (githubUrl) {
        // 假设您的 Pages URL 是 https://your-site.pages.dev
        // 代理链接就是 https://your-site.pages.dev/https://github.com/...
        output.textContent = window.location.origin + '/' + githubUrl.replace(/^(https?:\/\/)/, '');
      } else {
        output.textContent = '请输入一个 GitHub URL。';
      }
    }
  </script>
</body>
</html>
`;

/**
 * 检查并返回要代理的 URL
 * @param {URL} url - 请求的 URL 对象
 * @returns {string | null} 目标 URL 字符串，如果不是有效目标则返回 null
 */
function getTargetUrl(url) {
  // 检查路径部分是否包含目标 URL，通常 Pages Functions 会捕获所有路径
  // 例如：https://your.pages.dev/https://raw.githubusercontent.com/user/repo/master/file.txt
  const path = url.pathname.slice(1); // 去掉开头的 /

  if (path) {
    // 尝试解析路径作为完整的 URL
    try {
      const targetUrl = new URL(path.startsWith('http') ? path : 'https://' + path);
      
      // 检查主机名是否在允许的列表中
      if (HOSTS.includes(targetUrl.hostname)) {
        return targetUrl.toString();
      }
    } catch (e) {
      // URL 解析失败，可能是无效格式
      console.error("Invalid target URL in path:", path, e);
    }
  }

  // 如果没有有效的代理目标，返回 null
  return null;
}

/**
 * 处理传入的 Fetch 请求
 * @param {Request} request - 传入的请求对象
 * @param {Context} context - Pages Functions 的上下文对象
 * @returns {Response} 响应对象
 */
export async function onRequest({ request }) {
  const url = new URL(request.url);
  const targetUrl = getTargetUrl(url);

  if (!targetUrl) {
    // 如果没有有效的代理目标，返回默认 HTML 页面
    return new Response(HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  try {
    // 创建新的请求对象，用于代理
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      redirect: 'manual', // 不自动跟随重定向
      body: request.body,
    });

    // 移除可能导致问题的 Headers
    proxyRequest.headers.delete('host');
    proxyRequest.headers.delete('if-modified-since');
    proxyRequest.headers.delete('if-none-match');

    // 发送代理请求
    let response = await fetch(proxyRequest);

    // 检查并处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        // 重写重定向的 Location 头部，使其指向代理地址
        const newLocation = url.origin + '/' + location.replace(/^(https?:\/\/)/, '');
        response = new Response(response.body, response);
        response.headers.set('location', newLocation);
      }
    }

    // 设置响应头部，允许 CORS 跨域
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers') || '*');
    
    // 返回代理的响应
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy failed:", error);
    return new Response(`Proxy Error: ${error.message}`, { status: 500 });
  }
}

// Pages Functions 的 OPTIONS 请求预检处理
export async function onPreflight({ request }) {
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    });

    const allowHeaders = request.headers.get('Access-Control-Request-Headers');
    if (allowHeaders) {
      headers.set('Access-Control-Allow-Headers', allowHeaders);
    }

    return new Response(null, {
      status: 204,
      headers: headers,
    });
  }
  return null;
}
