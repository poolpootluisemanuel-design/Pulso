import { useState } from 'react'
import type { Level, Profile, Rsvp, SessionItem } from '../lib/types'
import { LEVELS, SPORTS, ZONES } from '../lib/types'
import { cancelRsvp, createSession, joinSession, listRsvps } from '../lib/store'
import { formatDate, todayISO, weekdayName } from '../lib/utils'
import { Btn, Card, Empty, Field, inputCls, selectCls, Tag } from './ui'

export default function SessionsTab({ profile, sessions, onRefresh }: { profile: Profile; sessions: SessionItem[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [sport, setSport] = useState('Pádel')
  const [level, setLevel] = useState<Level | 'todos'>('todos')
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('19:00')
  const [place, setPlace] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [rsvps, setRsvps] = useState<Record<string, Rsvp[]>>({})

  async function loadRsvps(id: string) {
    const list = await listRsvps(id)
    setRsvps((prev) => ({ ...prev, [id]: list }))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      await createSession({
        title: title.trim(), sport, level, date, time,
        place: place.trim(), zone: profile.zone,
        capacity: Number(capacity) || 4,
        host_id: profile.id, host_name: profile.name,
      })
      setMsg(`Sesión creada para ${weekdayName(date)} ${formatDate(date)}. ¡Compártela con tus compañeros!`)
      setTitle(''); setPlace(''); setShowForm(false)
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo crear la sesión.') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-teal-dark">Sesiones y eventos</h2>
        <Btn variant="coral" onClick={() => setShowForm(!showForm)}>+ Crear</Btn>
      </div>

      {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
      {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}

      {showForm && (
        <Card>
          <form onSubmit={create} className="space-y-3">
            <Field label="Título"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ej. Pádel entre semana" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Deporte">
                <select className={selectCls} value={sport} onChange={(e) => setSport(e.target.value)}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select>
              </Field>
              <Field label="Nivel">
                <select className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as Level | 'todos')}>
                  <option value="todos">Todos los niveles</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha">
                <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                {date && <p className="text-xs text-slate-500">Es {weekdayName(date)} — verifica que sea el día que quieres.</p>}
              </Field>
              <Field label="Hora"><input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
            </div>
            <Field label="Lugar / cancha"><input className={inputCls} value={place} onChange={(e) => setPlace(e.target.value)} required placeholder="Ej. Cancha Tajamar" /></Field>
            <Field label="Zona">
              <select className={selectCls} value={profile.zone} disabled>
                <option>{profile.zone}</option>
              </select>
            </Field>
            <Field label="Cupo (personas)"><input className={inputCls} type="number" min="2" max="50" value={capacity} onChange={(e) => setCapacity(e.target.value)} required /></Field>
            <Btn type="submit" variant="coral" className="w-full">Crear sesión</Btn>
          </form>
        </Card>
      )}

      {sessions.length === 0 ? <Empty text="No hay sesiones todavía. Crea la primera y compártela por WhatsApp." /> : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const list = rsvps[s.id]
            const mine = list?.find((r) => r.profile_id === profile.id)
            const confirmed = list?.filter((r) => r.status === 'confirmed').length ?? 0
            return (
              <Card key={s.id}>
                <div className="flex gap-2"><Tag>{s.sport}</Tag><Tag>{s.level}</Tag><Tag>{s.zone}</Tag></div>
                <p className="mt-2 text-lg font-bold">{s.title}</p>
                <p className="text-sm text-slate-600">{weekdayName(s.date)} {formatDate(s.date)} · {s.time} · {s.place}</p>
                <p className="text-sm text-slate-500">Organiza {s.host_name} · Cupo {confirmed}/{s.capacity}</p>
                <div className="mt-2 flex gap-2">
                  <button className="text-sm font-semibold text-teal-dark underline" onClick={() => loadRsvps(s.id)}>
                    Ver quién va ({confirmed})
                  </button>
                  {!mine && (
                    <Btn variant="teal" className="px-3 py-1.5 text-sm" onClick={async () => {
                      const st = await joinSession(s, profile.id)
                      setMsg(st === 'confirmed' ? '¡Confirmado! Te esperamos.' : 'Cupo lleno, quedaste en lista de espera. Te avisamos si se libera un lugar.')
                      await loadRsvps(s.id)
                    }}>Me apunto</Btn>
                  )}
                  {mine && (
                    <button className="text-sm text-red-500 underline" onClick={async () => { await cancelRsvp(s.id, profile.id); await loadRsvps(s.id) }}>
                      Cancelar ({mine.status === 'confirmed' ? 'confirmado' : 'en espera'})
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <p className="text-center text-xs text-slate-500">Zonas disponibles: {ZONES.join(' · ')}</p>
    </div>
  )
}
