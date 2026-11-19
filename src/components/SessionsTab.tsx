import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { Level, Profile, Rsvp, SessionItem } from '../lib/types'
import { LEVELS, SPORTS, ZONES } from '../lib/types'
import { cancelRsvp, createSession, joinSession, listRsvps } from '../lib/store'
import { subscribeLiveTrainers, type LiveTrainer } from '../lib/liveTraining'
import SessionChat from './SessionChat'
import LiveTrainingLayer, { liveTrainersToMarkers } from './LiveTrainingLayer'
import { formatDate, todayISO, weekdayName } from '../lib/utils'
import { Btn, Card, Empty, Field, inputCls, selectCls, Tag } from './ui'
// El mapa (MapLibre, ~1 MB) solo se descarga cuando se abre la vista
// de mapa, no en la primera carga de la app.
const MapView = lazy(() => import('./MapView'))
import type { MapMarker } from './MapView'
import RecommendedRoutes from './RecommendedRoutes'
import MapBottomSheet from './MapBottomSheet'
import { RECOMMENDED_ROUTES, routesSortedByZone, zoneCenter } from '../lib/routes'
import type { RecommendedRoute } from '../lib/routes'
import { isNative } from '../lib/native'
import { getNativeCurrentPosition } from '../lib/nativeGps'

const SPORT_EMOJI: Record<string, string> = {
  running: '🏃', caminata: '🚶', pádel: '🎾', padel: '🎾', crossfit: '💪',
  ciclismo: '🚴', surf: '🏄', natación: '🏊', gym: '🏋️', yoga: '🧘',
}
function sportEmoji(sport: string) {
  return SPORT_EMOJI[sport.toLowerCase()] || '🏅'
}

