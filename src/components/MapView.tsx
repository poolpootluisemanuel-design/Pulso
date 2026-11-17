// Mapa real con MapLibre GL + CARTO Dark Matter (sin API key, sin costo).
// - Estilo oscuro PULSO (azul noche #0A1B2E de fondo): las calles claras
//   de OpenStreetMap se veían viejas y no combinaban con la app.
// - 3D REAL (estilo Strava): pitch (inclinación) y bearing (rotación)
//   de verdad, con botones 2D/3D, girar e inclinar, y gestos táctiles
//   (dos dedos para inclinar/girar). No es un truco de CSS: MapLibre
//   renderiza el mapa en WebGL con perspectiva.
// - Se crea UNA vez y se destruye al desmontar: si se recreara al
//   cambiar de pestaña, el mapa se duplicaría o fallaría.
// - Los marcadores son divs propios (emoji sobre círculo PULSO), no la
//   imagen por defecto.
// - Las calles (tiles) necesitan internet. Sin internet el fondo queda
//   azul noche, pero la ruta y los marcadores sí se dibujan, y el GPS
//   sigue grabando: se avisa con un texto corto.
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CANCUN_CENTER } from '../lib/routes'

export interface MapPoint { lat: number; lng: number }
export interface MapMarker extends MapPoint {
  key: string
  emoji: string
  color: string
  popupHtml: string
}

// Centro por defecto: Cancún centro (definido en lib/routes.ts para
// que quien lo necesite no tenga que importar todo el mapa).
export { CANCUN_CENTER }

// Estilo oscuro: raster CARTO Dark Matter, libre y sin key. El fondo
// del canvas es azul noche PULSO, así que sin tiles (offline) no se ve
// un hueco gris claro sino el color de la app.
const DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap · © CARTO',
    },
  },
  layers: [{ id: 'carto-dark', type: 'raster', source: 'carto-dark' }],
}

function routeGeo(points: MapPoint[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
      properties: {},
    }],
  }
}

function dotElement(emoji: string, color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:${color};color:#fff;font-size:19px;border:2px solid #fff;box-shadow:0 2px 8px rgba(10,27,46,.5);`
  el.textContent = emoji
  return el
}

