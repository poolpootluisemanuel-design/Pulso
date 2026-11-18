import type { Business, Challenge, Workout } from '../lib/types'
import { computeMedals, computeStreak } from '../lib/utils'
import { isChallengeCompleted } from '../lib/challengePrizes'
import ChallengePrize from './ChallengePrize'
import { Card, Empty } from './ui'

export default function Challenges({ workouts, challenges, businesses = [] }: { workouts: Workout[]; challenges: Challenge[]; businesses?: Business[] }) {
  const streak = computeStreak(workouts)
  const medals = computeMedals(workouts)
  const totalKm = workouts.reduce((s, w) => s + (w.distance_km || 0), 0)

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-teal-dark">Retos y logros</h2>
      <Card className="bg-coral text-night">
        <p className="text-sm opacity-80">🔥 Racha actual</p>
        <p className="text-3xl font-black">{streak} {streak === 1 ? 'día' : 'días'} seguidos</p>
        <p className="text-sm opacity-80">{workouts.length} entrenamientos · {totalKm.toFixed(1)} km</p>
      </Card>

      <h3 className="text-lg font-bold">Medallas</h3>
      <div className="grid grid-cols-2 gap-2">
        {medals.map((m) => (
          <Card key={m.id} className={m.earned ? 'border-2 border-coral' : 'opacity-60'}>
            <p className="text-2xl">{m.earned ? '🏅' : '🔒'}</p>
            <p className="text-sm font-bold">{m.label}</p>
            <p className="text-xs text-slate-500">{m.earned ? '¡Lograda!' : 'Aún no'}</p>
          </Card>
        ))}
      </div>

      <h3 className="text-lg font-bold">Retos activos</h3>
      {challenges.length === 0 ? <Empty text="No hay retos activos todavía." /> : (
        <div className="space-y-2">
          {challenges.map((c) => {
            const progress = Math.min(workouts.length, c.target_count)
            const pct = Math.round((progress / c.target_count) * 100)
            return (
              <Card key={c.id}>
                <p className="font-bold">{c.title}</p>
                <p className="text-sm text-slate-600">{c.days} días · Meta: {c.target_count} entrenamientos</p>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-sage-100">
                  <div className="h-full bg-teal" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{progress}/{c.target_count} · {pct}%</p>
                <ChallengePrize
                  challenge={c}
                  business={businesses.find((b) => b.id === c.business_id)}
                  completed={isChallengeCompleted(c, workouts)}
                />
              </Card>
            )
          })}
        </div>
      )}
      <p className="text-center text-xs text-slate-500">Modo sin comparación: tus retos son contra ti, no contra otros.</p>
    </div>
  )
}
