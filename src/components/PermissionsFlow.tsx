// Flujo único de permisos (app nativa de Android, primer inicio).
// Android no permite pedir varios permisos en un solo diálogo: cada
// permiso abre su propio diálogo del sistema. Aquí se piden EN
// SECUENCIA dentro del mismo flujo, con una explicación corta por
// permiso, un botón "Permitir todo" y el estado de cada uno (✓ Listo,
// ⏳ Falta, ✕ Denegado → "Ir a Ajustes"). Al cerrarlo (completo o
// saltado) queda marcado y no vuelve a salir solo; se reabre desde
// Perfil → "Dar todos los permisos".
// Orden: Ubicación → Actividad física → Notificaciones → Música y
// audio → Salud / Health Connect. La ubicación "todo el tiempo" no se
// puede pedir con diálogo: tras conceder la ubicación se ofrece abrir
// Ajustes para elegirla (paso 1b).
// La hoja flota encima del muelle de música (pulso-sheet-bottom) y el
// fondo solo cubre hasta ahí: la navegación y la mini-barra de música
// quedan visibles y sin tapar.
import { useEffect, useState } from 'react'
import {
  checkPermissionStates,
  markPermissionsFlowSeen,
  openAppSettings,
  openHealthSettings,
  openLocationSettings,
  requestActivity,
  requestHealth,
  requestLocation,
  requestMusic,
  requestNotifications,
  type PermissionStates,
} from '../lib/permissions'
import { Btn } from './ui'

type StepId = 'location' | 'activity' | 'notifications' | 'music' | 'health'

interface Step {
  id: StepId
  icon: string
  title: string
  why: string
}

const STEPS: Step[] = [
  { id: 'location', icon: '📍', title: 'Ubicación', why: 'Para grabar tu ruta con GPS.' },
  { id: 'activity', icon: '🏃', title: 'Actividad física', why: 'Para contar tus pasos mientras entrenas.' },
  { id: 'notifications', icon: '🔔', title: 'Notificaciones', why: 'Para avisarte de sesiones y retos.' },
  { id: 'music', icon: '🎵', title: 'Música y audio', why: 'Para escuchar tus canciones del teléfono.' },
  { id: 'health', icon: '❤️', title: 'Salud (Health Connect)', why: 'Para leer tus pasos del día desde Samsung Health.' },
]

type Status = 'done' | 'pending' | 'denied'

function statusOf(id: StepId, s: PermissionStates): Status {
  switch (id) {
    case 'location': return s.location === 'granted' ? 'done' : s.location === 'denied' ? 'denied' : 'pending'
    case 'activity': return s.activity ? 'done' : 'pending'
    case 'notifications': return s.notifications ? 'done' : 'pending'
    case 'music': return s.music ? 'done' : 'pending'
    case 'health': return s.health === true ? 'done' : 'pending'
  }
}

