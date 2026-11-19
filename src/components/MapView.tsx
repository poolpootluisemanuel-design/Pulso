// Mapa deportivo de PULSO con MapLibre GL.
// - Fondo principal: OpenFreeMap Liberty (tiles vectoriales de
//   OpenStreetMap, gratis y sin llave). Verificado en el teléfono de
//   Luis (Galaxy A56) a zoom 16, 18 y 19: calles, nombres en español,
//   parques, costa y edificios se ven bien, sin zonas en blanco. Los
//   colores PULSO (mar turquesa, parques menta) se aplican sobre el
//   estilo al cargar (ver lib/mapStyle.ts).
// - Respaldo: si el estilo deportivo falla de verdad (error de estilo
//   o no carga en 20 s), el mapa cambia UNA vez a satélite de Esri y
//   avisa con un texto corto. La primera carga tarda unos segundos:
//   eso no dispara el respaldo. Un error del mapa nunca toca el GPS,
//   que vive fuera de este componente (GpsTracker).
// - ANTES era Esri World Dark Gray / satélite. El satélite se conserva
//   como alternativa y el oscuro como tercera opción.
// - 3D REAL (estilo Strava): pitch (inclinación) y bearing (rotación)
//   de verdad, con botones 2D/3D, girar e inclinar, y gestos táctiles
//   (dos dedos para inclinar/girar). No es un truco de CSS: MapLibre
//   renderiza el mapa en WebGL con perspectiva.
// - Se crea UNA vez y se destruye al desmontar: si se recreara al
//   cambiar de pestaña, el mapa se duplicaría o fallaría.
// - Los marcadores son divs propios (emoji sobre círculo PULSO), no la
//   imagen por defecto. Inicio verde, destino con bandera y "Estás
//   aquí" con punto azul pulsante.
// - Las calles (tiles) necesitan internet. Sin internet el fondo queda
//   claro, pero la ruta y los marcadores sí se dibujan, y el GPS
//   sigue grabando: se avisa con un texto corto.
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CANCUN_CENTER } from '../lib/routes'
import {
  applyPulsoPaint,
  BASEMAP_KEY,
  GUIDE_COLOR,
  GUIDE_WIDTH,
  resolveInitialBasemap,
  ROUTE_CASING_COLOR,
  ROUTE_CASING_WIDTH,
  ROUTE_COLOR,
  ROUTE_WIDTH,
  SPORT_FALLBACK,
  START_MARKER_COLOR,
  styleFor,
  STYLE_LOAD_TIMEOUT_MS,
} from '../lib/mapStyle'
import type { Basemap } from '../lib/mapStyle'

export type { Basemap }

export interface MapPoint { lat: number; lng: number }
export interface MapMarker extends MapPoint {
  key: string
  emoji: string
  color: string
  popupHtml: string
  /** Tipo de marcador deportivo. Si no se pone, se deduce de la clave
   *  para no tocar a quienes ya lo usan: 'inicio'/'r-inicio' = inicio,
   *  'fin'/'r-fin' = destino, 'ahora'/'yo' = estás aquí. */
  kind?: 'start' | 'finish' | 'you'
}

// Centro por defecto: Cancún centro (definido en lib/routes.ts para
// que quien lo necesite no tenga que importar todo el mapa).
export { CANCUN_CENTER }

// Los estilos viven en lib/mapStyle.ts: 'sport' es OpenFreeMap Liberty
// (vectorial, fondo principal), 'satellite' es Esri World Imagery y
// 'dark' es Esri Canvas Dark Gray (respaldo y tercera opción).
// Esri usa /tile/{z}/{y}/{x} (y antes que x), al revés que OSM.

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

