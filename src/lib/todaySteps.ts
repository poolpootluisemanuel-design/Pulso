// Pasos de HOY para la tarjeta de Inicio.
// Cómo se calculan (sin inventar nada):
// 1) Contador del sistema (Android, TYPE_STEP_COUNTER): el sensor
//    da un total acumulado desde el último reinicio. Se guarda en
//    localStorage la base de hoy a las 00:00; pasos de hoy = total
//    actual - base de hoy. Si el teléfono se reinició (total < base),
//    se toma una base nueva y se devuelve el total.
// 2) Si no hay sensor o no hay permiso: Health Connect (pasos de
//    hoy 00:00-ahora, getTodaySteps() de healthConnect.ts).
// 3) Si tampoco hay Health Connect: null y la tarjeta lo dice con
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
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
        base = { date: today, base: total }
        saveBase(base)
      } else if (total < base.base) {
        // El teléfono se reinició: el sensor volvió a 0.
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
