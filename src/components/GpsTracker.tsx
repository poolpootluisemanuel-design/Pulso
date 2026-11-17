import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { haversineKm, paceMinKm } from '../lib/utils'
import { computeNavigation, formatDistM } from '../lib/navigation'
import type { RecommendedRoute } from '../lib/routes'
import { routeDistanceKm } from '../lib/routes'
import { Btn, Card } from './ui'
// El mapa (MapLibre, ~1 MB) solo se descarga cuando se muestra uno,
// no en la primera carga de la app: Entrenar abre sin esperarlo.
const MapView = lazy(() => import('./MapView'))

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
 *  al volver queda en pausa, lista para reanudar donde iba.
 *  Con `guide` (ruta recomendada elegida en Sesiones → Mapa), la ruta
 *  se dibuja como línea teal punteada de referencia mientras grabas. */
export default function GpsTracker({ onSave, onCancel, onProgress, guide, onClearGuide }: { onSave: (r: GpsResult) => void; onCancel: () => void; onProgress?: (p: GpsProgress) => void; guide?: RecommendedRoute | null; onClearGuide?: () => void }) {
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
  // Posición actual aceptada (ya pasó el filtro anti-deriva): es la
  // que usa la navegación guiada, para no dar indicaciones con saltos.
  const [currentPos, setCurrentPos] = useState<Point | null>(saved?.points?.length ? saved.points[saved.points.length - 1] : null)
  // Navegación guiada: progreso, próximo giro y si te saliste de la ruta.
  const nav = useMemo(
    () => (guide && currentPos ? computeNavigation(currentPos, guide) : null),
    [guide, currentPos],
  )
  // "Volver a la ruta": centra el mapa en el punto más cercano de la guía.
  const [focusKey, setFocusKey] = useState(0)
  // Indicaciones por voz (apagado por defecto): dice los giros con
  // speechSynthesis, solo mientras grabas y solo cuando cambia la
  // indicación, para no hablar encima de la música.
  const [voiceOn, setVoiceOn] = useState(() => {
    try { return localStorage.getItem('pulso_nav_voice') === '1' } catch { return false }
  })
  const lastSpokenRef = useRef('')
  useEffect(() => {
    if (!voiceOn || status !== 'recording' || !nav) return
    if (nav.instruction === lastSpokenRef.current) return
    lastSpokenRef.current = nav.instruction
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.cancel()
      const u = new SpeechSynthesisUtterance(nav.instruction.replace(/^[^\w]+/u, ''))
      u.lang = 'es-MX'
      u.rate = 1
      synth.speak(u)
    } catch { /* sin voz en este navegador: la indicación sigue en pantalla */ }
  }, [voiceOn, status, nav])
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
        setCurrentPos(next)
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
          setCurrentPos(p)
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
          setCurrentPos(p)
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

  // Mapa real de la ruta (MapLibre oscuro, 3D): la ruta se dibuja en
  // vivo en rojo pulso, el mapa sigue tu posición. Sin internet no
  // cargan las calles, pero la ruta y la distancia con GPS sí se
  // siguen grabando. Marcadores: inicio teal, posición actual roja.
  // Si vienes de una ruta recomendada, su trazado sale en teal
  // punteado como guía para seguirlo.
  const routeMarkers = points.length > 0 ? [
    { key: 'inicio', lat: points[0].lat, lng: points[0].lng, emoji: '🟢', color: '#14B8A6', popupHtml: '<b>Inicio</b>' },
    ...(points.length > 1 ? [{ key: 'ahora', lat: points[points.length - 1].lat, lng: points[points.length - 1].lng, emoji: '📍', color: '#E63946', popupHtml: '<b>Estás aquí</b>' }] : []),
  ] : []
  const routeMap = (
    <Suspense fallback={<div className="rounded-2xl bg-night p-4 text-center text-sm text-white/70" style={{ height: 260 }}>Cargando mapa…</div>}>
      <MapView
        center={points.length > 0 ? points[points.length - 1] : guide ? guide.points[0] : undefined}
        points={points}
        guidePoints={guide?.points}
        markers={routeMarkers}
        height={260}
        follow
        focus={nav?.nearestPoint}
        focusKey={focusKey}
        defaultBasemap={guide?.zone === 'Isla Mujeres' ? 'satellite' : 'dark'}
        offlineNote="📶 Sin internet: el mapa no carga las calles, pero tu ruta se sigue grabando con GPS."
      />
    </Suspense>
  )

  return (
    <Card>
      <h3 className="text-lg font-bold">Grabar con GPS</h3>
      <p className="mb-3 text-sm text-slate-500">Caminata, correr o ciclismo. Se guarda tu ruta, distancia y ritmo.</p>
      {guide && (
        <p className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-teal/10 p-2 text-sm font-semibold text-teal-dark">
          <span>🗺️ Siguiendo ruta: {guide.name} — sigue la línea teal punteada.</span>
          {onClearGuide && <button className="shrink-0 text-xs underline" onClick={onClearGuide}>Quitar guía</button>}
        </p>
      )}

      {status === 'idle' && (
        <div className="space-y-3">
          {guide && (
            <div>
              {routeMap}
              <p className="mt-1 text-center text-xs text-slate-500">La línea teal es la ruta recomendada ({routeDistanceKm(guide).toFixed(1)} km aprox.). Tu recorrido se dibuja en rojo encima. Al iniciar te diré cuándo girar y cuánto falta.</p>
              <label className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={voiceOn} onChange={(e) => {
                  const v = e.target.checked
                  setVoiceOn(v)
                  try { localStorage.setItem('pulso_nav_voice', v ? '1' : '0') } catch { /* noop */ }
                }} />
                🔊 Indicaciones por voz
              </label>
            </div>
          )}
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
          {guide && nav && (
            <div className="space-y-2 rounded-2xl bg-night p-3 text-white shadow-md">
              <p className="text-xl font-black leading-tight">{nav.instruction}</p>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-pulso" style={{ width: `${nav.progressPct}%` }} />
              </div>
              <p className="text-sm font-semibold text-white/85">
                {nav.progressKm.toFixed(2)} km de {nav.totalKm.toFixed(1)} km · faltan {nav.remainingKm.toFixed(2)} km ({Math.round(nav.progressPct)}%)
              </p>
              {nav.nextTurn && !nav.completed && !nav.offRoute && (
                <p className="text-sm text-teal">
                  Próximo giro: {nav.nextTurn.direction === 'vuelta' ? 'da la vuelta' : `a la ${nav.nextTurn.direction}`} en {formatDistM(nav.nextTurn.distanceM)}
                </p>
              )}
              {nav.offRoute && (
                <div className="space-y-2 rounded-xl bg-amber-400/20 p-2">
                  <p className="text-sm font-bold text-amber-200">Estás a {Math.round(nav.distToRouteM)} m de la ruta. Sigue la línea teal en el mapa.</p>
                  <Btn variant="teal" className="w-full" onClick={() => setFocusKey((k) => k + 1)}>📍 Volver a la ruta</Btn>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm font-semibold text-white/85">
                <input type="checkbox" checked={voiceOn} onChange={(e) => {
                  const v = e.target.checked
                  setVoiceOn(v)
                  try { localStorage.setItem('pulso_nav_voice', v ? '1' : '0') } catch { /* noop */ }
                  if (!v) { try { window.speechSynthesis?.cancel() } catch { /* noop */ } }
                }} />
                🔊 Indicaciones por voz
              </label>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black tabular-nums">{mm}:{ss}</p><p className="text-xs text-slate-500">Tiempo</p></div>
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black tabular-nums">{distanceKm.toFixed(2)} km</p><p className="text-xs text-slate-500">Distancia</p></div>
            <div className="rounded-xl bg-sage-50 p-2"><p className="text-xl font-black">{sport === 'Ciclismo' ? `${distanceKm > 0 && minutes > 0 ? (distanceKm / (minutes / 60)).toFixed(1) : '0'} km/h` : distanceKm < 0.01 ? '—' : paceMinKm(distanceKm, minutes)}</p><p className="text-xs text-slate-500">{sport === 'Ciclismo' ? 'Velocidad' : 'Ritmo'}</p></div>
          </div>
          {routeMap}
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
          {routeMap}
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
