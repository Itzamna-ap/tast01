// Define the cache name and files to cache
const CACHE_NAME = 'af-v2-cache-v2'; // Changed cache name to ensure update
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  // Add other assets like your main CSS file if you have one
  // e.g., '/style.css'
];

// Install event: open cache and add files
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Install complete');
        return self.skipWaiting();
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Activation complete');
        return self.clients.claim();
    })
  );
});

// Fetch event: Network-first strategy
self.addEventListener('fetch', event => {
  // We only want to intercept navigation requests, not API calls to the script
  if (event.request.mode !== 'navigate' && new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // If the fetch is successful, clone it and cache it.
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        return networkResponse;
      })
      .catch(() => {
        // If the network request fails (offline), try to serve from the cache.
        return caches.match(event.request)
          .then(cachedResponse => {
            return cachedResponse;
          });
      })
  );
});
