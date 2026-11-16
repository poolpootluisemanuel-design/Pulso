import type { Profile, SessionItem, Workout } from '../lib/types'
import { computeStreak, formatDate, weekdayName } from '../lib/utils'
import { Card, Empty, Tag } from './ui'

export default function Home({ profile, sessions, workouts, onGoSessions }: { profile: Profile; sessions: SessionItem[]; workouts: Workout[]; onGoSessions: () => void }) {
  const streak = computeStreak(workouts)
  const next = sessions.filter((s) => s.date >= new Date().toISOString().slice(0, 10))[0]
  const week = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
  const todayIdx = (new Date().getDay() + 6) % 7
  const trainedDays = new Set(workouts.map((w) => (new Date(w.date + 'T12:00:00').getDay() + 6) % 7))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Estás en {profile.zone}</p>
          <h2 className="text-2xl font-black text-teal-dark">Hola, {profile.name} 👋</h2>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-coral text-xl font-black text-white">
          {profile.name.slice(0, 1).toUpperCase()}
        </div>
      </div>

      <Card className="bg-night text-white">
        <p className="text-sm opacity-80">🔥 Tu racha</p>
        <p className="text-3xl font-black">{streak} {streak === 1 ? 'día' : 'días'}</p>
        <p className="text-sm opacity-80">{workouts.length} entrenamientos registrados</p>
      </Card>

      <Card>
        <p className="mb-2 font-bold">Tu semana</p>
        <div className="flex justify-between">
          {week.map((d, i) => (
            <div key={d} className="text-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${trainedDays.has(i) ? 'bg-coral text-white' : i === todayIdx ? 'bg-teal text-white' : 'bg-sage-100 text-slate-600'}`}>
                {d.slice(0, 2).toUpperCase()}
              </div>
              <p className="mt-1 text-[10px] text-slate-500">{d.slice(0, 3)}</p>
            </div>
          ))}
        </div>
      </Card>

      <h3 className="text-lg font-bold">Tu próxima sesión</h3>
      {next ? (
        <Card>
          <div className="flex gap-2"><Tag>{next.sport}</Tag><Tag>{next.level}</Tag></div>
          <p className="mt-2 text-lg font-bold">{next.title}</p>
          <p className="text-sm text-slate-600">
            {weekdayName(next.date)} {formatDate(next.date)} · {next.time} · {next.place}
          </p>
          <p className="text-sm text-slate-500">Con {next.host_name} · {next.zone}</p>
          <button className="mt-2 font-semibold text-teal-dark underline" onClick={onGoSessions}>Ver sesiones →</button>
        </Card>
      ) : (
        <Empty text="No hay sesiones próximas. Crea la primera en la pestaña Sesiones." />
      )}

      <Card>
        <p className="font-bold">Tus deportes</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.sports.length === 0
            ? <p className="text-sm text-slate-500">Completa tu perfil para agregar deportes y nivel.</p>
            : profile.sports.map((s) => <Tag key={s.sport}>{s.sport} · {s.level}</Tag>)}
        </div>
      </Card>
    </div>
  )
}
