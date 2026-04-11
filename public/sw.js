// Service worker: cache-first offline support for md-reader.
// Strategy:
//   - /assets/* (Vite-hashed, immutable): cache-first, never revalidate.
//   - Everything else: stale-while-revalidate — serve cache instantly,
//     fetch from network in the background, update cache for next visit.
//   - Offline navigations fall back to cached index.html.
// Cache name: production builds replace the placeholder below with a short hash
// derived from this file + the precache manifest so deploys drop stale caches.

const VERSION = '__SW_CACHE_VERSION__'
const CACHE = `md-reader-${VERSION}`

// Replaced at build time by the sw-precache-manifest Vite plugin with the
// list of hashed /assets/* files emitted by the bundle. In dev, stays [].
const PRECACHE_ASSETS = /* PRECACHE_MANIFEST */ []
const PRECACHE_SHELL = ['/', '/index.html', '/favicon.svg']
const PRECACHE = [...PRECACHE_SHELL, ...PRECACHE_ASSETS]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // Use allSettled so a single flaky asset doesn't fail the whole install.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (!url.protocol.startsWith('http')) return

  const isHashedAsset =
    url.origin === self.location.origin && url.pathname.startsWith('/assets/')

  if (isHashedAsset) {
    event.respondWith(cacheFirst(req))
  } else {
    event.respondWith(staleWhileRevalidate(req))
  }
})

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (isCacheable(res)) cache.put(req, res.clone())
    return res
  } catch {
    return Response.error()
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(req)

  const networkPromise = fetch(req)
    .then((res) => {
      if (isCacheable(res)) cache.put(req, res.clone()).catch(() => {})
      return res
    })
    .catch(() => null)

  if (cached) return cached

  const networkRes = await networkPromise
  if (networkRes) return networkRes

  if (req.mode === 'navigate') {
    const fallback =
      (await cache.match('/index.html')) || (await cache.match('/'))
    if (fallback) return fallback
  }

  return Response.error()
}

function isCacheable(res) {
  return !!res && (res.ok || res.type === 'opaque')
}
