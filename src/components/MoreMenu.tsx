// Menú "Más": la 5ª pestaña. Aquí viven Buscar, Comunidad,
// Negocios, Música, Perfil, Soy coach y (solo admin)
// Administración. Antes eran pestañas fijas y la barra tenía 8
// botones; ahora la navegación es solo Inicio, Sesiones, Entrenar,
// Retos y Más.
import { Card } from './ui'

export type MoreOption = 'buscar' | 'comunidad' | 'negocios' | 'musica' | 'perfil' | 'coach' | 'admin'

const OPTIONS: { id: MoreOption; icon: string; label: string; desc: string; adminOnly?: boolean }[] = [
  { id: 'buscar', icon: '🔍', label: 'Buscar', desc: 'Encuentra compañero por deporte, nivel y zona' },
  { id: 'comunidad', icon: '💬', label: 'Comunidad', desc: 'Publicaciones, grupos por deporte y negocios' },
  { id: 'negocios', icon: '🏪', label: 'Negocios', desc: 'Coaches, gyms, canchas y clases destacadas' },
  { id: 'musica', icon: '🎵', label: 'Música', desc: 'YouTube o tus canciones del teléfono' },
  { id: 'perfil', icon: '👤', label: 'Perfil', desc: 'Tus datos, deportes y tus publicaciones' },
  { id: 'coach', icon: '🏅', label: 'Soy coach', desc: 'Crea clases, ve a tus alumnos y tus números' },
  { id: 'admin', icon: '🛠️', label: 'Administración', desc: 'Estadísticas, usuarios y moderación', adminOnly: true },
]

export default function MoreMenu({ isAdmin, guest = false, onSelect, onCreateAccount }: { isAdmin: boolean; guest?: boolean; onSelect: (opt: MoreOption) => void; onCreateAccount?: () => void }) {
  // En modo invitado solo se puede VER: Buscar, Comunidad, Negocios
  // y Música. Perfil, Soy coach y Administración necesitan cuenta.
  const visible = OPTIONS.filter((o) => (!o.adminOnly || isAdmin) && (!guest || ['buscar', 'comunidad', 'negocios', 'musica'].includes(o.id)))
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-teal-dark">Más</h2>
      {guest && (
        <Card>
          <button type="button" onClick={() => onCreateAccount?.()} className="flex w-full items-center gap-3 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pulso text-xl">👤</span>
            <span className="min-w-0 flex-1">
              <span className="block font-black text-night">Crear cuenta gratis</span>
              <span className="block text-sm text-slate-600">Apuntarte, publicar, chatear y entrenar con GPS</span>
            </span>
            <span className="shrink-0 text-lg text-slate-400">›</span>
          </button>
        </Card>
      )}
      <div className="space-y-2">
        {visible.map((o) => (
          <Card key={o.id}>
            <button type="button" onClick={() => onSelect(o.id)} className="flex w-full items-center gap-3 text-left">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pulso text-xl">{o.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-black text-night">{o.label}</span>
                <span className="block text-sm text-slate-600">{o.desc}</span>
              </span>
              <span className="shrink-0 text-lg text-slate-400">›</span>
            </button>
          </Card>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500">
        PULSO · Entrena con pulso · Isla Mujeres y la Riviera Maya
      </p>
    </div>
  )
}
