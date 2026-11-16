// Mapa real con Leaflet + OpenStreetMap (sin API key, sin costo).
// - Se crea UNA vez y se destruye al desmontar: si se recreara al
//   cambiar de pestaña, Leaflet tira "Map container is already
//   initialized" y se duplican los mapas.
// - Los marcadores usan divIcon con emoji (no la imagen por defecto
//   de Leaflet, que en Vite no se resuelve y sale rota).
// - Las calles (tiles) necesitan internet. Sin internet el fondo
//   queda gris, pero la polyline y los marcadores sí se dibujan, y
//   el GPS sigue grabando la ruta: se avisa con un texto corto.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPoint { lat: number; lng: number }
export interface MapMarker extends MapPoint {
  key: string
  emoji: string
  color: string
  popupHtml: string
}

// Centro por defecto: Cancún centro.
export const CANCUN_CENTER: MapPoint = { lat: 21.1619, lng: -86.8515 }

function dotIcon(emoji: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:${color};color:#fff;font-size:19px;border:2px solid #fff;box-shadow:0 2px 8px rgba(10,27,46,.35);">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  })
}

export default function MapView({
  center = CANCUN_CENTER,
  zoom = 14,
  points,
  markers,
  height = 220,
  follow = false,
  offlineNote,
}: {
  center?: MapPoint
  zoom?: number
  points?: MapPoint[]
  markers?: MapMarker[]
  height?: number
  follow?: boolean
  /** Texto que se muestra sin internet (cada uso pone el suyo). */
  offlineNote?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const polyRef = useRef<L.Polyline | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const fittedRef = useRef<string>('')
  const [online, setOnline] = useState(() => navigator.onLine)

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
    const map = L.map(el, { zoomControl: true, attributionControl: true })
    map.setView([center.lat, center.lng], zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    markersRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // Entrenar se oculta con CSS al cambiar de pestaña (display:none):
    // el mapa nace con tamaño 0. Al volver a tener tamaño, se corrige.
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) map.invalidateSize()
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      polyRef.current = null
      markersRef.current = null
    }
    // Solo al montar: el centro inicial no se re-aplica después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ruta (polyline): se actualiza sin recrear el mapa. Con follow, el
  // mapa sigue la última posición (la grabación en vivo).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (polyRef.current) {
      polyRef.current.remove()
      polyRef.current = null
    }
    if (points && points.length >= 2) {
      polyRef.current = L.polyline(points.map((p) => [p.lat, p.lng] as [number, number]), {
        color: '#14B8A6', weight: 4, opacity: 0.9,
      }).addTo(map)
      if (follow) map.panTo([points[points.length - 1].lat, points[points.length - 1].lng])
    } else if (follow && points && points.length === 1) {
      map.panTo([points[0].lat, points[0].lng])
    }
  }, [points, follow])

  // Marcadores: se limpian y se vuelven a poner en cada cambio.
  // La primera vez que llega un conjunto nuevo, se encuadra el mapa.
  useEffect(() => {
    const map = mapRef.current
    const layer = markersRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const list = markers || []
    list.forEach((m) => {
      L.marker([m.lat, m.lng], { icon: dotIcon(m.emoji, m.color) })
        .bindPopup(m.popupHtml)
        .addTo(layer)
    })
    const key = list.map((m) => m.key).join('|')
    if (list.length > 0 && key !== fittedRef.current) {
      fittedRef.current = key
      if (list.length === 1) map.setView([list[0].lat, list[0].lng], 15)
      else map.fitBounds(L.latLngBounds(list.map((m) => [m.lat, m.lng] as [number, number])), { padding: [24, 24], maxZoom: 15 })
    }
  }, [markers])

  return (
    <div>
      {!online && offlineNote && (
        <p className="mb-2 rounded-xl bg-amber-50 p-2 text-center text-xs font-semibold text-amber-800">{offlineNote}</p>
      )}
      <div ref={containerRef} className="pulso-map w-full overflow-hidden rounded-2xl border border-slate-100 shadow-sm" style={{ height }} />
    </div>
  )
}
