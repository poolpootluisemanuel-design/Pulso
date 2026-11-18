// Traer entrenamientos grabados en el reloj (Samsung Watch, Garmin...)
// a través de Health Connect. Solo visible en la app nativa de Android.
// El usuario elige cuáles importar; los que ya están en el historial
// salen marcados como duplicados (mismo criterio que el importador GPX)
// y no se marcan por defecto. Sin ruta GPS ni frecuencia cardíaca:
// Health Connect no da la ruta de la sesión en este plugin.
import { useState } from 'react'
import type { Profile, Workout } from '../lib/types'
import { logWorkout } from '../lib/store'
import { isNative } from '../lib/native'
import { healthAvailable, openHealthConnectSettings } from '../lib/healthConnect'
import {
  fetchWatchSessions,
  requestWorkoutsAccess,
  watchSessionToWorkout,
} from '../lib/watchImport'
import type { WatchSession } from '../lib/watchImport'
import { formatDate, paceMinKm } from '../lib/utils'
import { Btn, Card } from './ui'

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export default function ImportWatch({ profile, workouts, onRefresh }: { profile: Profile; workouts: Workout[]; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sessions, setSessions] = useState<WatchSession[] | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [skippedOther, setSkippedOther] = useState(0)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [noHealth, setNoHealth] = useState(false)
  const [noPermission, setNoPermission] = useState(false)

  const selectedCount = sessions ? sessions.filter((s) => selected[s.key]).length : 0

  // Solo en la app nativa: en web no hay Health Connect ni reloj.
  // (después de los hooks: los hooks no pueden ir tras un return.)
  if (!isNative()) return null

  async function load() {
    setErr(''); setMsg(''); setSessions(null); setSkippedOther(0)
    setNoHealth(false); setNoPermission(false); setLoading(true)
    try {
      const avail = await healthAvailable()
      if (!avail.available) {
        setNoHealth(true)
        setErr('Health Connect no está disponible en este teléfono.')
        return
      }
      const granted = await requestWorkoutsAccess()
      if (!granted) {
        setNoPermission(true)
        setErr('No diste permiso para leer entrenamientos. Sin ese permiso PULSO no puede ver lo del reloj.')
        return
      }
      const { sessions: list, skippedOther: skipped } = await fetchWatchSessions(workouts, 30)
      setSessions(list)
      setSkippedOther(skipped)
      // Por defecto se marcan los que no son duplicados.
      const sel: Record<string, boolean> = {}
      for (const s of list) sel[s.key] = !s.duplicate
      setSelected(sel)
      if (list.length === 0) {
        setMsg('No hay entrenamientos del reloj en los últimos 30 días. Revisa que tu reloj sincronice a Health Connect (abajo te digo cómo).')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudieron leer los entrenamientos del reloj.')
    } finally {
      setLoading(false)
    }
  }

  async function importSelected() {
    if (!sessions) return
    const chosen = sessions.filter((s) => selected[s.key])
    if (chosen.length === 0) return
    setErr(''); setMsg(''); setSaving(true)
    try {
      let ok = 0
      for (const s of chosen) {
        await logWorkout(watchSessionToWorkout(s, profile.id))
        ok++
      }
      setMsg(`Se importaron ${ok} entrenamiento${ok === 1 ? '' : 's'} del reloj a tu historial.`)
      setSessions(sessions.filter((s) => !selected[s.key]))
      setSelected({})
      onRefresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudieron guardar los entrenamientos.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h3 className="text-lg font-bold">⌚ Traer entrenamientos del reloj</h3>
      <p className="mb-3 text-sm text-slate-500">
        Si corres con Samsung Watch o Garmin, tus entrenamientos llegan solos a PULSO
        a través de Health Connect. Sin ruta GPS: el reloj no comparte la ruta por aquí.
      </p>
      <p className="mb-3 rounded-xl bg-sage-50 p-2 text-xs text-slate-600">
        <b>Antes de buscar, revisa la sincronización:</b><br />
        • Samsung Watch: Samsung Health → Ajustes → <b>Sincronizar con Health Connect</b>.<br />
        • Garmin: Garmin Connect → Ajustes → <b>Health Connect</b> → activar la sincronización.<br />
        Si no está activado, tus entrenamientos no aparecen aquí aunque el reloj sí los tenga.
      </p>

      <Btn variant="ghost" className="w-full" disabled={loading} onClick={() => void load()}>
        {loading ? 'Buscando en Health Connect…' : '⌚ Buscar entrenamientos del reloj'}
      </Btn>

      {err && <p className="mt-2 rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-2 rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}

      {(noHealth || noPermission) && (
        <Btn variant="ghost" className="mt-2 w-full" onClick={() => void openHealthConnectSettings()}>
          Abrir ajustes de Health Connect
        </Btn>
      )}
      {noHealth && (
        <p className="mt-2 text-center text-xs text-slate-500">
          Android 14+ lo trae instalado. En Android 13 o menos hay que instalar
          “Health Connect by Android” desde Play Store.
        </p>
      )}

      {sessions && sessions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-bold">
            {sessions.length} entrenamiento{sessions.length === 1 ? '' : 's'} del reloj (últimos 30 días)
          </p>
          {sessions.map((s) => (
            <label
              key={s.key}
              className={`flex items-start gap-2 rounded-2xl border p-3 ${s.duplicate ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-white'}`}
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-teal-600"
                checked={!!selected[s.key]}
                onChange={(e) => setSelected({ ...selected, [s.key]: e.target.checked })}
              />
              <span className="flex-1">
                <span className="font-bold">
                  {s.sport} · {formatDate(s.date)}{timeLabel(s.startAt) ? ` · ${timeLabel(s.startAt)}` : ''}
                </span>
                <span className="block text-sm text-slate-600">
                  {s.durationMin} min
                  {s.distanceKm !== undefined ? ` · ${s.distanceKm} km · ${paceMinKm(s.distanceKm, s.durationMin)}` : ' · sin distancia'}
                  {s.calories !== undefined ? ` · ${s.calories} kcal` : ''}
                </span>
                <span className="block text-xs text-slate-500">⌚ {s.sourceName}</span>
                {s.duplicate && (
                  <span className="mt-1 block rounded-lg bg-amber-100 p-1 text-xs font-semibold text-amber-800">
                    ⚠️ Ya tienes este entrenamiento en tu historial. Si lo importas, quedará duplicado.
                  </span>
                )}
              </span>
            </label>
          ))}
          {skippedOther > 0 && (
            <p className="text-xs text-slate-500">
              {skippedOther} sesión{skippedOther === 1 ? '' : 'es'} de otro tipo (fútbol, tenis, esquí…) no se {skippedOther === 1 ? 'muestra' : 'muestran'}: PULSO solo importa correr, caminar, ciclismo, natación, gym, yoga, CrossFit y surf.
            </p>
          )}
          <div className="flex gap-2">
            <Btn variant="ghost" className="flex-1" onClick={() => { setSessions(null); setSelected({}) }}>Cancelar</Btn>
            <Btn variant="teal" className="flex-1" disabled={saving || selectedCount === 0} onClick={() => void importSelected()}>
              {saving ? 'Guardando…' : `Importar ${selectedCount} al historial`}
            </Btn>
          </div>
        </div>
      )}
    </Card>
  )
}
