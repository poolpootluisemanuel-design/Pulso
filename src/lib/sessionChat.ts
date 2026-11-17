// Chat dentro de una sesión de PULSO.
// - Con Supabase: los mensajes viven en la tabla session_messages y
//   llegan en vivo por Realtime (postgres_changes); si Realtime falla
//   o no hay red, se hace polling cada 5 s.
// - Sin Supabase (modo local de demostración): los mensajes viven en
//   localStorage, con la misma clave que usa store.ts para sus datos
//   (pulso_local_ + 'session_messages').
// - Solo participantes confirmados (o el anfitrión) pueden enviar.
//   La comprobación usa listRsvps() de store.ts, salvo que quien
//   llama ya tenga la lista y la pase en `opts.participantIds`
//   (así SessionsTab no vuelve a preguntar por los RSVPs que ya cargó).
// Nunca se inventan credenciales aquí: se usa el cliente de supabase.ts.
import { supabase, supabaseConfigured } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { listRsvps, listSessions } from './store'
import { uid } from './utils'

export interface SessionMessage {
  id: string
  session_id: string
  profile_id: string
  author_name: string
  text: string
  created_at: string // ISO
}

export interface SendSessionMessageOptions {
  /** Ids de participantes confirmados, si quien llama ya los tiene. */
  participantIds?: string[]
  /** Id del anfitrión de la sesión (también puede escribir). */
  hostId?: string
}

export const MAX_MESSAGE_LENGTH = 500
const POLL_MS = 5000

// ---------- Espejo local (mismo patrón que store.ts) ----------
// store.ts guarda con el prefijo 'pulso_local_'; aquí la clave completa
// es 'pulso_local_session_messages', como pide el plan.
const LS_KEY = 'pulso_local_session_messages'
const LS_PENDING_KEY = 'pulso_local_session_messages_pending'

function loadLocal(): SessionMessage[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]') as SessionMessage[]
  } catch {
    return []
  }
}
function saveLocal(all: SessionMessage[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch {
    /* sin espacio: se sigue sin espejo */
  }
}
function loadPending(): SessionMessage[] {
  try {
    return JSON.parse(localStorage.getItem(LS_PENDING_KEY) || '[]') as SessionMessage[]
  } catch {
    return []
  }
}
function savePending(all: SessionMessage[]): void {
  try {
    localStorage.setItem(LS_PENDING_KEY, JSON.stringify(all))
  } catch {
    /* noop */
  }
}
function mirrorUpsert(msg: SessionMessage): void {
  const all = loadLocal()
  if (!all.some((m) => m.id === msg.id)) all.push(msg)
  saveLocal(all)
}
function mirrorReplaceSession(sessionId: string, list: SessionMessage[]): void {
  const rest = loadLocal().filter((m) => m.session_id !== sessionId)
  saveLocal([...rest, ...list])
}

// ---------- Utilidades (mismo patrón que store.ts) ----------
function withTimeout<T>(p: PromiseLike<T>, ms = 5000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}
function isNetworkError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return (
    m.includes('timeout') || m.includes('failed to fetch') || m.includes('networkerror') ||
    m.includes('network request failed') || m.includes('load failed') || m.includes('offline')
  )
}

// ---------- Participantes ----------
export async function isConfirmedParticipant(
  sessionId: string,
  profileId: string,
  opts?: SendSessionMessageOptions,
): Promise<boolean> {
  if (opts?.participantIds) {
    return opts.participantIds.includes(profileId) || opts.hostId === profileId
  }
  const rsvps = await listRsvps(sessionId)
  if (rsvps.some((r) => r.profile_id === profileId && r.status === 'confirmed')) return true
  // El anfitrión no tiene fila en rsvps (no se apunta a su propia
  // sesión), así que también puede escribir en el chat.
  try {
    const session = (await listSessions()).find((s) => s.id === sessionId)
    return session?.host_id === profileId
  } catch {
    return false
  }
}

