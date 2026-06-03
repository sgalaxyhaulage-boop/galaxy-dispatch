// ═══════════════════════════════════════════════════
//  Galaxy Dispatch App – Service Worker
//  Offline-first cache strategy
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'galaxy-dispatch-v2';
const CACHE_VERSION = '1.0.1';
const BASE = '/galaxy-dispatch';

// Files to cache on install
const PRECACHE_URLS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192x192.png',
  BASE + '/icons/icon-512x512.png',
  BASE + '/icons/icon-maskable-512x512.png',
];

// External CDN resources to cache
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/signature_pad/4.1.7/signature_pad.umd.min.js',
];

// ── INSTALL ──────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing Galaxy Dispatch v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local files
      return cache.addAll(PRECACHE_URLS).then(() => {
        // Cache CDN files individually (don't fail install if CDN is down)
        return Promise.allSettled(
          CDN_URLS.map(url =>
            fetch(url).then(res => {
              if (res.ok) return cache.put(url, res);
            }).catch(() => {})
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating Galaxy Dispatch v' + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH (Cache-first with network fallback) ─────
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!event.request.url.startsWith('http')) return;

  // Skip camera/media requests (barcode scanner) – always go to network
  if (event.request.url.includes('camera') ||
      event.request.url.includes('mediastream')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Serve from cache; refresh cache in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse; // Return cached immediately
      }

      // Not in cache – fetch from network and cache the result
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || !networkResponse.ok) return networkResponse;

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline – Galaxy Dispatch App', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});

// ── PUSH NOTIFICATIONS (future use) ──────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Galaxy Dispatch', {
      body: data.body || 'New update',
      icon: './icons/icon-192x192.png',
      badge: './icons/icon-96x96.png',
      data: { url: data.url || './' },
      actions: [
        { action: 'open', title: 'Open App' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

console.log('[SW] Galaxy Dispatch Service Worker loaded');
