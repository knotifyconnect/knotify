const CACHE_VERSION = 'knotify-shell-v3'
const SHELL = ['/', '/manifest.webmanifest', '/app-icon-192.png', '/app-icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            // Registered synchronously, before respondWith's own promise settles,
            // so the event is still guaranteed to be alive when this fires.
            event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy)))
          }
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || /\.(?:png|svg|jpg|jpeg|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Revalidate in the background via its own waitUntil, called here
          // while the event is still active — not inside the fetch's .then(),
          // which only runs after respondWith already settled with `cached`
          // and the event may have already finished (InvalidStateError).
          event.waitUntil(
            fetch(request)
              .then((response) => (response.ok ? caches.open(CACHE_VERSION).then((cache) => cache.put(request, response)) : null))
              .catch(() => {})
          )
          return cached
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)))
          }
          return response
        })
      })
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: event.data ? event.data.text() : 'knotify' }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'knotify', {
      body: data.body || '',
      // mark.png is 160x146 (non-square) and renders poorly once Android
      // crops/masks it for the tray and status-bar badge — app-icon-192.png
      // is the square asset meant for exactly this.
      icon: '/app-icon-192.png',
      badge: '/app-icon-192.png',
      vibrate: [80, 40, 80],
      // The DB notification id, so a later read (in-app or on another
      // device) can find and dismiss this exact tray entry by tag.
      tag: data.id ? String(data.id) : undefined,
      renotify: Boolean(data.id),
      data: { url: data.url || '/', id: data.id ?? null },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return clients.openWindow(targetUrl)
    })
  )
})
