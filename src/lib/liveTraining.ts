// Mapa en vivo "Entrenando ahora": presencia efímera con Supabase Realtime.
// - NO escribe en ninguna tabla: la ubicación en vivo solo vive en el
//   canal de Presence ('live-training') mientras el usuario graba con GPS.
//   Al terminar, pausar o cerrar, se quita de inmediato; si el teléfono
//   se queda sin señal o se cierra la app, Presence lo quita solo y el
//   barrido de 60 s limpia lo que quede.
// - Privacidad: opt-in explícito por perfil, por defecto APAGADO
//   (localStorage `pulso_live_optin_<profileId>`). Sin opt-in no se
//   publica nada, aunque se esté grabando.
// - Sin Supabase (modo local / web sin llaves): no se rompe; solo se ve
//   el usuario mismo en su propio mapa, sin otros entrenadores.

import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface LiveTrainer {
  profileId: string
  name: string
  sport: string
  lat: number
  lng: number
  /** ms desde epoch de la última actualización recibida */
  updatedAt: number
}

const CHANNEL_NAME = 'live-training'
/** Sin actualización en este tiempo, el entrenador se quita del mapa. */
export const LIVE_TRAINER_TTL_MS = 60_000
const SWEEP_MS = 10_000
/** Entre publicaciones del mismo teléfono: el GPS da fixes cada 1-5 s,
 *  no hace falta mandar cada uno por la red. */
const PUBLISH_MIN_INTERVAL_MS = 4_000

// ---------------------------------------------------------------- opt-in

const OPTIN_PREFIX = 'pulso_live_optin_'

export function isLiveOptIn(profileId: string): boolean {
  try {
    return localStorage.getItem(OPTIN_PREFIX + profileId) === '1'
  } catch {
    return false
  }
}

export function setLiveOptIn(profileId: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(OPTIN_PREFIX + profileId, '1')
    else localStorage.removeItem(OPTIN_PREFIX + profileId)
  } catch {
    /* sin localStorage: el opt-in no persiste, pero no se rompe */
  }
}

// ------------------------------------------------------- estado compartido

/** Entrenadores activos que se conocen ahora mismo (de Presence o, sin
 *  Supabase, solo el usuario mismo). */
const liveMap = new Map<string, LiveTrainer>()
const listeners = new Set<(trainers: LiveTrainer[]) => void>()

function snapshot(): LiveTrainer[] {
  return [...liveMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

function emit(): void {
  const s = snapshot()
  listeners.forEach((fn) => fn(s))
}

// Barrido de expiración: si un teléfono deja de mandar (pausa, sin
// señal, app cerrada) y Presence no lo quitó, a los 60 s se quita solo.
let sweepTimer: ReturnType<typeof setInterval> | null = null
function ensureSweep(): void {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    const now = Date.now()
    let changed = false
    liveMap.forEach((t, k) => {
      if (now - t.updatedAt > LIVE_TRAINER_TTL_MS) {
        liveMap.delete(k)
        changed = true
      }
    })
    if (changed) emit()
  }, SWEEP_MS)
}
function stopSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer)
    sweepTimer = null
  }
}

// ----------------------------------------------------------------- canal

interface PresencePayload {
  name: string
  sport: string
  lat: number
  lng: number
  updatedAt: number
}

let channel: RealtimeChannel | null = null
let channelKey: string | null = null
let publishing = false

/** Clave anónima y estable para mirar el mapa sin publicar: quien solo
 *  mira no aparece en presenceState con ubicación (el sync ignora las
 *  presencias sin lat/lng), así que nadie lo ve entrenando. */
