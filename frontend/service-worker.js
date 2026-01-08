// Pratibha Marketing - Service Worker
// Smart caching for PWA functionality

const CACHE_NAME = 'pratibha-v1';
const API_CACHE_NAME = 'pratibha-api-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/products.html',
  '/orders.html',
  '/customer-order-form.html',
  '/customer-management.html',
  '/market-rates.html',
  '/supplier-dashboard.html',
  '/manifest.json',
  '/js/api.js',
  '/js/auth.js',
  '/icons/icon.svg'
];

// API endpoints to cache (read-only data)
const CACHEABLE_API_ROUTES = [
  '/api/products',
  '/api/market-rates'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[SW] Failed to cache static assets:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - handle requests with appropriate caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PUT, DELETE need network)
  if (request.method !== 'GET') {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets with cache-first strategy
  event.respondWith(handleStaticRequest(request));
});

// Cache-first strategy for static assets
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Return cached response and update cache in background
    updateCacheInBackground(request);
    return cachedResponse;
  }

  // If not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);

    // Cache the response for next time
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // If offline and not in cache, return offline page
    console.error('[SW] Network request failed:', error);
    return new Response('Offline - Please check your connection', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Network-first with cache fallback for API requests
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const isCacheableRoute = CACHEABLE_API_ROUTES.some(route =>
    url.pathname.startsWith(route)
  );

  // Non-cacheable API routes - network only
  if (!isCacheableRoute) {
    try {
      return await fetch(request);
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Network unavailable. Please check your connection.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Cacheable API routes - network first, cache fallback
  try {
    const networkResponse = await fetch(request);

    // Update cache with fresh data
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    console.log('[SW] Network failed, trying cache for:', url.pathname);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      console.log('[SW] Returning cached API response');
      return cachedResponse;
    }

    // No cache available
    return new Response(JSON.stringify({
      success: false,
      message: 'Data unavailable offline. Please connect to the internet.',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Update cache in background (stale-while-revalidate)
async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse);
    }
  } catch (error) {
    // Silently fail - we already served cached content
  }
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data === 'clearCache') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
