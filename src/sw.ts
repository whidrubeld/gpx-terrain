// Service worker: the app shell (scripts, styles, fonts, icons, example
// tracks) is precached, so the app starts offline; terrain, imagery and map
// feature tiles are cached as they are viewed, so tracks seen before work
// offline too.

import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[]
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// every navigation inside the scope gets the app (offline start, file launches)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

/** Whether a tile body is a complete image: servers sometimes truncate them. */
async function decodes(response: Response) {
  if (typeof createImageBitmap !== 'function') return true
  try {
    const bitmap = await createImageBitmap(await response.blob())
    bitmap.close()
    return true
  } catch {
    return false
  }
}

const TILE_HOSTS: [origin: string, path: string][] = [
  ['https://s3.amazonaws.com', '/elevation-tiles-prod/'],
  ['https://tiles.maps.eox.at', '/wmts']
]

/**
 * three-map-terrain retries a body it could not decode with `cache:
 * 'reload'`: go to the network then, and replace the entry.
 */
const reloadBypassesCache = {
  cachedResponseWillBeUsed: ({
    request,
    cachedResponse
  }: {
    request: Request
    cachedResponse?: Response
  }) => Promise.resolve(request.cache === 'reload' ? null : cachedResponse)
}

registerRoute(
  ({ url }) =>
    TILE_HOSTS.some(
      ([origin, path]) => url.origin === origin && url.pathname.startsWith(path)
    ),
  new CacheFirst({
    cacheName: 'tiles',
    plugins: [
      reloadBypassesCache,
      {
        // only complete images are stored
        cacheWillUpdate: async ({ response }) =>
          response.status === 200 && (await decodes(response.clone()))
            ? response
            : null
      },
      new ExpirationPlugin({
        // a 3×3 grid is 45 tiles, a 5×5 one 125
        maxEntries: 2000,
        maxAgeSeconds: 60 * 60 * 24 * 30,
        purgeOnQuotaError: true
      })
    ]
  })
)

// Map features: OpenFreeMap's TileJSON names the current planet build (it
// changes every few days: the network first), whose tiles never change
const OPENFREEMAP = 'https://tiles.openfreemap.org'

registerRoute(
  ({ url }) => url.origin === OPENFREEMAP && url.pathname === '/planet',
  new NetworkFirst({ cacheName: 'tilejson', networkTimeoutSeconds: 4 })
)

registerRoute(
  ({ url }) => url.origin === OPENFREEMAP && url.pathname.endsWith('.pbf'),
  new CacheFirst({
    cacheName: 'vector-tiles',
    plugins: [
      reloadBypassesCache,
      {
        cacheWillUpdate: ({ response }) =>
          Promise.resolve(response.status === 200 ? response : null)
      },
      new ExpirationPlugin({
        // up to 4 a terrain tile, shared by the four layers
        maxEntries: 1000,
        maxAgeSeconds: 60 * 60 * 24 * 30,
        purgeOnQuotaError: true
      })
    ]
  })
)

// `UpdateToast` → "Reload": activate the waiting version
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING')
    void self.skipWaiting()
})

clientsClaim()
