// Navegación guiada por una ruta recomendada (estilo Strava):
// indicaciones en vivo mientras grabas con GPS — progreso, próximo
// giro, distancia restante y aviso si te sales de la ruta.
// Todo es geometría local con haversine: no necesita internet ni
// API key. La posición que se usa es la última aceptada por el
// filtro anti-deriva de GpsTracker, así los saltos fantasma no
// disparan indicaciones falsas.
import { haversineKm } from './utils'
import { routeDistanceKm } from './routes'
import type { RecommendedRoute, RoutePoint } from './routes'

export interface TurnInfo {
  /** Ángulo del giro en grados: positivo = derecha, negativo = izquierda. */
  angleDeg: number
  direction: 'izquierda' | 'derecha' | 'vuelta'
  /** Distancia desde tu posición hasta el giro, en metros. */
  distanceM: number
}

export interface NavigationState {
  /** Texto de la indicación principal ("Gira a la derecha en 80 m"). */
  instruction: string
  /** Dirección del próximo giro, o null si no hay giro próximo. */
  nextTurn: TurnInfo | null
  /** Distancia ya recorrida SOBRE la ruta guía, en km. */
  progressKm: number
  /** Distancia que falta de la ruta guía, en km. */
  remainingKm: number
  /** Distancia total de la ruta guía, en km. */
  totalKm: number
  /** Progreso 0-100. */
  progressPct: number
  /** Distancia en línea recta a la ruta guía, en metros. */
  distToRouteM: number
  /** true si estás a más de 40 m de la ruta guía. */
  offRoute: boolean
  /** Punto de la ruta guía más cercano a ti (para "Volver a la ruta"). */
  nearestPoint: RoutePoint
  /** Ya llegaste al final de la ruta. */
  completed: boolean
}

/** Rumbo entre dos puntos, en grados 0-360 (0 = norte). */
export function bearing(a: RoutePoint, b: RoutePoint): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** Diferencia de rumbo normalizada a -180..180 (positivo = girar a la derecha). */
function turnAngle(fromBearing: number, toBearing: number): number {
  let d = toBearing - fromBearing
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

// Proyección de un punto sobre un tramo (a-b) en metros locales
// (aproximación equirectangular, válida para tramos cortos).
function projectOnSegment(p: RoutePoint, a: RoutePoint, b: RoutePoint): { point: RoutePoint; t: number; distKm: number } {
  const lat0 = (a.lat * Math.PI) / 180
  const kx = 111320 * Math.cos(lat0)
  const ky = 110540
  const px = (p.lng - a.lng) * kx
  const py = (p.lat - a.lat) * ky
  const bx = (b.lng - a.lng) * kx
  const by = (b.lat - a.lat) * ky
  const len2 = bx * bx + by * by
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
  return { point, t, distKm: haversineKm(p, point) }
}

/** Distancia acumulada de la ruta hasta cada vértice. */
function cumulativeKm(points: RoutePoint[]): number[] {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversineKm(points[i - 1], points[i]))
  return cum
}

/** Ángulo de giro en cada vértice interior (0 si no hay giro). */
function turnAngles(points: RoutePoint[]): number[] {
  const angles = new Array<number>(points.length).fill(0)
  for (let i = 1; i < points.length - 1; i++) {
    angles[i] = turnAngle(bearing(points[i - 1], points[i]), bearing(points[i], points[i + 1]))
  }
  return angles
}

export function formatDistM(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.max(0, Math.round(m))} m`
}

export function computeNavigation(current: RoutePoint, route: RecommendedRoute): NavigationState {
  const pts = route.points
  const totalKm = routeDistanceKm(route)
  const cum = cumulativeKm(pts)
  const angles = turnAngles(pts)

  // Punto de la ruta más cercano a ti y distancia recorrida sobre ella.
  let best = { point: pts[0], segment: 0, distKm: Infinity, alongKm: 0 }
  for (let i = 0; i < pts.length - 1; i++) {
    const proj = projectOnSegment(current, pts[i], pts[i + 1])
    if (proj.distKm < best.distKm) {
      best = { point: proj.point, segment: i, distKm: proj.distKm, alongKm: cum[i] + haversineKm(pts[i], proj.point) }
    }
  }
  const distToRouteM = best.distKm * 1000
  const offRoute = distToRouteM > 40
  const progressKm = Math.min(best.alongKm, totalKm)
  const remainingKm = Math.max(0, totalKm - progressKm)
  const progressPct = totalKm > 0 ? Math.min(100, (progressKm / totalKm) * 100) : 0
  const endDistM = haversineKm(current, pts[pts.length - 1]) * 1000
  const completed = remainingKm < 0.02 || endDistM < 20

  // Próximo giro: primer vértice por delante con giro de al menos 25°.
  let nextTurn: TurnInfo | null = null
  for (let j = best.segment + 1; j < pts.length - 1; j++) {
    const a = angles[j]
    if (Math.abs(a) < 25) continue
    const distM = Math.max(0, (cum[j] - progressKm) * 1000)
    nextTurn = {
      angleDeg: a,
      direction: Math.abs(a) > 155 ? 'vuelta' : a > 0 ? 'derecha' : 'izquierda',
      distanceM: distM,
    }
    break
  }

  let instruction: string
  if (completed) {
    instruction = '🏁 Llegaste — ruta completada'
  } else if (offRoute) {
    instruction = `⚠️ Te saliste de la ruta (${Math.round(distToRouteM)} m)`
  } else if (nextTurn) {
    const dir = nextTurn.direction === 'vuelta' ? 'da la vuelta' : `gira a la ${nextTurn.direction}`
    const arrow = nextTurn.direction === 'derecha' ? '➡️' : nextTurn.direction === 'izquierda' ? '⬅️' : '↩️'
    if (nextTurn.distanceM <= 50) instruction = `${arrow} Ahora: ${dir}`
    else if (nextTurn.distanceM <= 150) instruction = `${arrow} ${dir === 'da la vuelta' ? 'Da la vuelta' : `Gira a la ${nextTurn.direction}`} en ${formatDistM(nextTurn.distanceM)}`
    else instruction = `⬆️ Sigue recto ${formatDistM(nextTurn.distanceM)} y luego ${dir === 'da la vuelta' ? 'da la vuelta' : `gira a la ${nextTurn.direction}`}`
  } else {
    instruction = `⬆️ Sigue recto — faltan ${remainingKm.toFixed(1)} km`
  }

  return {
    instruction, nextTurn, progressKm, remainingKm, totalKm,
    progressPct, distToRouteM, offRoute, nearestPoint: best.point, completed,
  }
}