// Tipo deportivo del marcador: explícito en `kind`, o deducido de la
// clave para no tocar a quienes ya lo usan (GpsTracker pasa 'inicio'
// y 'ahora'; SessionsTab pasa 'r-inicio', 'r-fin' y 'yo').
function resolveMarkerKind(m: MapMarker): 'start' | 'finish' | 'you' | undefined {
  if (m.kind) return m.kind
  if (m.key === 'inicio' || m.key === 'r-inicio') return 'start'
  if (m.key === 'fin' || m.key === 'r-fin') return 'finish'
  if (m.key === 'ahora' || m.key === 'yo') return 'you'
  return undefined
}

function dotElement(m: MapMarker): HTMLDivElement {
  const kind = resolveMarkerKind(m)
  if (kind === 'you') {
    // Ubicación actual: punto azul pulsante (animación en index.css).
    const el = document.createElement('div')
    el.className = 'pulso-you-marker'
    el.innerHTML = '<span class="pulso-you-ring"></span><span class="pulso-you-dot"></span>'
    return el
  }
  const el = document.createElement('div')
  if (kind === 'start') {
    el.style.cssText = `display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:${START_MARKER_COLOR};color:#fff;font-size:18px;border:2px solid #fff;box-shadow:0 2px 8px rgba(10,27,46,.5);`
    el.textContent = '▶'
    return el
  }
  if (kind === 'finish') {
    el.style.cssText = `display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#fff;color:#4A2E28;font-size:19px;border:2px solid #D14D72;box-shadow:0 2px 8px rgba(10,27,46,.5);`
    el.textContent = '🏁'
    return el
  }
  el.style.cssText = `display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:${m.color};color:#fff;font-size:19px;border:2px solid #fff;box-shadow:0 2px 8px rgba(10,27,46,.5);`
  el.textContent = m.emoji
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
  // (allí el oscuro es casi todo mar gris). Se conserva el prop por
  // compatibilidad, pero el fondo inicial real lo decide
  // resolveInitialBasemap: la preferencia guardada manda y los
  // usuarios nuevos ven el mapa deportivo ('sport').
  defaultBasemap = 'sport',
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
      return resolveInitialBasemap(localStorage.getItem(BASEMAP_KEY))
    } catch { /* sin localStorage: usa el default que pasó quien llama */ }
    return defaultBasemap
  })
  const basemapRef = useRef(basemap)
  basemapRef.current = basemap
  // Carga del estilo y respaldo: el overlay "Cargando mapa…" se quita
  // cuando el estilo carga (style.load). Si el estilo deportivo no
  // carga en 20 s o da un error de estilo/fuente, se cambia UNA sola
  // vez por montaje a satélite de Esri y se avisa. Los errores de un
  // tile suelto no disparan el respaldo. La grabación GPS vive fuera
  // de este componente y nunca se ve afectada.
  const [styleLoaded, setStyleLoaded] = useState(false)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const styleLoadedRef = useRef(false)
  const fallbackTriedRef = useRef(false)
  const styleTimerRef = useRef<number | null>(null)
  function setStyleLoadedBoth(v: boolean) {
    styleLoadedRef.current = v
    setStyleLoaded(v)
  }
  function clearStyleTimer() {
    if (styleTimerRef.current !== null) {
      window.clearTimeout(styleTimerRef.current)
      styleTimerRef.current = null
    }
  }
  function fallbackToSatellite() {
    if (fallbackTriedRef.current) return
    fallbackTriedRef.current = true
    clearStyleTimer()
    setFallbackNotice('El mapa deportivo no cargó; usando satélite.')
    window.setTimeout(() => setFallbackNotice(null), 8000)
    setBasemap(SPORT_FALLBACK)
    try { localStorage.setItem(BASEMAP_KEY, SPORT_FALLBACK) } catch { /* sin localStorage */ }
    const map = mapRef.current
    setStyleLoadedBoth(false)
    if (map) {
      try { map.setStyle(styleFor(SPORT_FALLBACK)) } catch { /* noop */ }
    }
    // Si el satélite tampoco carga, no dejar el overlay para siempre:
    // se quita y quedan la ruta y los marcadores dibujados.
    styleTimerRef.current = window.setTimeout(() => setStyleLoadedBoth(true), 25000)
  }
  function armStyleTimeout() {
    clearStyleTimer()
    styleTimerRef.current = window.setTimeout(() => {
      if (basemapRef.current === 'sport' && !styleLoadedRef.current) {
        if (!fallbackTriedRef.current) fallbackToSatellite()
        // Si el usuario volvió a elegir el deportivo a mano tras un
        // fallo, no se vuelve a cambiar de fondo, pero tampoco se deja
        // el overlay tapando el mapa para siempre.
        else setStyleLoadedBoth(true)
      }
    }, STYLE_LOAD_TIMEOUT_MS)
  }
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
        // El vector llega hasta zoom 14 y se sigue dibujando por
        // sobrezoom hasta 19 sin quedarse en blanco (verificado en
        // Isla Mujeres a 16, 18 y 19).
        maxZoom: 19,
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
    // Estilo cargado: se quita el overlay "Cargando mapa…" y, si es el
    // deportivo, se aplican los colores PULSO (mar turquesa, parques
    // menta). También se dispara al cambiar de fondo con setStyle.
    map.on('style.load', () => {
      clearStyleTimer()
      setStyleLoadedBoth(true)
      if (basemapRef.current === 'sport') applyPulsoPaint(map)
    })
    // Error real del estilo o de sus fuentes (glifos, sprites): el
    // mapa cambia una sola vez a satélite. Los errores de un tile
    // suelto no cuentan (esos eventos traen `tile`) y la primera
    // carga lenta tampoco: la cubre el temporizador de 20 s.
    map.on('error', (e) => {
      if (basemapRef.current !== 'sport' || fallbackTriedRef.current) return
      const ev = e as unknown as { tile?: unknown; error?: { status?: number; message?: string } }
      if (ev.tile) return
      const msg = ev.error?.message || ''
      if (ev.error?.status !== undefined || /style|sprite|glyph/i.test(msg)) {
        fallbackToSatellite()
      }
    })
    if (basemapRef.current === 'sport') armStyleTimeout()
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
    // Capas propias (ruta rosa PULSO con borde blanco + guía lila):
    // setStyle las borra, así que se vuelven a poner en cada carga
    // de estilo.
    const addRouteLayers = () => {
      if (!map.getSource('route')) {
        map.addSource('route', { type: 'geojson', data: routeGeo([]) })
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': ROUTE_CASING_COLOR, 'line-width': ROUTE_CASING_WIDTH, 'line-opacity': 0.95 } })
        map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': ROUTE_COLOR, 'line-width': ROUTE_WIDTH, 'line-opacity': 1 } })
      }
      if (!map.getSource('guide')) {
        map.addSource('guide', { type: 'geojson', data: routeGeo([]) })
        map.addLayer({ id: 'guide', type: 'line', source: 'guide', paint: { 'line-color': GUIDE_COLOR, 'line-width': GUIDE_WIDTH, 'line-dasharray': [2, 2], 'line-opacity': 0.95 } })
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
      clearStyleTimer()
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
      const marker = new maplibregl.Marker({ element: dotElement(m) })
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
  function zoomBy(delta: number) {
    const map = mapRef.current
    if (!map) return
    map.zoomTo(map.getZoom() + delta, { duration: 300 })
  }
  // Centrar en mi posición (solo cuando hay puntos grabados): vuelve
  // a activar el seguimiento en vivo.
  function locateMe() {
    const map = mapRef.current
    const last = points && points.length > 0 ? points[points.length - 1] : null
    if (!map || !last) return
    setFollowingBoth(true)
    map.easeTo({ center: [last.lng, last.lat], zoom: 16, duration: 600 })
  }

  // Cambiar fondo Deportivo / Oscuro / Satélite: se guarda la elección.
  // Al pasar al deportivo se arma el temporizador de respaldo por si
  // el estilo no carga; al salir de él se desarma.
  function switchBasemap(next: Basemap) {
    if (next === basemap) return
    setBasemap(next)
    try { localStorage.setItem(BASEMAP_KEY, next) } catch { /* sin localStorage */ }
    const map = mapRef.current
    if (map) map.setStyle(styleFor(next))
    if (next === 'sport') {
      setStyleLoadedBoth(false)
      armStyleTimeout()
    } else {
      clearStyleTimer()
      setStyleLoadedBoth(true)
    }
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
        <div ref={containerRef} className="h-full w-full" style={{ background: basemap === 'dark' ? '#0A1B2E' : '#EFEAE2' }} />
        {contextLost && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-night/80 p-4 text-center text-sm font-semibold text-white">
            🔄 Recuperando el mapa… tu ruta se sigue grabando con GPS.
          </div>
        )}
        {/* Carga inicial del estilo: la primera vez tarda unos segundos
            (los tiles vectoriales vienen en camino). No es un error. */}
        {online && !styleLoaded && !webglFailed && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#EFEAE2]/90 p-4 text-center text-sm font-bold text-night">
            🗺️ Cargando mapa…
          </div>
        )}
        {fallbackNotice && (
          <button type="button" onClick={() => setFallbackNotice(null)}
            className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-night/90 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg">
            {fallbackNotice} ✕
          </button>
        )}
        {/* Fondo del mapa: Deportivo (principal), Oscuro o Satélite. */}
        <div className="absolute left-2 top-2 z-10 flex gap-1.5">
          <button type="button" onClick={() => switchBasemap('sport')} aria-label="Mapa deportivo"
            className={`rounded-full px-2.5 py-1.5 text-xs font-black shadow-lg ${basemap === 'sport' ? 'bg-pulso text-night' : 'bg-white/95 text-night'}`}>
            🏃 Deportivo
          </button>
          <button type="button" onClick={() => switchBasemap('dark')} aria-label="Mapa oscuro"
            className={`rounded-full px-2.5 py-1.5 text-xs font-black shadow-lg ${basemap === 'dark' ? 'bg-pulso text-night' : 'bg-white/95 text-night'}`}>
            🌙 Oscuro
          </button>
          <button type="button" onClick={() => switchBasemap('satellite')} aria-label="Mapa satélite"
            className={`rounded-full px-2.5 py-1.5 text-xs font-black shadow-lg ${basemap === 'satellite' ? 'bg-pulso text-night' : 'bg-white/95 text-night'}`}>
            🛰️ Satélite
          </button>
        </div>
        {/* Controles flotantes: zoom, ubicación, 2D/3D y girar. */}
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
          <button type="button" onClick={() => zoomBy(1)} aria-label="Acercar el mapa"
            className="rounded-full bg-white/95 px-3 py-1.5 text-base font-black text-night shadow-lg">+</button>
          <button type="button" onClick={() => zoomBy(-1)} aria-label="Alejar el mapa"
            className="rounded-full bg-white/95 px-3 py-1.5 text-base font-black text-night shadow-lg">−</button>
          {points !== undefined && (
            <button type="button" onClick={locateMe} disabled={!points || points.length === 0} aria-label="Centrar en mi ubicación"
              className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-night shadow-lg disabled:opacity-40">◎ Ubicación</button>
          )}
          <button type="button" onClick={toggle3d} aria-label="Cambiar vista 2D o 3D"
            className={`rounded-full px-3 py-1.5 text-xs font-black shadow-lg ${is3d ? 'bg-pulso text-night' : 'bg-white/95 text-night'}`}>
            {is3d ? '3D ✓' : '2D'}
          </button>
          <button type="button" onClick={() => rotate(-45)} aria-label="Girar el mapa a la izquierda"
            className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-night shadow-lg">⟲ Girar</button>
          <button type="button" onClick={() => rotate(45)} aria-label="Girar el mapa a la derecha"
            className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-night shadow-lg">Girar ⟳</button>
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
