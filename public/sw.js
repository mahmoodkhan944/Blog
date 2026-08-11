// Bumped so browsers ditch any old cache (which held a now-stale copy
// of base.css) — this is also why cache-first was the wrong strategy
// for CSS in the first place. See below.
const CACHE_NAME = "blog-static-v2";

// Deliberately small and conservative — ONLY the icon is cached now.
// CSS used to be listed here too, but that's actively-changing content:
// with a cache-first strategy, once a browser had base.css cached, it
// would keep serving that stale copy forever, even after real updates
// were deployed — exactly the "why isn't my CSS change showing up" bug
// that came up. HTML pages, JS, and all Firestore/Firebase calls are
// still never intercepted, so blog content (posts, comments, likes)
// always stays live and fresh.
const STATIC_ASSETS = [
  "/img/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;
  if (url.origin !== location.origin) return;
  if (!STATIC_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});