import { useCallback, useEffect, useRef, useState } from 'react'
import Logo from './components/Logo'
import Auth from './components/Auth'
import Challenges from './components/Challenges'
import Community from './components/Community'
import Home from './components/Home'
import ProfileTab from './components/ProfileTab'
import Search from './components/Search'
import SessionsTab from './components/SessionsTab'
import RoutesTab from './components/RoutesTab'
import Train from './components/Train'
import MusicPlayer from './components/MusicPlayer'
import Tutorial, { hasSeenTutorial, markTutorialSeen } from './components/Tutorial'
import PermissionsFlow from './components/PermissionsFlow'
import CoachPanel from './components/CoachPanel'
import { setupPushNotifications } from './lib/pushNotifications'
import { hasSeenPermissionsFlow, markPermissionsFlowSeen } from './lib/permissions'
import { isNative } from './lib/native'
import type { TrainActivity } from './components/Train'
import AdminPanel from './components/AdminPanel'
import Businesses from './components/Businesses'
import MoreMenu, { type MoreOption } from './components/MoreMenu'
import UpdatePrompt from './components/UpdatePrompt'
import GuestGate from './components/GuestGate'
import { enterGuestMode, exitGuestMode, isGuestMode, GUEST_PROFILE } from './lib/guest'
import { checkAppUpdate, type RemoteVersion } from './lib/appUpdate'
import { getCurrentUser, getProfile, isAdminUser, isNetworkError, listAllWorkouts, listBusinesses, listChallenges, listPosts, listProfiles, listSessions, listWorkouts, mode, pendingSyncCount, saveProfile, syncOutbox } from './lib/store'
import type { AuthUser, Business, Challenge, Post, Profile, SessionItem, Workout } from './lib/types'
import type { RecommendedRoute } from './lib/routes'
import { detectZone } from './lib/utils'

