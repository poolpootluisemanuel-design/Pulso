import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Actualización automática de la app (para que Luis NO tenga que
// borrar el caché con cada ajuste):
// - Antes la página ya cargada seguía corriendo el JS viejo en memoria
//   y Chrome solo revisa si hay un service worker nuevo cada cierto
//   tiempo, así que los ajustes no aparecían hasta borrar los datos
//   del sitio. Ahora, al abrir la app con internet, se busca
//   actualización enseguida y también cada vez que vuelve a primer
//   plano o vuelve internet.
// - Cuando hay una versión nueva esperando, main.tsx avisa a la app
//   con el evento 'pulso-sw-update' y App muestra "Hay una versión
//   nueva de PULSO — Actualizar". Al tocar Actualizar, el worker
//   nuevo toma el control (skipWaiting) y la página recarga sola.
//   No se borran datos del usuario: cuentas, entrenamientos y la
//   grabación GPS en curso viven en localStorage / Supabase.
// - Si es la primera instalación (nadie controla la página todavía),
//   la versión nueva se activa sola, sin aviso ni recarga.
declare global {
  interface Window { __pulsoApplyUpdate?: () => void }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let refreshing = false
  let waitingWorker: ServiceWorker | null = null

  const notifyUpdate = () => {
    window.dispatchEvent(new CustomEvent('pulso-sw-update'))
  }

  window.__pulsoApplyUpdate = () => {
    // Si no hay worker esperando, recargar basta (el index nuevo ya
    // está en la red: network-first con no-cache).
    if (!waitingWorker) { window.location.reload(); return }
    refreshing = true
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  // Cuando el worker nuevo toma el control, recargar una sola vez
  // para correr el JS nuevo. Sin este reload la página seguiría con
  // el código viejo en memoria aunque el worker ya cambió.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const checkUpdate = () => { reg.update().catch(() => undefined) }
      checkUpdate()
      // Revisar de nuevo al volver a la app y al volver internet.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkUpdate()
      })
      window.addEventListener('online', checkUpdate)
      // Y cada 5 minutos mientras la app siga abierta con internet.
      window.setInterval(() => { if (navigator.onLine) checkUpdate() }, 5 * 60 * 1000)

      const trackWaiting = (worker: ServiceWorker | null) => {
        if (!worker) return
        waitingWorker = worker
        if (!navigator.serviceWorker.controller) {
          // Primera instalación: nadie controla la página, activar
          // solo sin molestar con aviso ni recarga.
          worker.postMessage({ type: 'SKIP_WAITING' })
          return
        }
        notifyUpdate()
      }

      // Ya hay una versión esperando desde antes de abrir.
      if (reg.waiting) trackWaiting(reg.waiting)

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && reg.waiting) {
            trackWaiting(reg.waiting)
          }
        })
      })
    }).catch(() => undefined)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
