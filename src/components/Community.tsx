import { useState } from 'react'
import type { Business, Post, Profile } from '../lib/types'
import { createPost, getProfile } from '../lib/store'
import { Btn, Card, Empty, inputCls } from './ui'
import PublicProfile from './PublicProfile'

// Grupos por deporte (chips arriba del feed): filtran las
// publicaciones que mencionan ese deporte. Las publicaciones no
// guardan deporte, así que el filtro busca la palabra en el texto;
// si nadie ha publicado de ese deporte, sale el aviso vacío.
const GROUP_SPORTS: { label: string; words: string[] }[] = [
  { label: 'Running', words: ['running', 'correr', 'corre', 'carrera', 'run'] },
  { label: 'Pádel', words: ['pádel', 'padel'] },
  { label: 'Ciclismo', words: ['ciclismo', 'bici', 'rodada', 'rodar'] },
  { label: 'CrossFit', words: ['crossfit', 'cross fit'] },
  { label: 'Caminata', words: ['caminata', 'caminar'] },
  { label: 'Surf', words: ['surf'] },
  { label: 'Natación', words: ['natación', 'natacion', 'nadar'] },
  { label: 'Gym', words: ['gym', 'gimnasio'] },
]

export default function Community({ profile, posts, businesses, onRefresh, guest = false, onNeedAccount }: { profile: Profile; posts: Post[]; businesses: Business[]; onRefresh: () => void; guest?: boolean; onNeedAccount?: () => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  // Grupo seleccionado: 'Todos' o un deporte. Filtra el feed por
  // las palabras de ese deporte en el texto de la publicación.
  const [group, setGroup] = useState('Todos')
  // Perfil público que se está viendo (desde el nombre/autor de una
  // publicación). Se lee con getProfile, que usa la vista
  // profiles_public (sin correo). Si no se encuentra, se muestra
  // lo mínimo que trae la publicación (nombre).
  const [viewProfile, setViewProfile] = useState<Profile | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  async function openAuthor(p: Post) {
    setViewLoading(true)
    const found = await getProfile(p.profile_id)
    setViewProfile(found || {
      id: p.profile_id, name: p.author_name, email: '', zone: '', bio: '',
      beginner: false, sports: [], availability: [],
    })
    setViewLoading(false)
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    // En modo invitado no se puede publicar: se pide crear cuenta.
    if (guest) { onNeedAccount?.(); return }
    try {
      await createPost(profile.id, profile.name, text)
      setText('')
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo publicar.') }
  }

  const visiblePosts = group === 'Todos'
    ? posts
    : posts.filter((p) => {
        const t = p.text.toLowerCase()
        const words = GROUP_SPORTS.find((g) => g.label === group)?.words ?? []
        return words.some((w) => t.includes(w))
      })

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-teal-dark">Comunidad</h2>

      {/* Grupos por deporte */}
      <div className="flex flex-wrap gap-2">
        {['Todos', ...GROUP_SPORTS.map((g) => g.label)].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${group === g ? 'bg-pulso text-night' : 'bg-white text-slate-600 shadow-sm'}`}
          >
            {g}
          </button>
        ))}
      </div>

      <Card>
        <form onSubmit={publish} className="space-y-2">
          <textarea className={`${inputCls} resize-none`} rows={3} value={text}
            onChange={(e) => setText(e.target.value)} placeholder="¿Qué entrenaste hoy?" />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Btn type="submit" variant="teal" className="w-full">Publicar</Btn>
          {guest && (
            <p className="text-center text-xs font-semibold text-slate-500">
              Para publicar, crea tu cuenta gratis.
            </p>
          )}
        </form>
      </Card>

      {visiblePosts.length === 0 ? <Empty text={group === 'Todos' ? 'Aún no hay publicaciones. Sé el primero en saludar.' : `Aún no hay publicaciones en ${group}. Sé el primero en publicar de este deporte.`} /> : (
        <div className="space-y-2">
          {visiblePosts.map((p) => (
            <Card key={p.id}>
              <button
                type="button"
                className="flex items-center gap-2 text-left"
                onClick={() => openAuthor(p)}
                title="Ver perfil de esta persona"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-coral text-base font-black text-night">
                  {p.author_name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <span className="font-bold underline decoration-teal/50 underline-offset-2">{p.author_name}</span>
                  {p.profile_id === profile.id && <span className="ml-1 text-xs font-semibold text-teal-dark">(tú)</span>}
                  <span className="block text-sm text-slate-600">{new Date(p.created_at).toLocaleString('es-MX')}</span>
                </span>
              </button>
              <p className="mt-1">{p.text}</p>
            </Card>
          ))}
        </div>
      )}
      {viewLoading && <p className="text-center text-sm text-slate-500">Abriendo perfil…</p>}
      {viewProfile && (
        <PublicProfile
          profile={viewProfile}
          posts={posts.filter((p) => p.profile_id === viewProfile.id)}
          title={viewProfile.id === profile.id ? 'Tu perfil · así te ven los demás' : undefined}
          onClose={() => setViewProfile(null)}
        />
      )}

      <h3 className="pt-2 text-lg font-bold">Negocios locales</h3>
      <p className="text-sm text-slate-500">Coaches, gyms y canchas de Cancún y la Riviera Maya. Esta parte crece cuando ya haya usuarios.</p>
      {businesses.length === 0 ? <Empty text="Aún no hay negocios registrados." /> : (
        <div className="space-y-2">
          {businesses.map((b) => (
            <Card key={b.id}>
              <p className="font-bold">{b.name}</p>
              <p className="text-sm text-slate-600">{b.kind} · {b.zone}</p>
              <p className="mt-1 text-sm">{b.description}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
