const CACHE_NAME = 'efootball-pwa-v2';

// Static App Shell assets to precache
const STATIC_ASSETS = [
  '/',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable.png',
  '/icons/apple-touch-icon.png',
];

// Explicit exclusion patterns that MUST NEVER be cached
const DYNAMIC_EXCLUSIONS = [
  'supabase.co',
  'supabase.in',
  '/rest/v1/',
  '/auth/v1/',
  '/realtime/v1/',
  'livekit.cloud',
  '/api/live/token',
  '/api/livekit/token',
  '/admin/',
  '/api/',
];

// Install Event — Pre-cache static App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('SW Pre-cache partial warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event — Clean up old caches & claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Network-first for dynamic/API/streaming/auth, Cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. NON-GET requests -> ALWAYS Network Only
  if (request.method !== 'GET') {
    return;
  }

  // 2. WebSockets & WebRTC -> ALWAYS Network Only
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // 3. Excluded paths (Supabase, Auth, LiveKit, Admin, API) -> ALWAYS Network Only
  const isExcluded = DYNAMIC_EXCLUSIONS.some((pattern) => url.href.includes(pattern) || url.pathname.includes(pattern));
  if (isExcluded) {
    return;
  }

  // 4. HTML Navigation Requests -> Network First, fallback to cached App Shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const appShell = await caches.match('/');
          if (appShell) return appShell;
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return;
  }

  // 5. Static Assets (CSS, JS, Fonts, Images, Manifest) -> Stale-while-revalidate / Cache First
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/manifest.json' ||
    /\.(png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default behavior -> Network first
});
