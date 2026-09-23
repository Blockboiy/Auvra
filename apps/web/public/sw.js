/* Auvra install shell. Never cache login, missions, wallet data, or API responses. */
const VERSION = "auvra-pwa-v1";
const OFFLINE_CACHE = `${VERSION}-offline`;
const ASSET_CACHE = `${VERSION}-assets`;
const PREFIX = "auvra-pwa-";
const OFFLINE_PAGE = "/offline.html";
const PRECACHE = [OFFLINE_PAGE, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"];
const MAX_STATIC_ENTRIES = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== OFFLINE_CACHE && name !== ASSET_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function offlineResponse() {
  return await caches.match(OFFLINE_PAGE) ?? new Response("Auvra is offline. Reconnect to continue.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API replies, login, and all workspace pages are network-only, never persisted by this worker.
  const privateRoute = url.pathname === "/api" || url.pathname.startsWith("/api/") ||
    url.pathname === "/app" || url.pathname.startsWith("/app/") ||
    url.pathname === "/demo-login" || url.pathname.startsWith("/demo-login/");
  if (privateRoute) {
    if (request.mode === "navigate") {
      event.respondWith(fetch(request).catch(offlineResponse));
    }
    return;
  }

  // Keep the public offline page and install icons available without a connection.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((cached) => cached ?? fetch(request)));
    return;
  }

  // Never cache HTML or navigation responses (including any redirect to demo login).
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(offlineResponse));
    return;
  }

  // Only versioned Vite build assets are cacheable. Other requests pass through normally.
  if (!url.search && url.pathname.startsWith("/assets/") && /\.(?:js|css|svg|png|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      const policy = response.headers.get("Cache-Control") ?? "";
      if (response.ok && response.type === "basic" && !/\b(?:private|no-store)\b/i.test(policy)) {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > MAX_STATIC_ENTRIES) {
          await Promise.all(keys.slice(0, keys.length - MAX_STATIC_ENTRIES).map((key) => cache.delete(key)));
        }
      }
      return response;
    })());
  }
});
