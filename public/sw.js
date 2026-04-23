const CACHE_NAME = "trainingapp-static-v1";
const OFFLINE_URL = "/offline";
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-maskable-512.png",
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isBlockedPath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth")
  );
}

function isSafeStaticRequest(request, url) {
  if (request.method !== "GET" || !isSameOrigin(url) || isBlockedPath(url.pathname)) {
    return false;
  }

  return (
    url.pathname.startsWith("/_next/static/") ||
    ["image", "style", "script", "font", "manifest"].includes(request.destination)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Muterande requests, API och auth ska alltid gå direkt till nätet.
  if (request.method !== "GET" || !isSameOrigin(url) || isBlockedPath(url.pathname)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  if (isSafeStaticRequest(request, url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }

          return response;
        });
      }),
    );
  }
});
