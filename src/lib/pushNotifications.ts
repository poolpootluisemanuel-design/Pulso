// Notificaciones push nativas de PULSO (Android, Firebase Cloud Messaging).
// Base SOLO: el registro del token FCM y los avisos dentro de la app.
// Sin google-services.json (Firebase) el registro NO funciona: el
// plugin devuelve error y todo esto devuelve null con mensaje, sin
// romper la app. Ver docs-push-firebase.md para activar el push real.
// - En WEB (Chrome / PWA) no hay push nativo: todo devuelve null.
// - El permiso de notificaciones YA lo pide el flujo PermissionsFlow
//   (src/lib/permissions.ts → PulsoPermissions). Este módulo NO lo
//   vuelve a pedir salvo que se llame a requestPushPermission().
// - El token se guarda en localStorage (clave pulso_push_token_<id>)
//   y, si hay Supabase, en la tabla push_tokens (ver
//   supabase/migration_push_tokens.sql). Sin Supabase solo queda local.
// - Las notificaciones que llegan con la app ABIERTA no suenan solas:
//   onPushReceived() avisa al código de la app para mostrar un aviso
//   local (toast/banner). Con la app cerrada/en segundo plano, FCM
//   muestra la notificación del sistema solo (lo hace Android, no la app).
import { PushNotifications } from '@capacitor/push-notifications'
import type { ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications'
import { isAndroid, isNative } from './native'
import { supabase, supabaseConfigured } from './supabase'

/** true solo en la app nativa de Android (donde hay FCM). */
export function isPushSupported(): boolean {
  return isNative() && isAndroid()
}

export interface PushResult {
  token: string | null
  error: string | null
}

/** Pide el permiso de notificaciones con el diálogo del sistema. */
export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const r = await PushNotifications.requestPermissions()
    return r.receive === 'granted'
  } catch {
    return false
  }
}

/** Estado del permiso sin mostrar ningún diálogo. */
export async function checkPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const r = await PushNotifications.checkPermissions()
    return r.receive === 'granted'
  } catch {
    return false
  }
}

const REGISTER_TIMEOUT_MS = 30_000

/**
 * Registra el teléfono en FCM y devuelve el token.
 * - Pide el permiso si aún no está concedido (si se niega, devuelve
 *   null con mensaje, sin error).
 * - Requiere google-services.json en android/app/ (Firebase). Sin él,
 *   el registro falla con error legible y la app sigue igual.
 */
export async function registerPush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { token: null, error: 'Push solo disponible en la app nativa de Android.' }
  }
  try {
    const perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') {
      const asked = await PushNotifications.requestPermissions()
      if (asked.receive !== 'granted') {
        return { token: null, error: 'Permiso de notificaciones no concedido.' }
      }
    }
  } catch {
    return { token: null, error: 'No se pudo comprobar el permiso de notificaciones.' }
  }

  return new Promise<PushResult>((resolve) => {
    let done = false
    const finish = (r: PushResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      void PushNotifications.removeAllListeners()
      resolve(r)
    }
    const timer = setTimeout(
      () => finish({ token: null, error: 'Tiempo agotado esperando el token de Firebase. Revisa google-services.json y la conexión.' }),
      REGISTER_TIMEOUT_MS,
    )
    void PushNotifications.addListener('registration', (t) => {
      finish(t.value ? { token: t.value, error: null } : { token: null, error: 'Firebase no devolvió token.' })
    })
    void PushNotifications.addListener('registrationError', (e) => {
      finish({ token: null, error: `No se pudo registrar en Firebase: ${e.error}` })
    })
    void PushNotifications.register().catch((err: unknown) => {
      finish({ token: null, error: `No se pudo registrar en Firebase: ${err instanceof Error ? err.message : String(err)}` })
    })
  })
}

/** Aviso cuando llega una push con la app ABIERTA (para mostrar toast/banner). */
export function onPushReceived(cb: (n: PushNotificationSchema) => void): () => void {
  if (!isPushSupported()) return () => undefined
  let handle: { remove: () => Promise<void> } | null = null
  void PushNotifications.addListener('pushNotificationReceived', cb).then((h) => { handle = h })
  return () => { void handle?.remove() }
}

/** Aviso cuando el usuario TOCA una push (app en segundo plano o cerrada). */
export function onPushActionPerformed(cb: (n: ActionPerformed) => void): () => void {
  if (!isPushSupported()) return () => undefined
  let handle: { remove: () => Promise<void> } | null = null
  void PushNotifications.addListener('pushNotificationActionPerformed', cb).then((h) => { handle = h })
  return () => { void handle?.remove() }
}

export function pushTokenKey(profileId: string): string {
  return `pulso_push_token_${profileId}`
}

/** Token guardado localmente para este perfil (o null). */
export function getStoredPushToken(profileId: string): string | null {
  try {
    return localStorage.getItem(pushTokenKey(profileId))
  } catch {
    return null
  }
}

export interface SaveTokenResult {
  savedLocal: boolean
  savedRemote: boolean
  error: string | null
}

/**
 * Guarda el token FCM: siempre en localStorage y, si hay Supabase y
 * existe la tabla push_tokens, también en la nube (upsert por
 * profile_id). Si la tabla no existe aún, el token local queda guardado
 * y savedRemote es false con el error de Supabase.
 */
export async function savePushToken(profileId: string, token: string): Promise<SaveTokenResult> {
  let savedLocal = false
  try {
    localStorage.setItem(pushTokenKey(profileId), token)
    savedLocal = true
  } catch {
    savedLocal = false
  }
  if (!supabaseConfigured || !supabase) {
    return { savedLocal, savedRemote: false, error: savedLocal ? null : 'No se pudo guardar el token en el teléfono.' }
  }
  const { error } = await supabase.from('push_tokens').upsert({
    profile_id: profileId,
    token,
    platform: 'android',
    updated_at: new Date().toISOString(),
  })
  if (error) {
    return { savedLocal, savedRemote: false, error: `Token guardado solo en el teléfono: ${error.message}` }
  }
  return { savedLocal, savedRemote: true, error: null }
}

/**
 * Flujo completo en una llamada: registra el token FCM, lo guarda
 * (local + Supabase) y deja los avisos de push listos.
 * Pensado para llamarse UNA vez tras el login (con el profileId del
 * usuario) o tras conceder Notificaciones en PermissionsFlow.
 * No rompe nada si el push no está listo: devuelve el error legible.
 */
export async function setupPushNotifications(
  profileId: string,
  callbacks?: {
    onReceived?: (n: PushNotificationSchema) => void
    onAction?: (n: ActionPerformed) => void
  },
): Promise<PushResult & { savedRemote: boolean }> {
  const reg = await registerPush()
  if (callbacks?.onReceived) onPushReceived(callbacks.onReceived)
  if (callbacks?.onAction) onPushActionPerformed(callbacks.onAction)
  if (!reg.token) return { ...reg, savedRemote: false }
  const saved = await savePushToken(profileId, reg.token)
  return { token: reg.token, error: saved.error, savedRemote: saved.savedRemote }
}
