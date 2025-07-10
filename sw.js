// --- Service Worker for Advance Fertilizer App ---

// IMPORTANT: Change the version number every time you update the app's core files.
const CACHE_NAME = 'advance-fertilizer-cache-v7'; 
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
  // Note: We don't cache external CDN files here, the browser handles them.
];

// Install event: caches the core assets of our app.
self.addEventListener('install', event => {
  console.log('Service Worker: Install event in progress.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching core assets.');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installation complete.');
        // Force the waiting service worker to become the active service worker.
        return self.skipWaiting();
      })
  );
});

// Activate event: removes old caches to keep the app updated.
self.addEventListener('activate', event => {
  console.log('Service Worker: Activate event in progress.');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Claiming clients.');
        // Tell the active service worker to take control of the page immediately.
        return self.clients.claim();
    })
  );
});

// Fetch event: Defines how to handle requests.
self.addEventListener('fetch', event => {
  // Strategy: Network Only for API calls.
  // This ensures data is always fresh and avoids CORS issues with POST requests.
  if (event.request.url.includes('script.google.com')) {
    // Do not intercept API calls. Let the browser handle it.
    return; 
  }

  // Strategy: Cache First, then Network for all other GET requests (local assets, CDNs).
  // This makes the app load fast.
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // If the resource is in the cache, return it.
        if (cachedResponse) {
          return cachedResponse;
        }
        // Otherwise, fetch it from the network.
        return fetch(event.request);
      })
  );
});
