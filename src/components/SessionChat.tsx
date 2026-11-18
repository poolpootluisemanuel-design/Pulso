// Chat dentro de una sesión de PULSO.
// Solo lo ven/escriben quienes participan en la sesión: quien no es
// participante ve los mensajes pero no puede escribir (aviso abajo).
// Los mensajes llegan en vivo por Realtime (ver sessionChat.ts); si
// Realtime falla, el polling cada 5 s los trae igual.
import { useEffect, useRef, useState } from 'react'
import type { SessionMessage } from '../lib/sessionChat'
import { deleteSessionMessage, listSessionMessages, sendSessionMessage, subscribeSessionMessages } from '../lib/sessionChat'
import { Btn, Empty, inputCls } from './ui'

function formatHour(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function SessionChat({
  sessionId,
  sessionTitle,
  profileId,
  profileName,
  isParticipant,
  isAdmin = false,
  onClose,
}: {
  sessionId: string
  sessionTitle: string
  profileId: string
  profileName: string
  isParticipant: boolean
  /** El admin también puede borrar mensajes de otros (moderación). */
  isAdmin?: boolean
  /** Cerrar la hoja del chat. */
  onClose?: () => void
}) {
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setErr('')
    setMessages([])
    void listSessionMessages(sessionId)
      .then((list) => {
        if (alive) setMessages(list)
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : 'No se pudo cargar el chat.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    // En vivo: Realtime, con polling cada 5 s si Realtime falla.
    // Se evita duplicar: si el id ya está en la lista, no se agrega.
    const unsubscribe = subscribeSessionMessages(sessionId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [sessionId])

  // Baja sola al último mensaje cuando llega uno nuevo.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!isParticipant || sending || !draft.trim()) return
    setErr('')
    setSending(true)
    try {
      const msg = await sendSessionMessage(sessionId, profileId, profileName, draft)
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setDraft('')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo enviar el mensaje.')
    } finally {
      setSending(false)
    }
  }

  // Borrar un mensaje: solo su autor o el admin. Con confirmación
  // de un toque (primero "¿Borrar?" y luego "Sí, borrar").
  async function removeMessage(id: string) {
    setErr('')
    setConfirmDeleteId(null)
    try {
      await deleteSessionMessage(id)
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo borrar el mensaje.')
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-md shadow-night/5">
      {/* Cabecera azul noche PULSO */}
      <div className="flex items-start justify-between gap-2 bg-night px-4 py-3">
        <div className="min-w-0">
          <p className="font-bold text-white">💬 Chat de la sesión</p>
          <p className="truncate text-xs text-white/70">{sessionTitle}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar chat" className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-sm font-bold text-white">
            ✕
          </button>
        )}
      </div>

      {/* Lista de mensajes */}
      <div className="max-h-80 space-y-2 overflow-y-auto bg-night-50 p-3">
        {loading && <p className="py-6 text-center text-sm text-slate-500">Cargando mensajes…</p>}
        {!loading && messages.length === 0 && (
          <Empty text="Aún no hay mensajes en esta sesión. ¡Sé el primero en saludar! 👋" />
        )}
        {messages.map((m) => {
          const mine = m.profile_id === profileId
          const canDelete = mine || isAdmin
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'rounded-br-sm bg-pulso text-night' : 'rounded-bl-sm bg-white text-slate-800 shadow-sm'}`}>
                <p className={`text-xs font-bold ${mine ? 'text-white/85' : 'text-teal-dark'}`}>
                  {mine ? 'Tú' : m.author_name}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
                <p className={`text-right text-[11px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                  {formatHour(m.created_at)}
                </p>
                {canDelete && (
                  <p className="mt-1 text-right">
                    {confirmDeleteId === m.id ? (
                      <span className="flex justify-end gap-2">
                        <button type="button" className="text-[11px] font-bold text-red-600 underline" onClick={() => void removeMessage(m.id)}>Sí, borrar</button>
                        <button type="button" className="text-[11px] text-slate-500 underline" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                      </span>
                    ) : (
                      <button type="button" className={`text-[11px] underline ${mine ? 'text-white/70' : 'text-slate-400'}`} onClick={() => setConfirmDeleteId(m.id)}>
                        Borrar
                      </button>
                    )}
                  </p>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {err && <p className="bg-white px-4 pb-1 text-sm text-red-600">{err}</p>}

      {/* Escribir: solo participantes confirmados (o el anfitrión). */}
      {isParticipant ? (
        <form onSubmit={send} className="flex gap-2 border-t border-slate-100 bg-white p-3">
          <input
            className={inputCls}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Escribe algo, ${profileName}…`}
            maxLength={500}
            aria-label="Mensaje del chat de la sesión"
          />
          <Btn type="submit" variant="coral" disabled={sending || !draft.trim()}>
            {sending ? '…' : 'Enviar'}
          </Btn>
        </form>
      ) : (
        <p className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          🔒 Solo los participantes confirmados pueden escribir en este chat. Apúntate a la sesión para participar.
        </p>
      )}
    </div>
  )
}
