// Rutas recomendadas para correr (estilo Strava): tarjetas con la
// ficha de cada ruta y el trazado sobre el mapa oscuro. La distancia
// se calcula de la polilínea y se muestra como aproximada ("~3.3 km").
import { RECOMMENDED_ROUTES, routeDistanceKm } from '../lib/routes'
import type { RecommendedRoute } from '../lib/routes'
import { Btn, Card, Tag } from './ui'

const DIFFICULTY_COLOR: Record<string, string> = {
  'Fácil': 'bg-teal/10 text-teal-dark',
  'Media': 'bg-amber-100 text-amber-800',
  'Exigente': 'bg-pulso/10 text-pulso',
}

export default function RecommendedRoutes({
  selectedId,
  onSelect,
  onRun,
}: {
  selectedId: string | null
  onSelect: (route: RecommendedRoute) => void
  onRun: (route: RecommendedRoute) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-teal-dark">🏃 Rutas recomendadas para correr</p>
      <p className="text-xs text-slate-500">Toca una ruta para verla en el mapa. Las distancias son aproximadas, calculadas del trazado.</p>
      {RECOMMENDED_ROUTES.map((r) => {
        const selected = selectedId === r.id
        return (
          <Card key={r.id} className={selected ? 'ring-2 ring-pulso' : ''}>
            <button className="w-full text-left" onClick={() => onSelect(r)}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-bold">{r.name}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${DIFFICULTY_COLOR[r.difficulty]}`}>{r.difficulty}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{r.blurb}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Tag>📍 {r.zone}</Tag>
                <Tag>~{routeDistanceKm(r).toFixed(1)} km</Tag>
                <Tag>{r.surface}</Tag>
                <Tag>Desnivel ~{r.elevationGainM} m</Tag>
              </div>
            </button>
            {selected && (
              <Btn variant="coral" className="mt-3 w-full" onClick={() => onRun(r)}>
                ▶ Recorrer esta ruta con GPS
              </Btn>
            )}
          </Card>
        )
      })}
    </div>
  )
}
