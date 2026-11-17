// Mini tutorial de PULSO: explicación general y rápida, no larga.
// Máximo 4 tarjetas, una frase corta por paso, se lee en menos de
// 30 segundos. Sale solo al primer inicio con sesión (flag
// pulso_tutorial_seen_v1) y se reabre desde Perfil → "Ver tutorial".
// El paso 2 enlaza con el flujo de permisos (onOpenPermissions).
// La hoja flota encima del muelle de música (pulso-sheet-bottom) y el
// fondo solo cubre hasta ahí: la navegación y la mini-barra de música
// quedan visibles y sin tapar. Diseño PULSO: azul noche, rojo, teal.
import { useState } from 'react'
import { Btn } from './ui'

const STEPS = [
  {
    icon: '👤',
    title: 'Crea tu cuenta y tu perfil',
    text: 'Deporte, nivel y zona Isla Mujeres.',
  },
  {
    icon: '🔐',
    title: 'Da todos los permisos de una vez',
    text: 'Ubicación todo el tiempo, actividad, notificaciones y música.',
  },
  {
    icon: '🏃',
    title: 'Graba con GPS y escucha tu música',
    text: 'En Entrenar, con tus canciones del teléfono.',
  },
  {
    icon: '👥',
    title: 'Crea o únete a una sesión',
    text: 'Y encuentra con quién entrenar.',
  },
]

const KEY = 'pulso_tutorial_seen_v1'

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* noop */
  }
}

export default function Tutorial({ onClose, onOpenPermissions }: { onClose: () => void; onOpenPermissions: () => void }) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label="Tutorial de PULSO">
      {/* Fondo: cubre hasta encima del muelle de música; la navegación
          y la mini-barra quedan fuera y visibles. */}
      <div className="absolute inset-x-0 top-0 bottom-[calc(64px+64px+env(safe-area-inset-bottom,0px)+12px)] bg-night/70" onClick={onClose} />
      <div className="pulso-sheet-bottom absolute inset-x-0 mx-auto w-full max-w-2xl rounded-t-3xl bg-night p-4 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-pulso">PULSO · Entrena con pulso</p>
            <h2 className="mt-1 text-xl font-black">Así se usa PULSO</h2>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/90" aria-label="Saltar tutorial">
            Saltar
          </button>
        </div>

        {/* Una tarjeta a la vez: se lee en menos de 30 segundos. */}
        <div className="mt-4 rounded-3xl bg-white p-4 text-center text-night">
          <p className="text-5xl">{current.icon}</p>
          <p className="mt-2 text-lg font-black leading-tight">{current.title}</p>
          <p className="mt-1 text-sm text-slate-600">{current.text}</p>
          {step === 1 && (
            <Btn variant="teal" className="mt-3 w-full" onClick={onOpenPermissions}>
              🔐 Dar permisos ahora
            </Btn>
          )}
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              onClick={() => setStep(i)}
              aria-label={`Paso ${i + 1}: ${s.title}`}
              className={`h-2 rounded-full ${i === step ? 'w-6 bg-pulso' : 'w-2 bg-white/30'}`}
            />
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          {step > 0 && (
            <Btn variant="ghost" className="flex-1 !bg-white/10 !text-white" onClick={() => setStep(step - 1)}>
              ← Atrás
            </Btn>
          )}
          <Btn variant="coral" className="flex-1" onClick={() => (last ? onClose() : setStep(step + 1))}>
            {last ? 'Entendido ✓' : 'Siguiente →'}
          </Btn>
        </div>
        <p className="mt-2 text-center text-xs text-white/60">Paso {step + 1} de {STEPS.length} · menos de 30 segundos</p>
      </div>
    </div>
  )
}
