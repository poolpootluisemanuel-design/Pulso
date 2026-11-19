// Mapa real con MapLibre GL + Esri World Dark Gray (sin API key, sin costo).
// - ANTES era CARTO Dark Matter, pero CARTO ya no sirve tiles reales sin
//   API key: verificado con curl, TODAS las coordenadas devuelven el mismo
//   tile placeholder de 2.513 bytes (96 % un solo gris #262626), y Stadia
//   devuelve 401 directo. Eso era el "ocupo API key" que veía Luis.
// - Esri Canvas World Dark Gray sí sirve tiles reales sin key (verificado
//   con curl: 200, JPEG con calles reales de Cancún). Base oscura + capa
//   de referencia (nombres de calles) por encima. OJO: Esri usa
//   /tile/{z}/{y}/{x} (y antes que x), al revés que OSM/CARTO.
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

// Estilo oscuro: Esri World Dark Gray, libre y sin key (verificado con
// curl: tiles reales de Cancún, 200). El fondo del canvas es azul noche
// PULSO, así que sin tiles (offline) no se ve un hueco gris claro sino
// el color de la app. Esri usa /tile/{z}/{y}/{x}.
// PERO en Isla Mujeres el fondo oscuro es casi todo mar: verificado
// con curl, el tile z14 de la isla da 200 con 1 solo color (mar gris
// uniforme), mientras el satélite da 200 con 3.110 colores (tierra y
// mar reales). Por eso hay fondo Satélite: Esri World Imagery, libre
// y sin key, con capa de referencia (nombres) por encima.
export type Basemap = 'dark' | 'satellite'
const BASEMAP_KEY = 'pulso_map_basemap'

