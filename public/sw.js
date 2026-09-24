/**
 * Offline support, so an installed First Light opens instantly at 6am and
 * works with no signal — the practice itself needs no network at all.
 *
 * Hand-rolled rather than a plugin: the whole policy is two rules, and the
 * cache name is bumped by the build, so there's nothing a toolchain would
 * buy here.
 *
 * - Navigations: network-first, cache fallback. An open tab always gets the
 *   newest build when online, but still opens on a plane.
 * - Everything else: cache-first. Vite fingerprints asset filenames, so a
 *   cached /assets/index-ABC123.js can never be stale — a new build requests
 *   a new name.
 *
 * /api/* is never touched: reflection is a live, authenticated call.
 */

const CACHE = 'first-light-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 doesn't abort the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Same-origin only, and never the live reflection endpoint.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          // Opaque/error responses are not worth persisting.
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