// ---------- Lectura ----------
export async function listSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  if (supabaseConfigured && supabase) {
    // Antes de leer, se intenta subir lo que se escribió sin internet.
    await syncPendingSessionMessages().catch(() => undefined)
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('session_messages')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true }),
      )
      if (error) throw new Error(error.message)
      const list = (data || []) as SessionMessage[]
      // Espejo local: sin internet el chat se lee del teléfono.
      mirrorReplaceSession(sessionId, list)
      return list
    } catch (e) {
      if (isNetworkError(e)) {
        return loadLocal()
          .filter((m) => m.session_id === sessionId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
      }
      throw e
    }
  }
  return loadLocal()
    .filter((m) => m.session_id === sessionId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

// ---------- Envío ----------
export async function sendSessionMessage(
  sessionId: string,
  profileId: string,
  authorName: string,
  text: string,
  opts?: SendSessionMessageOptions,
): Promise<SessionMessage> {
  const clean = text.trim()
  if (!clean) throw new Error('Escribe un mensaje antes de enviar.')
  if (clean.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`El mensaje no puede pasar de ${MAX_MESSAGE_LENGTH} caracteres.`)
  }
  const allowed = await isConfirmedParticipant(sessionId, profileId, opts)
  if (!allowed) {
    throw new Error('Solo los participantes confirmados de la sesión pueden escribir en el chat. Apúntate primero.')
  }
  const msg: SessionMessage = {
    id: uid(),
    session_id: sessionId,
    profile_id: profileId,
    author_name: authorName.trim() || 'Sin nombre',
    text: clean,
    created_at: new Date().toISOString(),
  }
  if (supabaseConfigured && supabase) {
    try {
      const { error } = await withTimeout(supabase.from('session_messages').insert(msg))
      if (error) throw new Error(error.message)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      // Sin internet: queda en el espejo local y en la cola de
      // pendientes (mismo patrón outbox de store.ts) para subirlo
      // cuando vuelva la red, con el mismo id para no duplicarlo.
      mirrorUpsert(msg)
      const pending = loadPending()
      if (!pending.some((m) => m.id === msg.id)) pending.push(msg)
      savePending(pending)
      return msg
    }
    mirrorUpsert(msg)
    return msg
  }
  mirrorUpsert(msg)
  return msg
}

// Sube a Supabase los mensajes escritos sin internet. Se llama antes
// de cada lectura y no lanza: si sigue sin red, quedan en la cola.
export async function syncPendingSessionMessages(): Promise<number> {
  if (!supabaseConfigured || !supabase) return 0
  if (!navigator.onLine) return loadPending().length
  const pending = loadPending()
  if (!pending.length) return 0
  const remaining: SessionMessage[] = []
  for (const msg of pending) {
    try {
      const { error } = await supabase.from('session_messages').upsert(msg, { onConflict: 'id' })
      if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error
    } catch {
      remaining.push(msg)
    }
  }
  savePending(remaining)
  return remaining.length
}

// ---------- En vivo: Realtime con fallback a polling ----------
export function subscribeSessionMessages(
  sessionId: string,
  onMessage: (msg: SessionMessage) => void,
): () => void {
  const seen = new Set<string>()
  let cancelled = false
  let polling: ReturnType<typeof setInterval> | null = null
  let channel: RealtimeChannel | null = null

  function startPolling(): void {
    if (polling || cancelled) return
    polling = setInterval(() => {
      void listSessionMessages(sessionId)
        .then((list) => {
          if (cancelled) return
          for (const m of list) {
            if (!seen.has(m.id)) {
              seen.add(m.id)
              onMessage(m)
            }
          }
        })
        .catch(() => undefined)
    }, POLL_MS)
  }

  void listSessionMessages(sessionId)
    .then((initial) => {
      if (cancelled) return
      for (const m of initial) seen.add(m.id)
      if (!supabaseConfigured || !supabase) {
        // Modo local: no hay Realtime, solo polling cada 5 s.
        startPolling()
        return
      }
      channel = supabase
        .channel(`session-chat-${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'session_messages',
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            const m = payload.new as SessionMessage
            if (!m || seen.has(m.id)) return
            seen.add(m.id)
            onMessage(m)
          },
        )
        .subscribe((status) => {
          // Si Realtime no se suscribe (error, timeout o cierre),
          // se pasa a polling cada 5 s. Los duplicados no llegan
          // dos veces gracias al Set `seen`.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            startPolling()
          }
        })
    })
    .catch(() => {
      // Si ni la carga inicial funciona, el polling lo reintenta.
      startPolling()
    })

  return () => {
    cancelled = true
    if (polling) clearInterval(polling)
    if (channel && supabase) void supabase.removeChannel(channel)
  }
}
