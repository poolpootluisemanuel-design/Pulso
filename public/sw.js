// Service worker de PULSO (PWA) — modo offline.
// Cachea la app completa para que abra sin internet ni datos:
// - La shell (index.html, manifiesto, íconos).
// - Los bundles JS/CSS con hash (assets), que son lo que antes faltaba:
//   sin ellos la app se quedaba en blanco al abrir sin red.
// - Las fotos hero de Unsplash, solo si ya se cargaron una vez con internet.
// NO cachea llamadas a Supabase (siempre van a la red) ni videos de YouTube.
const CACHE = 'pulso-v2'
const CORE = [
  '/',
 '/index.html', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => undefined)
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Fotos hero de Unsplash: cache-first (solo si ya se vieron con
  // internet). Si no están en caché y no hay red, la app muestra su
  // degradado azul noche en vez de quedarse en blanco.
  if (url.origin === 'https://images.unsplash.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
          }
          return res
        }).catch(() => cached)
        return cached || network
      })
    )
    return
  }

  // Solo archivos propios (mismo origen). Supabase, YouTube y demás
  // orígenes externos siempre van a la red, nunca al caché.
  if (url.origin !== self.location.origin) return

  // Navegación (abrir la app / recargar): network-first, con fallback
  // a la shell cacheada cuando no hay internet. Así nunca queda en blanco.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => undefined)
        return res
      }).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Bundles JS/CSS con hash (/assets/...): cache-first. Si ya están en
  // caché, abren al instante sin internet; en segundo plano se
  // actualizan para la próxima apertura.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
          }
          return res
        }).catch(() => cached)
        return cached || network
      })
    )
    return
  }

  // Resto de archivos propios: cache-first con fallback a la red.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
          }
          return res
        }).catch(() => caches.match('/index.html'))
    )
  )
})
