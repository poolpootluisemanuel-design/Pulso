import type { Profile, SessionItem, Workout } from '../lib/types'
import { computeStreak, formatDate, weekdayName } from '../lib/utils'
import { Card, Empty, Tag } from './ui'

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

export default function Home({ profile, sessions, workouts, onGoSessions }: { profile: Profile; sessions: SessionItem[]; workouts: Workout[]; onGoSessions: () => void }) {
  const streak = computeStreak(workouts)
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = sessions.filter((s) => s.date >= today).slice(0, 3)
  const next = upcoming[0]
  const week = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
  const todayIdx = (new Date().getDay() + 6) % 7
  const trainedDays = new Set(workouts.map((w) => (new Date(w.date + 'T12:00:00').getDay() + 6) % 7))

  return (
    <div className="space-y-4">
      {/* Saludo con avatar, como la app de Muse */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-pulso">Cancún · {profile.zone}</p>
          <h2 className="truncate text-2xl font-black text-night">Hola, {profile.name} 👋</h2>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pulso to-pulso-dark text-xl font-black text-white shadow-lg shadow-pulso/30">
          {profile.name.slice(0, 1).toUpperCase()}
        </div>
      </div>

      {/* Hero con foto de la próxima sesión. Sin internet la foto no carga
          y queda el degradado azul noche (nunca en blanco). */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-night to-pulso-dark shadow-lg shadow-night/20">
        <img src={HERO_IMG} alt="Deporte en equipo" className="h-48 w-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <span className="rounded-full bg-pulso px-3 py-1 text-xs font-black uppercase tracking-wider">
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

      {/* Racha y entrenamientos */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-night !p-4 text-white">
          <p className="text-sm font-bold text-white/80">🔥 Tu racha</p>
          <p className="text-3xl font-black">{streak} <span className="text-base">{streak === 1 ? 'día' : 'días'}</span></p>
          <p className="text-xs text-white/70">Sigue así, no la pierdas</p>
        </Card>
        <Card className="!p-4">
          <p className="text-sm font-bold text-slate-500">🏅 Entrenamientos</p>
          <p className="text-3xl font-black text-night">{workouts.length}</p>
          <p className="text-xs text-slate-500">Registrados en PULSO</p>
        </Card>
      </div>

      {/* Tu semana */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-black text-night">Tu semana</p>
          <span className="rounded-full bg-teal/15 px-2.5 py-1 text-xs font-bold text-teal-dark">{trainedDays.size} días activos</span>
        </div>
        <div className="flex justify-between">
          {week.map((d, i) => (
            <div key={d} className="text-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black shadow-sm ${trainedDays.has(i) ? 'bg-gradient-to-br from-pulso to-pulso-dark text-white' : i === todayIdx ? 'bg-night text-white ring-2 ring-pulso' : 'bg-night-100 text-slate-600'}`}>
                {d.slice(0, 2).toUpperCase()}
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{d.slice(0, 3)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Próximas sesiones */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black text-night">Próximas sesiones</h3>
        <button className="text-sm font-bold text-pulso" onClick={onGoSessions}>Ver todas →</button>
      </div>
      {upcoming.length === 0 ? (
        <Empty text="No hay sesiones próximas. Crea la primera en la pestaña Sesiones." />
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

      {/* Tus deportes */}
      <Card>
        <p className="font-black text-night">Tus deportes</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.sports.length === 0
            ? <p className="text-sm text-slate-500">Completa tu perfil para agregar deportes y nivel.</p>
            : profile.sports.map((s) => <span key={s.sport} className="rounded-full bg-night px-3 py-1.5 text-sm font-bold text-white">{sportEmoji(s.sport)} {s.sport} · {s.level}</span>)}
        </div>
      </Card>
    </div>
  )
}
