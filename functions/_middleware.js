// Cloudflare Pages Functions 中间件（无外部 ASSET_URL 依赖）
const PREFIX = '/';
const Config = { jsdelivr: 0 };
const whiteList = [];

const exp1 = /^https?:\/\/github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i;
const exp2 = /^https?:\/\/github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i;
const exp3 = /^https?:\/\/github\.com\/.+?\/.+?\/(?:info|git-).*$/i;
const exp4 = /^https?:\/\/raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i;
const exp5 = /^https?:\/\/gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i;
const exp6 = /^https?:\/\/github\.com\/.+?\/.+?\/tags.*$/i;

const makeRes = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { ...headers, 'access-control-allow-origin': '*' } });

const newUrl = (s) => { try { return new URL(s); } catch { return null; } };

const checkUrl = (u) => [exp1, exp2, exp3, exp4, exp5, exp6].some((re) => re.test(u));

export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      if (q) return Response.redirect(`${url.origin}${PREFIX}${q}`, 301);

      let path = url.href.slice(url.origin.length + PREFIX.length).replace(/^https?:\/+/, 'https://');

      if (whiteList.length && !whiteList.some((w) => path.includes(w))) {
        return new Response('blocked', { status: 403 });
      }

      if (exp1.test(path) || exp5.test(path) || exp6.test(path) || exp3.test(path)) {
        return proxy(path, req);
      }
      if (exp2.test(path)) {
        if (Config.jsdelivr) {
          const cdn = path.replace('/blob/', '@').replace(/^https?:\/\/github\.com/, 'https://cdn.jsdelivr.net/gh');
          return Response.redirect(cdn, 302);
        }
        path = path.replace('/blob/', '/raw/');
        return proxy(path, req);
      }
      if (exp4.test(path)) {
        if (Config.jsdelivr) {
          const cdn = path.replace(/(?<=com\/.+?\/.+?)\/(.+?\/)/, '@$1')
                        .replace(/^https?:\/\/raw\.(?:githubusercontent|github)\.com/, 'https://cdn.jsdelivr.net/gh');
          return Response.redirect(cdn, 302);
        }
        return proxy(path, req);
      }

      // 兜底：本地 404 页
      return fetch(new URL('/404.html', url).href);
    } catch (e) {
      return makeRes('Pages Functions error:\n' + (e.stack || e), 502);
    }
  },
};

async function proxy(target, req) {
  const u = newUrl(target);
  if (!u) return makeRes('invalid url', 400);

  if (req.method === 'OPTIONS' && req.headers.has('access-control-request-headers')) {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
      },
    });
  }

  let res = await fetch(u.href, {
    method: req.method,
    headers: req.headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    redirect: 'manual',
  });

  if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
    const loc = res.headers.get('location');
    if (checkUrl(loc)) {
      const h = new Headers(res.headers);
      h.set('location', PREFIX + loc);
      return new Response(null, { status: res.status, headers: h });
    }
    return proxy(loc, req);
  }

  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', '*');
  h.set('access-control-expose-headers', '*');
  h.delete('content-security-policy');
  h.delete('content-security-policy-report-only');
  h.delete('clear-site-data');

  return new Response(res.body, { status: res.status, headers: h });
}