const VIEWER_KEY = 'pulso_live_viewer_id'
let viewerKeyCache: string | null = null
function viewerKey(): string {
  if (viewerKeyCache) return viewerKeyCache
  try {
    let id = localStorage.getItem(VIEWER_KEY)
    if (!id) {
      id = `view-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
      localStorage.setItem(VIEWER_KEY, id)
    }
    viewerKeyCache = id
    return id
  } catch {
    return `view-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** Reconstruye el mapa de activos desde el estado de Presence. Es la
 *  fuente de verdad en modo Supabase: incluye a quien publica (yo
 *  también) y excluye a los espectadores (sin lat/lng). */
function syncFromPresence(): void {
  if (!channel) return
  const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>
  const now = Date.now()
  const next = new Map<string, LiveTrainer>()
  for (const [key, presences] of Object.entries(state)) {
    const p = (presences?.[0] || {}) as Partial<PresencePayload>
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue
    next.set(key, {
      profileId: key,
      name: typeof p.name === 'string' && p.name ? p.name : 'Alguien',
      sport: typeof p.sport === 'string' ? p.sport : '',
      lat: p.lat,
      lng: p.lng,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now,
    })
  }
  liveMap.clear()
  next.forEach((v, k) => liveMap.set(k, v))
  emit()
}

/** Crea (o reutiliza) el canal con la clave dada. Si la clave cambia
 *  (de espectador a publicador o al revés), se cierra el canal viejo y
 *  se abre uno nuevo: la clave de Presence no se puede cambiar en vivo. */
function ensureChannel(key: string): RealtimeChannel | null {
  if (!supabase) return null
  if (channel && channelKey === key) return channel
  if (channel) {
    void channel.unsubscribe()
    channel = null
    channelKey = null
  }
  const ch = supabase.channel(CHANNEL_NAME, { config: { presence: { key } } })
  ch.on('presence', { event: 'sync' }, syncFromPresence)
  ch.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') syncFromPresence()
  })
  channel = ch
  channelKey = key
  return ch
}

// -------------------------------------------------------------- publicación

let lastPublishAt = 0
let pendingPayload: { profileId: string; name: string; sport: string; lat: number; lng: number } | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null

function doPublish(profileId: string, name: string, sport: string, lat: number, lng: number): void {
  lastPublishAt = Date.now()
  const ch = ensureChannel(profileId)
  if (!ch) return
  // track() antes del SUBSCRIBED se guarda y se manda al unirse al
  // canal; no hace falta esperar a estar suscrito.
  void ch.track({ name, sport, lat, lng, updatedAt: lastPublishAt })
}

/** Publica (o actualiza) mi posición en vivo. Solo la llama quien
 *  graba con GPS y tiene el opt-in prendido (ver LiveTrainingToggle).
 *  Con throttle de 4 s: si llega otra posición antes, se guarda la
 *  última y se manda al vencer el intervalo. */
export function publishLivePosition(profileId: string, name: string, sport: string, lat: number, lng: number): void {
  if (!supabase) {
    // Modo local / sin Supabase: solo yo me veo, sin red, sin romperse.
    liveMap.set(profileId, { profileId, name, sport, lat, lng, updatedAt: Date.now() })
    emit()
    return
  }
  publishing = true
  const now = Date.now()
  if (now - lastPublishAt < PUBLISH_MIN_INTERVAL_MS) {
    pendingPayload = { profileId, name, sport, lat, lng }
    if (!pendingTimer) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null
        const p = pendingPayload
        pendingPayload = null
        if (p) doPublish(p.profileId, p.name, p.sport, p.lat, p.lng)
      }, PUBLISH_MIN_INTERVAL_MS - (now - lastPublishAt))
    }
    return
  }
  doPublish(profileId, name, sport, lat, lng)
}

/** Quita mi presencia en vivo de inmediato (terminar, pausar, apagar
 *  el opt-in, salir de la pantalla). Si alguien sigue mirando el mapa,
 *  el canal se mantiene como espectador para seguir recibiendo. */
export function stopLivePosition(profileId: string): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
    pendingPayload = null
  }
  publishing = false
  if (!supabase) {
    if (liveMap.delete(profileId)) emit()
    return
  }
  if (channel) {
    void channel.untrack()
    if (listeners.size > 0) {
      ensureChannel(viewerKey())
    } else {
      void channel.unsubscribe()
      channel = null
      channelKey = null
    }
  }
  if (liveMap.delete(profileId)) emit()
}

// -------------------------------------------------------------- suscripción

/** Suscribe al mapa de entrenadores activos. Llama a onChange de
 *  inmediato con lo que haya ahora y en cada cambio (entra/sale uno,
 *  se mueve, expira a los 60 s). Devuelve la función para desuscribir.
 *  Sin Supabase solo reporta al usuario mismo cuando publica. */
export function subscribeLiveTrainers(onChange: (trainers: LiveTrainer[]) => void): () => void {
  listeners.add(onChange)
  ensureSweep()
  if (supabase && !publishing) ensureChannel(viewerKey())
  onChange(snapshot())
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0) {
      stopSweep()
      // Sin nadie mirando y sin publicar, se cierra el canal.
      if (channel && !publishing) {
        void channel.unsubscribe()
        channel = null
        channelKey = null
      }
    }
  }
}
