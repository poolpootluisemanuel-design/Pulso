// Importar entrenamiento desde Strava / Garmin / Google Fit.
// El archivo se lee EN EL TELÉFONO y nunca se sube a ningún servidor.
// Formatos: .gpx y .tcx. Antes de guardar se muestra una vista previa
// (deporte, fecha, duración, distancia, ritmo y ruta) y se avisa si
// ese entrenamiento ya existe (misma fecha + distancia + duración),
// para no duplicarlo.
import { useRef, useState } from 'react'
import type { Profile, Workout } from '../lib/types'
import { SPORTS } from '../lib/types'
import { logWorkout } from '../lib/store'
import { paceMinKm } from '../lib/utils'
import { parseWorkoutFile } from '../lib/importFile'
import type { ParsedWorkout } from '../lib/importFile'
import { Btn, Card, Field, inputCls, selectCls } from './ui'

function RouteMini({ route, h = 130 }: { route: { lat: number; lng: number }[]; h?: number }) {
  if (!route || route.length < 2) return <p className="py-4 text-center text-sm text-slate-500">Este archivo no trae ruta GPS para dibujar.</p>
  const lats = route.map((p) => p.lat), lngs = route.map((p) => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const w = 320
  const x = (lng: number) => 10 + ((lng - minLng) / Math.max(maxLng - minLng, 0.0001)) * (w - 20)
  const y = (lat: number) => h - 10 - ((lat - minLat) / Math.max(maxLat - minLat, 0.0001)) * (h - 20)
  const d = route.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-xl bg-sage-100">
      <path d={d} fill="none" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round" />
      <circle cx={x(route[0].lng)} cy={y(route[0].lat)} r="5" fill="#22c55e" />
      <circle cx={x(route[route.length - 1].lng)} cy={y(route[route.length - 1].lat)} r="5" fill="#E63946" />
    </svg>
  )
}

export default function ImportWorkout({ profile, workouts, onRefresh }: { profile: Profile; workouts: Workout[]; onRefresh: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [parsed, setParsed] = useState<ParsedWorkout | null>(null)
  const [fileName, setFileName] = useState('')
  const [sport, setSport] = useState('Running')
  const [date, setDate] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Duplicado: misma fecha, distancia casi igual y duración casi igual.
  const duplicate = parsed
    ? workouts.find((w) =>
        w.date === date &&
        w.distance_km !== undefined &&
        Math.abs(w.distance_km - parsed.distanceKm) < 0.05 &&
        Math.abs(w.duration_min - parsed.durationMin) <= 2)
    : undefined

  async function onFile(file: File | undefined) {
    if (!file) return
    setErr(''); setMsg(''); setParsed(null)
    try {
      const text = await file.text()
      const p = parseWorkoutFile(file.name, text)
      setParsed(p)
      setFileName(file.name)
      setSport(p.sport)
      setDate(p.date)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    }
  }

  async function save(force = false) {
    if (!parsed) return
    if (duplicate && !force) return // el usuario confirma con "Guardar de todos modos"
    setErr(''); setMsg(''); setSaving(true)
    try {
      await logWorkout({
        profile_id: profile.id,
        sport,
        date,
        duration_min: parsed.durationMin,
        distance_km: parsed.distanceKm > 0 ? parsed.distanceKm : undefined,
        notes: `Importado de ${parsed.source}${parsed.name && parsed.name !== 'Entrenamiento importado' ? ` · ${parsed.name}` : ''}`,
        route: parsed.route.length >= 2 ? parsed.route : undefined,
      })
      setMsg('Entrenamiento importado y guardado en tu historial.')
      setParsed(null)
      setFileName('')
      onRefresh()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar el entrenamiento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h3 className="text-lg font-bold">📥 Importar entrenamiento</h3>
      <p className="mb-3 text-sm text-slate-500">
        Trae tus entrenamientos de Strava, Garmin o Google Fit sin empezar de cero.
        El archivo se lee en tu teléfono y no se sube a ningún lado.
      </p>
      <p className="mb-3 rounded-xl bg-sage-50 p-2 text-xs text-slate-600">
        <b>Cómo bajar el archivo:</b><br />
        • Strava: abre la actividad → ⋯ → <b>Exportar GPX</b>.<br />
        • Google Fit: <b>Takeout</b> (takeout.google.com) → Fit → Activities (.tcx).<br />
        • Garmin: actividad → Exportar → GPX o TCX.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.tcx,application/gpx+xml,text/xml"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <Btn variant="ghost" className="w-full" onClick={() => inputRef.current?.click()}>
        Elegir archivo .gpx o .tcx
      </Btn>
      {fileName && <p className="mt-2 text-center text-xs text-slate-500">Archivo: {fileName}</p>}
      {err && <p className="mt-2 rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-2 rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}

      {parsed && (
        <div className="mt-3 space-y-3 rounded-2xl border border-teal/30 bg-teal/5 p-3">
          <p className="font-bold">Vista previa — revisa antes de guardar</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white p-2"><p className="text-lg font-black tabular-nums">{parsed.distanceKm.toFixed(2)} km</p><p className="text-xs text-slate-500">Distancia</p></div>
            <div className="rounded-xl bg-white p-2"><p className="text-lg font-black tabular-nums">{parsed.durationMin} min</p><p className="text-xs text-slate-500">Duración</p></div>
            <div className="rounded-xl bg-white p-2"><p className="text-lg font-black">{parsed.distanceKm > 0 ? paceMinKm(parsed.distanceKm, parsed.durationMin) : '—'}</p><p className="text-xs text-slate-500">Ritmo</p></div>
          </div>
          <p className="text-center text-xs text-slate-500">
            {parsed.route.length} puntos de ruta · Origen: {parsed.source}
            {parsed.name && parsed.name !== 'Entrenamiento importado' ? ` · ${parsed.name}` : ''}
          </p>
          <RouteMini route={parsed.route} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Deporte">
              <select className={selectCls} value={sport} onChange={(e) => setSport(e.target.value)}>
                {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Fecha"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          </div>
          {duplicate && (
            <p className="rounded-xl bg-amber-50 p-2 text-sm font-semibold text-amber-800">
              ⚠️ Ya tienes un entrenamiento el {date} de ~{duplicate.distance_km} km en {duplicate.duration_min} min.
              Parece el mismo: si lo guardas, quedará duplicado.
            </p>
          )}
          <div className="flex gap-2">
            <Btn variant="ghost" className="flex-1" onClick={() => { setParsed(null); setFileName('') }}>Cancelar</Btn>
            {duplicate ? (
              <Btn variant="coral" className="flex-1" disabled={saving} onClick={() => void save(true)}>
                {saving ? 'Guardando…' : 'Guardar de todos modos'}
              </Btn>
            ) : (
              <Btn variant="teal" className="flex-1" disabled={saving} onClick={() => void save()}>
                {saving ? 'Guardando…' : 'Guardar en mi historial'}
              </Btn>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
