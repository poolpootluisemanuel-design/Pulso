// Rutas recomendadas para correr (estilo Strava): tarjetas con la
// ficha de cada ruta y el trazado sobre el mapa oscuro. La distancia
// se calcula de la polilínea y se muestra como aproximada ("~3.3 km").
// Orden por zona: primero las rutas de la zona del usuario ("Cerca
// de ti"), luego las demás. Filtros: Cerca de mí / Isla Mujeres /
// Cancún / Todas.
import { useState } from 'react'
import { RECOMMENDED_ROUTES, routesSortedByZone, routeDistanceKm } from '../lib/routes'
import type { RecommendedRoute } from '../lib/routes'
import { Btn, Card, Tag } from './ui'

const DIFFICULTY_COLOR: Record<string, string> = {
  'Fácil': 'bg-teal/10 text-teal-dark',
  'Media': 'bg-amber-100 text-amber-800',
  'Exigente': 'bg-pulso/10 text-pulso',
}

type Filter = 'cerca' | 'isla' | 'cancun' | 'todas'

export default function RecommendedRoutes({
  selectedId,
  onSelect,
  onRun,
  userZone,
}: {
  selectedId: string | null
  onSelect: (route: RecommendedRoute) => void
  onRun: (route: RecommendedRoute) => void
  userZone?: string
}) {
  const [filter, setFilter] = useState<Filter>('cerca')
  const sorted = userZone ? routesSortedByZone(userZone) : RECOMMENDED_ROUTES
  const mine = userZone ? sorted.filter((r) => r.zone === userZone) : []
  let visible: RecommendedRoute[]
  if (filter === 'cerca') visible = sorted
  else if (filter === 'isla') visible = RECOMMENDED_ROUTES.filter((r) => r.zone === 'Isla Mujeres')
  else if (filter === 'cancun') visible = RECOMMENDED_ROUTES.filter((r) => r.zone === 'Cancún centro' || r.zone === 'Zona Hotelera')
  else visible = RECOMMENDED_ROUTES

  const chips: { id: Filter; label: string }[] = [
    { id: 'cerca', label: userZone ? `📍 Cerca de mí (${userZone})` : '📍 Cerca de mí' },
    { id: 'isla', label: '🏝️ Isla Mujeres' },
    { id: 'cancun', label: '🌴 Cancún' },
    { id: 'todas', label: 'Todas' },
  ]

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-teal-dark">
        🏃 Rutas recomendadas para correr
        {mine.length > 0 && filter === 'cerca' ? ` · Cerca de ti en ${userZone} (${mine.length})` : ''}
      </p>
      <p className="text-xs text-slate-500">Toca una ruta para verla en el mapa. Las distancias son aproximadas, calculadas del trazado.</p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === c.id ? 'bg-night text-white' : 'bg-white text-slate-600 shadow-sm'}`}>
            {c.label}
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-600">No hay rutas en esta zona todavía.</p>
      )}
      {visible.map((r) => {
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
                {userZone && r.zone === userZone && <Tag>⭐ Cerca de ti</Tag>}
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
