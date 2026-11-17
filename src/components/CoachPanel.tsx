// Panel del modo coach (persona real que da clases).
// NO es el entrenador IA: ese es src/lib/coach.ts (planes
// semanales automáticos) y CoachPlan.tsx. Esto es para que un
// coach vea sus clases, sus alumnos y sus números, y cree
// clases/sesiones. Sin pagos.
//
// Uso (cableado pendiente, ver reporte de entrega):
//   <CoachPanel profile={profile} onCreateSession={() => setTab('sesiones')} />
// onCreateSession solo navega / abre el formulario de crear
// sesión: la creación en sí la sigue haciendo SessionsTab con
// createSession() de store.ts, con host_id = profile.id.
import { useCallback, useEffect, useState } from 'react'
import type { Profile, SessionItem } from '../lib/types'
import { coachStats, getCoachProfile, isCoach, listCoachSessions, listCoachStudents, setCoachMode } from '../lib/coachMode'
import type { CoachStats, CoachStudent } from '../lib/coachMode'
import { listRsvps } from '../lib/store'
import { formatDate, weekdayName } from '../lib/utils'
import { Btn, Card, Empty, Field, inputCls, Tag } from './ui'

export default function CoachPanel({ profile, onCreateSession }: { profile: Profile; onCreateSession: () => void }) {
  const [coach, setCoach] = useState(() => isCoach(profile))
  const [specialty, setSpecialty] = useState(() => getCoachProfile(profile).specialty)
  const [experience, setExperience] = useState(() => getCoachProfile(profile).experience)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [students, setStudents] = useState<CoachStudent[]>([])
  const [stats, setStats] = useState<CoachStats | null>(null)
  const [confirmedBySession, setConfirmedBySession] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [ss, st, stats] = await Promise.all([
        listCoachSessions(profile.id),
        listCoachStudents(profile.id),
        coachStats(profile.id),
      ])
      setSessions(ss)
      setStudents(st)
      setStats(stats)
      const counts: Record<string, number> = {}
      await Promise.all(
        ss.map(async (s) => {
          const rsvps = await listRsvps(s.id)
          counts[s.id] = rsvps.filter((r) => r.status === 'confirmed').length
        }),
      )
      setConfirmedBySession(counts)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo cargar tu panel de coach.')
    } finally {
      setLoading(false)
    }
  }, [profile.id])

  useEffect(() => {
    if (coach) void load()
  }, [coach, load])

  async function activate(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setMsg('')
    try {
      await setCoachMode(profile.id, true, specialty, experience)
      setCoach(true)
      setMsg('Modo coach activado. Ya puedes crear clases y ver a tus alumnos.')
      await load()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo activar el modo coach.')
    }
  }

  async function deactivate() {
    setErr('')
    setMsg('')
    try {
      await setCoachMode(profile.id, false)
      setCoach(false)
      setSpecialty('')
      setExperience('')
      setSessions([])
      setStudents([])
      setStats(null)
      setMsg('Modo coach desactivado.')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo desactivar el modo coach.')
    }
  }

  // ---- No es coach todavía: tarjeta para activar el modo ----
  if (!coach) {
    return (
      <Card className="bg-night">
        <p className="text-lg font-black text-white">🏅 ¿Eres coach?</p>
        <p className="mt-1 text-sm text-white/70">
          Activa el modo coach para crear clases, ver quién se apunta a cada una y llevar tus números. Sin pagos: tus
          clases son sesiones normales de PULSO.
        </p>
        <form onSubmit={activate} className="mt-3 space-y-3">
          <Field label="Especialidad">
            <input
              className={inputCls}
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="Ej. Pádel intermedio, Running, Yoga…"
            />
          </Field>
          <Field label="Experiencia">
            <input
              className={inputCls}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="Ej. 5 años dando clases en Cancún…"
            />
          </Field>
          {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
          {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
          <Btn type="submit" variant="coral" className="w-full">
            Activar modo coach
          </Btn>
        </form>
        <p className="mt-2 text-xs text-white/50">
          Esto no es el entrenador IA (ese arma tu plan semanal). Aquí eres tú el coach, con alumnos reales.
        </p>
      </Card>
    )
  }

  // ---- Es coach: estadísticas, alumnos, sesiones y crear clase ----
  return (
    <div className="space-y-4">
      <Card className="bg-night">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-black text-white">🏅 Panel de coach</p>
            <p className="text-sm text-white/70">
              {specialty ? `${specialty}` : 'Coach de PULSO'}
              {experience ? ` · ${experience}` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-teal px-2.5 py-1 text-xs font-black text-white">COACH</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-2xl font-black text-white">{stats?.totalSessions ?? '—'}</p>
            <p className="text-xs font-bold text-white/70">Sesiones</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-2xl font-black text-white">{stats?.totalConfirmedAttendees ?? '—'}</p>
            <p className="text-xs font-bold text-white/70">Asistentes</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-2xl font-black text-white">{stats?.upcomingSessions ?? '—'}</p>
            <p className="text-xs font-bold text-white/70">Próximas</p>
          </div>
        </div>
        <Btn variant="coral" className="mt-3 w-full" onClick={onCreateSession}>
          + Crear clase / sesión
        </Btn>
        {msg && <p className="mt-2 rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
        {err && <p className="mt-2 rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      </Card>

      <Card>
        <p className="mb-2 font-black text-night">Mis alumnos ({students.length})</p>
        {loading ? (
          <p className="py-4 text-center text-sm text-slate-500">Cargando…</p>
        ) : students.length === 0 ? (
          <Empty text="Todavía no hay alumnos confirmados en tus sesiones. Crea una clase y comparte el enlace con tu grupo." />
        ) : (
          <ul className="space-y-2">
            {students.map((st) => (
              <li key={st.profileId} className="flex items-start gap-3 rounded-2xl bg-night-50 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal text-lg font-black text-white">
                  {st.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-night">{st.name}</p>
                  <p className="text-sm text-slate-600">
                    Va a {st.sessionsCount} {st.sessionsCount === 1 ? 'sesión' : 'sesiones'}: {st.sessionTitles.join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-2 font-black text-night">Mis sesiones ({sessions.length})</p>
        {loading ? (
          <p className="py-4 text-center text-sm text-slate-500">Cargando…</p>
        ) : sessions.length === 0 ? (
          <Empty text="No has creado sesiones todavía. Toca «Crear clase / sesión» para armar la primera." />
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-2xl bg-night-50 p-3">
                <div className="flex flex-wrap gap-2">
                  <Tag>{s.sport}</Tag>
                  <Tag>{s.level}</Tag>
                </div>
                <p className="mt-1 font-bold text-night">{s.title}</p>
                <p className="text-sm text-slate-600">
                  {weekdayName(s.date)} {formatDate(s.date)} · {s.time} · {s.place}
                </p>
                <p className="text-sm text-slate-500">
                  Confirmados {confirmedBySession[s.id] ?? 0}/{s.capacity}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <button className="w-full text-center text-sm text-slate-500 underline" onClick={deactivate}>
        Dejar el modo coach
      </button>
    </div>
  )
}
