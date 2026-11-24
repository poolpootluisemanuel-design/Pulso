// Mini-mapa de una ruta guardada: dibujo SVG (sin MapLibre, sin
// internet). Trazo lila, inicio verde, fin rosa. Movido tal cual desde
// Train.tsx para reutilizarlo en la tarjeta de publicar, el feed y el
// detalle del historial.
export default function RouteMini({ route, h = 110 }: { route: { lat: number; lng: number }[]; h?: number }) {
  if (!route || route.length < 2) return null
  const lats = route.map((p) => p.lat), lngs = route.map((p) => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const w = 320
  const x = (lng: number) => 10 + ((lng - minLng) / Math.max(maxLng - minLng, 0.0001)) * (w - 20)
  const y = (lat: number) => h - 10 - ((lat - minLat) / Math.max(maxLat - minLat, 0.0001)) * (h - 20)
  const d = route.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full rounded-xl bg-sage-100">
      <path d={d} fill="none" stroke="#7E57A8" strokeWidth="3" strokeLinecap="round" />
      <circle cx={x(route[0].lng)} cy={y(route[0].lat)} r="5" fill="#22c55e" />
      <circle cx={x(route[route.length - 1].lng)} cy={y(route[route.length - 1].lat)} r="5" fill="#D14D72" />
    </svg>
  )
}
