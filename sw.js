// 앱 화면만 캐시한다. Google API·인증·일정 데이터는 가로채거나 삭제하지 않는다.
const VERSION = 'sh-v1.0.8';
const SCOPE = new URL('./', self.location.href);
const ASSETS = [
  './', 'config.js', 'css/app.css', 'css/calendar-swipe.css',
  'css/calendar-swipe.css?v=1.0.8',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/icon-192.png',
  'icons/icon-512.png', 'icons/maskable-512.png', 'index.html',
  'js/areas.js', 'js/auth.js', 'js/calendar-swipe.js',
  'js/calendar-swipe.js?v=1.0.8', 'js/dates.js', 'js/db.js',
  'js/editors.js', 'js/event-complete.js', 'js/gapi.js', 'js/main.js',
  'js/mock.js', 'js/nlp.js', 'js/prefs.js', 'js/routines.js', 'js/store.js',
  'js/taskutil.js', 'js/ui.js', 'js/views/calendar.js', 'js/views/common.js',
  'js/views/routines.js', 'js/views/search.js', 'js/views/settings.js',
  'js/views/tasks.js', 'js/views/today.js', 'manifest.webmanifest',
  'privacy.html', 'update.html'
];
const paths = new Set(ASSETS.map((p) => new URL(p, SCOPE).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // HTTP 캐시의 오래된 파일을 새 버전 캐시에 다시 넣지 않는다.
    await cache.addAll(ASSETS.map((p) => new Request(new URL(p, SCOPE), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 같은 출처의 다른 앱 캐시와 IndexedDB/localStorage는 그대로 둔다.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => /^sh-v\d+\./.test(k) && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SH_GET_VERSION') event.ports[0]?.postMessage({ version: VERSION });
  if (event.data?.type === 'SH_SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== SCOPE.origin || !paths.has(url.pathname)) return;
  const appNav = req.mode === 'navigate' &&
    (url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + 'index.html');
  const key = appNav ? new URL('index.html', SCOPE).href : req.url;
  const fresh = appNav || /\.(?:html|js|css|webmanifest)$/.test(url.pathname);
  if (!fresh) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(key);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') await cache.put(key, res.clone());
      return res;
    })());
    return;
  }
  // HTML/JS/CSS는 최신 응답 우선. 오프라인에서는 저장된 화면으로 복귀한다.
  const network = fetch(req, { cache: 'no-cache' }).then(async (res) => {
    if (!res.ok || res.type !== 'basic') return null;
    const cache = await caches.open(VERSION);
    await cache.put(key, res.clone());
    return res;
  }).catch(() => null);
  event.waitUntil(network.then(() => undefined));
  event.respondWith((async () => {
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), 4000); });
    const res = await Promise.race([network, timeout]);
    clearTimeout(timer);
    if (res) return res;
    const cache = await caches.open(VERSION);
    return (await cache.match(key)) || (await network) ||
      new Response('오프라인입니다. 연결 후 다시 시도하세요.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
