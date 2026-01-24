// Pratibha Marketing - Production Service Worker
// Uses runtime caching (no pre-cached asset list) for compatibility with Vite builds

const CACHE_NAME = 'pratibha-v37';
const API_CACHE_NAME = 'pratibha-api-v1';
const MAX_API_CACHE_ENTRIES = 50;

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

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  // No pre-caching of specific assets - they have hashed filenames from Vite
  // Assets are cached dynamically as they are fetched (runtime caching)
  event.waitUntil(self.skipWaiting());
});

// Activate event - clean up old caches and claim clients
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

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
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

  // HTML/page requests use network-first (users always get latest after deploy)
  const isNavigation = request.mode === 'navigate';
  const isHtmlFile = url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.');
  if (isNavigation || isHtmlFile) {
    event.respondWith(handleHtmlRequest(request));
    return;
  }

  // Hashed static assets (JS, CSS, images in /assets/) use cache-first
  // These are safe to cache indefinitely because content changes = filename changes
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleHashedAssetRequest(request));
    return;
  }

  // Other static assets use stale-while-revalidate
  event.respondWith(handleStaticRequest(request));
});

// Network-first strategy for HTML/navigation requests
async function handleHtmlRequest(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed for HTML, trying cache:', request.url);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

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

// Cache-first strategy for hashed assets (immutable content)
async function handleHashedAssetRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Stale-while-revalidate for other static assets
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);

  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      caches.open(CACHE_NAME).then(c => {
        c.put(request, networkResponse.clone());
      }).catch(err => {
        console.warn('[SW] Cache write failed for static asset:', err.message);
      });
    }
    return networkResponse;
  }).catch(() => null);

  // Return cached immediately if available, otherwise wait for network
  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response('Asset unavailable offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Network-first with cache fallback for API requests
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const isCacheableRoute = CACHEABLE_API_ROUTES.some(route =>
    url.pathname.startsWith(route)
  );

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

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      // Trim cache to prevent unbounded growth
      trimCache(API_CACHE_NAME, MAX_API_CACHE_ENTRIES);
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
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

// Evict oldest entries when cache exceeds max size (LRU approximation)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
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
    caches.keys().then((names) => {
      return Promise.all(names.map((name) => caches.delete(name)));
    }).then(() => {
      if (event.data === 'logout') {
        console.log('[SW] Caches cleared on logout');
      }
    });
  }
});
