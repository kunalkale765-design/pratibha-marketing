// Pratibha Marketing - Service Worker
// Smart caching for PWA functionality

const CACHE_NAME = 'pratibha-v46';
// IMPORTANT: Increment when API response shapes change
const API_CACHE_NAME = 'pratibha-api-v2';
const MAX_API_CACHE_ENTRIES = 50;

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pages/auth/login.html',
  '/pages/auth/signup.html',
  '/pages/products/',
  '/pages/orders/',
  '/pages/order-form/',
  '/pages/customers/',
  '/pages/market-rates/',
  '/pages/packing/',
  '/pages/reconciliation/',
  '/manifest.json',
  '/js/api.js',
  '/js/auth.js',
  '/js/utils.js',
  '/js/ui.js',
  '/js/init.js',
  '/js/csrf.js',
  // Page scripts
  '/js/pages/dashboard.js',
  '/js/pages/orders.js',
  '/js/pages/order-form.js',
  '/js/pages/customers.js',
  '/js/pages/products.js',
  '/js/pages/market-rates.js',
  '/js/pages/packing.js',
  '/js/pages/reconciliation.js',
  '/assets/icons/icon.svg',
  '/assets/icons/icon-72.png',
  '/assets/icons/icon-96.png',
  '/assets/icons/icon-128.png',
  '/assets/icons/icon-144.png',
  '/assets/icons/icon-152.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-384.png',
  '/assets/icons/icon-512.png',
  // Core CSS
  '/assets/css/variables.css',
  '/assets/css/base.css',
  '/assets/css/components.css',
  '/assets/css/utilities.css',
  '/assets/css/responsive.css',
  // Animation CSS
  '/assets/css/animations/skeleton.css',
  '/assets/css/animations/buttons.css',
  '/assets/css/animations/cards.css',
  '/assets/css/animations/inputs.css',
  '/assets/css/animations/badges.css',
  '/assets/css/animations/segments.css',
  '/assets/css/animations/page.css',
  '/assets/css/animations/swipe.css',
  // Page-specific CSS
  '/assets/css/pages/login.css',
  '/assets/css/pages/signup.css',
  '/assets/css/pages/index.css',
  '/assets/css/pages/orders.css',
  '/assets/css/pages/products.css',
  '/assets/css/pages/market-rates.css',
  '/assets/css/pages/customer-management.css',
  '/assets/css/pages/customer-order-form.css',
  '/assets/css/pages/packing.css',
  '/assets/css/pages/reconciliation.css'
];

// API endpoints safe to cache (read-only data, network-first with fallback)
const CACHEABLE_API_ROUTES = [
  '/api/products',
  '/api/market-rates'
];

// API endpoints that must NEVER be cached (security/mutation-critical)
const NEVER_CACHE_ROUTES = [
  '/api/auth/',
  '/api/csrf-token',
  '/api/ledger/payment',
  '/api/reconciliation/'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Caching static assets');
        // Cache assets individually so one missing file doesn't block installation.
        // After Vite build, some paths change (e.g. hashed filenames), so we
        // gracefully skip assets that 404 rather than failing the entire install.
        const results = await Promise.allSettled(
          STATIC_ASSETS.map(asset => cache.add(asset).catch(() => {
            console.warn('[SW] Could not cache:', asset);
          }))
        );
        const cached = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[SW] Cached ${cached}/${STATIC_ASSETS.length} assets`);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[SW] Failed during install:', err);
        throw err;
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
      .then(() => {
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
          });
        });
        return self.clients.claim();
      })
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

  // Never cache PDF/storage files
  if (url.pathname.startsWith('/storage/')) {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    // Never cache security-critical or mutation-related API routes
    if (NEVER_CACHE_ROUTES.some(route => url.pathname.startsWith(route))) {
      return;
    }
    event.respondWith(handleApiRequest(request));
    return;
  }

  // HTML files use network-first (so users always get latest version after deploy)
  const isHtmlFile = url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.');
  if (isHtmlFile) {
    event.respondWith(handleHtmlRequest(request));
    return;
  }

  // Other static assets (JS, CSS, images) use cache-first strategy
  event.respondWith(handleStaticRequest(request));
});

// Network-first strategy for HTML files (ensures users get latest after deploy)
async function handleHtmlRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Cache the fresh response
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Network failed - try cache as fallback
    console.log('[SW] Network failed for HTML, trying cache:', request.url);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // No cache either - return offline message
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Offline</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>You're offline</h1>
          <p>Please check your internet connection and try again.</p>
          <button onclick="location.reload()">Retry</button>
        </body>
      </html>
    `, {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

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
      // Trim cache to prevent unbounded growth
      trimCache(API_CACHE_NAME, MAX_API_CACHE_ENTRIES);
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
      cache.put(request, networkResponse.clone());
    } else {
      console.warn('[SW] Background cache update failed with status:', networkResponse.status, 'for:', request.url);
    }
  } catch (error) {
    // Log the error for debugging - cached content was already served
    console.warn('[SW] Background cache update failed:', error.message, 'for:', request.url);
    // Notify main thread about cache update failure (for critical resources)
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'CACHE_UPDATE_FAILED',
          url: request.url,
          error: error.message
        });
      });
    }).catch(() => {
      // Ignore errors when notifying clients
    });
  }
}

// Evict oldest entries when cache exceeds max size (LRU approximation)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Delete oldest entries (first in list)
    const toDelete = keys.length - maxItems;
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data === 'clearCache' || event.data === 'logout') {
    // On logout, purge all caches to prevent cross-user data leaks
    // Use event.waitUntil to ensure purge completes before SW goes idle
    const purge = caches.keys().then((names) => {
      return Promise.all(names.map((name) => caches.delete(name)));
    }).then(() => {
      if (event.data === 'logout') {
        console.log('[SW] Caches cleared on logout');
        // Notify all clients that cache purge is complete
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'CACHE_PURGED' });
          });
        });
      }
    });
    event.waitUntil(purge);
  }
});
