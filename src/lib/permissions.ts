// Permisos de la app nativa de Android, todos juntos en un solo flujo.
// Android NO permite pedir varios permisos en un único diálogo del
// sistema: cada permiso abre su propio diálogo. Este módulo los pide EN
// SECUENCIA dentro del mismo flujo (PermissionsFlow.tsx), con una
// explicación corta por permiso y un botón "Permitir todo".
// - Ubicación: @capacitor/geolocation (primer plano). El "Permitir todo
//   el tiempo" (segundo plano, para grabar con pantalla apagada) NO se
//   puede pedir con diálogo en Android 10+: solo se concede desde
//   Ajustes, así que el flujo abre Ajustes con openLocationSettings().
//   Tampoco se puede COMPROBAR desde el código: el flujo lo deja como
//   "revisar en Ajustes", no como un estado falso.
// - Actividad física y Notificaciones: plugin propio PulsoPermissions
//   (android/.../PulsoPermissionsPlugin.java), sin dependencias nuevas.
// - Música y audio: plugin propio DeviceMusic (ya existía).
// - Salud / Health Connect: @capgo/capacitor-health (ya existía);
//   su permiso se concede en la pantalla del sistema de Health Connect.
// - En WEB todo devuelve false/desconocido y el flujo ni se muestra:
//   el navegador solo permite ubicación y notificaciones, y cada uno
//   se pide cuando se usa (GPS en Entrenar, etc.).
import { registerPlugin } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'
import { isAndroid, isNative } from './native'
import { hasDeviceMusicPermission, requestDeviceMusicPermission } from './deviceMusic'
import { healthAvailable, openHealthConnectSettings, requestStepsAccess } from './healthConnect'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

interface PulsoPermissionsPlugin {
  checkAll(): Promise<{ notifications: boolean; activity: boolean }>
  requestNotifications(): Promise<{ granted: boolean }>
  requestActivity(): Promise<{ granted: boolean }>
  openSettings(): Promise<void>
}

const PulsoPermissions = registerPlugin<PulsoPermissionsPlugin>('PulsoPermissions')

/** true solo en la app nativa de Android (en web, false). */
export function permissionsSupported(): boolean {
  return isNative() && isAndroid()
}

export type LocationState = 'granted' | 'denied' | 'prompt' | 'unknown'

export interface PermissionStates {
  location: LocationState
  activity: boolean
  notifications: boolean
  music: boolean
  /** Health Connect: null = aún no se ha pedido en este flujo. */
  health: boolean | null
  healthAvailable: boolean
}

/** Estado actual de cada permiso, sin mostrar ningún diálogo. */
export async function checkPermissionStates(): Promise<PermissionStates> {
  const base: PermissionStates = {
    location: 'unknown',
    activity: false,
    notifications: false,
    music: false,
    health: null,
    healthAvailable: false,
  }
  if (!permissionsSupported()) return base
  try {
    const loc = await Geolocation.checkPermissions()
    // Capacitor puede devolver 'prompt-with-rationale' (Android): es
    // lo mismo que 'prompt' para el flujo (aún no se ha pedido).
    base.location = loc.location === 'granted' || loc.location === 'denied' ? loc.location : 'prompt'
  } catch {
    base.location = 'unknown'
  }
  try {
    const all = await PulsoPermissions.checkAll()
    base.activity = !!all.activity
    base.notifications = !!all.notifications
  } catch {
    /* sin plugin: se quedan en false */
  }
  try {
    base.music = await hasDeviceMusicPermission()
  } catch {
    base.music = false
  }
  try {
    base.healthAvailable = (await healthAvailable()).available
  } catch {
    base.healthAvailable = false
  }
  return base
}

/** Pide la ubicación en primer plano (diálogo del sistema). */
export async function requestLocation(): Promise<boolean> {
  if (!permissionsSupported()) return false
  try {
    const r = await Geolocation.requestPermissions()
    return r.location === 'granted'
  } catch {
    return false
  }
}

/** Abre Ajustes de PULSO: ahí se elige "Permitir todo el tiempo". */
export async function openLocationSettings(): Promise<void> {
  if (!permissionsSupported()) return
  try {
    await BackgroundGeolocation.openSettings()
  } catch {
    try {
      await PulsoPermissions.openSettings()
    } catch {
      /* sin ajustes disponibles */
    }
  }
}

/** Pide Actividad física (pasos) con el diálogo del sistema. */
export async function requestActivity(): Promise<boolean> {
  if (!permissionsSupported()) return false
  try {
    return (await PulsoPermissions.requestActivity()).granted
  } catch {
    return false
  }
}

/** Pide Notificaciones con el diálogo del sistema. */
export async function requestNotifications(): Promise<boolean> {
  if (!permissionsSupported()) return false
  try {
    return (await PulsoPermissions.requestNotifications()).granted
  } catch {
    return false
  }
}

/** Pide Música y audio con el diálogo del sistema. */
export async function requestMusic(): Promise<boolean> {
  if (!permissionsSupported()) return false
  return requestDeviceMusicPermission()
}

/** Pide Salud / Health Connect (pasos del día). */
export async function requestHealth(): Promise<boolean> {
  if (!permissionsSupported()) return false
  return requestStepsAccess()
}

/** Abre los ajustes de Health Connect (instalarlo o dar permisos). */
export async function openHealthSettings(): Promise<void> {
  await openHealthConnectSettings()
}

/** Abre Ajustes de PULSO (para permisos ya negados). */
export async function openAppSettings(): Promise<void> {
  if (!permissionsSupported()) return
  try {
    await PulsoPermissions.openSettings()
  } catch {
    /* sin ajustes disponibles */
  }
}

// El flujo solo sale solo la primera vez: al cerrarlo (completo o
// saltado) queda marcado y se reabre solo desde Perfil → "Dar todos
// los permisos". Así no molesta cada vez que se abre la app.
const FLOW_KEY = 'pulso_permissions_done_v1'

export function hasSeenPermissionsFlow(): boolean {
  try {
    return localStorage.getItem(FLOW_KEY) === '1'
  } catch {
    return true
  }
}

export function markPermissionsFlowSeen(): void {
  try {
    localStorage.setItem(FLOW_KEY, '1')
  } catch {
    /* noop */
  }
}
