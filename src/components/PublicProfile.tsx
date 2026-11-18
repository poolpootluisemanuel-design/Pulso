import type { Post, Profile } from '../lib/types'
import { Btn, Card, Empty, Tag } from './ui'

/** Perfil público de un usuario, tal como lo ven los demás.
 *  Solo muestra datos públicos (nombre, zona, bio, deportes con
 *  nivel, disponibilidad y sus publicaciones). NUNCA muestra el
 *  correo ni botones de editar: los datos vienen de la vista
 *  `profiles_public`, sin correo. Se usa igual para ver el perfil
 *  de otra persona desde Comunidad y para la vista previa
 *  "Ver como me ven" del propio perfil. */
export default function PublicProfile({ profile, posts, title, onClose }: {
  profile: Profile
  posts: Post[]
  title?: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#FFF9F0] p-4 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black text-teal-dark">{title || `Perfil de ${profile.name}`}</h3>
          <Btn variant="ghost" onClick={onClose}>✕ Cerrar</Btn>
        </div>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-coral text-2xl font-black text-night">
              {profile.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold">{profile.name}{profile.beginner ? ' · 🌱 Principiante' : ''}</p>
              <p className="text-sm text-slate-600">{profile.zone}</p>
              {profile.bio && <p className="mt-1 text-sm text-slate-700">{profile.bio}</p>}
            </div>
          </div>
          {profile.sports.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {profile.sports.map((s) => <Tag key={s.sport}>{s.sport} · {s.level}</Tag>)}
            </div>
          )}
          {profile.availability.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">Disponible: {profile.availability.join(', ')}</p>
          )}
        </Card>

        <h4 className="mb-2 mt-4 text-base font-black text-night">Sus publicaciones ({posts.length})</h4>
        {posts.length === 0 ? (
          <Empty text={`${profile.name} aún no ha publicado nada en Comunidad.`} />
        ) : (
          <div className="space-y-2">
            {posts.map((p) => (
              <Card key={p.id}>
                <p className="text-sm text-slate-600">{new Date(p.created_at).toLocaleString('es-MX')}</p>
                <p className="mt-1">{p.text}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
