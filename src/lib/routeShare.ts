// Publicar un recorrido GPS sin migración de base de datos.
//
// La tabla `posts` solo tiene id/profile_id/author_name/text/created_at
// y RLS de workouts solo deja leer los entrenamientos propios, así que
// un post NO puede referenciar el workout por id esperando que los
// demás lean la ruta. La tarjeta del post es autocontenida: el texto
// lleva una primera línea con un marcador que la UI oculta al
// renderizar:
//
//   [recorrido:<workoutId>|<deporte>|<distanciaKm>|<duracionMin>|<pasos>|<polilinea>]
//   <texto del usuario (opcional)>
//
// La polilínea es la ruta codificada (algoritmo de Google, 5 decimales)
// reducida a 40 puntos. El texto total se limita a 950 caracteres
// (el límite de la base es 1000). Un post viejo o con el marcador roto
// se renderiza como texto normal: el parseo es tolerante.
//
// Limpieza post-lanzamiento: columna workout_id en posts + política RLS
// «recorridos publicados visibles» para leer la ruta completa del
// workout en vez de la polilínea reducida.
import type { Post, Workout } from './types'

export const ROUTE_MARKER_PREFIX = '[recorrido:'
const MAX_POST_CHARS = 950
const MAX_ROUTE_POINTS = 40

export type LatLng = { lat: number; lng: number }

export interface ParsedRoutePost {
  workoutId: string
  sport: string
  distanceKm?: number
  durationMin: number
  steps?: number
  /** Ruta reducida (para el mapa del feed). La ruta completa solo la ve el dueño. */
  route: LatLng[]
  /** Texto del usuario (sin el marcador). */
  note: string
}

// --- Polilínea de Google (5 decimales), sin dependencias ---

const PRECISION = 1e5

function encodeSigned(n: number): string {
  let v = n < 0 ? ~(n << 1) : n << 1
  let out = ''
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
    v >>= 5
  }
  return out + String.fromCharCode(v + 63)
}

export function encodePolyline(route: LatLng[]): string {
  let lastLat = 0
  let lastLng = 0
  let out = ''
  for (const p of route) {
    const lat = Math.round(p.lat * PRECISION)
    const lng = Math.round(p.lng * PRECISION)
    out += encodeSigned(lat - lastLat) + encodeSigned(lng - lastLng)
    lastLat = lat
    lastLng = lng
  }
  return out
}

export function decodePolyline(str: string): LatLng[] | null {
  try {
    const out: LatLng[] = []
    let i = 0
    let lat = 0
    let lng = 0
    while (i < str.length) {
      let shift = 0
      let result = 0
      let b = 0
      do {
        if (i >= str.length) return null
        b = str.charCodeAt(i++) - 63
        if (Number.isNaN(b) || b < 0) return null
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const dlat = result & 1 ? ~(result >> 1) : result >> 1
      lat += dlat
      shift = 0
      result = 0
      do {
        if (i >= str.length) return null
        b = str.charCodeAt(i++) - 63
        if (Number.isNaN(b) || b < 0) return null
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const dlng = result & 1 ? ~(result >> 1) : result >> 1
      lng += dlng
      out.push({ lat: lat / PRECISION, lng: lng / PRECISION })
    }
    return out
  } catch {
    return null
  }
}

/** Reduce la ruta a como mucho `max` puntos (muestreo uniforme, con primero y último). */
export function downsampleRoute(route: LatLng[], max: number = MAX_ROUTE_POINTS): LatLng[] {
  if (!route || route.length <= max) return route || []
  const out: LatLng[] = []
  for (let i = 0; i < max; i++) {
    out.push(route[Math.round((i * (route.length - 1)) / (max - 1))])
  }
  return out
}

// --- Marcador en el texto del post ---

export function buildRoutePostText(workout: Workout, note: string): string {
  const poly = encodePolyline(downsampleRoute(workout.route ?? []))
  const marker = `${ROUTE_MARKER_PREFIX}${workout.id}|${workout.sport}|${workout.distance_km ?? ''}|${workout.duration_min}|${workout.steps ?? ''}|${poly}]`
  const clean = note.trim()
  if (!clean) return marker
  const room = MAX_POST_CHARS - marker.length - 1
  if (room <= 0) return marker
  return `${marker}\n${clean.slice(0, room)}`
}

export function parseRoutePost(text: string): ParsedRoutePost | null {
  if (!text || !text.startsWith(ROUTE_MARKER_PREFIX)) return null
  const end = text.indexOf(']', ROUTE_MARKER_PREFIX.length)
  if (end < 0) return null
  const parts = text.slice(ROUTE_MARKER_PREFIX.length, end).split('|')
  if (parts.length !== 6) return null
  const [workoutId, sport, dist, dur, steps, poly] = parts
  if (!workoutId || !sport) return null
  const distanceKm = dist === '' ? undefined : Number(dist)
  if (distanceKm !== undefined && Number.isNaN(distanceKm)) return null
  const durationMin = Number(dur)
  if (Number.isNaN(durationMin)) return null
  const stepsNum = steps === '' ? undefined : Number(steps)
  if (stepsNum !== undefined && Number.isNaN(stepsNum)) return null
  const route = poly ? decodePolyline(poly) : []
  if (route === null) return null
  return {
    workoutId,
    sport,
    distanceKm,
    durationMin,
    steps: stepsNum,
    route: route ?? [],
    note: text.slice(end + 1).trim(),
  }
}

/** El post de un recorrido, si es que lo es. */
export function findRoutePost(posts: Post[], workoutId: string): Post | undefined {
  return posts.find((p) => parseRoutePost(p.text)?.workoutId === workoutId)
}

/** Texto visible de un post: la nota del recorrido (o un resumen) en vez del marcador. */
export function postDisplayText(text: string): string {
  const route = parseRoutePost(text)
  if (!route) return text
  if (route.note) return route.note
  const dist = route.distanceKm != null ? ` · ${route.distanceKm} km` : ''
  return `Recorrido · ${route.sport}${dist} · ${route.durationMin} min`
}
