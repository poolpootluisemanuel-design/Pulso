import { useEffect, useRef, useState } from 'react'
import { haversineKm, paceMinKm } from '../lib/utils'
import { Btn, Card } from './ui'

interface Point { lat: number; lng: number }

export interface GpsResult {
  sport: string
  durationMin: number
  distanceKm: number
  route: Point[]
}

/** Grabar con GPS: tiempo, distancia, ritmo, ruta, pausa y reanudar.
 *  Usa la API de geolocalización del navegador. Pide permiso de ubicación:
 *  sin permiso, muestra el mensaje y no graba. */
export default function GpsTracker({ onSave, onCancel }: { onSave: (r: GpsResult) => void; onCancel: () => void }) {
  const [sport, setSport] = useState('Caminata')
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'done'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [distanceKm, setDistanceKm] = useState(0)
  const [error, setError] = useState('')
  const [points, setPoints] = useState<Point[]>([])
  const watchId = useRef<number | null>(null)
  const lastPoint = useRef<Point | null>(null)
  const lastTime = useRef<number>(0)

  // Cronómetro
  useEffect(() => {
    if (status !== 'recording') return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [status])

  // Mantener la pantalla encendida mientras graba (si el navegador lo permite).
  useEffect(() => {
    if (status !== 'recording') return
    let lock: { release: () => void } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } }
    nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => undefined)
    return () => { lock?.release() }
  }, [status])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  function start() {
    setError('')
    if (!('geolocation' in navigator)) {
      setError('Este teléfono o navegador no tiene GPS disponible. Usa el registro manual.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        lastPoint.current = p
        lastTime.current = Date.now()
        setPoints([p])
        setStatus('recording')
        watchId.current = navigator.geolocation.watchPosition(
          (pos2) => {
            if (pos2.coords.accuracy > 25) return // punto poco preciso, se descarta
            const next = { lat: pos2.coords.latitude, lng: pos2.coords.longitude }
            const prev = lastPoint.current
            if (!prev) { lastPoint.current = next; return }
            const d = haversineKm(prev, next)
            if (d < 0.003) return // menos de 3 m: ruido del GPS, se ignora
            if (d > 0.2) return // salto mayor a 200 m: error del GPS, se ignora
            lastPoint.current = next
            setDistanceKm((km) => km + d)
            setPoints((pts) => [...pts, next])
          },
          () => setError('Se perdió la señal GPS. La grabación sigue con lo que llevaba.'),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        )
      },
      () => setError('No diste permiso de ubicación. Pulso la ubicación para este sitio y vuelve a intentar.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function finish() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setStatus('done')
  }

  const minutes = seconds / 60
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  // Mini mapa de la ruta (proyección simple a SVG, sin librerías externas).
  function RouteMap({ pts, h = 140 }: { pts: Point[]; h?: number }) {
    if (pts.length < 2) return <p className="py-4 text-center text-sm text-slate-500">Tu ruta se dibuja aquí mientras caminas.</p>
    const lats = pts.map((p) => p.lat)
    const lngs = pts.map((p) => p.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const w = 320
    const x = (lng: number) => 10 + ((lng - minLng) / Math.max(maxLng - minLng, 0.0001)) * (w - 20)
    const y = (lat: number) => h - 10 - ((lat - minLat) / Math.max(maxLat - minLat, 0.0001)) * (h - 20)
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ')
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-xl bg-sage-100">
        <path d={d} fill="none" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round" />
        <circle cx={x(pts[0].lng)} cy={y(pts[0].lat)} r="5" fill="#22c55e" />
        <circle cx={x(pts[pts.length - 1].lng)} cy={y(pts[pts.length - 1].lat)} r="5" fill="#E63946" />
      </svg>
    )
  }

  return (
    <Card>
      <h3 className="text-lg font-bold">Grabar con GPS</h3>
      <p className="mb-3 text-sm text-slate-500">Caminata, correr o ciclismo. Se guarda tu ruta, distancia y ritmo.</p>

      {status === 'idle' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {['Caminata', 'Correr', 'Ciclismo'].map((s) => (
              <button key={s} onClick={() => setSport(s)}
                className={`rounded-full px-3 py-2 text-sm font-semibold ${sport === s ? 'bg-teal text-white' : 'bg-sage-100 text-teal-dark'}`}>
                {s}
              </button>
            ))}
          </div>
          {error && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <Btn variant="coral" className="w-full" onClick={start}>▶ Iniciar grabación GPS</Btn>
          <button className="w-full text-center text-sm text-slate-500 underline" onClick={onCancel}>Usar registro manual</button>
        </div>
      )}

      {(status === 'recording' || status === 'paused') && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black">{mm}:{ss}</p><p className="text-xs text-slate-500">Tiempo</p></div>
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black">{distanceKm.toFixed(2)} km</p><p className="text-xs text-slate-500">Distancia</p></div>
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black">{sport === 'Ciclismo' ? `${distanceKm > 0 && minutes > 0 ? (distanceKm / (minutes / 60)).toFixed(1) : '0'} km/h` : paceMinKm(distanceKm, minutes)}</p><p className="text-xs text-slate-500">{sport === 'Ciclismo' ? 'Velocidad' : 'Ritmo'}</p></div>
          </div>
          <RouteMap pts={points} />
          <p className="text-center text-sm font-semibold text-coral">{status === 'paused' ? '⏸ Pausado' : '● Grabando… no cierres la app'}</p>
          {error && <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-800">{error}</p>}
          <div className="flex gap-2">
            {status === 'recording'
              ? <Btn variant="ghost" className="flex-1" onClick={() => setStatus('paused')}>Pausar</Btn>
              : <Btn variant="teal" className="flex-1" onClick={() => setStatus('recording')}>Reanudar</Btn>}
            <Btn variant="coral" className="flex-1" onClick={finish}>Terminar</Btn>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="space-y-3">
          <h4 className="font-bold">Resumen de tu {sport.toLowerCase()}</h4>
          <p className="text-sm text-slate-600">Tiempo: {mm}:{ss} · Distancia: {distanceKm.toFixed(2)} km · Ritmo: {paceMinKm(distanceKm, minutes)}</p>
          <RouteMap pts={points} h={160} />
          <Btn variant="coral" className="w-full" onClick={() => onSave({ sport, durationMin: Math.max(1, Math.round(minutes)), distanceKm: Math.round(distanceKm * 100) / 100, route: points })}>
            Guardar entrenamiento
          </Btn>
          <button className="w-full text-center text-sm text-slate-500 underline" onClick={() => { setStatus('idle'); setSeconds(0); setDistanceKm(0); setPoints([]) }}>
            Descartar y volver a grabar
          </button>
        </div>
      )}
    </Card>
  )
}
