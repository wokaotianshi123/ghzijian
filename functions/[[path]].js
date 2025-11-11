// functions/[[path]].js

/**
 * gh-proxy 核心代理逻辑 - 适用于 Cloudflare Pages Function
 *
 * 原始 ASSET_URL 的作用是处理对前端页面的请求，但在 Pages 部署中，
 * 静态文件（public/index.html）会由 Pages 自动处理，因此
 * 这里只需要实现动态的代理转发逻辑。
 */

// 匹配 GitHub 相关 URL 的正则表达式
// 原始 gh-proxy 使用了一组更复杂的正则，这里使用简化的、核心的匹配模式
const EXP1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i; // releases/archive
const EXP2 = /^(?:https?:\/\/)?raw\.githubusercontent\.com\/.+?\/.+?\/.+?$/i;   // raw
const EXP3 = /^(?:https?:\/\/)?gist\.githubusercontent\.com\/.+?\/.+?\/raw\/.+$/i; // gist
const EXP4 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i;      // blob/raw
const EXP5 = /^(?:https?:\/\/)?github\.com\/.*?\/(?:archive|releases)\/.*$/i;   // git archive/releases

// 默认不启用白名单，如果需要，请在 Pages Function 环境变量中设置 WHITE_LIST
const WHITE_LIST = []; 
const PREFIX = '/'; // Pages 根路径部署

const PREFLIGHT_INIT = {
    status: 204,
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,HEAD,DELETE,OPTIONS',
        'Access-Control-Max-Age': '1728000',
    },
}

/**
 * 代理请求处理函数
 * @param {Request} request
 * @param {import('@cloudflare/workers-types').EventContext} env
 * @returns {Promise<Response>}
 */
export async function onRequest({ request, next }) {
    const url = new URL(request.url);
    const pathname = url.pathname.slice(PREFIX.length);
    const reqHdrRaw = request.headers;

    // 1. 预检请求 (OPTIONS)
    if (request.method === 'OPTIONS' && reqHdrRaw.has('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT);
    }

    // 2. Pages 静态文件处理 (index.html)
    // 根路径请求，让 Pages 自动返回 public/index.html
    if (pathname === '') {
        return next();
    }
    
    // 3. 核心代理逻辑
    let urlStr = pathname;

    // 检查白名单
    let allow = WHITE_LIST.length === 0;
    for (const item of WHITE_LIST) {
        if (urlStr.includes(item)) {
            allow = true;
            break;
        }
    }
    if (!allow) {
        return new Response("blocked", { status: 403 });
    }

    // 完整 URL 模式
    if (urlStr.search(/^https?:\/\//) !== 0) {
        urlStr = 'https://' + urlStr;
    }

    const targetUrl = newUrl(urlStr);
    if (!targetUrl) {
         // 如果不是有效的URL，让Pages处理，返回404或静态文件
        return next();
    }

    // 检查是否为 raw.githubusercontent.com 走 jsdelivr CDN 逻辑 (可选加速)
    if (targetUrl.href.search(EXP2) === 0) {
        // 原始逻辑：将 raw.githubusercontent.com 转发给 jsdelivr CDN
        const newUrl = targetUrl.href.replace(/(?<=com\/.+?\/.+?)\/(.+?\/)/, '@$1').replace(/^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com/, 'https://cdn.jsdelivr.net/gh');
        return Response.redirect(newUrl, 302);
    }

    // 检查是否为其他 GitHub URL，不走 CDN
    if (targetUrl.href.search(EXP1) === 0 || targetUrl.href.search(EXP3) === 0 || targetUrl.href.search(EXP4) === 0 || targetUrl.href.search(EXP5) === 0) {
        // 执行常规代理
        return proxy(targetUrl, request);
    }
    
    // 如果不匹配任何代理模式，或者只是静态文件请求（如 /favicon.ico），
    // 允许它继续传递给 Pages 静态资源服务，Pages 会返回 404 或静态文件。
    return next();
}


/**
 * 构造 URL 对象
 * @param {string} urlStr 
 */
function newUrl(urlStr) {
    try {
        return new URL(urlStr);
    } catch (err) {
        return null;
    }
}

/**
 * 核心转发函数
 * @param {URL} urlObj 目标 URL
 * @param {Request} req 原始请求
 * @returns {Promise<Response>}
 */
async function proxy(urlObj, req) {
    const reqHdrRaw = req.headers;
    const reqHdrNew = new Headers(reqHdrRaw);
    
    // 移除可能导致问题的头信息
    reqHdrNew.delete('host');
    // reqHdrNew.delete('referer'); // 保留 referer 避免某些网站检查
    reqHdrNew.delete('cf-connecting-ip');
    reqHdrNew.delete('x-forwarded-for');
    reqHdrNew.delete('x-real-ip');

    /** @type {RequestInit} */
    const reqInit = { 
        method: req.method, 
        headers: reqHdrNew, 
        redirect: 'manual', // 关键：手动处理重定向
        body: req.method === 'GET' || req.method === 'HEAD' ? null : req.body,
    };

    const res = await fetch(urlObj.href, reqInit);
    const resHdrNew = new Headers(res.headers);
    const status = res.status;

    // 处理重定向
    if (resHdrNew.has('location')) {
        let _location = resHdrNew.get('location');
        // 如果重定向目标是 GitHub 相关的链接，则重写为代理链接
        if (_location.search(EXP1) === 0 || _location.search(EXP4) === 0) {
            // 将重定向链接重写为代理地址
            resHdrNew.set('location', PREFIX + _location);
        } else {
            // 如果不是 GitHub 相关链接，取消手动处理，让浏览器自行跳转或内部重试
            reqInit.redirect = 'follow';
            return proxy(newUrl(_location), reqInit);
        }
    }

    // 添加 CORS 头
    resHdrNew.set('access-control-expose-headers', '*');
    resHdrNew.set('access-control-allow-origin', '*');
    resHdrNew.delete('content-security-policy');
    resHdrNew.delete('content-security-policy-report-only');
    resHdrNew.delete('clear-site-data');

    return new Response(res.body, { status, headers: resHdrNew });
}