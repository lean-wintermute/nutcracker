/**
 * Nutcracker - Service Worker
 *
 * Provides offline functionality for the PWA.
 * - Cache-first strategy for static assets and images
 * - Images cached on demand (not precached) for easier updates
 * - Network-first for API calls (Firebase)
 * - Automatic cache cleanup on version update
 */

'use strict';

// Cache version - increment to invalidate old caches
const CACHE_VERSION = 'v24';
const CACHE_NAME = `nutcracker-${CACHE_VERSION}`;

// Core assets to cache on install (images cached on demand)
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './image-catalog.json',
  './icon-192.png',
  './icon-512.png'
];

// API endpoints that should use network-first (Firebase)
const API_PATTERNS = [
  /firebase/i,
  /firestore/i,
  /api\//i
];

/**
 * Install event - cache core static assets only
 * Images are cached on demand when first requested
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v' + CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Install complete');
        // Take control immediately
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v' + CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('nutcracker-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activate complete');
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - serve from cache or network
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Check if this is an API request (network-first)
  const isApiRequest = API_PATTERNS.some(pattern => pattern.test(url.href));

  if (isApiRequest) {
    // Network-first for API calls
    event.respondWith(networkFirst(request));
  } else {
    // Cache-first for static assets and images
    event.respondWith(cacheFirst(request));
  }
});

/**
 * Cache-first strategy
 * Try cache, fall back to network, cache successful responses
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Return cached response immediately
    // Update cache in background for next time
    updateCache(request);
    return cachedResponse;
  }

  // Not in cache, try network
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses (including images)
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (err) {
    console.error('[SW] Fetch failed:', err);

    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAME);
      return cache.match('./index.html');
    }

    throw err;
  }
}

/**
 * Network-first strategy
 * Try network, fall back to cache
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (err) {
    console.log('[SW] Network failed, trying cache:', request.url);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    throw err;
  }
}

/**
 * Update cache in background (stale-while-revalidate)
 */
async function updateCache(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
  } catch (err) {
    // Network update failed, that's okay - we have cached version
  }
}

/**
 * Handle messages from the main thread
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
