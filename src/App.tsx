import { useCallback, useEffect, useState } from 'react'
import Auth from './components/Auth'
import Challenges from './components/Challenges'
import Community from './components/Community'
import Home from './components/Home'
import ProfileTab from './components/ProfileTab'
import Search from './components/Search'
import SessionsTab from './components/SessionsTab'
import Train from './components/Train'
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
      <div className="flex min-h-screen items-center justify-center bg-sage-100">
        <p className="text-lg font-bold text-night">Cargando PULSO…</p>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-sage-100 font-sans text-slate-800">
        <Auth onDone={() => { setLoading(true); loadAll() }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sage-100 font-sans text-slate-800">
      <header className="sticky top-0 z-10 bg-night px-4 py-3 text-white shadow">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <p className="text-xl font-black tracking-wide">PULSO</p>
          <p className="text-xs opacity-90">
            {mode === 'supabase' ? '● En línea' : '● Modo local (demo)'} · {profile.zone}
          </p>
        </div>
      </header>

      {!isStandalone && installEvt && !installDismissed && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-sm">
            <p className="text-sm"><strong>Instala PULSO</strong> en tu pantalla para abrirla como app, sin WhatsApp ni navegador.</p>
            <button className="shrink-0 rounded-full bg-coral px-3 py-2 text-sm font-bold text-white"
              onClick={async () => { await installEvt.prompt(); setInstallEvt(null) }}>
              Instalar
            </button>
            <button className="shrink-0 text-slate-400" onClick={() => setInstallDismissed(true)}>✕</button>
          </div>
        </div>
      )}
      {!isStandalone && !installEvt && (
        <div className="mx-auto mt-3 max-w-2xl px-4">
          <p className="rounded-2xl bg-white p-3 text-center text-xs text-slate-600 shadow-sm">
            📲 Para instalarla: en Android toca ⋮ → “Instalar app” o “Agregar a pantalla de inicio”. En iPhone: Compartir → “Agregar a pantalla de inicio”.
          </p>
        </div>
      )}

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        {tab === 'inicio' && <Home profile={profile} sessions={sessions} workouts={workouts} onGoSessions={() => setTab('sesiones')} />}
        {tab === 'buscar' && <Search profiles={profiles} meId={user.id} />}
        {tab === 'sesiones' && <SessionsTab profile={profile} sessions={sessions} onRefresh={loadAll} />}
        {tab === 'entrenar' && <Train profile={profile} workouts={workouts} onRefresh={loadAll} />}
        {tab === 'retos' && <Challenges workouts={workouts} challenges={challenges} />}
        {tab === 'comunidad' && <Community profile={profile} posts={posts} businesses={businesses} onRefresh={loadAll} />}
        {tab === 'perfil' && <ProfileTab user={user} profile={profile} onRefresh={loadAll} onSignOut={() => { setUser(null); setProfile(null) }} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center py-2 text-[11px] font-semibold ${tab === t.id ? 'text-coral' : 'text-slate-500'}`}>
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
              {tab === t.id && <span className="mt-0.5 h-1 w-1 rounded-full bg-coral" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
