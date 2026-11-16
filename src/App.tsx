import { useCallback, useEffect, useState } from 'react'
import Auth from './components/Auth'
import Challenges from './components/Challenges'
import Community from './components/Community'
import Home from './components/Home'
import ProfileTab from './components/ProfileTab'
import Search from './components/Search'
import SessionsTab from './components/SessionsTab'
import Train from './components/Train'
import MusicPlayer from './components/MusicPlayer'
import type { TrainActivity } from './components/Train'
import { getCurrentUser, getProfile, listBusinesses, listChallenges, listPosts, listProfiles, listSessions, listWorkouts, mode } from './lib/store'
import type { AuthUser, Business, Challenge, Post, Profile, SessionItem, Workout } from './lib/types'

type Tab = 'inicio' | 'buscar' | 'sesiones' | 'entrenar' | 'retos' | 'comunidad' | 'perfil'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  { id: 'buscar', label: 'Buscar', icon: '🔍' },
  { id: 'sesiones', label: 'Sesiones', icon: '📅' },
  { id: 'entrenar', label: 'Entrenar', icon: '🏃' },
  { id: 'retos', label: 'Retos', icon: '🏅' },
  { id: 'comunidad', label: 'Comunidad', icon: '💬' },
  { id: 'perfil', label: 'Perfil', icon: '👤' },
]

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

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
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  // Actividad en curso de Entrenar (GPS / música): para la barrita que
  // aparece al cambiar de pestaña y vuelve a Entrenar al tocarla.
  const [activity, setActivity] = useState<TrainActivity>({ gps: null, music: null })

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  const loadAll = useCallback(async () => {
    const me = await getCurrentUser()
    setUser(me)
    if (!me) { setLoading(false); return }
    const prof = await getProfile(me.id)
    setProfile(prof)
    const [ps, ss, ch, po, bu] = await Promise.all([
      listProfiles(), listSessions(), listChallenges(), listPosts(), listBusinesses(),
    ])
    setProfiles(ps); setSessions(ss); setChallenges(ch); setPosts(po); setBusinesses(bu)
    setWorkouts(await listWorkouts(me.id))
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-night">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-pulso text-3xl font-black text-white">P</div>
          <p className="text-lg font-black text-white">Cargando PULSO…</p>
        </div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-night-50 font-sans text-slate-800">
        <Auth onDone={() => { setLoading(true); loadAll() }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-night-50 font-sans text-slate-800">
      {/* Encabezado estilo app de Muse: logo, avatar y notificaciones */}
      <header className="sticky top-0 z-10 bg-night px-4 py-3 text-white shadow-lg shadow-night/20">
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
              {mode === 'supabase' ? '● En línea' : '● Modo local'}
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

      {!isStandalone && installEvt && !installDismissed && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <div className="flex items-center justify-between gap-2 rounded-3xl bg-white p-3 shadow-md">
            <p className="text-sm"><strong>Instala PULSO</strong> en tu pantalla para abrirla como app, sin WhatsApp ni navegador.</p>
            <button className="shrink-0 rounded-full bg-gradient-to-r from-pulso to-pulso-dark px-3 py-2 text-sm font-bold text-white"
              onClick={async () => { await installEvt.prompt(); setInstallEvt(null) }}>
              Instalar
            </button>
            <button className="shrink-0 text-slate-400" onClick={() => setInstallDismissed(true)}>✕</button>
          </div>
        </div>
      )}
      {!isStandalone && !installEvt && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <p className="rounded-3xl bg-white p-3 text-center text-xs text-slate-600 shadow-md">
            📲 Para instalarla: en Android toca ⋮ → “Instalar app” o “Agregar a pantalla de inicio”. En iPhone: Compartir → “Agregar a pantalla de inicio”.
          </p>
        </div>
      )}

      <main className="mx-auto max-w-2xl px-4 pb-32 pt-4">
        {tab === 'inicio' && <Home profile={profile} sessions={sessions} workouts={workouts} onGoSessions={() => setTab('sesiones')} />}
        {tab === 'buscar' && <Search profiles={profiles} meId={user.id} />}
        {tab === 'sesiones' && <SessionsTab profile={profile} sessions={sessions} onRefresh={loadAll} />}
        {/* Entrenar se mantiene montado SIEMPRE y solo se oculta con CSS:
            antes se desmontaba al cambiar de pestaña y se perdía el GPS
            que se estaba grabando y la música. Así el cronómetro, la ruta
            y el reproductor siguen vivos en cualquier pestaña. */}
        <div className={tab === 'entrenar' ? '' : 'hidden'}>
          <Train profile={profile} workouts={workouts} onRefresh={loadAll} onActivity={(a) => setActivity((prev) => ({ ...prev, gps: a.gps }))} onShowMusic={() => document.getElementById('pulso-music')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
        </div>
        {tab === 'retos' && <Challenges workouts={workouts} challenges={challenges} />}
        {tab === 'comunidad' && <Community profile={profile} posts={posts} businesses={businesses} onRefresh={loadAll} />}
        {tab === 'perfil' && <ProfileTab user={user} profile={profile} onRefresh={loadAll} onSignOut={() => { setUser(null); setProfile(null) }} />}
      </main>

      {/* Reproductor de música PERSISTENTE: una sola instancia, siempre
          montada en App, nunca dentro de una pestaña que se oculte con
          display:none (eso pausa el iframe de YouTube). En Entrenar se
          ve la tarjeta completa; en las demás pestañas, la mini-barra
          fija con el video chiquito pero visible, y el audio sigue.
          El envoltorio es UNO SOLO y solo cambia de clase, para que
          React no desmonte el reproductor al cambiar de pestaña. */}
      <div id="pulso-music" className={tab === 'entrenar' ? 'mx-auto max-w-2xl px-4 pb-4' : 'fixed bottom-[64px] left-0 right-0 z-20 px-3'}>
        <MusicPlayer
          profileId={profile.id}
          compact={tab !== 'entrenar'}
          onPlayingChange={(m) => setActivity((prev) => ({ ...prev, music: m }))}
          onGoTrain={() => setTab('entrenar')}
        />
      </div>

      {/* Barrita de GPS: solo GPS (la música ya tiene su mini-barra).
          Va arriba de la mini-barra de música cuando hay grabación. */}
      {tab !== 'entrenar' && activity.gps?.active && (
        <button
          onClick={() => setTab('entrenar')}
          className="fixed bottom-[140px] left-0 right-0 z-20 mx-auto flex max-w-2xl items-center justify-between gap-2 px-4"
        >
          <span className="flex flex-1 items-center gap-2 rounded-full bg-night px-4 py-2.5 text-sm font-bold text-white shadow-xl shadow-night/40">
            {activity.gps?.active && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-pulso" />
                {activity.gps.status === 'paused' ? '⏸ Pausado' : '● Grabando'} {String(Math.floor(activity.gps.seconds / 60)).padStart(2, '0')}:{String(activity.gps.seconds % 60).padStart(2, '0')} · {activity.gps.distanceKm.toFixed(2)} km
              </span>
            )}
            <span className="ml-auto shrink-0 text-teal">Volver →</span>
          </span>
        </button>
      )}

      {/* Botón flotante para crear sesión (sube cuando hay barras fijas). */}
      <button onClick={() => setTab('sesiones')} aria-label="Crear sesión"
        className={`fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-pulso to-pulso-dark text-3xl font-black text-white shadow-xl shadow-pulso/40 ${tab === 'entrenar' ? 'bottom-20' : activity.gps?.active ? 'bottom-48' : 'bottom-40'}`}>
        +
      </button>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(10,27,46,0.08)]">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center py-2 text-[11px] font-bold ${tab === t.id ? 'text-pulso' : 'text-slate-400'}`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
              {tab === t.id && <span className="mt-1 h-1 w-6 rounded-full bg-pulso" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
