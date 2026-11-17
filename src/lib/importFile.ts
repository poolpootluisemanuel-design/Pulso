// Importar entrenamientos desde Strava / Garmin / Google Fit.
// Lee un archivo .gpx o .tcx EN EL TELÉFONO (FileReader): el archivo
// nunca se sube a ningún servidor, ni a Supabase, ni a Vercel.
// Extrae deporte, fecha, duración, distancia y ruta GPS, y muestra
// una vista previa antes de guardar. Sin API keys, sin OAuth, sin
// credenciales de Strava: solo el archivo que el usuario descarga:
//   Strava → actividad → ⋯ → Exportar GPX
//   Google Fit → Takeout (takeout.google.com) → Fit → Activities (.tcx)
//   Garmin → actividad → Exportar → GPX / TCX
import { haversineKm } from './utils'

export interface RoutePoint { lat: number; lng: number }

export interface ParsedWorkout {
  sport: string
  date: string // YYYY-MM-DD (día local del usuario)
  durationMin: number
  distanceKm: number
  route: RoutePoint[]
  name: string
  source: 'GPX' | 'TCX'
}

const SPORT_KEYWORDS: [RegExp, string][] = [
  [/cicl|bik|ride|bici|mountain/i, 'Ciclismo'],
  [/correr|run|carrera|jog/i, 'Running'],
  [/camin|walk|hike|senderismo|trek/i, 'Caminata'],
  [/swim|nataci|nadar/i, 'Natación'],
  [/p[aá]del/i, 'Pádel'],
  [/crossfit/i, 'CrossFit'],
  [/yoga/i, 'Yoga'],
  [/surf/i, 'Surf'],
  [/gym|pesas|fuerza/i, 'Gym'],
]

function guessSport(text: string): string {
  for (const [re, sport] of SPORT_KEYWORDS) if (re.test(text)) return sport
  return 'Running' // el usuario lo puede cambiar en la vista previa
}

function localDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function textOf(el: Element | null | undefined): string {
  return el?.textContent?.trim() || ''
}

/** Reduce la ruta a como mucho N puntos, sin quitar el primero ni el último. */
function downsample(points: RoutePoint[], max = 400): RoutePoint[] {
  if (points.length <= max) return points
  const step = points.length / max
  const out: RoutePoint[] = []
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)])
  out.push(points[points.length - 1])
  return out
}

function distanceOf(points: RoutePoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i])
  return total
}

function parseGpx(doc: Document): ParsedWorkout {
  const trk = doc.getElementsByTagName('trk')[0]
  const name = textOf(trk?.getElementsByTagName('name')[0]) || textOf(doc.getElementsByTagName('name')[0])
  const type = textOf(trk?.getElementsByTagName('type')[0])
  const pts = Array.from(doc.getElementsByTagName('trkpt'))
  const route: RoutePoint[] = []
  const times: number[] = []
  for (const p of pts) {
    const lat = Number(p.getAttribute('lat'))
    const lng = Number(p.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    route.push({ lat, lng })
    const t = Date.parse(textOf(p.getElementsByTagName('time')[0]))
    if (Number.isFinite(t)) times.push(t)
  }
  if (route.length < 2) throw new Error('El archivo GPX no trae una ruta con puntos GPS.')
  const durationMin = times.length >= 2
    ? Math.max(1, Math.round((times[times.length - 1] - times[0]) / 60000))
    : 0
  if (!durationMin) throw new Error('El archivo GPX no trae horas, así que no se puede calcular la duración.')
  return {
    sport: guessSport(`${type} ${name}`),
    date: localDateISO(new Date(times[0])),
    durationMin,
    distanceKm: Math.round(distanceOf(route) * 100) / 100,
    route: downsample(route),
    name: name || 'Entrenamiento importado',
    source: 'GPX',
  }
}

function parseTcx(doc: Document): ParsedWorkout {
  const activity = doc.getElementsByTagName('Activity')[0]
  const sportAttr = activity?.getAttribute('Sport') || ''
  const lap = doc.getElementsByTagName('Lap')[0]
  const startAttr = lap?.getAttribute('StartTime') || ''
  const totalSeconds = Number(textOf(lap?.getElementsByTagName('TotalTimeSeconds')[0]))
  const distanceMeters = Number(textOf(lap?.getElementsByTagName('DistanceMeters')[0]))
  const tps = Array.from(doc.getElementsByTagName('Trackpoint'))
  const route: RoutePoint[] = []
  const times: number[] = []
  for (const tp of tps) {
    const pos = tp.getElementsByTagName('Position')[0]
    const lat = Number(textOf(pos?.getElementsByTagName('LatitudeDegrees')[0]))
    const lng = Number(textOf(pos?.getElementsByTagName('LongitudeDegrees')[0]))
    if (Number.isFinite(lat) && Number.isFinite(lng)) route.push({ lat, lng })
    const t = Date.parse(textOf(tp.getElementsByTagName('Time')[0]))
    if (Number.isFinite(t)) times.push(t)
  }
  if (route.length < 2 && !Number.isFinite(distanceMeters)) {
    throw new Error('El archivo TCX no trae ruta GPS ni distancia.')
  }
  const firstTime = Date.parse(startAttr) || times[0]
  const durationMin = Number.isFinite(totalSeconds) && totalSeconds > 0
    ? Math.max(1, Math.round(totalSeconds / 60))
    : times.length >= 2
      ? Math.max(1, Math.round((times[times.length - 1] - times[0]) / 60000))
      : 0
  if (!durationMin) throw new Error('El archivo TCX no trae duración.')
  if (!Number.isFinite(firstTime)) throw new Error('El archivo TCX no trae fecha.')
  return {
    sport: guessSport(sportAttr),
    date: localDateISO(new Date(firstTime)),
    durationMin,
    distanceKm: Number.isFinite(distanceMeters) && distanceMeters > 0
      ? Math.round((distanceMeters / 1000) * 100) / 100
      : Math.round(distanceOf(route) * 100) / 100,
    route: downsample(route),
    name: 'Entrenamiento importado',
    source: 'TCX',
  }
}

/** Lee el texto de un .gpx o .tcx y devuelve el entrenamiento listo
 *  para la vista previa. Lanza Error con mensaje en español si el
 *  archivo no se entiende. */
export function parseWorkoutFile(fileName: string, text: string): ParsedWorkout {
  const lower = fileName.toLowerCase()
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, 'text/xml')
  } catch {
    throw new Error('No se pudo leer el archivo. Revisa que sea un .gpx o .tcx válido.')
  }
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El archivo no es un XML válido. Revisa que sea un .gpx o .tcx sin modificar.')
  }
  if (lower.endsWith('.tcx') || doc.getElementsByTagName('TrainingCenterDatabase').length > 0) {
    return parseTcx(doc)
  }
  if (lower.endsWith('.gpx') || doc.getElementsByTagName('gpx').length > 0) {
    return parseGpx(doc)
  }
  // Sin extensión clara: si trae Trackpoint es TCX, si trae trkpt es GPX.
  if (doc.getElementsByTagName('Trackpoint').length > 0) return parseTcx(doc)
  if (doc.getElementsByTagName('trkpt').length > 0) return parseGpx(doc)
  throw new Error('No reconozco el archivo: sube un .gpx o .tcx de Strava, Garmin o Google Fit.')
}