export default function MapView({
  center = CANCUN_CENTER,
  zoom = 14,
  points,
  guidePoints,
  markers,
  height = 220,
  follow = false,
  offlineNote,
}: {
  center?: MapPoint
  zoom?: number
  points?: MapPoint[]
  /** Ruta recomendada como guía: línea punteada teal de referencia. */
  guidePoints?: MapPoint[]
  markers?: MapMarker[]
  height?: number
  follow?: boolean
  /** Texto que se muestra sin internet (cada uso pone el suyo). */
  offlineNote?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const fittedRef = useRef<string>('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [is3d, setIs3d] = useState(false)
  const [webglFailed, setWebglFailed] = useState(false)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Crear el mapa una sola vez.
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: el,
        style: DARK_STYLE,
        center: [center.lng, center.lat],
        zoom,
        pitch: 0,
        bearing: 0,
        maxPitch: 60,
        attributionControl: { compact: true },
        dragRotate: true,
        touchPitch: true,
        touchZoomRotate: true,
      })
    } catch {
      // Sin WebGL (navegador muy viejo): no se rompe la pantalla, se
      // muestra el aviso y la ruta se sigue grabando igual.
      setWebglFailed(true)
      return
    }
    map.on('webglcontextlost', () => setWebglFailed(true))
    map.on('load', () => {
      // Ruta grabada: rojo pulso con borde oscuro para que resalte
      // sobre el mapa oscuro. Guía recomendada: teal punteada.
      map.addSource('route', { type: 'geojson', data: routeGeo([]) })
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#0A1B2E', 'line-width': 8, 'line-opacity': 0.9 } })
      map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#E63946', 'line-width': 4, 'line-opacity': 1 } })
      map.addSource('guide', { type: 'geojson', data: routeGeo([]) })
      map.addLayer({ id: 'guide', type: 'line', source: 'guide', paint: { 'line-color': '#14B8A6', 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.95 } })
    })
    mapRef.current = map
    // Entrenar se oculta con CSS al cambiar de pestaña (display:none):
    // el mapa nace con tamaño 0. Al volver a tener tamaño, se corrige.
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) map.resize()
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markersRef.current = []
    }
    // Solo al montar: el centro inicial no se re-aplica después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ruta grabada + guía: se actualizan sin recrear el mapa. Con follow,
  // el mapa sigue la última posición (la grabación en vivo).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('route')) return
    const src = map.getSource('route') as maplibregl.GeoJSONSource
    src.setData(routeGeo(points && points.length >= 2 ? points : []))
    const guide = map.getSource('guide') as maplibregl.GeoJSONSource
    guide.setData(routeGeo(guidePoints && guidePoints.length >= 2 ? guidePoints : []))
    if (follow && points && points.length > 0) {
      map.easeTo({ center: [points[points.length - 1].lng, points[points.length - 1].lat], duration: 400 })
    } else if (guidePoints && guidePoints.length >= 2) {
      const lngs = guidePoints.map((p) => p.lng)
      const lats = guidePoints.map((p) => p.lat)
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 30, maxZoom: 15, duration: 400 })
    }
  }, [points, guidePoints, follow])

  // Marcadores: se limpian y se vuelven a poner en cada cambio.
  // La primera vez que llega un conjunto nuevo, se encuadra el mapa.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const list = markers || []
    list.forEach((m) => {
      const marker = new maplibregl.Marker({ element: dotElement(m.emoji, m.color) })
        .setLngLat([m.lng, m.lat])
        .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(m.popupHtml))
        .addTo(map)
      markersRef.current.push(marker)
    })
    const key = list.map((m) => m.key).join('|')
    if (list.length > 0 && key !== fittedRef.current) {
      fittedRef.current = key
      const lngs = list.map((m) => m.lng)
      const lats = list.map((m) => m.lat)
      if (list.length === 1) map.easeTo({ center: [list[0].lng, list[0].lat], zoom: 15, duration: 400 })
      else map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 30, maxZoom: 15, duration: 400 })
    }
  }, [markers])

  // 3D: inclinar a 55° y girar. Volver a 2D endereza (pitch 0, bearing 0).
  function toggle3d() {
    const map = mapRef.current
    if (!map) return
    const next = !is3d
    setIs3d(next)
    map.easeTo({ pitch: next ? 55 : 0, bearing: next ? map.getBearing() : 0, duration: 600 })
  }
  function rotate(delta: number) {
    const map = mapRef.current
    if (!map) return
    if (!is3d) setIs3d(true)
    map.easeTo({ bearing: map.getBearing() + delta, pitch: 55, duration: 400 })
  }

  if (webglFailed) {
    return (
      <div className="rounded-2xl bg-night p-4 text-center text-sm text-white/80" style={{ height }}>
        Tu navegador no soporta el mapa 3D, pero tu ruta se sigue grabando con GPS igual.
      </div>
    )
  }

  return (
    <div>
      {!online && offlineNote && (
        <p className="mb-2 rounded-xl bg-amber-50 p-2 text-center text-xs font-semibold text-amber-800">{offlineNote}</p>
      )}
      <div className="pulso-map relative w-full overflow-hidden rounded-2xl border border-night/20 shadow-md shadow-night/20" style={{ height }}>
        <div ref={containerRef} className="h-full w-full" style={{ background: '#0A1B2E' }} />
        {/* Controles 3D estilo Strava: 2D/3D, girar, inclinar. */}
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
          <button type="button" onClick={toggle3d} aria-label="Cambiar vista 2D o 3D"
            className={`rounded-full px-3 py-1.5 text-xs font-black shadow-lg ${is3d ? 'bg-pulso text-white' : 'bg-night/90 text-white'}`}>
            {is3d ? '3D ✓' : '2D'}
          </button>
          <button type="button" onClick={() => rotate(-45)} aria-label="Girar el mapa a la izquierda"
            className="rounded-full bg-night/90 px-3 py-1.5 text-xs font-black text-white shadow-lg">⟲ Girar</button>
          <button type="button" onClick={() => rotate(45)} aria-label="Girar el mapa a la derecha"
            className="rounded-full bg-night/90 px-3 py-1.5 text-xs font-black text-white shadow-lg">Girar ⟳</button>
        </div>
        <p className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-night/80 px-2.5 py-1 text-[10px] font-bold text-white/80">
          {is3d ? 'Vista 3D · gira con dos dedos' : 'Toca 3D para inclinar el mapa'}
        </p>
      </div>
    </div>
  )
}
