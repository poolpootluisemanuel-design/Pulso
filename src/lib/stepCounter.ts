// Contador de pasos REAL del sistema (Android), puente TS del plugin
// nativo StepCounter (android/app/src/main/java/com/pulso/app/
// StepCounterPlugin.java, sensor TYPE_STEP_COUNTER).
// - Preciso: es el podómetro del hardware, no la estimación por picos
//   de aceleración (DeviceMotion). Sigue contando con la pantalla
//   apagada; al volver, getStepCount() lee el total acumulado y el
//   delta de la grabación sale correcto.
// - Uso: startStepCounting() al iniciar/reanudar la grabación (guarda
//   la base), getStepCount() para leer el delta, stopStepCounting()
//   al pausar/terminar. Todo devuelve valores seguros (false/null/0)
//   en web o si el teléfono no tiene el sensor: quien llama cae al
//   siguiente método (Health Connect y luego estimación).
import { registerPlugin } from '@capacitor/core'
import { isAndroid, isNative } from './native'

interface StepCounterPlugin {
  isAvailable(): Promise<{ available: boolean; granted: boolean }>
  hasPermission(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  startCounting(): Promise<{ started: boolean }>
  getSteps(): Promise<{ steps: number; available: boolean; counting: boolean }>
  /** Total crudo del sensor (desde el último reinicio del teléfono). */
  getTotalSteps(): Promise<{ total: number; available: boolean }>
  stopCounting(): Promise<{ steps: number }>
}

const StepCounter = registerPlugin<StepCounterPlugin>('StepCounter')

/** true solo dentro de la app nativa de Android (en web, false). */
export function stepCounterSupported(): boolean {
  return isNative() && isAndroid()
}

/** ¿Este teléfono tiene contador de pasos del sistema? (false en web). */
export async function stepCounterAvailable(): Promise<boolean> {
  if (!stepCounterSupported()) return false
  try {
    return (await StepCounter.isAvailable()).available
  } catch {
    return false
  }
}

/** ¿Ya está dado el permiso de Actividad física? (false en web). */
export async function hasStepPermission(): Promise<boolean> {
  if (!stepCounterSupported()) return false
  try {
    return (await StepCounter.hasPermission()).granted
  } catch {
    return false
  }
}

/** Muestra el diálogo del sistema para el permiso de Actividad física. */
export async function requestStepPermission(): Promise<boolean> {
  if (!stepCounterSupported()) return false
  try {
    return (await StepCounter.requestPermission()).granted
  } catch {
    return false
  }
}

/** Arranca el conteo de esta grabación (guarda la base). false si no se pudo. */
export async function startStepCounting(): Promise<boolean> {
  if (!stepCounterSupported()) return false
  try {
    return (await StepCounter.startCounting()).started
  } catch {
    return false
  }
}

/** Pasos desde que se llamó a startStepCounting(). null si no se pudo leer. */
export async function getStepCount(): Promise<number | null> {
  if (!stepCounterSupported()) return null
  try {
    return (await StepCounter.getSteps()).steps
  } catch {
    return null
  }
}

/** Para el conteo y devuelve los pasos de esta sesión. */
export async function stopStepCounting(): Promise<number> {
  if (!stepCounterSupported()) return 0
  try {
    return (await StepCounter.stopCounting()).steps
  } catch {
    return 0
  }
}

/** Total crudo del sensor (pasos desde el último reinicio del
 *  teléfono). null si no hay sensor, no hay permiso o todavía no
 *  llegó ningún evento del sensor. No toca la base de la grabación
 *  en curso: solo lee el total. */
export async function getTotalSteps(): Promise<number | null> {
  if (!stepCounterSupported()) return null
  try {
    const r = await StepCounter.getTotalSteps()
    return r.total >= 0 ? r.total : null
  } catch {
    return null
  }
}