export default function PermissionsFlow({ onClose }: { onClose: () => void }) {
  const [states, setStates] = useState<PermissionStates | null>(null)
  const [busy, setBusy] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const [locationAsked, setLocationAsked] = useState(false)

  useEffect(() => {
    let alive = true
    void checkPermissionStates().then((s) => { if (alive) setStates(s) })
    return () => { alive = false }
  }, [])

  function patch(next: Partial<PermissionStates>) {
    setStates((prev) => (prev ? { ...prev, ...next } : prev))
  }

  async function askOne(id: StepId) {
    if (!states || busy) return
    setBusy(true)
    try {
      switch (id) {
        case 'location': {
          const ok = await requestLocation()
          setLocationAsked(true)
          patch({ location: ok ? 'granted' : 'denied' })
          break
        }
        case 'activity': patch({ activity: await requestActivity() }); break
        case 'notifications': patch({ notifications: await requestNotifications() }); break
        case 'music': patch({ music: await requestMusic() }); break
        case 'health': patch({ health: await requestHealth() }); break
      }
    } finally {
      setBusy(false)
    }
  }

  // "Permitir todo": pide cada permiso que falte, en orden, uno tras
  // otro (cada uno abre su diálogo del sistema). Si uno se niega, se
  // sigue con el siguiente; al final se ve cuáles quedaron.
  async function askAll() {
    if (!states || busy) return
    setRunningAll(true)
    setBusy(true)
    try {
      const s = { ...states }
      if (s.location !== 'granted') {
        s.location = (await requestLocation()) ? 'granted' : 'denied'
        setLocationAsked(true)
        setStates({ ...s })
      }
      if (!s.activity) { s.activity = await requestActivity(); setStates({ ...s }) }
      if (!s.notifications) { s.notifications = await requestNotifications(); setStates({ ...s }) }
      if (!s.music) { s.music = await requestMusic(); setStates({ ...s }) }
      if (s.health !== true) { s.health = await requestHealth(); setStates({ ...s }) }
    } finally {
      setBusy(false)
      setRunningAll(false)
    }
  }

  function close() {
    markPermissionsFlowSeen()
    onClose()
  }

  const doneCount = states ? STEPS.filter((s) => statusOf(s.id, states) === 'done').length : 0

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label="Permisos de PULSO">
      {/* Fondo: cubre hasta encima del muelle de música; la navegación
          y la mini-barra quedan fuera y visibles. */}
      <div className="absolute inset-x-0 top-0 bottom-[calc(64px+64px+env(safe-area-inset-bottom,0px)+12px)] bg-night/70" onClick={close} />
      <div className="pulso-sheet-bottom absolute inset-x-0 mx-auto max-h-[72vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-night">🔐 Permisos de PULSO</h2>
            <p className="mt-1 text-sm text-slate-600">
              Todo en un solo lugar. Cada permiso abre su propio aviso de Android; si uno no te interesa, lo puedes saltar.
            </p>
          </div>
          <button onClick={close} className="shrink-0 rounded-full bg-night-100 px-3 py-1.5 text-xs font-bold text-teal-dark" aria-label="Cerrar">
            ✕ Cerrar
          </button>
        </div>

        <div className="mt-3">
          <Btn variant="coral" className="w-full" onClick={() => void askAll()} disabled={busy || !states}>
            {runningAll ? '⏳ Pidiendo permisos…' : '✅ Permitir todo'}
          </Btn>
          {states && (
            <p className="mt-2 text-center text-sm font-bold text-teal-dark">
              {doneCount} de {STEPS.length} permisos listos
            </p>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {STEPS.map((step) => {
            const status: Status = states ? statusOf(step.id, states) : 'pending'
            const chip = status === 'done'
              ? <span className="rounded-full bg-teal/15 px-2.5 py-1 text-xs font-bold text-teal-dark">✓ Listo</span>
              : status === 'denied'
                ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">✕ Denegado</span>
                : <span className="rounded-full bg-night-100 px-2.5 py-1 text-xs font-bold text-slate-600">⏳ Falta</span>
            return (
              <div key={step.id} className="rounded-2xl border border-slate-100 bg-night-50 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{step.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-night">{step.title}</p>
                    <p className="text-sm text-slate-600">{step.why}</p>
                  </div>
                  {chip}
                </div>
                {step.id === 'location' && (locationAsked || (states?.location === 'granted')) && (
                  <p className="mt-2 rounded-xl bg-amber-50 p-2 text-sm text-amber-800">
                    📍 Para grabar con la pantalla apagada, en Ajustes elige ubicación “Permitir todo el tiempo”.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {status !== 'done' && (
                    <Btn variant="teal" onClick={() => void askOne(step.id)} disabled={busy || !states}>
                      Permitir {step.title.toLowerCase()}
                    </Btn>
                  )}
                  {step.id === 'location' && states?.location === 'granted' && (
                    <Btn variant="ghost" onClick={() => void openLocationSettings()} disabled={busy}>
                      📍 Abrir ajustes de ubicación
                    </Btn>
                  )}
                  {step.id === 'health' && states && !states.healthAvailable && (
                    <Btn variant="ghost" onClick={() => void openHealthSettings()} disabled={busy}>
                      ❤️ Instalar / abrir Health Connect
                    </Btn>
                  )}
                  {status === 'denied' && (
                    <Btn variant="ghost" onClick={() => void openAppSettings()} disabled={busy}>
                      ⚙️ Ir a Ajustes
                    </Btn>
                  )}
                </div>
                {step.id === 'health' && states && !states.healthAvailable && (
                  <p className="mt-2 text-xs text-slate-500">
                    Health Connect no está en este teléfono. Instálalo desde Play Store y en Samsung Health activa “Sincronizar con Health Connect”.
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <Btn variant="ghost" className="flex-1" onClick={close}>Saltar por ahora</Btn>
          <Btn variant="coral" className="flex-1" onClick={close}>Listo</Btn>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">
          Puedes cambiar cualquier permiso cuando quieras en Ajustes → PULSO → Permisos, o desde Perfil → “Dar todos los permisos”.
        </p>
      </div>
    </div>
  )
}
