const CACHE_NAME = "blog-static-v1";

// Deliberately small and conservative — only these exact files are
// cached. HTML pages, JS, and all Firestore/Firebase calls are NEVER
// intercepted, so blog content (posts, comments, likes) always stays
// live and fresh. This just makes repeat visits a little faster and
// lets the site be "installed" as a PWA.
const STATIC_ASSETS = [
  "/css/variables.css",
  "/css/base.css",
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