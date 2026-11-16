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

export interface GpsProgress { active: boolean; status: 'idle' | 'recording' | 'paused' | 'done'; seconds: number; distanceKm: number; sport: string }

const GPS_SAVED_KEY = 'pulso_local_gps_in_progress'

interface SavedGps { sport: string; seconds: number; distanceKm: number; points: Point[]; savedAt: number }

function loadSavedGps(): SavedGps | null {
  try {
    const raw = localStorage.getItem(GPS_SAVED_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedGps
    if (!parsed || !Array.isArray(parsed.points)) return null
    return parsed
  } catch {
    return null
  }
}

export { GPS_SAVED_KEY }

/** Grabar con GPS: tiempo, distancia, ritmo, ruta, pausa y reanudar.
 *  Usa la API de geolocalización del navegador. Pide permiso de ubicación:
 *  sin permiso, muestra el mensaje y no graba.
 *  La grabación en curso se guarda en localStorage mientras graba, así
 *  sobrevive al cambiar de pestaña (Train ya no se desmonta) y a recargar:
 *  al volver queda en pausa, lista para reanudar donde iba. */
export default function GpsTracker({ onSave, onCancel, onProgress }: { onSave: (r: GpsResult) => void; onCancel: () => void; onProgress?: (p: GpsProgress) => void }) {
  const savedRef = useRef<SavedGps | null>(null)
  if (savedRef.current === null) savedRef.current = loadSavedGps()
  const saved = savedRef.current
  const [sport, setSport] = useState(saved?.sport || 'Caminata')
  // Una grabación guardada se restaura en pausa: no se reanuda sola sin
  // que el usuario toque Reanudar (el navegador no daría GPS sin gesto).
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'done'>(saved ? 'paused' : 'idle')
  const [seconds, setSeconds] = useState(saved?.seconds || 0)
  const [distanceKm, setDistanceKm] = useState(saved?.distanceKm || 0)
  const [error, setError] = useState(saved ? 'Tienes una grabación sin terminar. Toca Reanudar para seguir donde ibas.' : '')
  const [points, setPoints] = useState<Point[]>(saved?.points || [])
  // Pausa automática por estar parado: se detecta deriva del GPS (la
  // posición salta sola 5-15 m sin moverse, sobre todo en modo avión o
  // dentro de casa) y se deja de sumar distancia hasta moverse de verdad.
  const [autoPaused, setAutoPaused] = useState(false)
  const watchId = useRef<number | null>(null)
  const lastPoint = useRef<Point | null>(null)
  const lastFixAt = useRef<number>(0)
  // Ventana de 30 s para detectar parado: distancia real aceptada en ella.
  const stillWindowStart = useRef<number>(0)
  const stillWindowDistKm = useRef<number>(0)
  const autoPausedRef = useRef(false)

  // Cronómetro
  useEffect(() => {
    if (status !== 'recording') return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [status])

  // Guardar el progreso mientras graba / en pausa: sobrevive a recargar.
  // Al terminar, guardar o descartar se borra.
  useEffect(() => {
    try {
      if (status === 'recording' || status === 'paused') {
        localStorage.setItem(GPS_SAVED_KEY, JSON.stringify({ sport, seconds, distanceKm, points, savedAt: Date.now() }))
      } else {
        localStorage.removeItem(GPS_SAVED_KEY)
      }
    } catch { /* localStorage lleno o bloqueado: la grabación sigue en memoria */ }
  }, [status, seconds, distanceKm, points, sport])

  // Avisar arriba (App) para la barrita "Grabando…".
  useEffect(() => {
    onProgress?.({ active: status === 'recording' || status === 'paused', status, seconds, distanceKm, sport })
  }, [status, seconds, distanceKm, sport, onProgress])

  // Mantener la pantalla encendida mientras graba (si el navegador lo permite).
  // Al volver a la app se pide de nuevo: el navegador puede soltarlo al
  // cambiar de pestaña. Fallback silencioso si no hay Wake Lock.
  useEffect(() => {
    if (status !== 'recording') return
    let lock: { release: () => void } | null = null
    let cancelled = false
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } }
    const ask = () => {
      nav.wakeLock?.request('screen').then((l) => { if (!cancelled) lock = l }).catch(() => undefined)
    }
    ask()
    const onVisible = () => { if (document.visibilityState === 'visible') ask() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); lock?.release() }
  }, [status])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  function stopWatch() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }

  function setAutoPausedBoth(v: boolean) {
    autoPausedRef.current = v
    setAutoPaused(v)
  }

  function startWatch(from: Point) {
    lastPoint.current = from
    lastFixAt.current = Date.now()
    stillWindowStart.current = Date.now()
    stillWindowDistKm.current = 0
    setAutoPausedBoth(false)
    watchId.current = navigator.geolocation.watchPosition(
      (pos2) => {
        if (pos2.coords.accuracy > 25) return // punto poco preciso, se descarta
        const now = Date.now()
        const next = { lat: pos2.coords.latitude, lng: pos2.coords.longitude }
        const prev = lastPoint.current
        if (!prev) { lastPoint.current = next; lastFixAt.current = now; return }
        const d = haversineKm(prev, next)
        // Tiempo desde la última lectura válida: para la velocidad implícita.
        const dtSec = Math.max(0.5, (now - lastFixAt.current) / 1000)
        lastFixAt.current = now
        if (d > 0.2) return // salto mayor a 200 m: error del GPS, se ignora
        // Velocidad implícita: un salto de 10 m en 1 s son 36 km/h, imposible
        // caminando. La deriva salta así; el movimiento real no.
        const speedMs = (d * 1000) / dtSec
        const maxSpeedMs = sport === 'Ciclismo' ? 15 : sport === 'Correr' ? 6 : 2.5
        if (speedMs > maxSpeedMs) return
        // Ventana de 30 s: si en 30 s no se acumuló movimiento real
        // (menos de 10 m), estás parado: entra la pausa automática y los
        // saltos de deriva ya no se suman. El cronómetro sigue corriendo.
        if (now - stillWindowStart.current >= 30000) {
          const wasStill = stillWindowDistKm.current < 0.010
          stillWindowStart.current = now
          stillWindowDistKm.current = 0
          if (wasStill) setAutoPausedBoth(true)
        }
        if (autoPausedRef.current) {
          // Parado: solo un desplazamiento grande (>= 15 m desde el ancla)
          // y con buena precisión reanuda el conteo. Los saltos chicos de
          // deriva no mueven el ancla, así que no se acumulan.
          if (d < 0.015 || pos2.coords.accuracy > 15) return
          setAutoPausedBoth(false)
          stillWindowStart.current = now
          stillWindowDistKm.current = 0
        } else {
          // Umbral de ruido: menos de 8 m desde el ancla se ignora y el
          // ancla NO se mueve, así el movimiento real lento (caminar 1-2 m
          // por lectura) se acumula hasta pasar 8 m y sí se suma, mientras
          // que los saltos de deriva quedan atrapados alrededor del ancla.
          // Con señal floja (accuracy > 15 m) el umbral sube a 10 m.
          const minMoveKm = pos2.coords.accuracy > 15 ? 0.010 : 0.008
          if (d < minMoveKm) return
        }
        lastPoint.current = next
        stillWindowDistKm.current += d
        setDistanceKm((km) => km + d)
        setPoints((pts) => [...pts, next])
      },
      () => setError('Se perdió la señal GPS. La grabación sigue con lo que llevaba.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  }

  function pause() {
    // Antes la pausa solo cambiaba el texto: el watch seguía sumando
    // distancia. Ahora sí se detiene el GPS hasta reanudar.
    stopWatch()
    setStatus('paused')
  }

  // El primer punto también pasa el filtro de precisión: antes
  // getCurrentPosition aceptaba cualquier accuracy, así que la grabación
  // podía arrancar anclada a un punto con ±50 m de error y de ahí salían
  // los primeros saltos fantasma. Si la señal es muy débil, no arranca
  // y pide salir al aire libre, en vez de inventar distancia.
  function acceptFirstFix(pos: GeolocationPosition, onOk: (p: Point) => void) {
    if (pos.coords.accuracy > 25) {
      setError(`Señal GPS muy débil (precisión ±${Math.round(pos.coords.accuracy)} m). Sal al aire libre, espera unos segundos y vuelve a tocar Iniciar.`)
      return
    }
    onOk({ lat: pos.coords.latitude, lng: pos.coords.longitude })
  }

  function resume() {
    setError('')
    if (!('geolocation' in navigator)) {
      setError('Este teléfono o navegador no tiene GPS disponible. Usa el registro manual.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        acceptFirstFix(pos, (p) => {
          // Si hay ruta guardada, se sigue desde ahí sin borrar nada;
          // si no, este es el primer punto.
          if (points.length === 0) setPoints([p])
          setStatus('recording')
          startWatch(p)
        })
      },
      () => setError('No diste permiso de ubicación. Pulso la ubicación para este sitio y vuelve a intentar.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function start() {
    setError('')
    if (!('geolocation' in navigator)) {
      setError('Este teléfono o navegador no tiene GPS disponible. Usa el registro manual.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        acceptFirstFix(pos, (p) => {
          setPoints([p])
          setStatus('recording')
          startWatch(p)
        })
      },
      () => setError('No diste permiso de ubicación. Pulso la ubicación para este sitio y vuelve a intentar.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function finish() {
    stopWatch()
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
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black tabular-nums">{mm}:{ss}</p><p className="text-xs text-slate-500">Tiempo</p></div>
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black tabular-nums">{distanceKm.toFixed(2)} km</p><p className="text-xs text-slate-500">Distancia</p></div>
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black">{sport === 'Ciclismo' ? `${distanceKm > 0 && minutes > 0 ? (distanceKm / (minutes / 60)).toFixed(1) : '0'} km/h` : distanceKm < 0.01 ? '—' : paceMinKm(distanceKm, minutes)}</p><p className="text-xs text-slate-500">{sport === 'Ciclismo' ? 'Velocidad' : 'Ritmo'}</p></div>
          </div>
          <RouteMap pts={points} />
          <p className="text-center text-sm font-semibold text-coral">{status === 'paused' ? '⏸ Pausado' : '● Grabando… no cierres la app'}</p>
          {autoPaused && status === 'recording' && (
            <p className="rounded-xl bg-amber-50 p-2 text-center text-sm text-amber-800">⏸ Parece que estás parado — GPS en pausa automática. La distancia no se suma hasta que te muevas de verdad. El tiempo sigue corriendo.</p>
          )}
          <p className="text-center text-xs text-slate-500">La pantalla se mantiene encendida mientras grabas, para que el GPS y la música no se pausen.</p>
          {error && <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-800">{error}</p>}
          <div className="flex gap-2">
            {status === 'recording'
              ? <Btn variant="ghost" className="flex-1" onClick={pause}>Pausar</Btn>
              : <Btn variant="teal" className="flex-1" onClick={resume}>Reanudar</Btn>}
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
