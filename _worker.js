// gh-proxy Pages Function (_worker.js)
// 移除对 const ASSET_URL 的依赖，所有逻辑都在此文件内完成。

/**
 * 核心处理函数
 * @param {Request} request
 * @param {object} env 环境变量
 * @param {object} ctx Context
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

    const path = url.pathname.slice(1);
    const domain = url.host;

    // 1. 处理根路径 "/" 的请求 - 提供一个简单的 HTML 页面
    if (!path) {
        // 在 Pages 部署中，我们不再依赖 ASSET_URL，而是直接提供一个简单的页面
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
    </style>
</head>
<body>
    <h1>GitHub 文件加速服务</h1>
    <p>当前服务部署在 <strong>Cloudflare Pages Functions</strong> 上，已脱离对外部 <code>ASSET_URL</code> 的依赖。</p>
    <h2>使用方法 (Usage):</h2>
    <p>将 GitHub 的文件地址 (<code>https://github.com/...</code>) 或原始文件地址 (<code>https://raw.githubusercontent.com/...</code>) 替换为当前域名 (<code>https://${domain}/...</code>) 即可。</p>
    <h3>示例 (Examples):</h3>
    <ul>
        <li><strong>GitHub Release 文件:</strong>
            <pre>原地址: <code>https://github.com/user/repo/releases/download/v1.0.0/file.zip</code>
加速后: <code>https://${domain}/github.com/user/repo/releases/download/v1.0.0/file.zip</code></pre>
        </li>
        <li><strong>原始文件 (Raw Content):</strong>
            <pre>原地址: <code>https://raw.githubusercontent.com/user/repo/branch/file.txt</code>
加速后: <code>https://${domain}/raw.githubusercontent.com/user/repo/branch/file.txt</code></pre>
        </li>
        <li><strong>其他 git/assets/gist/codeload 等域名加速方式类似。</strong></li>
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
    const TARGET_URL = 'https://' + path; // 构造目标 URL

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

        // 缓存处理 (可选: 可根据需求调整缓存策略)
        // 确保 Pages Function 部署后能生效，通常 Pages 自身带有 CDN 缓存。
        // newResponse.headers.set('Cache-Control', 'public, max-age=86400'); // 例如，缓存一天

        return newResponse;

    } catch (e) {
        // URL 格式错误或其他异常
        return new Response(`Error processing request: ${e.message}`, { status: 500 });
    }
}
