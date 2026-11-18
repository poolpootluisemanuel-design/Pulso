// Negocios locales: coaches, gyms, canchas y clases destacadas.
// Vista propia dentro del menú Más (antes solo salía un resumen
// dentro de Comunidad).
import type { Business } from '../lib/types'
import { Card, Empty } from './ui'

export default function Businesses({ businesses }: { businesses: Business[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-teal-dark">Negocios</h2>
      <p className="text-sm text-slate-500">
        Coaches, gyms y canchas de Isla Mujeres, Cancún y la Riviera Maya.
      </p>
      {businesses.length === 0 ? (
        <Empty text="Aún no hay negocios registrados. ¿Tienes un gym, una cancha o das clases? Pronto podrás registrarte aquí." />
      ) : (
        <div className="space-y-2">
          {businesses.map((b) => (
            <Card key={b.id}>
              <p className="font-bold">{b.name}</p>
              <p className="text-sm text-slate-600">{b.kind} · {b.zone}</p>
              <p className="mt-1 text-sm">{b.description}</p>
              {b.phone && <p className="mt-1 text-sm font-semibold text-teal-dark">📞 {b.phone}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
