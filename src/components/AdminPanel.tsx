// Panel de administración — solo lo ve el dueño (ver isAdminUser en
// store.ts: su correo, o is_admin = true en la base). Nadie más ve
// esta pestaña. Los correos de otros usuarios NO se muestran: para
// moderar bastan nombre, zona y deportes. Las estadísticas de
// entrenamientos de todos requieren la política "admins ven
// entrenamientos" (schema.sql): si aún no se corrió el esquema
// nuevo en Supabase, el panel avisa que solo ve los propios.
import { useState } from 'react'
import type { Business, Post, Profile, SessionItem, Workout } from '../lib/types'
import { deletePost, deleteSession, mode } from '../lib/store'
import { formatDate } from '../lib/utils'
import { Btn, Card, Empty, Tag } from './ui'

export default function AdminPanel({
  profiles, sessions, posts, businesses, allWorkouts, dbAdmin, onRefresh,
}: {
  profiles: Profile[]
  sessions: SessionItem[]
  posts: Post[]
  businesses: Business[]
  allWorkouts: Workout[]
  /** is_admin en la base (distinto del acceso por correo del dueño). */
  dbAdmin: boolean
  onRefresh: () => void
}) {
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
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
      <p className="text-sm text-slate-500">Solo tú ves este panel. Aquí ves cómo va PULSO y puedes moderar sesiones y publicaciones.</p>
      {mode === 'supabase' && !dbAdmin && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          ⚠️ Entras al panel por ser el dueño, pero en la base aún no tienes el permiso de admin: para ver los entrenamientos de todos y borrar sesiones o publicaciones de otros, corre el esquema actualizado (supabase/schema.sql) en el SQL Editor de Supabase. Sin eso, los borrados de otros pueden fallar.
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
        {profiles.length === 0 ? <Empty text="Aún no hay usuarios." /> : (
          <ul className="space-y-2">
            {profiles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-sage-50 p-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-sm font-black text-white">{p.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.name} {p.is_admin ? <span className="rounded-full bg-pulso/10 px-2 py-0.5 text-[11px] font-bold text-pulso">Admin</span> : null}</p>
                  <p className="text-xs text-slate-500">{p.zone}{p.sports.length ? ` · ${p.sports.map((s) => s.sport).join(', ')}` : ''}</p>
                </div>
              </li>
            ))}
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
                    <button className="rounded-full bg-pulso px-3 py-1.5 text-xs font-bold text-white" onClick={() => void removeSession(s.id)}>Sí, borrar</button>
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
                    <button className="rounded-full bg-pulso px-3 py-1.5 text-xs font-bold text-white" onClick={() => void removePost(p.id)}>Sí, borrar</button>
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
