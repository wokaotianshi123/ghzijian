// gh-proxy Pages Function (_worker.js) - 路径使用完整的URL作为目标

/**
 * 核心处理函数
 * @param {Request} request
 */
export default {
    async fetch(request, env, ctx) {
        return handleRequest(request);
    }
};

/**
 * gh-proxy 代理逻辑
 * @param {Request} request
 */
async function handleRequest(request) {
    const url = new URL(request.url);

    // 预检请求（CORS）处理
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    // path 包含了 /https:/raw.githubusercontent.com/...
    const path = url.pathname.slice(1);
    const domain = url.host;

    // 1. 处理根路径 "/" 的请求 - 提供一个简单的 HTML 页面
    if (!path) {
        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>GitHub Proxy - Cloudflare Pages Function</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: auto; }
        h1 { color: #333; }
        code { background: #eee; padding: 2px 4px; border-radius: 4px; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .usage { color: #007bff; font-weight: bold; }
    </style>
</head>
<body>
    <h1>GitHub 文件加速服务</h1>
    <p>当前服务部署在 <strong>Cloudflare Pages Functions</strong> 上，已脱离对外部 <code>ASSET_URL</code> 的依赖。</p>
    <h2>使用方法 (Usage):</h2>
    <p>将 GitHub 的文件地址 (<code>https://...</code>) **完整地** 放在当前域名之后。</p>
    <p class="usage">加速格式: <code>https://${domain}/[完整的目标 URL]</code></p>
    <h3>示例 (Examples):</h3>
    <ul>
        <li><strong>GitHub Release 文件:</strong>
            <pre>原地址: <code>https://github.com/user/repo/releases/download/v1.0.0/file.zip</code>
加速后: <code>https://${domain}/https://github.com/user/repo/releases/download/v1.0.0/file.zip</code></pre>
        </li>
        <li><strong>原始文件 (Raw Content):</strong>
            <pre>原地址: <code>https://raw.githubusercontent.com/user/repo/branch/file.txt</code>
加速后: <code>https://${domain}/https://raw.githubusercontent.com/user/repo/branch/file.txt</code></pre>
        </li>
    </ul>
    <p>本服务基于 <a href="https://github.com/hunshcn/gh-proxy" target="_blank">hunshcn/gh-proxy</a> 的 Workers 逻辑修改。</p>
</body>
</html>`;
        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
            },
        });
    }

    // 2. 代理逻辑
    // path 已经是 https://github.com/... 或 https:/raw.githubusercontent.com/...
    const TARGET_URL = path; 

    // 检查是否以 "http://" 或 "https://" 开头，防止路径被意外截断
    if (!TARGET_URL.startsWith('http://') && !TARGET_URL.startsWith('https://')) {
        return new Response('Error: Invalid URL format. Target URL must start with http:// or https://.', { status: 400 });
    }

    // 检查是否是合法的目标域名，防止开放代理
    const allowedHosts = [
        'github.com',
        'raw.githubusercontent.com',
        'gist.githubusercontent.com',
        'github.githubassets.com',
        'avatars.githubusercontent.com',
        'objects.githubusercontent.com',
        'codeload.github.com',
        'github.dev',
        'vscode.dev'
    ];

    try {
        const targetUrl = new URL(TARGET_URL);
        const host = targetUrl.hostname;

        if (!allowedHosts.includes(host)) {
            return new Response(`Error: ${host} is not a supported GitHub domain for proxying.`, { status: 403 });
        }

        const newRequest = new Request(targetUrl, request);

        // 移除或修改可能影响代理请求的 Header
        newRequest.headers.set('Host', host);
        newRequest.headers.set('Referer', 'https://github.com/'); // 设置 Referer
        newRequest.headers.delete('X-Forwarded-For');
        newRequest.headers.delete('X-Real-Ip');
        // 确保 Content-Type 在没有请求体时不会被错误设置
        if (request.body === null) {
            newRequest.headers.delete('Content-Type');
        }

        // 发起请求
        const response = await fetch(newRequest);
        const newResponse = new Response(response.body, response);

        // 处理响应头
        newResponse.headers.set('Access-Control-Allow-Origin', '*'); // 允许跨域
        newResponse.headers.delete('Content-Security-Policy');
        newResponse.headers.delete('Strict-Transport-Security');

        // 缓存处理
        // newResponse.headers.set('Cache-Control', 'public, max-age=86400');

        return newResponse;

    } catch (e) {
        // URL 格式错误或其他异常
        return new Response(`Error processing request or invalid URL: ${e.message}`, { status: 500 });
    }
}