// El popup del mapa es HTML: se escapan los textos del usuario para
// que un título con < o " no rompa el marcador.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function SessionsTab({ profile, sessions, onRefresh, onRunRoute, createSignal = 0, guest = false, onNeedAccount, gpsActive = false, onMapImmersiveChange }: { profile: Profile; sessions: SessionItem[]; onRefresh: () => void; onRunRoute?: (route: RecommendedRoute) => void; createSignal?: number; guest?: boolean; onNeedAccount?: () => void; gpsActive?: boolean; onMapImmersiveChange?: (active: boolean) => void }) {
  const [showForm, setShowForm] = useState(false)
  // El botón flotante "+" (App.tsx) abre el formulario de crear: cada
  // toque suma 1 a createSignal y aquí se abre el formulario.
  // En modo invitado el botón no existe, pero si llegara la señal se
  // ignora: crear sesión necesita cuenta.
  const createSignalRef = useRef(0)
  useEffect(() => {
    if (createSignal > createSignalRef.current) { createSignalRef.current = createSignal; if (!guest) setShowForm(true) }
  }, [createSignal, guest])
  const [title, setTitle] = useState('')
  const [sport, setSport] = useState('Pádel')
  const [level, setLevel] = useState<Level | 'todos'>('todos')
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('19:00')
  const [place, setPlace] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [rsvps, setRsvps] = useState<Record<string, Rsvp[]>>({})
  // Chat de la sesión abierta (solo una a la vez).
  const [openChatId, setOpenChatId] = useState<string | null>(null)
  // Cancelar el lugar: primero se pide confirmación de un toque
  // (para no cancelar por accidente) y luego se hace con try/catch:
  // si falla, se avisa en vez de dejar creer que ya canceló.
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  // Mapa en vivo: quién entrena ahora (opt-in, presencia efímera).
  const [liveTrainers, setLiveTrainers] = useState<LiveTrainer[]>([])
  const [showLive, setShowLive] = useState(true)
  // Vista Lista / Mapa y ubicación del lugar al crear la sesión.
  const [view, setView] = useState<'lista' | 'mapa'>('lista')
  // Dentro del mapa: sesiones con ubicación o rutas recomendadas.
  const [mapMode, setMapMode] = useState<'sesiones' | 'rutas'>('sesiones')
  // Suscripción al mapa en vivo: solo en vista mapa + modo sesiones.
  useEffect(() => {
    if (view !== 'mapa' || mapMode !== 'sesiones') return
    return subscribeLiveTrainers(setLiveTrainers)
  }, [view, mapMode])
  const [selectedRoute, setSelectedRoute] = useState<RecommendedRoute | null>(null)
  // Centro del mapa: GPS del usuario si ya dio permiso, si no su zona
  // (Isla Mujeres si es su zona), nunca siempre Cancún centro.
  const [gpsCenter, setGpsCenter] = useState<{ lat: number; lng: number } | null>(null)
  // Estado de la ubicación pedida a mano (botón de rutas cercanas).
  const [locState, setLocState] = useState<'idle' | 'loading' | 'denied' | 'unavailable'>('idle')

  // Pide la ubicación actual una sola vez (botón "Mostrar las más
  // cercanas a mí" en Rutas): en nativo con Capacitor, en web con el
  // navegador. Sirve para ordenar las rutas por cercanía y para el
  // marcador "Estás aquí" en el mapa.
  function requestUserPosition() {
    setLocState('loading')
    if (isNative()) {
      void getNativeCurrentPosition().then((p) => {
        if (!p) { setLocState('denied'); return }
        setGpsCenter({ lat: p.lat, lng: p.lng })
        setLocState('idle')
      })
      return
    }
    if (!('geolocation' in navigator)) { setLocState('unavailable'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocState('idle')
      },
      () => setLocState('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Al abrir el mapa, intenta centrar en el GPS si el permiso ya está
  // concedido (sin preguntar de nuevo); si no, centra en su zona.
  function openMap() {
    setView('mapa')
    if (!('geolocation' in navigator)) return
    const nav = navigator as Navigator & { permissions?: { query: (o: { name: string }) => Promise<{ state: string }> } }
    nav.permissions?.query({ name: 'geolocation' }).then(
      (res) => {
        if (res.state !== 'granted') return
        navigator.geolocation.getCurrentPosition(
          (pos) => setGpsCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => undefined,
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        )
      },
      () => undefined
    ).catch(() => undefined)
  }
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [locBusy, setLocBusy] = useState(false)
  const [locMsg, setLocMsg] = useState('')

  async function loadRsvps(id: string) {
    const list = await listRsvps(id)
    setRsvps((prev) => ({ ...prev, [id]: list }))
  }

  // "Usar mi ubicación": guarda las coordenadas actuales del teléfono
  // como ubicación de la sesión. Es opcional: sin ella la sesión solo
  // sale en la lista, no en el mapa.
  function useMyLocation() {
    setErr(''); setLocMsg('')
    if (!('geolocation' in navigator)) {
      setErr('Este teléfono o navegador no tiene GPS disponible.')
      return
    }
    setLocBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setLocMsg(`📍 Ubicación guardada: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
        setLocBusy(false)
      },
      () => {
        setErr('No se pudo tomar tu ubicación. Revisa el permiso de ubicación para este sitio e inténtalo de nuevo.')
        setLocBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      await createSession({
        title: title.trim(), sport, level, date, time,
        place: place.trim(), zone: profile.zone,
        capacity: Number(capacity) || 4,
        host_id: profile.id, host_name: profile.name,
        ...(lat !== null && lng !== null ? { lat, lng } : {}),
      })
      setMsg(`Sesión creada para ${weekdayName(date)} ${formatDate(date)}. ¡Compártela con tus compañeros!`)
      setTitle(''); setPlace(''); setLat(null); setLng(null); setLocMsg(''); setShowForm(false)
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo crear la sesión.') }
  }

  // Solo las sesiones con coordenadas aparecen en el mapa.
  const withCoords = sessions.filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
  const markers: MapMarker[] = withCoords.map((s) => {
    const list = rsvps[s.id]
    const confirmed = list?.filter((r) => r.status === 'confirmed').length ?? 0
    return {
      key: s.id,
      lat: s.lat as number,
      lng: s.lng as number,
      emoji: sportEmoji(s.sport),
      color: '#E63946',
      popupHtml: `<b>${esc(s.title)}</b><br>${esc(s.sport)} · ${esc(s.level)}<br>${esc(weekdayName(s.date))} ${esc(formatDate(s.date))} · ${esc(s.time)}<br>${esc(s.place)}<br>Cupo ${confirmed}/${s.capacity} · ${esc(s.host_name)}`,
    }
  })
  const mapCenter = withCoords.length > 0
    ? { lat: withCoords[0].lat as number, lng: withCoords[0].lng as number }
    : gpsCenter || zoneCenter(profile.zone)
  // Marcador "Estás aquí": tu ubicación actual, si se conoce (al
  // abrir el mapa con permiso, o con el botón de rutas cercanas).
  // Así se ve en el mapa si estás lejos del inicio de una ruta.
  const youMarker: MapMarker[] = gpsCenter ? [
    { key: 'yo', lat: gpsCenter.lat, lng: gpsCenter.lng, emoji: '🧍', color: '#0A1B2E', popupHtml: '<b>Estás aquí</b>' },
  ] : []
  // En Isla Mujeres el mapa oscuro es casi todo mar gris: allí el
  // mapa arranca en satélite (se ve la isla real). El usuario puede
  // cambiarlo con el selector y su elección se guarda.
  const defaultBasemap = profile.zone === 'Isla Mujeres' ? 'satellite' as const : 'dark' as const
  // Primera ruta que se muestra al abrir Rutas: la primera de su zona.
  const firstRouteForZone = routesSortedByZone(profile.zone)[0] || RECOMMENDED_ROUTES[0]

  // Vista inmersiva del mapa (Fase 1): Sesiones → Mapa a pantalla
  // completa cuando hay algo que mostrar en el mapa (sesiones con
  // ubicación, o una ruta seleccionada). Sin sesiones con ubicación,
  // la vista de mapa sigue siendo la de antes (mensaje vacío), sin
  // overlay. La lista no cambia: solo cambia dónde se dibuja el mapa.
  const showImmersiveMap = view === 'mapa' && (mapMode === 'rutas' ? selectedRoute !== null : withCoords.length > 0)
  // Avisar a App (esconde el FAB "+" que el overlay taparía) y
  // bloquear el scroll de la página detrás mientras el mapa inmersivo
  // está abierto.
  useEffect(() => {
    onMapImmersiveChange?.(showImmersiveMap)
    // Al desmontar (cambiar de pestaña con el mapa abierto), avisar
    // que ya no está inmersivo para no dejar el FAB escondido.
    return () => { onMapImmersiveChange?.(false) }
  }, [showImmersiveMap, onMapImmersiveChange])
  useEffect(() => {
    if (!showImmersiveMap) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [showImmersiveMap])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-teal-dark">Sesiones y eventos</h2>
        <Btn variant="coral" onClick={() => { if (guest) { onNeedAccount?.(); return } setShowForm(!showForm) }}>+ Crear</Btn>
      </div>

      {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}
      {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}

      {showForm && (
        <Card>
          <form onSubmit={create} className="space-y-3">
            <Field label="Título"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ej. Pádel entre semana" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Deporte">
                <select className={selectCls} value={sport} onChange={(e) => setSport(e.target.value)}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select>
              </Field>
              <Field label="Nivel">
                <select className={selectCls} value={level} onChange={(e) => setLevel(e.target.value as Level | 'todos')}>
                  <option value="todos">Todos los niveles</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha">
                <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                {date && <p className="text-xs text-slate-500">Es {weekdayName(date)} — verifica que sea el día que quieres.</p>}
              </Field>
              <Field label="Hora"><input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
            </div>
            <Field label="Lugar / cancha"><input className={inputCls} value={place} onChange={(e) => setPlace(e.target.value)} required placeholder="Ej. Cancha Tajamar" /></Field>
            {/* Ubicación en el mapa: opcional. Si no se pone, la sesión
                solo sale en la lista. */}
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Ubicación en el mapa (opcional)</p>
              <div className="flex gap-2">
                <Btn type="button" variant="teal" className="flex-1" onClick={useMyLocation} disabled={locBusy}>
                  {locBusy ? 'Tomando ubicación…' : '📍 Usar mi ubicación'}
                </Btn>
                {lat !== null && lng !== null && (
                  <Btn type="button" variant="ghost" onClick={() => { setLat(null); setLng(null); setLocMsg('') }}>Quitar</Btn>
                )}
              </div>
              {locMsg && <p className="mt-1 text-xs font-semibold text-teal-dark">{locMsg}</p>}
              <p className="mt-1 text-xs text-slate-500">Si estás en el lugar de la sesión, guárdalo aquí y saldrá en el mapa.</p>
            </div>
            <Field label="Zona">
              <select className={selectCls} value={profile.zone} disabled>
                <option>{profile.zone}</option>
              </select>
            </Field>
            <Field label="Cupo (personas)"><input className={inputCls} type="number" min="2" max="50" value={capacity} onChange={(e) => setCapacity(e.target.value)} required /></Field>
            <Btn type="submit" variant="coral" className="w-full">Crear sesión</Btn>
          </form>
        </Card>
      )}

      {/* Vista Lista / Mapa */}
      <div className="flex gap-2">
        <button onClick={() => setView('lista')} className={`pulso-press flex-1 rounded-full px-3 py-2 text-sm font-bold ${view === 'lista' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>📋 Lista</button>
        <button onClick={openMap} className={`pulso-press flex-1 rounded-full px-3 py-2 text-sm font-bold ${view === 'mapa' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>🗺️ Mapa ({withCoords.length})</button>
      </div>

      {view === 'mapa' && !showImmersiveMap && (
        <div className="space-y-3">
          {/* Dentro del mapa: sesiones o rutas recomendadas para correr. */}
          <div className="flex gap-2">
            <button onClick={() => setMapMode('sesiones')} className={`pulso-press flex-1 rounded-full px-3 py-2 text-sm font-bold ${mapMode === 'sesiones' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>📍 Sesiones ({withCoords.length})</button>
            <button onClick={() => { setMapMode('rutas'); if (!selectedRoute) setSelectedRoute(firstRouteForZone) }} className={`pulso-press flex-1 rounded-full px-3 py-2 text-sm font-bold ${mapMode === 'rutas' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>🏃 Rutas ({RECOMMENDED_ROUTES.length})</button>
          </div>

          {mapMode === 'sesiones' && (withCoords.length === 0 ? (
            <Empty text="Ninguna sesión tiene ubicación en el mapa todavía. Al crear una, toca «Usar mi ubicación» estando en el lugar." />
          ) : (
            <>
              <LiveTrainingLayer trainers={liveTrainers} visible={showLive} onToggle={setShowLive} selfProfileId={profile.id} />
              <Suspense fallback={<div className="rounded-2xl bg-night p-4 text-center text-sm text-white/70" style={{ height: 320 }}>Cargando mapa…</div>}>
                <div className="relative" style={{ height: 320 }}>
                  <MapView center={mapCenter} markers={[...markers, ...youMarker, ...(showLive ? liveTrainersToMarkers(liveTrainers, profile.id) : [])]} height={320} defaultBasemap={defaultBasemap} offlineNote="📶 Sin internet: el mapa necesita internet para cargar las calles." />
                  <MapBottomSheet title="Sesiones en el mapa" count={withCoords.length}>
                    <div className="space-y-2">
                      {withCoords.map((s) => {
                        const list = rsvps[s.id]
                        const confirmed = list?.filter((r) => r.status === 'confirmed').length ?? 0
                        return (
                          <div key={s.id} className="rounded-xl bg-white p-2 shadow-sm">
                            <p className="text-sm font-bold text-night">{sportEmoji(s.sport)} {s.title}</p>
                            <p className="text-xs text-slate-500">{weekdayName(s.date)} {formatDate(s.date)} · {s.time} · {s.place}</p>
                            <p className="text-xs font-semibold text-teal-dark">Cupo {confirmed}/{s.capacity} · {s.host_name}</p>
                          </div>
                        )
                      })}
                      <p className="pt-1 text-center text-[11px] text-slate-500">Toca un marcador en el mapa para ver deporte, fecha, hora, lugar y cupos.</p>
                    </div>
                  </MapBottomSheet>
                </div>
              </Suspense>
              <p className="text-center text-xs text-slate-500">Toca un marcador para ver deporte, fecha, hora, lugar y cupos. Las sesiones sin ubicación solo salen en la lista.</p>
            </>
          ))}

          {mapMode === 'rutas' && (
            <>
              {selectedRoute && (
                <Suspense fallback={<div className="rounded-2xl bg-night p-4 text-center text-sm text-white/70" style={{ height: 320 }}>Cargando mapa…</div>}>
                  <MapView
                    center={selectedRoute.points[0]}
                    guidePoints={selectedRoute.points}
                    defaultBasemap={defaultBasemap}
                    markers={[
                      { key: 'r-inicio', lat: selectedRoute.points[0].lat, lng: selectedRoute.points[0].lng, emoji: '🟢', color: '#14B8A6', popupHtml: '<b>Inicio</b>' },
                      { key: 'r-fin', lat: selectedRoute.points[selectedRoute.points.length - 1].lat, lng: selectedRoute.points[selectedRoute.points.length - 1].lng, emoji: '🏁', color: '#E63946', popupHtml: '<b>Fin</b>' },
                      ...youMarker,
                    ]}
                    height={320}
                    offlineNote="📶 Sin internet: el mapa necesita internet para cargar las calles."
                  />
                </Suspense>
              )}
              <RecommendedRoutes
                selectedId={selectedRoute?.id || null}
                onSelect={setSelectedRoute}
                onRun={(r) => onRunRoute?.(r)}
                userZone={profile.zone}
                userPosition={gpsCenter}
                onRequestLocation={requestUserPosition}
                locState={locState}
              />
            </>
          )}
        </div>
      )}

      {/* Mapa inmersivo (Fase 1): contenedor fixed a pantalla completa.
          El mapa llena el área sobre la navegación + el dock de música
          (que quedan visibles y funcionales). La hoja es hija flex
          (modo dock): el mapa ocupa lo que queda arriba y la
          atribución de MapLibre queda visible justo encima de la hoja,
          nunca tapada. En escritorio la hoja es panel lateral. Se sale
          con ← Lista; + Crear sale del mapa y abre el formulario. */}
      {showImmersiveMap && (
        <div className={`pulso-map-immersive ${gpsActive ? 'pulso-map-immersive-gps' : ''}`}>
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#EFEAE2] text-sm font-bold text-night">🗺️ Cargando mapa…</div>}>
              {mapMode === 'sesiones' ? (
                <MapView
                  center={mapCenter}
                  markers={[...markers, ...youMarker, ...(showLive ? liveTrainersToMarkers(liveTrainers, profile.id) : [])]}
                  defaultBasemap={defaultBasemap}
                  offlineNote="📶 Sin internet: el mapa necesita internet para cargar las calles."
                  immersive
                />
              ) : selectedRoute ? (
                <MapView
                  center={selectedRoute.points[0]}
                  guidePoints={selectedRoute.points}
                  defaultBasemap={defaultBasemap}
                  markers={[
                    { key: 'r-inicio', lat: selectedRoute.points[0].lat, lng: selectedRoute.points[0].lng, emoji: '🟢', color: '#14B8A6', popupHtml: '<b>Inicio</b>' },
                    { key: 'r-fin', lat: selectedRoute.points[selectedRoute.points.length - 1].lat, lng: selectedRoute.points[selectedRoute.points.length - 1].lng, emoji: '🏁', color: '#E63946', popupHtml: '<b>Fin</b>' },
                    ...youMarker,
                  ]}
                  offlineNote="📶 Sin internet: el mapa necesita internet para cargar las calles."
                  immersive
                />
              ) : null}
            </Suspense>
            {/* Pastilla flotante: salir a la lista + crear sesión. */}
            <div className="absolute left-2 z-20 flex items-center gap-2" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}>
              <button type="button" onClick={() => setView('lista')} className="pulso-press rounded-full bg-white/95 px-3 py-2 text-sm font-black text-night shadow-lg">← Lista</button>
              <span className="rounded-full bg-night/85 px-3 py-2 text-xs font-bold text-white shadow-lg">🗺️ Mapa · {profile.zone}</span>
              {!guest && (
                <button type="button" onClick={() => { setView('lista'); setShowForm(true) }} className="pulso-press rounded-full bg-pulso px-3 py-2 text-sm font-black text-night shadow-lg">+ Crear</button>
              )}
            </div>
          </div>
          <MapBottomSheet
            dock
            title="Sesiones en el mapa"
            count={withCoords.length}
            header={(
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button onClick={() => setMapMode('sesiones')} className={`pulso-press flex-1 rounded-full px-3 py-2 text-sm font-bold ${mapMode === 'sesiones' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>📍 Sesiones ({withCoords.length})</button>
                  <button onClick={() => { setMapMode('rutas'); if (!selectedRoute) setSelectedRoute(firstRouteForZone) }} className={`pulso-press flex-1 rounded-full px-3 py-2 text-sm font-bold ${mapMode === 'rutas' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>🏃 Rutas ({RECOMMENDED_ROUTES.length})</button>
                </div>
                {mapMode === 'sesiones' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLive(!showLive)}
                      aria-pressed={showLive}
                      className={`pulso-press rounded-full px-3 py-1.5 text-xs font-bold shadow-sm ${showLive ? 'bg-pulso text-night' : 'bg-white text-slate-600'}`}
                    >
                      {showLive ? '🔴' : '⚪'} Entrenando ahora{liveTrainers.length > 0 ? ` (${liveTrainers.length})` : ''}
                    </button>
                    {showLive && liveTrainers.length === 0 && (
                      <span className="text-xs text-slate-500">Nadie entrena ahora mismo.</span>
                    )}
                  </div>
                )}
              </div>
            )}
          >
            {mapMode === 'sesiones' ? (
              <div className="space-y-2">
                {withCoords.map((s) => {
                  const list = rsvps[s.id]
                  const confirmed = list?.filter((r) => r.status === 'confirmed').length ?? 0
                  return (
                    <div key={s.id} className="rounded-xl bg-white p-2 shadow-sm">
                      <p className="text-sm font-bold text-night">{sportEmoji(s.sport)} {s.title}</p>
                      <p className="text-xs text-slate-500">{weekdayName(s.date)} {formatDate(s.date)} · {s.time} · {s.place}</p>
                      <p className="text-xs font-semibold text-teal-dark">Cupo {confirmed}/{s.capacity} · {s.host_name}</p>
                    </div>
                  )
                })}
                <p className="pt-1 text-center text-[11px] text-slate-500">Toca un marcador en el mapa para ver deporte, fecha, hora, lugar y cupos.</p>
              </div>
            ) : (
              <RecommendedRoutes
                selectedId={selectedRoute?.id || null}
                onSelect={setSelectedRoute}
                onRun={(r) => onRunRoute?.(r)}
                userZone={profile.zone}
                userPosition={gpsCenter}
                onRequestLocation={requestUserPosition}
                locState={locState}
              />
            )}
          </MapBottomSheet>
        </div>
      )}

      {view === 'lista' && (sessions.length === 0 ? <Empty text="No hay sesiones todavía. Crea la primera e invita a tu grupo." /> : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const list = rsvps[s.id]
            const mine = list?.find((r) => r.profile_id === profile.id)
            const confirmed = list?.filter((r) => r.status === 'confirmed').length ?? 0
            return (
              <Card key={s.id}>
                <div className="flex gap-2"><Tag>{s.sport}</Tag><Tag>{s.level}</Tag><Tag>{s.zone}</Tag>{typeof s.lat === 'number' && <Tag>📍 En mapa</Tag>}</div>
                <p className="mt-2 text-lg font-bold">{s.title}</p>
                <p className="text-sm text-slate-600">{weekdayName(s.date)} {formatDate(s.date)} · {s.time} · {s.place}</p>
                <p className="text-sm text-slate-500">Organiza {s.host_name} · Cupo {confirmed}/{s.capacity}</p>
                <div className="mt-2 flex gap-2">
                  <button className="text-sm font-semibold text-teal-dark underline" onClick={() => loadRsvps(s.id)}>
                    Ver quién va ({confirmed})
                  </button>
                  <button className="text-sm font-semibold text-teal-dark underline" onClick={async () => {
                    if (guest) { onNeedAccount?.(); return }
                    await loadRsvps(s.id)
                    setOpenChatId(openChatId === s.id ? null : s.id)
                  }}>
                    💬 Chat
                  </button>
                  {!mine && (
                    <Btn variant="coral" className="px-3 py-1.5 text-sm" onClick={async () => {
                      if (guest) { onNeedAccount?.(); return }
                      setErr('')
                      try {
                        const st = await joinSession(s, profile.id)
                        setMsg(st === 'confirmed' ? '¡Confirmado! Te esperamos.' : 'Cupo lleno, quedaste en lista de espera. Te avisamos si se libera un lugar.')
                        await loadRsvps(s.id)
                      } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No te pudiste apuntar.') }
                    }}>Me apunto</Btn>
                  )}
                  {mine && confirmCancelId !== s.id && (
                    <button className="text-sm text-red-500 underline" onClick={() => setConfirmCancelId(s.id)}>
                      Cancelar ({mine.status === 'confirmed' ? 'confirmado' : 'en espera'})
                    </button>
                  )}
                  {mine && confirmCancelId === s.id && (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">¿Seguro que cancelas tu lugar?</span>
                      <button className="font-bold text-red-600 underline" onClick={async () => {
                        setErr('')
                        setConfirmCancelId(null)
                        try {
                          await cancelRsvp(s.id, profile.id)
                          setMsg('Cancelaste tu lugar en esta sesión.')
                          await loadRsvps(s.id)
                        } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo cancelar. Revisa tu internet e inténtalo de nuevo.') }
                      }}>
                        Sí, cancelar
                      </button>
                      <button className="text-slate-500 underline" onClick={() => setConfirmCancelId(null)}>No</button>
                    </span>
                  )}
                </div>
                {/* El chat ya NO se abre inline dentro de la tarjeta:
                    es una hoja inferior que SOLO se abre al tocar el
                    botón 💬 de una sesión, nunca al entrar a Sesiones.
                    La hoja se renderiza al final del componente. */}
              </Card>
            )
          })}
        </div>
      ))}
      {/* Hoja del chat de la sesión abierta (una a la vez). */}
      {(() => {
        const chatSession = sessions.find((s) => s.id === openChatId) ?? null
        if (!chatSession) return null
        const list = rsvps[chatSession.id]
        const isParticipant = chatSession.host_id === profile.id || list?.find((r) => r.profile_id === profile.id)?.status === 'confirmed'
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50" onClick={() => setOpenChatId(null)}>
            <div
              className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#FFF9F0] p-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <SessionChat
                sessionId={chatSession.id}
                sessionTitle={chatSession.title}
                profileId={profile.id}
                profileName={profile.name}
                isParticipant={isParticipant}
                isAdmin={profile.is_admin === true}
                onClose={() => setOpenChatId(null)}
              />
            </div>
          </div>
        )
      })()}
      <p className="text-center text-xs text-slate-500">Zonas disponibles: {ZONES.join(' · ')}</p>
    </div>
  )
}
