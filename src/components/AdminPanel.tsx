// Panel de administración — solo lo ve el dueño (ver isAdminUser en
// store.ts: su correo, o is_admin = true en la base). Nadie más ve
// esta pestaña. Los correos de otros usuarios NO se muestran: para
// moderar bastan nombre, zona y deportes. Las estadísticas de
// entrenamientos de todos requieren la política "admins ven
// entrenamientos" (schema.sql): si aún no se corrió el esquema
// nuevo en Supabase, el panel avisa que solo ve los propios.
import { useState } from 'react'
import type { AuthUser, Business, Post, Profile, SessionItem, Workout } from '../lib/types'
import { ZONES } from '../lib/types'
import { deletePost, deleteSession, mode, setUserBlocked, updateProfileAsAdmin } from '../lib/store'
import { formatDate } from '../lib/utils'
import { Btn, Card, Empty, Tag, inputCls, selectCls } from './ui'

export default function AdminPanel({
  profiles, sessions, posts, businesses, allWorkouts, dbAdmin, onRefresh, adminUser, adminProfile, currentUserId,
}: {
  profiles: Profile[]
  sessions: SessionItem[]
  posts: Post[]
  businesses: Business[]
  allWorkouts: Workout[]
  /** is_admin en la base (distinto del acceso por correo del dueño). */
  dbAdmin: boolean
  onRefresh: () => void
  /** El admin que está usando el panel (para no bloquearse a sí mismo). */
  adminUser: AuthUser
  adminProfile: Profile
  currentUserId: string
}) {
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [blockConfirmId, setBlockConfirmId] = useState<string | null>(null)
  // Edición de perfil (admin): nombre, zona y bio. Correo y contraseña
  // no se editan desde el panel.
  const [editing, setEditing] = useState<Profile | null>(null)
  const [editName, setEditName] = useState('')
  const [editZone, setEditZone] = useState('')
  const [editBio, setEditBio] = useState('')
  const totalKm = allWorkouts.reduce((s, w) => s + (w.distance_km || 0), 0)

  async function removeSession(id: string) {
    setErr(''); setMsg('')
    try {
      await deleteSession(id)
      setMsg('Sesión eliminada.')
      setConfirmId(null)
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo eliminar la sesión.') }
  }
  async function removePost(id: string) {
    setErr(''); setMsg('')
    try {
      await deletePost(id)
      setMsg('Publicación eliminada.')
      setConfirmId(null)
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo eliminar la publicación.') }
  }

  function startEdit(p: Profile) {
    setErr(''); setMsg('')
    setEditing(p)
    setEditName(p.name)
    setEditZone(p.zone)
    setEditBio(p.bio || '')
  }

  async function saveEdit() {
    if (!editing) return
    setErr(''); setMsg('')
    try {
      await updateProfileAsAdmin(adminUser, adminProfile, editing, { name: editName, zone: editZone, bio: editBio })
      setMsg(`Perfil de ${editName.trim()} actualizado.`)
      setEditing(null)
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo guardar el perfil.') }
  }

  async function toggleBlock(p: Profile) {
    setErr(''); setMsg('')
    try {
      await setUserBlocked(adminUser, adminProfile, p, !p.is_blocked)
      setMsg(p.is_blocked ? `${p.name} desbloqueado: ya puede crear sesiones, publicar y apuntarse.` : `${p.name} bloqueado: ya no puede crear sesiones, publicar ni apuntarse.`)
      setBlockConfirmId(null)
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo cambiar el bloqueo.') }
  }

  const stats: { label: string; value: string }[] = [
    { label: 'Usuarios', value: String(profiles.length) },
    { label: 'Sesiones', value: String(sessions.length) },
    { label: 'Entrenamientos', value: String(allWorkouts.length) },
    { label: 'Km totales', value: totalKm.toFixed(1) },
    { label: 'Publicaciones', value: String(posts.length) },
    { label: 'Negocios', value: String(businesses.length) },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-teal-dark">🛠️ Administración</h2>
      <p className="text-sm text-slate-500">Solo tú ves este panel. Aquí ves cómo va PULSO y puedes moderar sesiones y publicaciones, bloquear usuarios y editar sus perfiles.</p>
      {mode === 'supabase' && !dbAdmin && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          ⚠️ Entras al panel por ser el dueño, pero en la base aún no tienes el permiso de admin: para ver los entrenamientos de todos, borrar sesiones o publicaciones de otros y bloquear o editar usuarios, corre el esquema actualizado (supabase/schema.sql) en el SQL Editor de Supabase. Sin eso, esas acciones pueden fallar.
        </p>
      )}
      {err && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">{msg}</p>}

      <div className="grid grid-cols-3 gap-2 text-center">
        {stats.map((s) => (
          <Card key={s.label} className="p-3">
            <p className="text-xl font-black text-teal-dark">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="mb-2 text-lg font-bold">👥 Usuarios ({profiles.length})</h3>
        <p className="mb-2 text-xs text-slate-500">Bloquear: el usuario sigue entrando y viendo la app, pero no puede crear sesiones, publicar ni apuntarse. El admin no puede bloquearse a sí mismo ni a otro admin.</p>
        {profiles.length === 0 ? <Empty text="Aún no hay usuarios." /> : (
          <ul className="space-y-2">
            {profiles.map((p) => {
              const isSelf = p.id === currentUserId
              const canBlock = !isSelf && !p.is_admin
              return (
                <li key={p.id} className="rounded-xl bg-sage-50 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-sm font-black text-white">{p.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {p.name}{' '}
                        {p.is_admin ? <span className="rounded-full bg-pulso/10 px-2 py-0.5 text-[11px] font-bold text-pulso-dark">Admin</span> : null}{' '}
                        {p.is_blocked ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">🚫 Bloqueado</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">{p.zone}{p.sports.length ? ` · ${p.sports.map((s) => s.sport).join(', ')}` : ''}</p>
                    </div>
                    <div className="flex gap-1">
                      {(!p.is_admin || isSelf) && (
                        <button className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold" onClick={() => startEdit(p)}>Editar</button>
                      )}
                      {canBlock && blockConfirmId !== p.id && (
                        <button className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700" onClick={() => setBlockConfirmId(p.id)}>
                          {p.is_blocked ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      )}
                      {canBlock && blockConfirmId === p.id && (
                        <span className="flex gap-1">
                          <button className="rounded-full bg-pulso px-3 py-1.5 text-xs font-bold text-night" onClick={() => void toggleBlock(p)}>{p.is_blocked ? 'Sí, desbloquear' : 'Sí, bloquear'}</button>
                          <button className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold" onClick={() => setBlockConfirmId(null)}>Cancelar</button>
                        </span>
                      )}
                    </div>
                  </div>
                  {editing?.id === p.id && (
                    <div className="mt-3 space-y-2 rounded-xl bg-white p-3">
                      <p className="text-sm font-bold">Editar perfil de {p.name}</p>
                      <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" aria-label="Nombre" />
                      <select className={selectCls} value={editZone} onChange={(e) => setEditZone(e.target.value)} aria-label="Zona">
                        {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                      </select>
                      <textarea className={inputCls} value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Bio (opcional)" rows={2} aria-label="Bio" />
                      <p className="text-xs text-slate-500">El correo y la contraseña no se cambian desde el panel.</p>
                      <div className="flex gap-2">
                        <Btn variant="teal" className="flex-1" onClick={() => void saveEdit()}>Guardar cambios</Btn>
                        <Btn variant="ghost" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Btn>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">📅 Sesiones ({sessions.length})</h3>
        {sessions.length === 0 ? <Empty text="No hay sesiones." /> : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-sage-50 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.title}</p>
                  <p className="text-xs text-slate-500">{s.sport} · {formatDate(s.date)} {s.time} · {s.place} · por {s.host_name}</p>
                </div>
                {confirmId === s.id ? (
                  <span className="flex gap-1">
                    <button className="rounded-full bg-pulso px-3 py-1.5 text-xs font-bold text-night" onClick={() => void removeSession(s.id)}>Sí, borrar</button>
                    <button className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold" onClick={() => setConfirmId(null)}>Cancelar</button>
                  </span>
                ) : (
                  <button className="text-xs font-bold text-red-500 underline" onClick={() => setConfirmId(s.id)}>Eliminar</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">💬 Publicaciones ({posts.length})</h3>
        {posts.length === 0 ? <Empty text="No hay publicaciones." /> : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-2 rounded-xl bg-sage-50 p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{p.author_name}</p>
                  <p className="text-sm text-slate-600">{p.text}</p>
                </div>
                {confirmId === p.id ? (
                  <span className="flex gap-1">
                    <button className="rounded-full bg-pulso px-3 py-1.5 text-xs font-bold text-night" onClick={() => void removePost(p.id)}>Sí, borrar</button>
                    <button className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold" onClick={() => setConfirmId(null)}>Cancelar</button>
                  </span>
                ) : (
                  <button className="text-xs font-bold text-red-500 underline" onClick={() => setConfirmId(p.id)}>Eliminar</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">🏪 Negocios ({businesses.length})</h3>
        {businesses.length === 0 ? <Empty text="No hay negocios registrados." /> : (
          <ul className="space-y-2">
            {businesses.map((b) => (
              <li key={b.id} className="rounded-xl bg-sage-50 p-2">
                <p className="text-sm font-bold">{b.name}</p>
                <p className="text-xs text-slate-500">{b.kind} · {b.zone}</p>
                {b.description && <p className="text-xs text-slate-600">{b.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">🏃 Entrenamientos recientes</h3>
        {allWorkouts.length === 0 ? <Empty text={mode === 'supabase' && !dbAdmin ? 'Sin permiso de admin en la base solo se ven los tuyos (corre el esquema nuevo).' : 'Aún no hay entrenamientos.'} /> : (
          <ul className="space-y-1">
            {allWorkouts.slice(0, 20).map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Tag>{w.sport}</Tag>
                <span className="font-semibold">{formatDate(w.date)}</span>
                <span className="text-slate-600">{w.duration_min} min{w.distance_km ? ` · ${w.distance_km} km` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Btn variant="ghost" className="w-full" onClick={onRefresh}>Actualizar datos</Btn>
    </div>
  )
}
