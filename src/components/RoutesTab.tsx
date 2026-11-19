// Rutas para entrenar (categoría propia, separada de Sesiones):
// explorar rutas recomendadas, verlas en el mapa y elegir una para
// recorrerla con GPS en Entrenar. No crea ni toca inscripciones: la
// ruta solo se pasa como guía a Entrenar (prop onRunRoute).
// Antes esta vista vivía dentro de Sesiones → Mapa → "Rutas"; se
// movió aquí tal cual, sin duplicar componentes: la lista es
// RecommendedRoutes y el mapa es el MapView que ya existía.
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Profile } from '../lib/types'
import RecommendedRoutes from './RecommendedRoutes'
import type { RouteLocState } from './RecommendedRoutes'
import { RECOMMENDED_ROUTES, routesSortedByZone } from '../lib/routes'
import type { RecommendedRoute } from '../lib/routes'
import { isNative } from '../lib/native'
import { getNativeCurrentPosition } from '../lib/nativeGps'

// El mapa (MapLibre, ~1 MB) solo se descarga cuando se abre esta
// pestaña, no en la primera carga de la app.
const MapView = lazy(() => import('./MapView'))
import type { MapMarker } from './MapView'

export default function RoutesTab({ profile, onRunRoute }: { profile: Profile; onRunRoute?: (route: RecommendedRoute) => void }) {
  // Primera ruta que se muestra al entrar: la primera de su zona.
  const [selectedRoute, setSelectedRoute] = useState<RecommendedRoute>(
    () => routesSortedByZone(profile.zone)[0] || RECOMMENDED_ROUTES[0]
  )
  // Centro del mapa: GPS del usuario si ya dio permiso, si no su zona
  // (Isla Mujeres si es su zona), nunca siempre Cancún centro.
  const [gpsCenter, setGpsCenter] = useState<{ lat: number; lng: number } | null>(null)
  // Estado de la ubicación pedida a mano (botón de rutas cercanas).
  const [locState, setLocState] = useState<RouteLocState>('idle')

  // Al entrar, intenta centrar en el GPS si el permiso ya está
  // concedido (sin preguntar de nuevo); si no, centra en su zona.
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    const nav = navigator as Navigator & { permissions?: { query: (o: { name: string }) => Promise<{ state: string }> } }
    nav.permissions?.query({ name: 'geolocation' }).then(
      (res) => {
        if (res.state !== 'granted') return
        navigator.geolocation.getCurrentPosition(
          (pos) => setGpsCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => undefined,
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        )
      },
      () => undefined
    ).catch(() => undefined)
  }, [])

  // Pide la ubicación actual una sola vez (botón "Mostrar las más
  // cercanas a mí" en Rutas): en nativo con Capacitor, en web con el
  // navegador. Sirve para ordenar las rutas por cercanía y para el
  // marcador "Estás aquí" en el mapa.
  function requestUserPosition() {
    setLocState('loading')
    if (isNative()) {
      void getNativeCurrentPosition().then((p) => {
        if (!p) { setLocState('denied'); return }
        setGpsCenter({ lat: p.lat, lng: p.lng })
        setLocState('idle')
      })
      return
    }
    if (!('geolocation' in navigator)) { setLocState('unavailable'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocState('idle')
      },
      () => setLocState('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Marcador "Estás aquí": tu ubicación actual, si se conoce (al
  // entrar con permiso, o con el botón de rutas cercanas).
  // Así se ve en el mapa si estás lejos del inicio de una ruta.
  const youMarker: MapMarker[] = gpsCenter ? [
    { key: 'yo', lat: gpsCenter.lat, lng: gpsCenter.lng, emoji: '🧍', color: '#0A1B2E', popupHtml: '<b>Estás aquí</b>' },
  ] : []
  // El mapa abre en el deportivo (MapView: 'sport' por defecto, con
  // satélite de respaldo si falla); la elección se guarda.

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-teal-dark">Rutas para entrenar</h2>
        <p className="text-sm text-slate-600">Explora rutas recomendadas y recórrelas con GPS en Entrenar. Elegir una ruta no te apunta a ninguna sesión.</p>
      </div>

      <Suspense fallback={<div className="rounded-2xl bg-night p-4 text-center text-sm text-white/70" style={{ height: 320 }}>Cargando mapa…</div>}>
        <MapView
          center={selectedRoute.points[0]}
          guidePoints={selectedRoute.points}
          markers={[
            { key: 'r-inicio', lat: selectedRoute.points[0].lat, lng: selectedRoute.points[0].lng, emoji: '🟢', color: '#14B8A6', popupHtml: '<b>Inicio</b>' },
            { key: 'r-fin', lat: selectedRoute.points[selectedRoute.points.length - 1].lat, lng: selectedRoute.points[selectedRoute.points.length - 1].lng, emoji: '🏁', color: '#E63946', popupHtml: '<b>Fin</b>' },
            ...youMarker,
          ]}
          height={320}
          offlineNote="📶 Sin internet: el mapa necesita internet para cargar las calles."
        />
      </Suspense>
      <RecommendedRoutes
        selectedId={selectedRoute?.id || null}
        onSelect={setSelectedRoute}
        onRun={(r) => onRunRoute?.(r)}
        userZone={profile.zone}
        userPosition={gpsCenter}
        onRequestLocation={requestUserPosition}
        locState={locState}
      />
    </div>
  )
}
