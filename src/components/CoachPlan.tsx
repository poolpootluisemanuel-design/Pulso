// Entrenador IA de PULSO: plan semanal por deporte, nivel y meta.
// El plan se genera con reglas por deporte/nivel/meta (src/lib/coach.ts),
// se ajusta con los entrenamientos ya registrados, se guarda en la
// cuenta (Supabase o local) y cada tarea se puede marcar como hecha
// y registrar como entrenamiento.
import { useEffect, useState } from 'react'
import type { CoachGoal, Level, Profile, TrainingPlan, Workout } from '../lib/types'
import { COACH_GOALS, LEVELS, SPORTS } from '../lib/types'
import { deletePlan, getPlan, logWorkout, savePlan, togglePlanTask } from '../lib/store'
import { generatePlan, goalLabel } from '../lib/coach'
import { formatDate } from '../lib/utils'
import { Btn, Card, Empty, Field, Tag, selectCls } from './ui'

export default function CoachPlan({ profile, workouts, onRefresh }: { profile: Profile; workouts: Workout[]; onRefresh: () => void }) {
  const mySport = profile.sports[0]
  const [sport, setSport] = useState(mySport?.sport || 'Running')
  const [level, setLevel] = useState<Level>(mySport?.level || 'principiante')
  const [goal, setGoal] = useState<CoachGoal>('constancia')
  const [days, setDays] = useState(3)
  const [minutes, setMinutes] = useState(30)
  const [plan, setPlan] = useState<TrainingPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getPlan(profile.id).then((p) => { setPlan(p); setLoading(false) }).catch(() => setLoading(false))
  }, [profile.id])

  async function createPlan() {
    setErr(''); setMsg(''); setSaving(true)
    try {
      const generated = generatePlan({ sport, level, goal, daysPerWeek: days, minutesPerSession: minutes }, workouts, profile.availability)
      generated.profile_id = profile.id
      await savePlan(generated)
      setPlan(generated)
      setMsg('Tu plan semanal está listo.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo generar el plan.') }
    setSaving(false)
  }

  async function toggle(taskId: string) {
    if (!plan) return
    const updated = await togglePlanTask(profile.id, plan.id, taskId)
    if (updated) setPlan(updated)
  }

  async function registerTask(taskId: string) {
    if (!plan) return
    const task = plan.tasks.find((t) => t.id === taskId)
    if (!task) return
    try {
      await logWorkout({
        profile_id: profile.id, sport: plan.sport, date: task.date,
        duration_min: task.duration_min, distance_km: task.distance_km,
        notes: `Plan IA: ${task.title}`,
      })
      const updated = await togglePlanTask(profile.id, plan.id, taskId)
      if (updated) setPlan(updated)
      setMsg('Tarea registrada como entrenamiento.')
      onRefresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo registrar.') }
  }

  const doneCount = plan ? plan.tasks.filter((t) => t.done).length : 0

  return (
    <Card>
      <h3 className="text-lg font-bold">🤖 Entrenador IA</h3>
      <p className="mt-1 text-sm text-slate-600">
        Te arma un plan semanal por deporte, con tareas por día, metas y progresión según lo que ya entrenaste.
      </p>

      {loading ? (
        <p className="py-4 text-sm text-slate-500">Cargando tu plan…</p>
      ) : !plan ? (
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); createPlan() }}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Deporte">
              <select className={selectCls} value={sport} onChange={(e) => { setSport(e.target.value); const s = profile.sports.find((x) => x.sport === e.target.value); if (s) setLevel(s.level) }}>
                {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Nivel">
              <select className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Tu meta">
            <select className={selectCls} value={goal} onChange={(e) => setGoal(e.target.value as CoachGoal)}>
              {COACH_GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Días por semana">
              <select className={selectCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} días</option>)}
              </select>
            </Field>
            <Field label="Minutos por sesión">
              <select className={selectCls} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[20, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} min</option>)}
              </select>
            </Field>
          </div>
          {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
          {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
          <Btn type="submit" variant="coral" className="w-full" disabled={saving}>
            {saving ? 'Armando tu plan…' : 'Armar mi plan semanal'}
          </Btn>
          <p className="text-xs text-slate-500">Es un plan de entrenamiento general, no médico. Si tienes una lesión o condición de salud, consúltalo con un profesional.</p>
        </form>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{plan.sport}</Tag>
            <Tag>{plan.level}</Tag>
            <Tag>{goalLabel(plan.goal)}</Tag>
            <span className="text-sm text-slate-600">
              Meta de la semana: {plan.week_goal_min} min
              {plan.week_goal_km ? ` · ~${plan.week_goal_km} km` : ''}
            </span>
          </div>
          <p className="rounded-xl bg-teal/10 p-3 text-sm text-teal-dark">{plan.adjustment}</p>
          <div className="h-2 overflow-hidden rounded-full bg-sage-100">
            <div className="h-full bg-coral" style={{ width: `${plan.tasks.length ? (doneCount / plan.tasks.length) * 100 : 0}%` }} />
          </div>
          <p className="text-sm font-semibold">{doneCount} de {plan.tasks.length} tareas hechas</p>

          <div className="space-y-2">
            {plan.tasks.map((t) => (
              <div key={t.id} className={`rounded-xl border p-3 ${t.done ? 'border-teal bg-teal/5' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-teal-600" checked={t.done} onChange={() => toggle(t.id)} aria-label={`Marcar ${t.title} como hecha`} />
                  <div className="flex-1">
                    <p className={`font-bold ${t.done ? 'text-slate-500 line-through' : ''}`}>{t.title}</p>
                    <p className="text-xs font-semibold text-teal-dark">{t.day} · {formatDate(t.date)} · {t.duration_min} min{t.distance_km ? ` · ~${t.distance_km} km` : ''}</p>
                    <p className="mt-1 text-sm text-slate-600">{t.detail}</p>
                  </div>
                </div>
                {!t.done && (
                  <Btn variant="ghost" className="mt-2 w-full" onClick={() => registerTask(t.id)}>
                    ✓ Registrar como entrenamiento
                  </Btn>
                )}
              </div>
            ))}
          </div>

          {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
          {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
          <div className="flex gap-2">
            <Btn variant="teal" className="flex-1" onClick={() => setPlan(null)}>Cambiar mi plan</Btn>
            <Btn variant="ghost" onClick={async () => { await deletePlan(profile.id, plan.id); setPlan(null) }}>Borrar plan</Btn>
          </div>
          {plan.tasks.length === 0 && <Empty text="Tu plan no tiene tareas." />}
        </div>
      )}
    </Card>
  )
}