type Tab = 'inicio' | 'sesiones' | 'rutas' | 'entrenar' | 'retos' | 'mas'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  { id: 'sesiones', label: 'Sesiones', icon: '📅' },
  { id: 'rutas', label: 'Rutas', icon: '🗺️' },
  { id: 'entrenar', label: 'Entrenar', icon: '🏃' },
  { id: 'retos', label: 'Retos', icon: '🏅' },
  { id: 'mas', label: 'Más', icon: '⋯' },
]

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  // Modo invitado: ver la app sin cuenta (vista previa). El invitado
  // ve sesiones, mapa, rutas, comunidad, negocios y retos, pero no
  // puede apuntarse, crear, publicar, chatear ni grabar con GPS: esas
  // acciones abren la hoja GuestGate. La bandera vive en
  // localStorage (ver lib/guest.ts) y sobrevive al cerrar la app.
  const [guest, setGuest] = useState(() => isGuestMode())
  const [guestGate, setGuestGate] = useState(false)
  // Vista de la pantalla de acceso al salir de invitado para crear
  // cuenta: el registro, no el login.
  const [authView, setAuthView] = useState<'login' | 'register' | 'recover'>('login')
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
  // Error real al cargar (no de red): se muestra con botón
  // Reintentar en vez de dejar la app vacía en silencio. Sin
  // internet no es error: se entra con el espejo local.
  const [loadError, setLoadError] = useState('')
  // Versión nueva esperando: main.tsx avisa con 'pulso-sw-update'
  // cuando el service worker nuevo ya se descargó. Mostrar el aviso
  // y que Luis toque Actualizar (skipWaiting + recarga) en vez de
  // tener que borrar el caché para ver cada ajuste.
  const [updateAvailable, setUpdateAvailable] = useState(false)
  // Ruta recomendada elegida en Rutas → "Recorrer esta ruta":
  // Entrenar abre el GPS con esa ruta como guía teal.
  const [guideRoute, setGuideRoute] = useState<RecommendedRoute | null>(null)
  // Botón flotante "+ Crear" de Sesiones: cada toque suma 1 y
  // SessionsTab abre el formulario.
  const [createSignal, setCreateSignal] = useState(0)
  // Menú "Más" (5ª pestaña): qué vista muestra dentro de Más.
  // 'menu' es la lista (Buscar, Comunidad, Negocios, Música, Perfil,
  // Soy coach, Administración). Al salir de Más se vuelve al menú.
  const [moreView, setMoreView] = useState<MoreOption | 'menu'>('menu')
  function goTab(t: Tab) {
    if (t === 'mas') setMoreView('menu')
    setTab(t)
  }
  // Entrar como invitado desde la pantalla de acceso: se guarda la
  // bandera y se recargan las listas públicas.
  function goGuest() {
    enterGuestMode()
    setGuest(true)
    setLoading(true)
    loadAll()
  }
  // Salir de invitado para crear cuenta: se quita la bandera y se
  // vuelve a la pantalla de acceso en la vista de registro.
  function goCreateAccount() {
    exitGuestMode()
    setGuest(false)
    setGuestGate(false)
    setUser(null)
    setProfile(null)
    setAuthView('register')
  }
  // Aviso de actualización del APK (version.json remoto): si hay
  // versión nueva, sale el modal con "Actualizar ahora" / "Después".
  // "Después" solo lo cierra esta vez; vuelve a salir al abrir la app.
  // También se revisa en modo invitado: el aviso es del APK, no de la cuenta.
  const [updateInfo, setUpdateInfo] = useState<RemoteVersion | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  useEffect(() => {
    if (!user && !guest) return
    let alive = true
    void checkAppUpdate().then((v) => { if (alive && v) setUpdateInfo(v) })
    return () => { alive = false }
  }, [user, guest])
  // inicio con sesión, nunca en la pantalla de acceso y nunca en web
  // (los permisos solo existen en la app nativa). Se guardan en
  // localStorage para no volver a salir solos; se reabren desde Perfil.
  const [showTutorial, setShowTutorial] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)
  const firstRunRef = useRef(false)
  useEffect(() => {
    if (!user || !profile || guest || firstRunRef.current) return
    firstRunRef.current = true
    if (!hasSeenTutorial()) setShowTutorial(true)
    else if (isNative() && !hasSeenPermissionsFlow()) setShowPermissions(true)
  }, [user, profile])
  // Notificaciones push (solo app nativa; en web setupPushNotifications
  // devuelve null al instante y no hace nada). Una vez por sesión, sin
  // bloquear el login: si no hay Firebase configurado, no se registra
  // token y la app sigue igual (ver docs-push-firebase.md).
  const pushSetupRef = useRef(false)
  useEffect(() => {
    if (!user || pushSetupRef.current) return
    pushSetupRef.current = true
    void setupPushNotifications(user.id).catch(() => undefined)
  }, [user])
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
    setLoadError('')
    try {
      // Modo invitado: solo lecturas públicas, sin sesión ni usuario.
      // Cada lista se protege por separado: si la base no deja leer
      // algo sin cuenta, esa lista queda vacía (estado vacío honesto)
      // en vez de dejar la app en blanco o con un error que asuste.
      // Nunca se inventan datos de demostración.
      if (isGuestMode()) {
        const [ps, ss, ch, po, bu] = await Promise.all([
          listProfiles().catch(() => [] as Profile[]),
          listSessions().catch(() => [] as SessionItem[]),
          listChallenges().catch(() => [] as Challenge[]),
          listPosts().catch(() => [] as Post[]),
          listBusinesses().catch(() => [] as Business[]),
        ])
        setProfiles(ps); setSessions(ss); setChallenges(ch); setPosts(po); setBusinesses(bu)
        setWorkouts([])
        setUser(null)
        setProfile(GUEST_PROFILE)
        setPending(pendingSyncCount())
        return
      }
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
    } catch (e) {
      // Nunca quedarse en "Cargando" para siempre: si algo falló, se
      // muestra lo que haya (sesión local / espejo) o la pantalla de acceso.
      // Pero si hay internet y el error NO es de red, se avisa: antes
      // la app se veía vacía sin explicación.
      if (navigator.onLine && !isNetworkError(e)) {
        setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar tus datos.')
      }
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
    if (!profile || guest || profile.zone !== 'Cancún centro' || zoneCheckedRef.current) return
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
  // En modo invitado no hay nada que subir: solo recargar listas.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      if (guest) { loadAll(); return }
      void syncOutbox().then((n) => { setPending(n); loadAll() })
    }
    const goOffline = () => { setOnline(false); setPending(pendingSyncCount()) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [loadAll, guest])

  // Aviso de versión nueva: toca Actualizar y la app recarga con el
  // ajuste nuevo, sin borrar caché ni datos. Se muestra también en
  // la pantalla de acceso, para que el aviso no dependa de entrar.
  const updateBanner = updateAvailable ? (
    <div className="mx-auto mt-3 max-w-2xl px-4">
      <div className="flex items-center justify-between gap-3 rounded-3xl bg-night p-3 text-white shadow-md">
        <p className="text-sm font-semibold">✨ Hay una versión nueva de PULSO</p>
        <button
          onClick={() => window.__pulsoApplyUpdate?.()}
          className="shrink-0 rounded-full bg-pulso px-4 py-2 text-sm font-black text-night"
        >
          Actualizar
        </button>
      </div>
    </div>
  ) : null

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF9F0]">
        <div className="text-center">
          <Logo size={72} withWordmark />
          <p className="mt-3 text-lg font-black text-night">Cargando PULSO…</p>
          {slowLoad && <p className="mt-2 px-6 text-sm text-slate-500">Tardando… si no tienes internet, la app entra en modo offline con tus datos guardados.</p>}
        </div>
      </div>
    )
  }

  // Sin perfil no se entra (en invitado loadAll pone el perfil de
  // solo lectura GUEST_PROFILE); sin usuario y sin invitado, acceso.
  if (!profile) {
    return (
      <div className="min-h-screen bg-night-50 font-sans text-slate-800">
        {updateBanner}
        <Auth onDone={() => { setLoading(true); loadAll() }} onGuest={goGuest} initialView={authView} />
      </div>
    )
  }
  if (!user && !guest) {
    return (
      <div className="min-h-screen bg-night-50 font-sans text-slate-800">
        {updateBanner}
        <Auth onDone={() => { setLoading(true); loadAll() }} onGuest={goGuest} initialView={authView} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-night-50 font-sans text-slate-800">
      {/* Encabezado claro (paleta cálida 2026-11-18): logo PULSO, avatar.
          Sin campana: el punto rojo era falso (se prendía con cualquier
          publicación, no con algo nuevo para ti). */}
      <header className="pulso-header sticky top-0 z-10 border-b border-[#F2DCC6] bg-[#FFF9F0]/95 px-4 pb-3 text-night shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={36} />
            <div>
              <p className="text-lg font-black leading-none tracking-wide">PULSO</p>
              <p className="text-[11px] text-slate-500">Entrena con pulso · {profile.zone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-night-100 px-2.5 py-1 text-[11px] font-bold text-night sm:block">
              {!online ? '● Sin internet' : guest ? '● Explorando' : mode === 'supabase' ? '● En línea' : '● Modo local'}
            </span>
            {guest ? (
              <button onClick={goCreateAccount} className="rounded-full bg-pulso px-3 py-2 text-xs font-black text-night shadow">
                Crear cuenta
              </button>
            ) : (
              <button onClick={() => { setMoreView('perfil'); setTab('mas') }} aria-label="Mi perfil"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-pulso text-base font-black text-night">
                {profile.name.slice(0, 1).toUpperCase()}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Aviso de modo invitado: visible en todas las pantallas,
          con el botón para crear cuenta siempre a la mano. */}
      {guest && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <div className="flex items-center justify-between gap-3 rounded-3xl bg-pulso/15 p-3 text-sm shadow-md">
            <p className="font-semibold text-night">👀 Estás explorando sin cuenta</p>
            <button onClick={goCreateAccount} className="shrink-0 rounded-full bg-pulso px-4 py-2 text-sm font-black text-night">
              Crear cuenta
            </button>
          </div>
        </div>
      )}

      {/* Aviso offline: la app sigue funcionando con lo guardado en el
          teléfono. GPS y música local no necesitan internet; YouTube sí. */}
      {updateBanner}
      {loadError && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <div className="flex items-center justify-between gap-3 rounded-3xl bg-red-50 p-3 text-sm shadow-md">
            <p className="font-semibold text-red-700">⚠️ No se pudieron cargar tus datos: {loadError}</p>
            <button
              onClick={() => { setLoading(true); loadAll() }}
              className="shrink-0 rounded-full bg-pulso px-4 py-2 text-sm font-black text-night"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}
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
        {tab === 'inicio' && <Home profile={profile} sessions={sessions} workouts={workouts} onGoSessions={() => goTab('sesiones')} />}
        {tab === 'sesiones' && <SessionsTab profile={profile} sessions={sessions} onRefresh={loadAll} createSignal={createSignal} guest={guest} onNeedAccount={() => setGuestGate(true)} />}
        {tab === 'rutas' && <RoutesTab profile={profile} onRunRoute={(r) => { setGuideRoute(r); goTab('entrenar') }} />}
        {/* Entrenar se mantiene montado SIEMPRE y solo se oculta con CSS:
            antes se desmontaba al cambiar de pestaña y se perdía el GPS
            que se estaba grabando y la música. Así el cronómetro, la ruta
            y el reproductor siguen vivos en cualquier pestaña.
            En modo invitado NO se monta Entrenar: grabar con GPS
            necesita cuenta. Sale una tarjeta que lo explica y lleva
            a crear cuenta (la música sigue en Más → Música). */}
        {guest ? (
          tab === 'entrenar' ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-black text-teal-dark">Entrenar</h2>
              <div className="rounded-3xl bg-white p-5 text-center shadow-md">
                <p className="text-4xl">🏃</p>
                <p className="mt-2 text-lg font-black text-night">Grabar con GPS necesita cuenta</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Para grabar tu ruta, guardar entrenamientos y contar pasos, crea tu cuenta gratis.
                  Mientras, puedes ver las sesiones y las rutas recomendadas sin cuenta.
                </p>
                <div className="mt-4 space-y-2">
                  <button onClick={goCreateAccount} className="w-full rounded-2xl bg-pulso py-3 text-base font-black text-night">
                    Crear mi cuenta gratis
                  </button>
                  <button onClick={() => goTab('sesiones')} className="w-full py-2 text-sm font-bold text-teal-dark underline">
                    Ver sesiones
                  </button>
                </div>
              </div>
            </div>
          ) : null
        ) : (
          <div className={tab === 'entrenar' ? '' : 'hidden'}>
            <Train profile={profile} workouts={workouts} onRefresh={loadAll} onActivity={(a) => setActivity((prev) => ({ ...prev, gps: a.gps }))} onShowMusic={() => setMusicExpanded(true)} guideRoute={guideRoute} onGuideDone={() => setGuideRoute(null)} />
          </div>
        )}
        {tab === 'retos' && <Challenges workouts={workouts} challenges={challenges} businesses={businesses} />}
        {/* Menú Más: Buscar, Comunidad, Negocios, Música, Perfil,
            Soy coach y Administración ya no son pestañas fijas. */}
        {tab === 'mas' && (
          <>
            {moreView !== 'menu' && (
              <button onClick={() => setMoreView('menu')} className="mb-3 text-sm font-bold text-pulso-dark">← Más</button>
            )}
            {moreView === 'menu' && (
              <MoreMenu
                isAdmin={admin}
                guest={guest}
                onCreateAccount={goCreateAccount}
                onSelect={(opt) => {
                  // Música: no es una vista, abre el reproductor
                  // persistente (hoja inferior) y se queda en el menú.
                  if (opt === 'musica') { setMusicExpanded(true); return }
                  setMoreView(opt)
                }}
              />
            )}
            {moreView === 'buscar' && <Search profiles={profiles} meId={user?.id ?? ''} />}
            {moreView === 'comunidad' && <Community profile={profile} posts={posts} businesses={businesses} onRefresh={loadAll} guest={guest} onNeedAccount={() => setGuestGate(true)} />}
            {moreView === 'negocios' && <Businesses businesses={businesses} />}
            {moreView === 'perfil' && user && (
              <ProfileTab user={user} profile={profile} posts={posts} onRefresh={loadAll} onSignOut={() => { setUser(null); setProfile(null) }} onShowTutorial={() => setShowTutorial(true)} onShowPermissions={() => setShowPermissions(true)} onGoAdmin={() => setMoreView('admin')} />
            )}
            {moreView === 'coach' && (
              <CoachPanel profile={profile} onCreateSession={() => { setCreateSignal((n) => n + 1); goTab('sesiones') }} />
            )}
            {moreView === 'admin' && admin && user && (
              <AdminPanel profiles={profiles} sessions={sessions} posts={posts} businesses={businesses} allWorkouts={allWorkouts} dbAdmin={profile.is_admin === true} onRefresh={loadAll} adminUser={user} adminProfile={profile} currentUserId={user.id} />
            )}
          </>
        )}
      </main>

      {/* Reproductor de música + barrita de GPS: UN SOLO contenedor
          fijo. El reproductor vive SIEMPRE montado aquí (nunca se
          desmonta al cambiar de pestaña): ANTES, mientras se grababa
          con GPS, la barrita de GPS REEMPLAZABA a la mini-barra de
          música al salir de Entrenar, así que MusicPlayer se
          desmontaba, el reproductor de YouTube se destruía y el
          <audio> local se paraba: la música se cortaba al cambiar de
          pestaña. Ahora la barrita de GPS se APILA ENCIMA de la
          mini-barra (el contenido reserva el espacio de las dos con
          .pulso-main-gps) y la música sigue sonando. En Entrenar la
          música sigue abajo como siempre, porque el GPS ya se ve en
          pantalla. */}
      <div id="pulso-music" className="pulso-music-dock fixed left-0 right-0 z-20 mx-auto max-w-2xl px-3">
        {tab !== 'entrenar' && activity.gps?.active && (
          <button
            onClick={() => goTab('entrenar')}
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
          onGoTrain={() => goTab('entrenar')}
        />
      </div>

      {/* Botón flotante para crear sesión: SOLO en Sesiones (antes salía
          en todas las pestañas y nadie sabía qué creaba el "+"). Con
          etiqueta "Crear" y texto oscuro sobre rosa. Se esconde en
          Entrenar, cuando la hoja de música está expandida y en modo
          invitado (crear sesión necesita cuenta). */}
      {tab === 'sesiones' && !musicExpanded && !guest && (
        <button onClick={() => setCreateSignal((n) => n + 1)} aria-label="Crear sesión"
          className={`pulso-fab fixed right-4 z-20 flex h-14 items-center gap-1 rounded-full bg-pulso px-5 text-base font-black text-night shadow-xl shadow-pulso/40 ${activity.gps?.active ? 'pulso-fab-gps' : ''}`}>
          <span className="text-2xl leading-none">+</span> Crear
        </button>
      )}

      <nav className="pulso-nav fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white shadow-[0_-4px_20px_rgba(10,27,46,0.08)]">
        <div className="mx-auto flex h-full max-w-2xl">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => goTab(t.id)} className={`flex h-full flex-1 flex-col items-center justify-center text-[11px] font-bold ${tab === t.id ? 'text-pulso-dark' : 'text-slate-400'}`}>
              {/* Entrenar es la acción principal: círculo rosa para que
                  se vea como el botón principal de la app. */}
              <span className={`flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none ${t.id === 'entrenar' ? 'bg-pulso text-night shadow-md shadow-pulso/40' : ''}`}>{t.icon}</span>
              {t.label}
              {/* El indicador ocupa siempre su sitio (transparente si
                  no es la pestaña activa): antes solo existía en la
                  activa y la altura de la navegación cambiaba. */}
              <span className={`mt-1 h-1 w-6 rounded-full ${tab === t.id ? 'bg-pulso-dark' : 'bg-transparent'}`} />
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

      {/* Aviso de actualización del APK: sale al abrir la app cuando
          hay versión nueva en version.json remoto. */}
      {updateInfo && !updateDismissed && (
        <UpdatePrompt version={updateInfo} onLater={() => setUpdateDismissed(true)} />
      )}

      {/* Hoja de "Crea tu cuenta gratis": sale en modo invitado al
          tocar apuntarse, crear, publicar o chatear. */}
      {guestGate && (
        <GuestGate onCreateAccount={goCreateAccount} onClose={() => setGuestGate(false)} />
      )}
    </div>
  )
}
