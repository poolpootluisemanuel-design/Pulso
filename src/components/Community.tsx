import { useState } from 'react'
import type { Business, Post, Profile } from '../lib/types'
import { createPost } from '../lib/store'
import { Btn, Card, Empty } from './ui'

export default function Community({ profile, posts, businesses, onRefresh }: { profile: Profile; posts: Post[]; businesses: Business[]; onRefresh: () => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')

  async function publish(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      await createPost(profile.id, profile.name, text)
      setText('')
      onRefresh()
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : 'No se pudo publicar.') }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-teal-dark">Comunidad</h2>
      <Card>
        <form onSubmit={publish} className="space-y-2">
          <textarea className="w-full rounded-xl border border-slate-300 px-3 py-2" rows={3} value={text}
            onChange={(e) => setText(e.target.value)} placeholder={`¿Qué onda, ${profile.name}? ¿Buscas compañero, compartes un logro…?`} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Btn type="submit" variant="teal" className="w-full">Publicar</Btn>
        </form>
      </Card>

      {posts.length === 0 ? <Empty text="Aún no hay publicaciones. Sé el primero en saludar." /> : (
        <div className="space-y-2">
          {posts.map((p) => (
            <Card key={p.id}>
              <p className="font-bold">{p.author_name}</p>
              <p className="text-sm text-slate-600">{new Date(p.created_at).toLocaleString('es-MX')}</p>
              <p className="mt-1">{p.text}</p>
            </Card>
          ))}
        </div>
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
