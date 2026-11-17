import { useCallback, useEffect, useRef, useState } from 'react'
import Auth from './components/Auth'
import Challenges from './components/Challenges'
import Community from './components/Community'
import Home from './components/Home'
import ProfileTab from './components/ProfileTab'
import Search from './components/Search'
import SessionsTab from './components/SessionsTab'
import Train from './components/Train'
import MusicPlayer from './components/MusicPlayer'
import Tutorial, { hasSeenTutorial, markTutorialSeen } from './components/Tutorial'
import PermissionsFlow from './components/PermissionsFlow'
import { hasSeenPermissionsFlow, markPermissionsFlowSeen } from './lib/permissions'
import { isNative } from './lib/native'
import type { TrainActivity } from './components/Train'
import AdminPanel from './components/AdminPanel'
import { getCurrentUser, getProfile, isAdminUser, listAllWorkouts, listBusinesses, listChallenges, listPosts, listProfiles, listSessions, listWorkouts, mode, pendingSyncCount, saveProfile, syncOutbox } from './lib/store'
import type { AuthUser, Business, Challenge, Post, Profile, SessionItem, Workout } from './lib/types'
import type { RecommendedRoute } from './lib/routes'
import { detectZone } from './lib/utils'

type Tab = 'inicio' | 'buscar' | 'sesiones' | 'entrenar' | 'retos' | 'comunidad' | 'perfil' | 'admin'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  { id: 'buscar', label: 'Buscar', icon: '🔍' },
  { id: 'sesiones', label: 'Sesiones', icon: '📅' },
  { id: 'entrenar', label: 'Entrenar', icon: '🏃' },
  { id: 'retos', label: 'Retos', icon: '🏅' },
  { id: 'comunidad', label: 'Comunidad', icon: '💬' },
  { id: 'perfil', label: 'Perfil', icon: '👤' },
]

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState<Tab>('inicio')
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  // Panel de administración: solo el dueño (su correo o is_admin).
  const admin = isAdminUser(user, profile)
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([])
  // La música empieza siempre recogida en mini-barra; solo se expande
  // cuando Luis la abre desde Entrenar. Al cambiar de pestaña se
  // recoge sola (ver MusicPlayer: compact la recoge).
  const [musicExpanded, setMusicExpanded] = useState(false)
  // Actividad en curso de Entrenar (GPS / música): para la barrita que
  // aparece al cambiar de pestaña y vuelve a Entrenar al tocarla.
  const [activity, setActivity] = useState<TrainActivity>({ gps: null, music: null })
  // Modo offline: sin internet la app entra con los datos guardados en
  // el teléfono, nunca se queda en blanco ni en "Cargando" para siempre.
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pending, setPending] = useState(0)
  const [slowLoad, setSlowLoad] = useState(false)
  // Versión nueva esperando: main.tsx avisa con 'pulso-sw-update'
  // cuando el service worker nuevo ya se descargó. Mostrar el aviso
  // y que Luis toque Actualizar (skipWaiting + recarga) en vez de
  // tener que borrar el caché para ver cada ajuste.
  const [updateAvailable, setUpdateAvailable] = useState(false)
  // Ruta recomendada elegida en Sesiones → Mapa → "Recorrer esta
  // ruta": Entrenar abre el GPS con esa ruta como guía teal.
  const [guideRoute, setGuideRoute] = useState<RecommendedRoute | null>(null)
  // Mini tutorial (4 tarjetas) y flujo de permisos: solo al primer
  // inicio con sesión, nunca en la pantalla de acceso y nunca en web
  // (los permisos solo existen en la app nativa). Se guardan en
  // localStorage para no volver a salir solos; se reabren desde Perfil.
  const [showTutorial, setShowTutorial] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)
  const firstRunRef = useRef(false)
  useEffect(() => {
    if (!user || !profile || firstRunRef.current) return
    firstRunRef.current = true
    if (!hasSeenTutorial()) setShowTutorial(true)
    else if (isNative() && !hasSeenPermissionsFlow()) setShowPermissions(true)
  }, [user, profile])
  useEffect(() => {
    const onUpdate = () => setUpdateAvailable(true)
    window.addEventListener('pulso-sw-update', onUpdate)
    return () => window.removeEventListener('pulso-sw-update', onUpdate)
  }, [])

  // La app ya se instala desde Chrome (íconos PWA subidos): Luis pidió
  // quitar la leyenda de cómo instalar y el banner propio, así que no
  // hay ningún texto de instalación. Chrome muestra su propio prompt
  // cuando toca, sin leyenda nuestra.

  const loadAll = useCallback(async () => {
    try {
      const me = await getCurrentUser()
      setUser(me)
      if (!me) { setLoading(false); return }
      const prof = await getProfile(me.id)
      setProfile(prof)
      // Cada lectura tiene timeout de 5 s en store.ts y usa el espejo
      // local si Supabase no responde: sin internet entra igual.
      const [ps, ss, ch, po, bu] = await Promise.all([
        listProfiles(), listSessions(), listChallenges(), listPosts(), listBusinesses(),
      ])
      setProfiles(ps); setSessions(ss); setChallenges(ch); setPosts(po); setBusinesses(bu)
      setWorkouts(await listWorkouts(me.id))
      // Admin: entrenamientos de todos para las estadísticas del panel.
      if (isAdminUser(me, prof)) setAllWorkouts(await listAllWorkouts())
      // Si algo se hizo sin internet, se sube ahora que hay red.
      if (navigator.onLine) setPending(await syncOutbox())
      else setPending(pendingSyncCount())
    } catch {
      // Nunca quedarse en "Cargando" para siempre: si algo falló, se
      // muestra lo que haya (sesión local / espejo) o la pantalla de acceso.
      setPending(pendingSyncCount())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Zona por GPS (Isla Mujeres, no "Cancún centro" fijo): la zona
  // por defecto al crear cuenta era siempre "Cancún centro". Si el
  // perfil todavía trae esa zona por defecto y el permiso de ubicación
  // YA está concedido (Luis ya lo dio para el GPS), se detecta en
  // silencio y se corrige. Si el permiso no está concedido, NO se
  // pregunta al abrir (molestaría): se detecta desde Perfil con el
  // botón "Detectar mi zona con GPS". Una sola vez por teléfono.
  const zoneCheckedRef = useRef(false)
  useEffect(() => {
    if (!profile || profile.zone !== 'Cancún centro' || zoneCheckedRef.current) return
    zoneCheckedRef.current = true
    try {
      if (localStorage.getItem('pulso_zone_auto') === '1') return
      localStorage.setItem('pulso_zone_auto', '1')
    } catch { return }
    if (!('geolocation' in navigator)) return
    const nav = navigator as Navigator & { permissions?: { query: (o: { name: string }) => Promise<{ state: string }> } }
    const tryDetect = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const z = detectZone(pos.coords.latitude, pos.coords.longitude)
          if (z && z !== profile.zone) {
            const updated = { ...profile, zone: z }
            void saveProfile(updated).then(() => setProfile(updated)).catch(() => undefined)
          }
        },
        () => undefined,
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      )
    }
    // Solo si el permiso ya está concedido: sin prompt al abrir.
    nav.permissions?.query({ name: 'geolocation' }).then(
      (res) => { if (res.state === 'granted') tryDetect() },
      () => undefined
    ).catch(() => undefined)
  }, [profile])

  // Seguridad extra: si la carga tarda más de 6 s, avisar en vez de
  // dejar la pantalla de carga fija.
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setSlowLoad(true), 6000)
    return () => clearTimeout(t)
  }, [loading])

  // Al volver internet: subir lo hecho offline y recargar.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      void syncOutbox().then((n) => { setPending(n); loadAll() })
    }
    const goOffline = () => { setOnline(false); setPending(pendingSyncCount()) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [loadAll])

  // Aviso de versión nueva: toca Actualizar y la app recarga con el
  // ajuste nuevo, sin borrar caché ni datos. Se muestra también en
  // la pantalla de acceso, para que el aviso no dependa de entrar.
  const updateBanner = updateAvailable ? (
    <div className="mx-auto mt-3 max-w-2xl px-4">
      <div className="flex items-center justify-between gap-3 rounded-3xl bg-night p-3 text-white shadow-md">
        <p className="text-sm font-semibold">✨ Hay una versión nueva de PULSO</p>
        <button
          onClick={() => window.__pulsoApplyUpdate?.()}
          className="shrink-0 rounded-full bg-pulso px-4 py-2 text-sm font-black text-white"
        >
          Actualizar
        </button>
      </div>
    </div>
  ) : null

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-night">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-pulso text-3xl font-black text-white">P</div>
          <p className="text-lg font-black text-white">Cargando PULSO…</p>
          {slowLoad && <p className="mt-2 px-6 text-sm text-white/70">Tardando… si no tienes internet, la app entra en modo offline con tus datos guardados.</p>}
        </div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-night-50 font-sans text-slate-800">
        {updateBanner}
        <Auth onDone={() => { setLoading(true); loadAll() }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-night-50 font-sans text-slate-800">
      {/* Encabezado estilo app de Muse: logo, avatar y notificaciones.
          pulso-header: padding-top con safe-area para que en Android
          nativo no quede debajo de la barra de estado del teléfono. */}
      <header className="pulso-header sticky top-0 z-10 bg-night px-4 pb-3 text-white shadow-lg shadow-night/20">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pulso text-lg font-black">P</div>
            <div>
              <p className="text-lg font-black leading-none tracking-wide">PULSO</p>
              <p className="text-[11px] text-white/70">Entrena con pulso · {profile.zone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/90 sm:block">
              {!online ? '● Sin internet' : mode === 'supabase' ? '● En línea' : '● Modo local'}
            </span>
            <button onClick={() => setTab('comunidad')} aria-label="Notificaciones y comunidad"
              className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg">
              🔔
              {posts.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-pulso ring-2 ring-night" />}
            </button>
            <button onClick={() => setTab('perfil')} aria-label="Mi perfil"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-pulso to-pulso-dark text-base font-black">
              {profile.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      {/* Aviso offline: la app sigue funcionando con lo guardado en el
          teléfono. GPS y música local no necesitan internet; YouTube sí. */}
      {updateBanner}
      {!online && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <p className="rounded-3xl bg-amber-100 p-3 text-center text-sm font-semibold text-amber-900 shadow-md">
            📶 Sin internet — modo offline. Puedes entrenar con GPS y música local; todo se guarda en el teléfono
            {pending > 0 ? ` y se sube cuando vuelva internet (${pending} por subir).` : ' y se sube cuando vuelva internet.'}
          </p>
        </div>
      )}
      {online && pending > 0 && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <p className="rounded-3xl bg-teal/10 p-3 text-center text-sm font-semibold text-teal-dark shadow-md">
            ⏫ Sincronizando tus entrenamientos guardados sin internet ({pending} por subir)…
          </p>
        </div>
      )}

      <main className={`mx-auto max-w-2xl px-4 pt-4 ${activity.gps?.active ? 'pulso-main-gps' : 'pulso-main'}`}>
        {tab === 'inicio' && <Home profile={profile} sessions={sessions} workouts={workouts} onGoSessions={() => setTab('sesiones')} />}
        {tab === 'buscar' && <Search profiles={profiles} meId={user.id} />}
        {tab === 'sesiones' && <SessionsTab profile={profile} sessions={sessions} onRefresh={loadAll} onRunRoute={(r) => { setGuideRoute(r); setTab('entrenar') }} />}
        {/* Entrenar se mantiene montado SIEMPRE y solo se oculta con CSS:
            antes se desmontaba al cambiar de pestaña y se perdía el GPS
            que se estaba grabando y la música. Así el cronómetro, la ruta
            y el reproductor siguen vivos en cualquier pestaña. */}
        <div className={tab === 'entrenar' ? '' : 'hidden'}>
          <Train profile={profile} workouts={workouts} onRefresh={loadAll} onActivity={(a) => setActivity((prev) => ({ ...prev, gps: a.gps }))} onShowMusic={() => setMusicExpanded(true)} guideRoute={guideRoute} onGuideDone={() => setGuideRoute(null)} />
        </div>
        {tab === 'retos' && <Challenges workouts={workouts} challenges={challenges} />}
        {tab === 'comunidad' && <Community profile={profile} posts={posts} businesses={businesses} onRefresh={loadAll} />}
        {tab === 'perfil' && <ProfileTab user={user} profile={profile} onRefresh={loadAll} onSignOut={() => { setUser(null); setProfile(null) }} onShowTutorial={() => setShowTutorial(true)} onShowPermissions={() => setShowPermissions(true)} />}
        {tab === 'admin' && admin && (
          <AdminPanel profiles={profiles} sessions={sessions} posts={posts} businesses={businesses} allWorkouts={allWorkouts} dbAdmin={profile.is_admin === true} onRefresh={loadAll} adminUser={user} adminProfile={profile} currentUserId={user.id} />
        )}
      </main>

      {/* Reproductor de música + barrita de GPS: UN SOLO contenedor
          fijo, siempre en el mismo sitio (encima de la navegación, con
          pulso-music-dock: bottom = altura del nav + safe-area). La
          música empieza recogida en mini-barra en TODAS las pestañas
          (también en Entrenar) y solo se expande a una hoja baja de
          40vh cuando Luis la abre; al cambiar de pestaña se recoge
          sola. Así no tapa el contenido ni la barra inferior. */}
      <div id="pulso-music" className="pulso-music-dock fixed left-0 right-0 z-20 mx-auto max-w-2xl px-3">
        {tab !== 'entrenar' && activity.gps?.active && (
          <button
            onClick={() => setTab('entrenar')}
            className="mb-2 flex h-11 w-full items-center justify-between gap-2 rounded-full bg-night px-4 text-sm font-bold text-white shadow-xl shadow-night/40"
          >
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-pulso" />
              {activity.gps.status === 'paused' ? '⏸ Pausado' : '● Grabando'} {String(Math.floor(activity.gps.seconds / 60)).padStart(2, '0')}:{String(activity.gps.seconds % 60).padStart(2, '0')} · {activity.gps.distanceKm.toFixed(2)} km
            </span>
            <span className="ml-auto shrink-0 text-teal">Volver →</span>
          </button>
        )}
        <MusicPlayer
          profileId={profile.id}
          compact={tab !== 'entrenar'}
          expanded={musicExpanded}
          onExpandedChange={setMusicExpanded}
          onPlayingChange={(m) => setActivity((prev) => ({ ...prev, music: m }))}
          onGoTrain={() => setTab('entrenar')}
        />
      </div>

      {/* Botón flotante para crear sesión. Se esconde en Entrenar y
          cuando la hoja de música está expandida, para no taparla ni
          que ella lo tape. En las demás pestañas va siempre encima
          del contenedor fijo (nav 64 + música 64 + margen 16, con
          safe-area; con GPS activo la barrita añade 52 px). Solo dos
          posiciones fijas, no salta. */}
      {tab !== 'entrenar' && !musicExpanded && (
        <button onClick={() => setTab('sesiones')} aria-label="Crear sesión"
          className={`pulso-fab fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-pulso to-pulso-dark text-3xl font-black text-white shadow-xl shadow-pulso/40 ${activity.gps?.active ? 'pulso-fab-gps' : ''}`}>
          +
        </button>
      )}

      <nav className="pulso-nav fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white shadow-[0_-4px_20px_rgba(10,27,46,0.08)]">
        <div className="mx-auto flex h-full max-w-2xl">
          {[...TABS, ...(admin ? [{ id: 'admin' as Tab, label: 'Admin', icon: '🛠️' }] : [])].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex h-full flex-1 flex-col items-center justify-center text-[11px] font-bold ${tab === t.id ? 'text-pulso' : 'text-slate-400'}`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
              {/* El indicador ocupa siempre su sitio (transparente si
                  no es la pestaña activa): antes solo existía en la
                  activa y la altura de la navegación cambiaba. */}
              <span className={`mt-1 h-1 w-6 rounded-full ${tab === t.id ? 'bg-pulso' : 'bg-transparent'}`} />
            </button>
          ))}
        </div>
      </nav>

      {/* Mini tutorial (4 tarjetas, menos de 30 s) y flujo de permisos:
          hojas flotantes encima del muelle de música, con la navegación
          y la música visibles y sin tapar. */}
      {showTutorial && (
        <Tutorial
          onClose={() => {
            markTutorialSeen()
            setShowTutorial(false)
            if (isNative() && !hasSeenPermissionsFlow()) setShowPermissions(true)
          }}
          onOpenPermissions={() => {
            markTutorialSeen()
            setShowTutorial(false)
            setShowPermissions(true)
          }}
        />
      )}
      {showPermissions && (
        <PermissionsFlow
          onClose={() => {
            markPermissionsFlowSeen()
            setShowPermissions(false)
          }}
        />
      )}
    </div>
  )
}
