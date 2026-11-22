// Pasos de HOY para la tarjeta de Inicio.
// Cómo se calculan (sin inventar nada):
// 1) Contador del sistema (Android, TYPE_STEP_COUNTER): el sensor
//    da un total acumulado desde el último reinicio. Se guarda en
//    localStorage la base del día (00:00 LOCAL); pasos de hoy =
//    total actual - base de hoy. Si el teléfono se reinició
//    (total < base), se toma una base nueva y se devuelve el total.
// 2) Primera lectura del día (o tras reinicio): los pasos caminados
//    antes de abrir la app se perderían si la base fuera el total
//    actual. Health Connect sí conoce el total del día (00:00 local
//    hasta ahora): se usa como referencia y la base del sistema se
//    ajusta (total - pasos de Health Connect) para que las lecturas
//    siguientes continúen desde ahí sin saltos.
// 3) Si no hay sensor o no hay permiso: Health Connect (pasos de
//    hoy 00:00-ahora, getTodaySteps() de healthConnect.ts).
// 4) Si tampoco hay Health Connect: null y la tarjeta lo dice con
//    honestidad (en web no hay contador de pasos del sistema).
import { getTotalSteps, stepCounterSupported } from './stepCounter'
import { getTodaySteps } from './healthConnect'

const DAY_BASE_KEY = 'pulso_steps_day_base'
export const STEPS_DAILY_GOAL = 10000

export interface TodayStepsResult {
  steps: number | null
  /** 'sistema' = podómetro del teléfono, 'health' = Health Connect. */
  source: 'sistema' | 'health' | 'ninguna'
}

/** Fecha de hoy en hora LOCAL (00:00 local a 00:00 local). Antes
 *  era toISOString() (UTC): en Cancún el día cambiaba a las 19:00
 *  local y la base guardada dejaba de coincidir, así que «Pasos hoy»
 *  se ponía en 0 cada noche. */
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readBase(): { date: string; base: number } | null {
  try {
    const raw = localStorage.getItem(DAY_BASE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { date: string; base: number }
    if (typeof parsed.date !== 'string' || typeof parsed.base !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function saveBase(base: { date: string; base: number }): void {
  try {
    localStorage.setItem(DAY_BASE_KEY, JSON.stringify(base))
  } catch {
    /* sin almacenamiento: se recalcula en la próxima lectura */
  }
}

export async function getTodayStepsUnified(): Promise<TodayStepsResult> {
  // 1) Contador del sistema.
  if (stepCounterSupported()) {
    const total = await getTotalSteps()
    if (total !== null) {
      const today = todayISO()
      let base = readBase()
      if (!base || base.date !== today) {
        // Primera lectura del día: recuperar lo caminado antes de
        // abrir la app con Health Connect (ver punto 2 del
        // encabezado). Si no hay datos, base = total actual.
        const hc = await getTodaySteps()
        if (hc !== null) {
          base = { date: today, base: total - hc }
          saveBase(base)
          return { steps: Math.max(0, hc), source: 'health' }
        }
        base = { date: today, base: total }
        saveBase(base)
      } else if (total < base.base) {
        // El teléfono se reinició: el sensor volvió a 0. Se intenta
        // recuperar el total del día con Health Connect; si no hay,
        // se toma base nueva (los pasos de antes del reinicio no se
        // pueden recuperar del sensor).
        const hc = await getTodaySteps()
        if (hc !== null) {
          base = { date: today, base: total - hc }
          saveBase(base)
          return { steps: Math.max(0, hc), source: 'health' }
        }
        base = { date: today, base: total }
        saveBase(base)
      }
      return { steps: Math.max(0, total - base.base), source: 'sistema' }
    }
  }
  // 2) Health Connect (pasos de hoy, sin base que guardar).
  const hc = await getTodaySteps()
  if (hc !== null) return { steps: hc, source: 'health' }
  // 3) Sin fuente de pasos en este dispositivo/navegador.
  return { steps: null, source: 'ninguna' }
}
