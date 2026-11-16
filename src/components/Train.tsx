import { useEffect, useState } from 'react'
import type { Profile, Workout } from '../lib/types'
import { SPORTS } from '../lib/types'
import { deleteWorkout, logWorkout } from '../lib/store'
import { formatDate, paceMinKm, todayISO } from '../lib/utils'
import GpsTracker, { GPS_SAVED_KEY } from './GpsTracker'
import type { GpsProgress } from './GpsTracker'
import MusicPlayer from './MusicPlayer'
import type { MusicStatus } from './MusicPlayer'
import CoachPlan from './CoachPlan'
import { Btn, Card, Empty, Field, inputCls, selectCls } from './ui'

function RouteMini({ route, h = 110 }: { route: { lat: number; lng: number }[]; h?: number }) {
  if (!route || route.length < 2) return null
  const lats = route.map((p) => p.lat), lngs = route.map((p) => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const w = 320
  const x = (lng: number) => 10 + ((lng - minLng) / Math.max(maxLng - minLng, 0.0001)) * (w - 20)
  const y = (lat: number) => h - 10 - ((lat - minLat) / Math.max(maxLat - minLat, 0.0001)) * (h - 20)
  const d = route.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full rounded-xl bg-sage-100">
      <path d={d} fill="none" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round" />
      <circle cx={x(route[0].lng)} cy={y(route[0].lat)} r="5" fill="#22c55e" />
      <circle cx={x(route[route.length - 1].lng)} cy={y(route[route.length - 1].lat)} r="5" fill="#E63946" />
    </svg>
  )
}

export interface TrainActivity { gps: GpsProgress | null; music: MusicStatus | null }

export default function Train({ profile, workouts, onRefresh, onActivity }: { profile: Profile; workouts: Workout[]; onRefresh: () => void; onActivity?: (a: TrainActivity) => void }) {
  // Si hay una grabación GPS guardada sin terminar, abrir el GPS directo
  // para que Luis la vea y pueda reanudarla, en vez de esconderla detrás
  // del botón "Grabar con GPS".
  const [showGps, setShowGps] = useState(() => {
    try { return localStorage.getItem(GPS_SAVED_KEY) !== null } catch { return false }
  })
  const [gps, setGps] = useState<GpsProgress | null>(null)
  const [music, setMusic] = useState<MusicStatus | null>(null)

  useEffect(() => {
    onActivity?.({ gps, music })
  }, [gps, music, onActivity])
  const [sport, setSport] = useState('Caminata')
  const [date, setDate] = useState(todayISO())
  const [duration, setDuration] = useState('30')
  const [distance, setDistance] = useState('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [openRoute, setOpenRoute] = useState<string | null>(null)

  const totalKm = workouts.reduce((s, w) => s + (w.distance_km || 0), 0)
  const totalMin = workouts.reduce((s, w) => s + w.duration_min, 0)

  async function saveManual(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      await logWorkout({
        profile_id: profile.id, sport, date,
        duration_min: Number(duration) || 0,
        distance_km: distance ? Number(distance) : undefined,
        notes: notes.trim() || undefined,
      })
      setMsg('Entrenamiento guardado.')
      setNotes(''); setDistance('')
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar.') }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="p-3"><p className="text-xl font-black text-teal-dark">{workouts.length}</p><p className="text-xs text-slate-500">Entrenamientos</p></Card>
        <Card className="p-3"><p className="text-xl font-black text-teal-dark">{totalKm.toFixed(1)} km</p><p className="text-xs text-slate-500">Distancia total</p></Card>
        <Card className="p-3"><p className="text-xl font-black text-teal-dark">{totalMin} min</p><p className="text-xs text-slate-500">Tiempo total</p></Card>
      </div>

      {showGps ? (
        <GpsTracker
          onProgress={setGps}
          onCancel={() => setShowGps(false)}
          onSave={async (r) => {
            await logWorkout({ profile_id: profile.id, sport: r.sport, date: todayISO(), duration_min: r.durationMin, distance_km: r.distanceKm, notes: `Ruta GPS · ${r.route.length} puntos`, route: r.route })
            setShowGps(false)
            setMsg('Entrenamiento con GPS guardado.')
            onRefresh()
          }}
        />
      ) : (
        <Btn variant="coral" className="w-full" onClick={() => setShowGps(true)}>📍 Grabar con GPS</Btn>
      )}

      <MusicPlayer profileId={profile.id} onPlayingChange={setMusic} />
      <CoachPlan profile={profile} workouts={workouts} onRefresh={onRefresh} />

      <Card>
        <h3 className="mb-3 text-lg font-bold">Registro manual</h3>
        <form onSubmit={saveManual} className="space-y-3">
          <Field label="Deporte">
            <select className={selectCls} value={sport} onChange={(e) => setSport(e.target.value)}>
              {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fecha"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            <Field label="Duración (min)"><input className={inputCls} type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} required /></Field>
          </div>
          <Field label="Distancia (km, opcional)"><input className={inputCls} type="number" step="0.1" min="0" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="Ej. 5" /></Field>
          <Field label="Notas (opcional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cómo te sentiste…" /></Field>
          {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
          {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
          <Btn type="submit" variant="teal" className="w-full">Guardar entrenamiento</Btn>
        </form>
      </Card>

      <h3 className="text-lg font-bold">Tu historial</h3>
      {workouts.length === 0 ? <Empty text="Aún no hay entrenamientos. Graba tu primera caminata con GPS o regístrala manual." /> : (
        <div className="space-y-2">
          {workouts.map((w) => (
            <Card key={w.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{w.sport} · {formatDate(w.date)}</p>
                  <p className="text-sm text-slate-600">{w.duration_min} min{w.distance_km ? ` · ${w.distance_km} km · ${paceMinKm(w.distance_km, w.duration_min)}` : ''}</p>
                  {w.notes && <p className="text-sm text-slate-500">{w.notes}</p>}
                </div>
                <button className="text-sm text-red-500 underline" onClick={async () => { await deleteWorkout(w.id); onRefresh() }}>Borrar</button>
              </div>
              {w.route && w.route.length >= 2 && (
                <>
                  <button className="mt-1 text-sm font-semibold text-teal-dark underline" onClick={() => setOpenRoute(openRoute === w.id ? null : w.id)}>
                    {openRoute === w.id ? 'Ocultar ruta' : 'Ver ruta'}
                  </button>
                  {openRoute === w.id && <RouteMini route={w.route} h={150} />}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
