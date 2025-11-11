// gh-proxy Pages Functions 版本
// 去除了对 const ASSET_URL = 'https://hunshcn.github.io/gh-proxy'; 的依赖

const PREFLIGHT_INIT = {
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE',
    'Access-Control-Allow-Headers': 'content-type,authorization,x-requested-with',
    'Cache-Control': 'max-age=172800',
  },
};

// 内置的 HTML 内容 (原 gh-proxy 页面的核心结构和JS逻辑)
// 注意：这个 HTML 包含必要的 JS 逻辑，使其能够独立运行。
// 为了简洁和适应 Pages Functions，我们只保留核心的 HTML 和 JS 逻辑。
// 原版 Worker 依赖的 ASSET_URL 主要是为了获取这个 index.html 的内容。
const ASSET_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
    <meta name="referrer" content="never">
    <title>GitHub文件加速</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
        h1 { text-align: center; color: #444; }
        .container { background-color: #f9f9f9; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        input[type="text"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        button { background-color: #5cb85c; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 10px; }
        button:hover { background-color: #4cae4c; }
        .result { margin-top: 20px; padding: 10px; background-color: #e9ecef; border-radius: 4px; word-break: break-all; }
    </style>
</head>
<body>
    <div class="container">
        <h1>GitHub文件加速</h1>
        <p>输入 GitHub 文件链接（如 Release/Raw/Archive 链接），点击“加速”以生成代理链接。</p>
        <input type="text" id="urlInput" placeholder="请输入 GitHub 文件链接">
        <button onclick="generateLink()">加速</button>
        <div class="result" id="output"></div>
    </div>
    <script>
        function generateLink() {
            const input = document.getElementById('urlInput');
            const output = document.getElementById('output');
            const originalUrl = input.value.trim();

            if (!originalUrl) {
                output.innerHTML = '请输入有效的链接';
                return;
            }

            // 获取当前域名作为代理前缀
            const proxyHost = window.location.origin;
            
            let proxyPath = '';

            try {
                const url = new URL(originalUrl);
                
                // 仅支持 github.com 或 raw.githubusercontent.com
                if (url.hostname === 'github.com') {
                    // 对于 github.com/user/repo/blob/... 或 github.com/user/repo/releases/...
                    // 我们直接使用完整的路径作为代理路径
                    proxyPath = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
                } else if (url.hostname === 'raw.githubusercontent.com') {
                    // 对于 raw.githubusercontent.com/...
                    proxyPath = 'https://raw.githubusercontent.com' + url.pathname;
                } else if (url.hostname === 'github.global.ssl.fastly.net') {
                    // 对于 releases.github.com 的 CDN 链接
                    proxyPath = originalUrl.replace('https://github.global.ssl.fastly.net/', '');
                } else {
                    output.innerHTML = '仅支持 github.com 或 raw.githubusercontent.com 链接。';
                    return;
                }
                
                // 完整的代理链接
                const proxyLink = \`\${proxyHost}/\${proxyPath}\`;
                
                output.innerHTML = '<strong>加速链接:</strong> <a href="' + proxyLink + '" target="_blank">' + proxyLink + '</a>';
                
            } catch (e) {
                output.innerHTML = '链接格式不正确';
            }
        }
    </script>
</body>
</html>
`;

/**
 * @param {URL} urlObj
 * @param {RequestInit} reqInit
 */
async function proxy(urlObj, reqInit) {
  const res = await fetch(urlObj.href, reqInit);
  const resHdrOld = res.headers;
  const resHdrNew = new Headers(resHdrOld);
  const status = res.status;

  // 检查是否是重定向，并且重定向地址仍然是 GitHub/Raw 的
  if ([301, 302, 303, 307, 308].includes(status) && resHdrNew.has('location')) {
    let _location = resHdrNew.get('location');
    const locationUrl = new URL(_location, urlObj.origin);
    
    // 如果重定向目标仍在 github/raw 域，则重写 location 头
    if (checkUrl(locationUrl.href)) {
      // 在 Pages Functions 中，PREFIX 实际上是当前页面的根路径
      const PREFIX = new URL(reqInit.cf.url).origin + '/';
      _location = PREFIX + urlParse(locationUrl.href).pathname;
      resHdrNew.set('location', _location);
    } else {
      // 否则，直接跟随重定向
      reqInit.redirect = 'follow';
      return proxy(locationUrl, reqInit);
    }
  }

  // 跨域设置
  resHdrNew.set('access-control-expose-headers', '*');
  resHdrNew.set('access-control-allow-origin', '*');
  resHdrNew.delete('content-security-policy');
  resHdrNew.delete('content-security-policy-report-only');
  resHdrNew.delete('set-cookie');

  return new Response(res.body, {
    status,
    headers: resHdrNew,
  });
}

/**
 * @param {string} urlStr
 */
function checkUrl(urlStr) {
  // 简化白名单，只检查是否是 GitHub 相关域名
  try {
    const url = new URL(urlStr);
    return [
      'github.com',
      'raw.githubusercontent.com',
      'github.global.ssl.fastly.net',
      'objects.githubusercontent.com',
    ].includes(url.hostname);
  } catch (e) {
    return false;
  }
}

/**
 * @param {string} urlStr
 */
function urlParse(urlStr) {
    const url = new URL(urlStr);
    let pathname = url.pathname;
    // 移除路径开头多余的斜杠
    while (pathname.startsWith('/')) {
        pathname = pathname.substring(1);
    }
    // 匹配原始 Worker 的逻辑，将路径转换为代理目标 URL
    if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
        return new URL(pathname); // 已经是完整 URL
    } else if (pathname.startsWith('raw.githubusercontent.com')) {
        return new URL('https://' + pathname); // raw.githubusercontent.com/...
    } else if (pathname.startsWith('github.com')) {
        return new URL('https://' + pathname); // github.com/...
    } else if (pathname.includes('/releases/download/')) {
        return new URL('https://github.com/' + pathname); // user/repo/releases/download/...
    } else {
        return new URL('https://raw.githubusercontent.com/' + pathname); // user/repo/branch/file
    }
}


/**
 * Pages Functions entry point (middleware)
 * @param {EventContext} context
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  let pathname = url.pathname.substring(1);

  if (request.method === 'OPTIONS') {
    return new Response(null, PREFLIGHT_INIT);
  }

  // 根路径 "/" 返回内置的 HTML 页面
  if (pathname === '' || pathname === 'index.html') {
    return new Response(ASSET_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // 其他路径作为代理目标
  try {
    const urlObj = urlParse(pathname);
    
    // 检查是否在白名单内（虽然我们简化了 urlParse，但保留这个检查）
    if (!checkUrl(urlObj.href)) {
        return new Response("Invalid URL for proxy", { status: 403 });
    }
    
    const reqHdrRaw = request.headers;
    const reqHdrNew = new Headers(reqHdrRaw);
    
    // 清理头部，防止冲突
    reqHdrNew.delete('host');
    reqHdrNew.delete('referer');
    
    /** @type {RequestInit} */
    const reqInit = {
      method: request.method,
      headers: reqHdrNew,
      redirect: 'manual', // 手动处理重定向
      body: request.body,
      // @ts-ignore Cloudflare Worker/Pages 允许此属性
      cf: {
          url: request.url, // 传递当前 URL
      }
    };
    
    return proxy(urlObj, reqInit);
    
  } catch (e) {
    console.error(e);
    return new Response('Proxy Error: ' + e.message, { status: 500 });
  }
}
