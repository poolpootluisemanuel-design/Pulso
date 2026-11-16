// Service worker básico de PULSO (PWA).
// Cachea la app para que abra rápido y se vea como app instalada.
// No guarda datos de usuario: las cuentas y entrenamientos viven en Supabase
// (o en modo local, en el propio teléfono).
const CACHE = 'pulso-v1'
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

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

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  // Solo cacheamos archivos propios (mismo origen). Las llamadas a Supabase
  // siempre van a la red, nunca al caché.
  if (new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
          return res
        }).catch(() => caches.match('/index.html'))
    )
  )
})
