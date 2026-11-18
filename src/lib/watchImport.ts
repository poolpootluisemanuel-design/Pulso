// Importar entrenamientos grabados en el reloj (Samsung Watch, Garmin...)
// a través de Health Connect, con @capgo/capacitor-health v8.13.0.
// Cómo funciona: el reloj guarda el entrenamiento en su app (Samsung
// Health, Garmin Connect...), esa app lo sincroniza al teléfono, y
// Health Connect lo junta. PULSO lo lee con queryWorkouts() (solo
// lectura) — no hay conexión directa con el reloj ni Bluetooth.
// - Solo funciona en la app nativa de Android. En web, Health.isAvailable()
//   devuelve available:false y estas funciones devuelven [] / false.
// - queryWorkouts devuelve por sesión: tipo, inicio, fin, duración en
//   segundos, distancia total en metros (si la app que grabó la dio) y
//   calorías. NO trae la ruta GPS ni la frecuencia cardíaca: Health
//   Connect no expone la ruta de la sesión en este plugin, así que el
//   entrenamiento importado entra sin ruta dibujada.
// - Samsung Health sincroniza solo a Health Connect si está activado en
//   Samsung Health → Ajustes → "Sincronizar con Health Connect".
// - Garmin: en Garmin Connect → Ajustes → "Health Connect" hay que
//   activar la sincronización; si no, las sesiones no aparecen aquí.
// - Sin el permiso READ_HEALTH_DATA_HISTORY, Health Connect solo deja
//   leer ~los últimos 30 días. Se pide junto con el permiso de
//   entrenamientos; en teléfonos viejos se ignora sin romper nada.
import { Health } from '@capgo/capacitor-health'
import type { Workout as HealthWorkout, WorkoutType } from '@capgo/capacitor-health'
import type { Workout } from './types'
import { healthAvailable } from './healthConnect'

export interface WatchSession {
  /** Id único de Health Connect (para no importar dos veces la misma). */
  key: string
  sport: string // deporte de PULSO
  date: string // YYYY-MM-DD (día local del usuario)
  startAt: string // ISO 8601, inicio de la sesión
  durationMin: number
  distanceKm?: number
  calories?: number
  /** App que grabó la sesión: 'Samsung Health', 'Garmin Connect'... */
  sourceName: string
  /** Tipo original de Health Connect, por si el usuario lo ve. */
  rawType: string
  /** ¿Ya existe en el historial? (mismo criterio que el importador GPX). */
  duplicate: boolean
}

/** Tipos de Health Connect que sabemos mapear a un deporte de PULSO.
 *  Los demás (fútbol, tenis, esquí...) no se importan y se cuentan
 *  en skippedOther, para no guardar un deporte inventado. */
const SPORT_BY_WORKOUT_TYPE: Record<string, string> = {
  running: 'Running',
  runningTreadmill: 'Running',
  trackAndField: 'Running',
  walking: 'Caminata',
  hiking: 'Caminata',
  cycling: 'Ciclismo',
  bikingStationary: 'Ciclismo',
  handCycling: 'Ciclismo',
  swimming: 'Natación',
  swimmingPool: 'Natación',
  swimmingOpenWater: 'Natación',
  strengthTraining: 'Gym',
  traditionalStrengthTraining: 'Gym',
  weightlifting: 'Gym',
  functionalStrengthTraining: 'Gym',
  calisthenics: 'Gym',
  yoga: 'Yoga',
  pilates: 'Yoga',
  taiChi: 'Yoga',
  stretching: 'Yoga',
  flexibility: 'Yoga',
  crossTraining: 'CrossFit',
  highIntensityIntervalTraining: 'CrossFit',
  bootCamp: 'CrossFit',
  mixedCardio: 'CrossFit',
  surfing: 'Surf',
  surfingSports: 'Surf',
}

function localDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Pide permiso para leer entrenamientos (y pasos/distancia, igual que
 *  el contador de pasos). Devuelve true si 'workouts' quedó autorizado. */
export async function requestWorkoutsAccess(): Promise<boolean> {
  try {
    const s = await Health.requestAuthorization({
      read: ['steps', 'distance', 'workouts'],
      requestHistoryAccess: true,
    })
    return s.readAuthorized.includes('workouts')
  } catch {
    return false
  }
}

