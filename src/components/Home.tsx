import type { Profile, SessionItem, Workout } from '../lib/types'
import { formatDate, weekdayName } from '../lib/utils'
import { Card, Empty, Tag } from './ui'
import TodaySteps from './TodaySteps'
import { IconPlay } from './icons'

// Foto libre (Unsplash, verificada 200): deporte / atletismo.
const HERO_IMG = 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=80&auto=format&fit=crop'

const SPORT_EMOJI: Record<string, string> = {
  running: '🏃', correr: '🏃', caminata: '🚶', pádel: '🎾', padel: '🎾',
  crossfit: '💪', ciclismo: '🚴', surf: '🏄', natación: '🏊', gym: '🏋️',
}
function sportEmoji(sport: string) {
  const key = sport.toLowerCase()
  return SPORT_EMOJI[key] || '🏅'
}

export default function Home({ profile, sessions, workouts, onGoSessions, onGoTrain }: { profile: Profile; sessions: SessionItem[]; workouts: Workout[]; onGoSessions: () => void; onGoTrain: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = sessions.filter((s) => s.date >= today).slice(0, 3)
  const next = upcoming[0]
  const week = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
  const todayIdx = (new Date().getDay() + 6) % 7
  const trainedDays = new Set(workouts.map((w) => (new Date(w.date + 'T12:00:00').getDay() + 6) % 7))

  // Esta semana, estilo Strava: distancia y duración de la semana
  // (lunes a domingo), km por semana de las últimas 12, serie de
  // semanas seguidas y mejores marcas. Todo se calcula con los
  // entrenamientos guardados (GPS y manuales). El mejor 5 km se
  // estima con el mejor ritmo (5 × ritmo) de carreras de 5 km o
  // más; el desnivel no se muestra porque PULSO no guarda altura.
  const mondayOf = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(12, 0, 0, 0); return x }
  const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const mondayISO = (dateStr: string) => toISODate(mondayOf(new Date(dateStr + 'T12:00:00')))
  const thisMonday = mondayOf(new Date())
  const thisMondayISO = toISODate(thisMonday)
  const weekWorkouts = workouts.filter((w) => mondayISO(w.date) === thisMondayISO)
  const weekKm = weekWorkouts.reduce((s, w) => s + (w.distance_km ?? 0), 0)
  const weekMin = weekWorkouts.reduce((s, w) => s + (w.duration_min || 0), 0)
  const last12Mondays = Array.from({ length: 12 }, (_, i) => { const m = new Date(thisMonday); m.setDate(m.getDate() - (11 - i) * 7); return m })
  const weekKmByWeek = last12Mondays.map((m) => {
    const iso = toISODate(m)
    return workouts.filter((w) => mondayISO(w.date) === iso).reduce((s, w) => s + (w.distance_km ?? 0), 0)
  })
  const weekHasWorkout = last12Mondays.map((m) => {
    const iso = toISODate(m)
    return workouts.some((w) => mondayISO(w.date) === iso)
  })
  // Serie: semanas seguidas con al menos un entrenamiento. Si esta
  // semana aún no entrena, se mide hasta la semana pasada.
  let streakWeeks = 0
  {
    let j = weekHasWorkout[11] ? 11 : 10
    while (j >= 0 && weekHasWorkout[j]) { streakWeeks++; j-- }
  }
  const isRun = (s: string) => ['correr', 'running', 'run'].includes(s.toLowerCase())
  const isBike = (s: string) => ['ciclismo', 'cycling', 'bici'].includes(s.toLowerCase())
  const paces = (pred: (s: string) => boolean, minKm: number) => workouts
    .filter((w) => (w.distance_km ?? 0) >= minKm && pred(w.sport))
    .map((w) => (w.duration_min || 0) / (w.distance_km || 1))
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
  const runPaces = paces(isRun, 5)
  const bikePaces = paces(isBike, 5)
  const fmtPace = (p: number) => { const m = Math.floor(p); const s = Math.round((p - m) * 60); return `${m}:${String(s).padStart(2, '0')}` }
  const fmt5k = (p: number) => { const t = Math.round(p * 5 * 60); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }
  const fmtKm = (km: number) => { const r = Math.round(km * 10) / 10; return `${r % 1 === 0 ? r : r.toFixed(1)} km` }
  const fmtDur = (min: number) => {
    const m = Math.round(min)
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60); const rest = m % 60
    return rest === 0 ? `${h} h` : `${h} h ${rest} min`
  }
  const bestMarks: { label: string; value: string }[] = []
  if (runPaces[0]) bestMarks.push({ label: 'Mejor 5 km', value: fmt5k(runPaces[0]) })
  if (runPaces[1]) bestMarks.push({ label: 'Segundo 5 km', value: fmt5k(runPaces[1]) })
  if (runPaces[0]) bestMarks.push({ label: 'Mejor ritmo corriendo', value: `${fmtPace(runPaces[0])} min/km` })
  if (bikePaces[0]) bestMarks.push({ label: 'Mejor ritmo en bici', value: `${fmtPace(bikePaces[0])} min/km` })
  const maxWeekKm = Math.max(...weekKmByWeek, 1)
  const chartPts = weekKmByWeek.map((km, i) => `${20 + (i * 360) / 11},${110 - (km / maxWeekKm) * 90}`).join(' ')
  const monthShort = (d: Date) => d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '').toUpperCase()

  return (
    <div className="space-y-4">
      {/* Saludo con avatar, como la app de Muse */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-pulso-dark">{profile.zone}</p>
          <h2 className="truncate text-2xl font-black text-night">Hola, {profile.name} 👋</h2>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pulso to-pulso-dark text-xl font-black text-white shadow-lg shadow-pulso/30">
          {profile.name.slice(0, 1).toUpperCase()}
        </div>
      </div>

      {/* Hero compacto con la próxima sesión (120 px, antes 192): la foto
          decorativa no es contenido del usuario y tapaba lo importante. */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-night to-pulso-dark shadow-lg shadow-night/20">
        <img src={HERO_IMG} alt="Deporte en equipo" className="h-[120px] w-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <span className="rounded-full bg-pulso px-3 py-1 text-xs font-black uppercase tracking-wider text-night">
            {next ? `Tu próxima sesión · ${sportEmoji(next.sport)} ${next.sport}` : 'Tu próxima sesión'}
          </span>
          {next ? (
            <>
              <p className="mt-2 text-xl font-black leading-tight">{next.title}</p>
              <p className="text-sm text-white/85">
                {weekdayName(next.date)} {formatDate(next.date)} · {next.time} · {next.place}
              </p>
              <button onClick={onGoSessions} className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-black text-night">
                Ver sesiones →
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-xl font-black leading-tight">¿Con quién entrenas mañana?</p>
              <p className="text-sm text-white/85">Crea tu primera sesión y encuentra compañero por nivel y zona.</p>
              <button onClick={onGoSessions} className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-black text-night">
                Crear sesión →
              </button>
            </>
          )}
        </div>
      </div>

      {/* Entrenar: botón destacado. Ya no es pestaña, pero entrenar
          sigue aquí, a un toque, con GPS, caminata, correr y ciclismo. */}
      <button onClick={onGoTrain} className="pulso-press flex w-full items-center justify-center gap-2 rounded-3xl bg-pulso py-4 text-lg font-black text-night shadow-lg shadow-pulso/40">
        <IconPlay className="h-6 w-6" /> Entrenar con GPS
      </button>

      {/* Pasos hoy (contador del sistema) + entrenamientos.
          La racha ya NO vive aquí: solo en Retos. */}
      <TodaySteps />
      <Card className="!p-4">
        <p className="text-sm font-bold text-slate-500">🏅 Entrenamientos</p>
        <p className="text-3xl font-black text-night">{workouts.length}</p>
        <p className="text-xs text-slate-500">Registrados en PULSO</p>
      </Card>

      {/* Tu semana */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-black text-night">Tu semana</p>
          <span className="rounded-full bg-teal/15 px-2.5 py-1 text-xs font-bold text-teal-dark">{trainedDays.size} días activos</span>
        </div>
        <div className="flex justify-between">
          {week.map((d, i) => (
            <div key={d} className="text-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black shadow-sm ${trainedDays.has(i) ? 'bg-pulso text-night' : i === todayIdx ? 'bg-night text-white ring-2 ring-pulso' : 'bg-night-100 text-slate-600'}`}>
                {d.slice(0, 2).toUpperCase()}
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{d.slice(0, 3)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Esta semana (estilo Strava): distancia y duración, gráfica
          de km de las últimas 12 semanas y mejores marcas. */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-black text-night">Esta semana</p>
          <span className="rounded-full bg-teal/15 px-2.5 py-1 text-xs font-bold text-teal-dark">Serie · {streakWeeks} {streakWeeks === 1 ? 'semana' : 'semanas'}</span>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Distancia</p>
            <p className="text-2xl font-black text-night">{fmtKm(weekKm)}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Duración</p>
            <p className="text-2xl font-black text-night">{fmtDur(weekMin)}</p>
          </div>
        </div>
        {weekKmByWeek.some((v) => v > 0) ? (
          <>
            <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Últimas 12 semanas · km por semana</p>
            <svg viewBox="0 0 400 130" className="h-auto w-full" role="img" aria-label="Kilómetros por semana, últimas 12 semanas">
              <line x1="20" y1="20" x2="20" y2="110" stroke="#e2e8f0" strokeWidth="1" />
              <line x1="20" y1="110" x2="380" y2="110" stroke="#e2e8f0" strokeWidth="1" />
              <text x="2" y="24" fontSize="9" fill="#64748b">{fmtKm(maxWeekKm).replace(' km', '')}</text>
              <text x="2" y="68" fontSize="9" fill="#64748b">{fmtKm(maxWeekKm / 2).replace(' km', '')}</text>
              <text x="6" y="112" fontSize="9" fill="#64748b">0</text>
              <polygon points={`${chartPts} 380,110 20,110`} fill="#F2A7B8" opacity="0.25" />
              <polyline points={chartPts} fill="none" stroke="#D14D72" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx="380" cy={110 - (weekKmByWeek[11] / maxWeekKm) * 90} r="4" fill="#D14D72" />
              <text x="20" y="126" fontSize="9" fill="#64748b">{monthShort(last12Mondays[0])}</text>
              <text x="190" y="126" fontSize="9" fill="#64748b">{monthShort(last12Mondays[6])}</text>
              <text x="360" y="126" fontSize="9" fill="#64748b">{monthShort(last12Mondays[11])}</text>
            </svg>
          </>
        ) : (
          <p className="mt-4 rounded-xl bg-sage-100 p-2 text-sm text-slate-600">Aún no hay kilómetros registrados en las últimas 12 semanas.</p>
        )}
        <p className="mb-2 mt-4 font-black text-night">Mejores tiempos</p>
        {bestMarks.length === 0 ? (
          <p className="text-sm text-slate-600">Sin marcas todavía: graba un entrenamiento con GPS para ver tu mejor ritmo y tu mejor 5 km.</p>
        ) : (
          <div className="space-y-1.5">
            {bestMarks.map((m) => (
              <div key={m.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{m.label}</span>
                <span className="font-black text-night">{m.value}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">El mejor 5 km se estima con tu mejor ritmo (5 × ritmo). El desnivel no se muestra: PULSO no guarda altura del GPS.</p>
      </Card>

      {/* Próximas sesiones */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black text-night">Próximas sesiones</h3>
        <button className="text-sm font-bold text-pulso-dark" onClick={onGoSessions}>Ver todas →</button>
      </div>
      {upcoming.length === 0 ? (
        <Empty text="No hay sesiones próximas. Crea la primera en la pestaña Comunidad." />
      ) : (
        upcoming.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-night text-white">
                <span className="text-lg leading-none">{sportEmoji(s.sport)}</span>
                <span className="mt-0.5 text-[10px] font-bold">{s.date.slice(8, 10)}/{s.date.slice(5, 7)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5"><Tag>{s.sport}</Tag><Tag>{s.level}</Tag></div>
                <p className="mt-1 font-black text-night">{s.title}</p>
                <p className="text-sm text-slate-600">
                  {weekdayName(s.date)} {formatDate(s.date)} · {s.time} · {s.place}
                </p>
                <p className="text-sm text-slate-500">Con {s.host_name} · {s.zone}</p>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
