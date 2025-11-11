const CACHE = 'gh-proxy-v1';
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['/404.html']))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', e => {
  // 只对同源 GET 请求做缓存
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request).then(netRes => {
        // 非 2xx 不缓存
        if (!netRes.ok) return netRes;
        const copy = netRes.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return netRes;
      });
    })
  );
});