/** ¿Este entrenamiento del reloj ya está en el historial de PULSO?
 *  Mismo criterio que el importador GPX: misma fecha, duración casi
 *  igual (≤ 2 min) y, si ambos traen distancia, distancia casi igual
 *  (< 0.05 km). Sin distancia (gym, yoga...), pide además mismo deporte. */
export function isDuplicateWatchSession(
  s: Pick<WatchSession, 'date' | 'durationMin' | 'distanceKm' | 'sport'>,
  existing: Workout[],
): boolean {
  return existing.some((w) => {
    if (w.date !== s.date) return false
    if (Math.abs(w.duration_min - s.durationMin) > 2) return false
    if (s.distanceKm !== undefined && w.distance_km !== undefined) {
      return Math.abs(w.distance_km - s.distanceKm) < 0.05
    }
    if (s.distanceKm === undefined && w.distance_km === undefined) {
      return w.sport === s.sport
    }
    return false
  })
}

/** Lee las sesiones de ejercicio de Health Connect de los últimos
 *  `days` días (por defecto 30) y las mapea a sesiones de PULSO.
 *  Lanza Error con mensaje en español si Health Connect no está
 *  disponible; el permiso se pide aparte con requestWorkoutsAccess(). */
export async function fetchWatchSessions(
  existing: Workout[],
  days = 30,
): Promise<{ sessions: WatchSession[]; skippedOther: number }> {
  const avail = await healthAvailable()
  if (!avail.available) {
    throw new Error('Health Connect no está disponible en este teléfono.')
  }
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const { workouts } = await Health.queryWorkouts({
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    limit: 100,
    ascending: false,
  })
  const seen = new Set<string>()
  const sessions: WatchSession[] = []
  let skippedOther = 0
  for (const w of workouts as HealthWorkout[]) {
    const sport = SPORT_BY_WORKOUT_TYPE[w.workoutType as WorkoutType]
    if (!sport) {
      skippedOther++
      continue
    }
    const durationMin = Math.max(1, Math.round(w.duration / 60))
    // Sesiones de menos de 1 minuto suelen ser registros basura.
    if (w.duration < 60) continue
    // Health Connect puede devolver la misma sesión dos veces (reloj +
    // teléfono grabando a la vez): se queda la primera.
    const key = w.platformId || `${w.startDate}|${w.workoutType}|${w.duration}`
    if (seen.has(key)) continue
    seen.add(key)
    const distanceKm =
      typeof w.totalDistance === 'number' && w.totalDistance > 0
        ? Math.round((w.totalDistance / 1000) * 100) / 100
        : undefined
    const session: WatchSession = {
      key,
      sport,
      date: localDateISO(new Date(w.startDate)),
      startAt: w.startDate,
      durationMin,
      distanceKm,
      calories:
        typeof w.totalEnergyBurned === 'number' && w.totalEnergyBurned > 0
          ? Math.round(w.totalEnergyBurned)
          : undefined,
      sourceName: w.sourceName || 'Reloj',
      rawType: w.workoutType,
      duplicate: false,
    }
    session.duplicate = isDuplicateWatchSession(session, existing)
    // Dos registros distintos del mismo entrenamiento (Samsung Health y
    // Garmin a la vez): misma fecha, distancia y duración → uno solo.
    if (
      sessions.some(
        (s) =>
          s.date === session.date &&
          s.durationMin === session.durationMin &&
          s.distanceKm === session.distanceKm &&
          s.sport === session.sport,
      )
    ) {
      continue
    }
    sessions.push(session)
  }
  return { sessions, skippedOther }
}

/** Convierte una sesión del reloj en un entrenamiento de PULSO.
 *  Queda marcado como origen "reloj" en las notas; sin ruta GPS. */
export function watchSessionToWorkout(
  s: WatchSession,
  profileId: string,
): Omit<Workout, 'id'> {
  return {
    profile_id: profileId,
    sport: s.sport,
    date: s.date,
    duration_min: s.durationMin,
    distance_km: s.distanceKm,
    notes: `⌚ Del reloj · ${s.sourceName}${s.calories ? ` · ${s.calories} kcal` : ''}`,
  }
}
