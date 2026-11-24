import { useEffect, useState } from 'react'
import type { Post, Profile, Workout } from '../lib/types'
import { SPORTS } from '../lib/types'
import { createPost, deleteWorkout, logWorkout } from '../lib/store'
import { buildRoutePostText, findRoutePost, parseRoutePost } from '../lib/routeShare'
import { formatDate, paceMinKm, todayISO } from '../lib/utils'
import GpsTracker, { GPS_SAVED_KEY } from './GpsTracker'
import type { GpsProgress } from './GpsTracker'
import type { RecommendedRoute } from '../lib/routes'
import type { MusicStatus } from './MusicPlayer'
import CoachPlan from './CoachPlan'
import ImportWorkout from './ImportWorkout'
import ImportWatch from './ImportWatch'
import PublishWorkoutCard from './PublishWorkoutCard'
import type { PublishVisibility } from './PublishWorkoutCard'
import WorkoutPostCard from './WorkoutPostCard'
import { Btn, Card, Empty, Field, inputCls, selectCls } from './ui'

export interface TrainActivity { gps: GpsProgress | null; music: MusicStatus | null }

export default function Train({ profile, workouts, posts, onRefresh, onActivity, guideRoute, onGuideDone }: { profile: Profile; workouts: Workout[]; posts: Post[]; onRefresh: () => void; onActivity?: (a: TrainActivity) => void; guideRoute?: RecommendedRoute | null; onGuideDone?: () => void }) {
  // Si hay una grabación GPS guardada sin terminar, abrir el GPS directo
  // para que Luis la vea y pueda reanudarla, en vez de esconderla detrás
  // del botón "Grabar con GPS".
  const [showGps, setShowGps] = useState(() => {
    try { return localStorage.getItem(GPS_SAVED_KEY) !== null } catch { return false }
  })
  // "Recorrer esta ruta": al elegir una ruta recomendada en Rutas,
  // Entrenar abre el GPS solo, con la ruta como guía teal.
  useEffect(() => {
    if (guideRoute) setShowGps(true)
  }, [guideRoute])
  const [gps, setGps] = useState<GpsProgress | null>(null)

  // La música ya no vive aquí: el reproductor está montado en App.tsx
  // y se ve abajo en esta misma pantalla (o como mini-barra en las
  // demás pestañas), así que al cambiar de pestaña no se corta.
  useEffect(() => {
    onActivity?.({ gps, music: null })
  }, [gps, onActivity])
  const [sport, setSport] = useState('Caminata')
  const [date, setDate] = useState(todayISO())
  const [duration, setDuration] = useState('30')
  const [distance, setDistance] = useState('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  // Detalle abierto del historial (id del entrenamiento) y tarjeta de
  // publicar (el entrenamiento recién guardado con GPS o uno del
  // historial que aún no se publicó).
  const [openDetail, setOpenDetail] = useState<string | null>(null)
  const [toPublish, setToPublish] = useState<Workout | null>(null)

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
          profile={profile}
          onProgress={setGps}
          onCancel={() => { setShowGps(false); onGuideDone?.() }}
          guide={guideRoute}
          onClearGuide={() => onGuideDone?.()}
          onSave={async (r) => {
            const saved = await logWorkout({ profile_id: profile.id, sport: r.sport, date: todayISO(), duration_min: r.durationMin, distance_km: r.distanceKm, steps: r.steps, notes: `Ruta GPS · ${r.route.length} puntos`, route: r.route })
            setShowGps(false)
            setToPublish(saved)
            onGuideDone?.()
            onRefresh()
          }}
        />
      ) : toPublish ? (
        <PublishWorkoutCard
          workout={toPublish}
          onPublish={async (note, visibility: PublishVisibility) => {
            setErr('')
            try {
              if (visibility === 'comunidad') {
                await createPost(profile.id, profile.name, buildRoutePostText(toPublish, note))
                setMsg('Recorrido publicado en Comunidad.')
              } else {
                setMsg('Recorrido guardado solo para ti.')
              }
            } catch (e2) {
              setErr(e2 instanceof Error ? e2.message : 'No se pudo publicar.')
              return
            }
            setToPublish(null)
            onRefresh()
          }}
          onClose={() => setToPublish(null)}
        />
      ) : (
        <Btn variant="coral" className="w-full" onClick={() => setShowGps(true)}>📍 Grabar con GPS</Btn>
      )}

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
          {workouts.map((w) => {
            const published = findRoutePost(posts, w.id)
            const publishedNote = published ? parseRoutePost(published.text)?.note : undefined
            // La nota automática del GPS («Ruta GPS · N puntos») no se
            // muestra: no dice nada y el mapa ya está en el detalle.
            const userNotes = w.notes && !w.notes.startsWith('Ruta GPS · ') ? w.notes : undefined
            return (
              <Card key={w.id}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="flex-1 text-left" onClick={() => setOpenDetail(openDetail === w.id ? null : w.id)} title="Ver detalle">
                    <p className="font-bold">{w.sport} · {formatDate(w.date)}</p>
                    <p className="text-sm text-slate-600">{w.duration_min} min{w.distance_km ? ` · ${w.distance_km} km · ${paceMinKm(w.distance_km, w.duration_min)}` : ''}{w.steps ? ` · 👣 ${w.steps.toLocaleString('es-MX')} pasos` : ''}</p>
                    <p className="text-xs font-semibold text-teal-dark">{openDetail === w.id ? 'Ocultar detalle' : 'Ver detalle'}</p>
                  </button>
                  <button className="shrink-0 text-sm text-red-500 underline" onClick={async () => { await deleteWorkout(w.id); onRefresh() }}>Borrar</button>
                </div>
                {openDetail === w.id && (
                  <div className="mt-2 space-y-2">
                    <WorkoutPostCard sport={w.sport} distanceKm={w.distance_km} durationMin={w.duration_min} steps={w.steps} route={w.route} />
                    {userNotes && <p className="text-sm text-slate-500">{userNotes}</p>}
                    {published ? (
                      <p className="rounded-xl bg-teal/10 p-2 text-sm font-semibold text-teal-dark">
                        Publicado en Comunidad{publishedNote ? ` · «${publishedNote}»` : ''}
                      </p>
                    ) : (
                      <Btn variant="teal" className="w-full" onClick={() => setToPublish(w)}>Publicar recorrido</Btn>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Importar entrenamientos (GPX/TCX o del reloj): colapsado al
          final, después del historial — es de uso ocasional y antes
          tapaba lo principal de Entrenar. */}
      <details className="rounded-3xl border border-slate-100 bg-white p-4 shadow-md shadow-night/5">
        <summary className="cursor-pointer font-bold text-night">⋯ Más opciones: importar entrenamientos</summary>
        <div className="mt-3 space-y-4">
          {/* Importar desde Strava / Garmin / Google Fit: el archivo se lee
              en el teléfono, se muestra una vista previa y se guarda como
              un entrenamiento normal (rachas, medallas y retos). */}
          <ImportWorkout profile={profile} workouts={workouts} onRefresh={onRefresh} />
          {/* Entrenamientos grabados en el reloj (Samsung Watch, Garmin...)
              vía Health Connect: solo sale en la app nativa. */}
          <ImportWatch profile={profile} workouts={workouts} onRefresh={onRefresh} />
        </div>
      </details>
    </div>
  )
}
