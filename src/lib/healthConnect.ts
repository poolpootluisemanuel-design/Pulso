// Health Connect (Android) para la app nativa, con @capgo/capacitor-health.
// Qué es: Health Connect es donde Android junta los pasos y entrenamientos
// de Samsung Health, Google Fit y otras apps. PULSO lo lee (solo lectura)
// para mostrar los pasos de hoy y, más adelante, importar entrenamientos.
// - Solo funciona en la app nativa de Android. En web, isAvailable()
//   devuelve available:false y estas funciones devuelven null/false.
//   Las sesiones de ejercicio del reloj se importan aparte, en
//   src/lib/watchImport.ts (queryWorkouts) con la UI en
//   src/components/ImportWatch.tsx.
// - Android 14+ trae Health Connect instalado; en Android 13 o menos el
//   usuario debe instalar "Health Connect by Android" desde Play Store
//   (openHealthConnectSettings() lo abre).
// - Los permisos se piden con requestAuthorization(): el usuario elige
//   en la pantalla del sistema qué datos comparte (pasos, distancia,
//   entrenamientos). Sin permiso, todo devuelve null, sin romper la app.
// - Samsung Health no tiene API web: la única forma de leer sus pasos es
//   que el usuario active en Samsung Health "Sincronizar con Health
//   Connect". Eso se le explica en la pantalla, no se puede forzar.
import { Health } from '@capgo/capacitor-health'

export interface HealthAvailability {
  available: boolean
  reason: string | null
}

/** ¿Hay Health Connect en este teléfono? (false en web). */
export async function healthAvailable(): Promise<HealthAvailability> {
  try {
    const r = await Health.isAvailable()
    return { available: r.available, reason: r.reason ?? null }
  } catch {
    return { available: false, reason: 'Health Connect no está disponible en este dispositivo.' }
  }
}

/** Pide permiso para leer pasos, distancia y entrenamientos. */
export async function requestStepsAccess(): Promise<boolean> {
  try {
    const s = await Health.requestAuthorization({
      read: ['steps', 'distance', 'workouts'],
    })
    return s.readAuthorized.includes('steps')
  } catch {
    return false
  }
}

/** Pasos de hoy (de 00:00 hasta ahora), sumados con queryAggregated.
 *  Devuelve null cuando no hay datos (sin muestras, sin permiso o
 *  error): un 0 en ese caso sería engañoso — la tarjeta y GpsTracker
 *  ya tratan null como «sin datos» y caen a otro camino. */
export async function getTodaySteps(): Promise<number | null> {
  try {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const { samples } = await Health.queryAggregated({
      dataType: 'steps',
      startDate: start.toISOString(),
      endDate: new Date().toISOString(),
      bucket: 'day',
      aggregation: 'sum',
    })
    const v = samples[0]?.value
    return typeof v === 'number' ? Math.round(v) : null
  } catch {
    return null
  }
}

/** Abre los ajustes de Health Connect (para instalarlo o dar permisos). */
export async function openHealthConnectSettings(): Promise<void> {
  try {
    await Health.openHealthConnectSettings()
  } catch {
    /* sin ajustes disponibles en este dispositivo */
  }
}
