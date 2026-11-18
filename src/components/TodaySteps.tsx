// Tarjeta "Pasos hoy" de Inicio: número grande + anillo de
// progreso hacia la meta diaria (10,000 pasos). Usa el contador
// del sistema del teléfono (ver src/lib/todaySteps.ts); se actualiza
// sola cada 30 s y al volver a la app. Si no hay fuente de pasos
// (web o teléfono sin sensor ni Health Connect), lo dice claro en
// vez de inventar un número.
import { useEffect, useState } from 'react'
import { Card } from './ui'
import { getTodayStepsUnified, STEPS_DAILY_GOAL, type TodayStepsResult } from '../lib/todaySteps'

const SOURCE_LABEL: Record<TodayStepsResult['source'], string> = {
  sistema: 'Pasos del sistema',
  health: 'Pasos de Health Connect',
  ninguna: 'Sin contador de pasos',
}

export default function TodaySteps() {
  const [result, setResult] = useState<TodayStepsResult | null>(null)

  useEffect(() => {
    let alive = true
    const refresh = () => {
      void getTodayStepsUnified().then((r) => {
        if (alive) setResult(r)
      })
    }
    refresh()
    const t = window.setInterval(refresh, 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const steps = result?.steps ?? null
  const pct = steps === null ? 0 : Math.min(100, Math.round((steps / STEPS_DAILY_GOAL) * 100))
  // Anillo de progreso (SVG): círculo de radio 26, circunferencia ~163.
  const C = 2 * Math.PI * 26
  const dash = (pct / 100) * C

  return (
    <Card className="!p-4">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
            <circle cx="32" cy="32" r="26" fill="none" stroke="#F2DCC6" strokeWidth="7" />
            <circle
              cx="32" cy="32" r="26" fill="none" stroke="#D14D72" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg">👣</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-500">Pasos hoy</p>
          {steps === null ? (
            <>
              <p className="text-3xl font-black text-night">—</p>
              <p className="text-xs text-slate-500">
                {result ? 'Este teléfono no tiene contador de pasos. En la app instalada de Android se cuentan solos.' : 'Leyendo tus pasos…'}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-black text-night">{steps.toLocaleString('es-MX')}</p>
              <p className="text-xs text-slate-500">
                {pct}% de tu meta ({STEPS_DAILY_GOAL.toLocaleString('es-MX')}) · {SOURCE_LABEL[result?.source ?? 'ninguna']}
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
