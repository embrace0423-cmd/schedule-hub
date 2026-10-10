// 서비스 워커 — 앱 화면(정적 파일)을 캐시해 오프라인에서도 열리게 한다.
// Google API 요청은 가로채지 않는다(데이터 캐시는 IndexedDB가 담당).
const VERSION = 'sh-v1.0.4';
const ASSETS = [
  "./",
  "config.js",
  "css/app.css",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "index.html",
  "js/areas.js",
  "js/auth.js",
  "js/dates.js",
  "js/db.js",
  "js/editors.js",
  "js/gapi.js",
  "js/main.js",
  "js/mock.js",
  "js/nlp.js",
  "js/prefs.js",
  "js/routines.js",
  "js/store.js",
  "js/taskutil.js",
  "js/ui.js",
  "js/views/calendar.js",
  "js/views/common.js",
  "js/views/routines.js",
  "js/views/search.js",
  "js/views/settings.js",
  "js/views/tasks.js",
  "js/views/today.js",
  "manifest.webmanifest",
  "privacy.html"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 같은 출처의 GET 요청만: 캐시 우선 + 백그라운드 갱신(stale-while-revalidate)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === 'navigate';
  const scopePath = new URL('./', self.location).pathname;
  // 앱 화면(루트·index.html)으로 이동할 때만 앱 셸(index.html)로 응답한다.
  // 그 밖의 페이지(privacy.html, 소유 확인 파일 등)는 네트워크 우선 + 자기 주소로만 캐시 → index.html 캐시를 덮어쓰지 않음
  const isAppNav = isNav && (url.pathname === scopePath || url.pathname === scopePath + 'index.html');
  if (isNav && !isAppNav) {
    e.respondWith(
      fetch(req).catch(async () =>
        (await caches.match(req, { ignoreSearch: true })) ||
        new Response('오프라인입니다', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      )
    );
    return;
  }
  const key = isAppNav ? new URL('./index.html', self.location).href : req;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: isNav });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(network);
        return cached;
      }
      const res = await network;
      return res || new Response('오프라인입니다', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
