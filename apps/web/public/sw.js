/*
 * Relay's offline worker, for the driver's phone.
 *
 * - Driver pages: network first, so a driver with signal always gets the
 *   latest; with no signal, the last copy of the page (or the run page) is
 *   served and the app opens from what the phone has stored.
 * - Built assets under /_next/static: cache first in production, where file
 *   names change with their content; network first on localhost, where they
 *   don't.
 * - API calls are never cached: the app's outbox handles them.
 */

const VERSION = "relay-driver-v2";
const LOCAL =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(["/icon.svg"]).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// The page tells the worker what it loaded before the worker was in control.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "keep" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      await Promise.all(
        data.urls.map(async (url) => {
          if (await cache.match(url)) return;
          try {
            const res = await fetch(url, { credentials: "same-origin" });
            if (res.ok) await cache.put(url, res);
          } catch {}
        }),
      );
      if (typeof data.page === "string" && data.page.startsWith("/driver")) {
        try {
          const res = await fetch(data.page, { credentials: "same-origin" });
          if (res.ok && !res.redirected) {
            await cache.put(data.page, res.clone());
            await cache.put("/driver", res);
          }
        } catch {}
      }
    }),
  );
});

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected) {
      cache.put(request, res.clone());
      if (fallbackKey) cache.put(fallbackKey, res.clone());
    }
    return res;
  } catch (err) {
    const hit =
      (await cache.match(request, { ignoreSearch: true })) ||
      (fallbackKey && (await cache.match(fallbackKey)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Next's own data requests for client navigations: leave them alone.
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (req.mode === "navigate" && url.pathname.startsWith("/driver")) {
    event.respondWith(networkFirst(req, "/driver"));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(LOCAL ? networkFirst(req) : cacheFirst(req));
    return;
  }
  if (
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(req));
  }
});
