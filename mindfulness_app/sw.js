/**
 * Mindfulness Sync - Service Worker
 * Enables offline functionality and caching
 */

const CACHE_NAME = 'mindfulness-sync-v1';
const ASSETS_TO_CACHE = [
    '/mindfulness_app/',
    '/mindfulness_app/index.html',
    '/mindfulness_app/styles.css',
    '/mindfulness_app/app.js',
    '/mindfulness_app/sounds.js',
    '/mindfulness_app/sync.js',
    '/mindfulness_app/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => {
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // Return a fallback for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match('/mindfulness_app/index.html');
                        }
                        return null;
                    });
            })
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Background sync for future features
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-sessions') {
        event.waitUntil(syncSessions());
    }
});

async function syncSessions() {
    // Placeholder for syncing session data when online
    console.log('Background sync triggered');
}
