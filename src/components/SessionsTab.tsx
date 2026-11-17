import { lazy, Suspense, useEffect, useState } from 'react'
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

export default function SessionsTab({ profile, sessions, onRefresh, onRunRoute }: { profile: Profile; sessions: SessionItem[]; onRefresh: () => void; onRunRoute?: (route: RecommendedRoute) => void }) {
  const [showForm, setShowForm] = useState(false)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-teal-dark">Sesiones y eventos</h2>
        <Btn variant="coral" onClick={() => setShowForm(!showForm)}>+ Crear</Btn>
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
        <button onClick={() => setView('lista')} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold ${view === 'lista' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>📋 Lista</button>
        <button onClick={openMap} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold ${view === 'mapa' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>🗺️ Mapa ({withCoords.length})</button>
      </div>

      {view === 'mapa' && (
        <div className="space-y-3">
          {/* Dentro del mapa: sesiones o rutas recomendadas para correr. */}
          <div className="flex gap-2">
            <button onClick={() => setMapMode('sesiones')} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold ${mapMode === 'sesiones' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>📍 Sesiones ({withCoords.length})</button>
            <button onClick={() => { setMapMode('rutas'); if (!selectedRoute) setSelectedRoute(firstRouteForZone) }} className={`flex-1 rounded-full px-3 py-2 text-sm font-bold ${mapMode === 'rutas' ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>🏃 Rutas ({RECOMMENDED_ROUTES.length})</button>
          </div>

          {mapMode === 'sesiones' && (withCoords.length === 0 ? (
            <Empty text="Ninguna sesión tiene ubicación en el mapa todavía. Al crear una, toca «Usar mi ubicación» estando en el lugar." />
          ) : (
            <>
              <LiveTrainingLayer trainers={liveTrainers} visible={showLive} onToggle={setShowLive} selfProfileId={profile.id} />
              <Suspense fallback={<div className="rounded-2xl bg-night p-4 text-center text-sm text-white/70" style={{ height: 320 }}>Cargando mapa…</div>}>
                <MapView center={mapCenter} markers={[...markers, ...youMarker, ...(showLive ? liveTrainersToMarkers(liveTrainers, profile.id) : [])]} height={320} defaultBasemap={defaultBasemap} offlineNote="📶 Sin internet: el mapa necesita internet para cargar las calles." />
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
                    await loadRsvps(s.id)
                    setOpenChatId(openChatId === s.id ? null : s.id)
                  }}>
                    💬 Chat
                  </button>
                  {!mine && (
                    <Btn variant="teal" className="px-3 py-1.5 text-sm" onClick={async () => {
                      setErr('')
                      try {
                        const st = await joinSession(s, profile.id)
                        setMsg(st === 'confirmed' ? '¡Confirmado! Te esperamos.' : 'Cupo lleno, quedaste en lista de espera. Te avisamos si se libera un lugar.')
                        await loadRsvps(s.id)
                      } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No te pudiste apuntar.') }
                    }}>Me apunto</Btn>
                  )}
                  {mine && (
                    <button className="text-sm text-red-500 underline" onClick={async () => { await cancelRsvp(s.id, profile.id); await loadRsvps(s.id) }}>
                      Cancelar ({mine.status === 'confirmed' ? 'confirmado' : 'en espera'})
                    </button>
                  )}
                </div>
                {openChatId === s.id && (
                  <div className="mt-3">
                    <SessionChat
                      sessionId={s.id}
                      sessionTitle={s.title}
                      profileId={profile.id}
                      profileName={profile.name}
                      isParticipant={s.host_id === profile.id || list?.find((r) => r.profile_id === profile.id)?.status === 'confirmed'}
                    />
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      ))}
      <p className="text-center text-xs text-slate-500">Zonas disponibles: {ZONES.join(' · ')}</p>
    </div>
  )
}