function styleFor(basemap: Basemap): StyleSpecification {
  if (basemap === 'satellite') {
    return {
      version: 8,
      sources: {
        'esri-sat': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri, Maxar, Earthstar Geographics',
        },
        'esri-sat-ref': {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
        },
      },
      layers: [
        { id: 'esri-sat', type: 'raster', source: 'esri-sat' },
        { id: 'esri-sat-ref', type: 'raster', source: 'esri-sat-ref' },
      ],
    }
  }
  return {
    version: 8,
    sources: {
      'esri-dark-base': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© Esri, HERE, Garmin, OpenStreetMap contributors',
      },
      'esri-dark-ref': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
      },
    },
    layers: [
      { id: 'esri-dark-base', type: 'raster', source: 'esri-dark-base' },
      { id: 'esri-dark-ref', type: 'raster', source: 'esri-dark-ref' },
    ],
  }
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
  // "Volver a la ruta": punto de la guía más cercano a ti + contador.
  // Cuando el contador cambia, el mapa se centra en ese punto.
  focus,
  focusKey = 0,
  // Fondo por defecto: quien llama pasa 'satellite' en Isla Mujeres
  // (allí el oscuro es casi todo mar gris). Si el usuario ya eligió
  // un fondo, su elección guardada manda sobre el default.
  defaultBasemap = 'dark',
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
  defaultBasemap?: Basemap
  /** Punto al que centrar el mapa cuando focusKey cambia. */
  focus?: MapPoint | null
  focusKey?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const fittedRef = useRef<string>('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [is3d, setIs3d] = useState(false)
  // Seguimiento en vivo: con follow, el mapa centra tu posición en
  // cada fix GPS. ANTES el mapa "no se movía": en realidad los puntos
  // nunca llegaban (la distancia se quedaba en 0 por el filtro de
  // velocidad, ver GpsTracker), así que no había nada que seguir. Con
  // los puntos fluyendo, el mapa sí se mueve. Además, si el usuario
  // arrastra el mapa, el seguimiento se suelta (como en las apps de
  // running) y sale el botón "📍 Seguirme" para volver a centrarte.
  const [following, setFollowing] = useState(follow)
  const followingRef = useRef(follow)
  const prevFollowRef = useRef(follow)
  function setFollowingBoth(v: boolean) {
    followingRef.current = v
    setFollowing(v)
  }
  // Si follow se vuelve a activar (nueva grabación), se retoma el
  // seguimiento; si se apaga, se suelta.
  useEffect(() => {
    if (follow !== prevFollowRef.current) {
      prevFollowRef.current = follow
      setFollowingBoth(follow)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow])
  const [webglFailed, setWebglFailed] = useState(false)
  // Pérdida de contexto WebGL al apagar/encender la pantalla: Android
  // suspende la WebView y el canvas pierde su contexto. ANTES este
  // evento ponía el mensaje permanente "no soporta el mapa 3D" y el
  // mapa quedaba en negro aunque el GPS siguiera grabando. Ahora se
  // distingue: pérdida transitoria (contextLost, se recupera) de
  // WebGL realmente no soportado (webglFailed, mensaje permanente).
  const [contextLost, setContextLost] = useState(false)
  const contextLostRef = useRef(false)
  // Forzar recreación del mapa (remontar): se usa cuando el contexto
  // se perdió y no se restauró solo al volver a primer plano.
  const [mapKey, setMapKey] = useState(0)
  const recreateTriedRef = useRef(false)
  const [basemap, setBasemap] = useState<Basemap>(() => {
    try {
      const saved = localStorage.getItem(BASEMAP_KEY)
      if (saved === 'dark' || saved === 'satellite') return saved
    } catch { /* sin localStorage: usa el default */ }
    return defaultBasemap
  })
  const basemapRef = useRef(basemap)
  basemapRef.current = basemap
  // Puntos actuales para re-dibujar la ruta cuando cambia el estilo
  // (setStyle borra las capas propias: hay que volver a ponerlas).
  const pointsRef = useRef<MapPoint[] | undefined>(points)
  pointsRef.current = points
  const guideRef = useRef<MapPoint[] | undefined>(guidePoints)
  guideRef.current = guidePoints

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

  // Crear el mapa una sola vez (o de nuevo si se fuerza con mapKey
  // tras una pérdida de contexto WebGL que no se restauró sola).
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: el,
        style: styleFor(basemapRef.current),
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
      // No se pudo crear el mapa: si este dispositivo ni siquiera
      // tiene WebGL, mensaje permanente; si no, puede ser un contexto
      // perdido transitorio y se reintenta una vez al segundo.
      const probe = document.createElement('canvas')
      const hasGl = !!(probe.getContext('webgl') || probe.getContext('webgl2'))
      if (!hasGl) {
        setWebglFailed(true)
      } else if (!recreateTriedRef.current) {
        recreateTriedRef.current = true
        setTimeout(() => setMapKey((k) => k + 1), 1000)
      } else {
        setWebglFailed(true)
      }
      return
    }
    // Pérdida de contexto WebGL (apagar/encender la pantalla en
    // Android): preventDefault() permite que el navegador lo restaure;
    // mientras, solo se muestra "Recuperando el mapa…", sin tirar el
    // mensaje de "no soporta 3D" ni tocar la grabación (el GPS vive
    // en GpsTracker, fuera de este componente).
    map.on('webglcontextlost', (e) => {
      // preventDefault() permite que el navegador restaure el
      // contexto; en los tipos de MapLibre viene en originalEvent.
      const ev = e as unknown as { preventDefault?: () => void; originalEvent?: { preventDefault?: () => void } }
      try { ev.preventDefault?.(); ev.originalEvent?.preventDefault?.() } catch { /* noop */ }
      contextLostRef.current = true
      setContextLost(true)
    })
    map.on('webglcontextrestored', () => {
      contextLostRef.current = false
      setContextLost(false)
      try { map.resize() } catch { /* noop */ }
    })
    // Si el usuario arrastra el mapa, se suelta el seguimiento en vivo
    // (no tiene sentido pelear con su dedo): sale "📍 Seguirme" para
    // volver a centrarte. El mapa sigue dibujando la ruta y el marcador
    // "Estás aquí" aunque no te siga.
    map.on('dragstart', () => setFollowingBoth(false))
    // Capas propias (ruta roja + guía teal): setStyle las borra, así
    // que se vuelven a poner en cada carga de estilo.
    const addRouteLayers = () => {
      if (!map.getSource('route')) {
        map.addSource('route', { type: 'geojson', data: routeGeo([]) })
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#0A1B2E', 'line-width': 8, 'line-opacity': 0.9 } })
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#E63946', 'line-width': 4, 'line-opacity': 1 } })
      }
      if (!map.getSource('guide')) {
        map.addSource('guide', { type: 'geojson', data: routeGeo([]) })
        map.addLayer({ id: 'guide', type: 'line', source: 'guide', paint: { 'line-color': '#14B8A6', 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.95 } })
      }
      const pts = pointsRef.current
      const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined
      if (src) src.setData(routeGeo(pts && pts.length >= 2 ? pts : []))
      const gd = guideRef.current
      const gsrc = map.getSource('guide') as maplibregl.GeoJSONSource | undefined
      if (gsrc) gsrc.setData(routeGeo(gd && gd.length >= 2 ? gd : []))
    }
    map.on('load', addRouteLayers)
    map.on('style.load', addRouteLayers)
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
      fittedRef.current = ''
    }
    // Al montar y al forzar recreación (mapKey): el centro inicial no
    // se re-aplica después salvo al recrear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey])

  // Al volver a primer plano (encender la pantalla, volver a la app):
  // el mapa puede haber perdido su tamaño o su contexto WebGL.
  // resize() basta en el caso normal; si el contexto se perdió y no
  // se restauró solo, se recrea el mapa entero con la ruta y la
  // posición actuales (pointsRef/guideRef siempre están al día), sin
  // tocar la grabación GPS, que vive fuera de este componente.
  // Sin @capacitor/app instalado: visibilitychange + focus cubren el
  // regreso a primer plano en la WebView de Android.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const map = mapRef.current
      if (map) {
        try { map.resize() } catch { /* noop */ }
      }
      if (contextLostRef.current) {
        contextLostRef.current = false
        setContextLost(false)
        setMapKey((k) => k + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [])

  // Ruta grabada + guía: se actualizan sin recrear el mapa. Con
  // seguimiento activo, el mapa sigue la última posición (la
  // grabación en vivo) en cada fix: el mapa se mueve contigo y la
  // ruta se dibuja en tiempo real. Si el estilo aún no cargó (sin
  // fuente 'route'), el centrado se hace igual: antes el efecto
  // salía antes de tiempo y el mapa no se movía hasta el siguiente
  // cambio de puntos.
  const prevPointsLenRef = useRef(0)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Nueva grabación (puntos de 0 a >0): se retoma el seguimiento.
    if (prevPointsLenRef.current === 0 && points && points.length > 0) setFollowingBoth(true)
    prevPointsLenRef.current = points ? points.length : 0
    if (map.getSource('route')) {
      const src = map.getSource('route') as maplibregl.GeoJSONSource
      src.setData(routeGeo(points && points.length >= 2 ? points : []))
    }
    if (map.getSource('guide')) {
      const guide = map.getSource('guide') as maplibregl.GeoJSONSource
      guide.setData(routeGeo(guidePoints && guidePoints.length >= 2 ? guidePoints : []))
    }
    if (followingRef.current && points && points.length > 0) {
      map.easeTo({ center: [points[points.length - 1].lng, points[points.length - 1].lat], duration: 400 })
    } else if ((!points || points.length === 0) && guidePoints && guidePoints.length >= 2) {
      // Solo al inicio (sin puntos grabados aún): encuadrar la guía.
      // Si el usuario soltó el seguimiento, NO se reencuadra en cada
      // fix: eso le quitaría el mapa de las manos.
      const lngs = guidePoints.map((p) => p.lng)
      const lats = guidePoints.map((p) => p.lat)
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 30, maxZoom: 15, duration: 400 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, guidePoints, follow])

  // "Volver a la ruta": centrar el mapa en el punto de la guía más
  // cercano a ti (el botón está en GpsTracker, que sube focusKey).
  // Solo al cambiar focusKey: el punto cambia con cada fix GPS y
  // recentrar en cada uno pelearía con el follow de la grabación.
  const focusRef = useRef(focus)
  focusRef.current = focus
  const lastFocusKeyRef = useRef(0)
  useEffect(() => {
    const map = mapRef.current
    if (!map || focusKey === 0 || focusKey === lastFocusKeyRef.current) return
    lastFocusKeyRef.current = focusKey
    const f = focusRef.current
    if (!f) return
    map.easeTo({ center: [f.lng, f.lat], zoom: 16, duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])
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

  // Cambiar fondo Oscuro / Satélite: se guarda la elección. En
  // Isla Mujeres el satélite es el default porque el oscuro allí es
  // casi todo mar gris; en satélite se ve la isla real.
  function switchBasemap(next: Basemap) {
    if (next === basemap) return
    setBasemap(next)
    try { localStorage.setItem(BASEMAP_KEY, next) } catch { /* sin localStorage */ }
    const map = mapRef.current
    if (map) map.setStyle(styleFor(next))
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
        {contextLost && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-night/80 p-4 text-center text-sm font-semibold text-white">
            🔄 Recuperando el mapa… tu ruta se sigue grabando con GPS.
          </div>
        )}
        {/* Fondo del mapa: Oscuro o Satélite. En Isla Mujeres el
            satélite es el default: en oscuro la isla es casi todo mar. */}
        <div className="absolute left-2 top-2 z-10 flex gap-1.5">
          <button type="button" onClick={() => switchBasemap('dark')} aria-label="Mapa oscuro"
            className={`rounded-full px-3 py-1.5 text-xs font-black shadow-lg ${basemap === 'dark' ? 'bg-pulso text-night' : 'bg-night/90 text-white'}`}>
            🌙 Oscuro
          </button>
          <button type="button" onClick={() => switchBasemap('satellite')} aria-label="Mapa satélite"
            className={`rounded-full px-3 py-1.5 text-xs font-black shadow-lg ${basemap === 'satellite' ? 'bg-pulso text-night' : 'bg-night/90 text-white'}`}>
            🛰️ Satélite
          </button>
        </div>
        {/* Controles 3D estilo Strava: 2D/3D, girar, inclinar. */}
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
          <button type="button" onClick={toggle3d} aria-label="Cambiar vista 2D o 3D"
            className={`rounded-full px-3 py-1.5 text-xs font-black shadow-lg ${is3d ? 'bg-pulso text-night' : 'bg-night/90 text-white'}`}>
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
        {/* Seguimiento soltado al arrastrar: botón para volver a
            centrarte en tu posición en vivo. */}
        {follow && points && points.length > 0 && !following && (
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current
              const last = points[points.length - 1]
              setFollowingBoth(true)
              if (map && last) map.easeTo({ center: [last.lng, last.lat], zoom: 16, duration: 600 })
            }}
            aria-label="Volver a seguir mi posición"
            className="absolute bottom-2 right-2 z-10 rounded-full bg-pulso px-3 py-1.5 text-xs font-black text-night shadow-lg"
          >
            📍 Seguirme
          </button>
        )}
      </div>
    </div>
  )
}
