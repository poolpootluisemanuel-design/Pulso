// Rutas recomendadas para correr (estilo Strava): tarjetas con la
// ficha de cada ruta y el trazado sobre el mapa oscuro. La distancia
// se calcula de la polilínea y se muestra como aproximada ("~3.3 km").
// Orden: si se conoce la ubicación del usuario, por defecto van
// primero las rutas con el INICIO más cercano ("Más cercanas a ti"),
// con "📍 A X.X km del inicio" en cada tarjeta; sin ubicación se
// ordena por zona ("Cerca de ti"), como antes. Filtros: Cerca de mí /
// Isla Mujeres / Cancún / Todas (con ubicación, cada filtro también
// se ordena por distancia al inicio, sin dejar de ser por zona).
import { useState } from 'react'
import { RECOMMENDED_ROUTES, distanceToRouteStartKm, routesSortedByDistance, routesSortedByZone, routeDistanceKm } from '../lib/routes'
import type { RecommendedRoute, RoutePoint } from '../lib/routes'
import { Btn, Card, Tag } from './ui'

const DIFFICULTY_COLOR: Record<string, string> = {
  'Fácil': 'bg-teal/10 text-teal-dark',
  'Media': 'bg-amber-100 text-amber-800',
  'Exigente': 'bg-pulso/10 text-pulso-dark',
}

type Filter = 'cerca' | 'isla' | 'cancun' | 'todas'

export type RouteLocState = 'idle' | 'loading' | 'denied' | 'unavailable'

export default function RecommendedRoutes({
  selectedId,
  onSelect,
  onRun,
  userZone,
  userPosition,
  onRequestLocation,
  locState = 'idle',
  // Compacto (hoja inmersiva expandida): una línea por ruta (nombre,
  // distancia ~km, chip de dificultad, y "A X.X km del inicio" si hay
  // ubicación), sin los textos largos ni las etiquetas. Los chips de
  // filtro y el botón de ubicación se conservan; la fila seleccionada
  // sigue mostrando "▶ Recorrer esta ruta con GPS".
  compact = false,
}: {
  selectedId: string | null
  onSelect: (route: RecommendedRoute) => void
  onRun: (route: RecommendedRoute) => void
  userZone?: string
  /** Ubicación actual del usuario, si ya se conoce (GPS). */
  userPosition?: RoutePoint | null
  /** Pide la ubicación actual (botón "Mostrar las más cercanas a mí"). */
  onRequestLocation?: () => void
  locState?: RouteLocState
  compact?: boolean
}) {
  const [filter, setFilter] = useState<Filter>('cerca')
  const byZone = userZone ? routesSortedByZone(userZone) : RECOMMENDED_ROUTES
  // Con ubicación, el orden por defecto es por distancia al inicio;
  // sin ella, por zona como antes.
  const sorted = userPosition ? routesSortedByDistance(userPosition) : byZone
  const mine = userZone ? sorted.filter((r) => r.zone === userZone) : []
  const sortByDistance = (list: RecommendedRoute[]) =>
    userPosition ? [...list].sort((a, b) => distanceToRouteStartKm(userPosition, a) - distanceToRouteStartKm(userPosition, b)) : list
  let visible: RecommendedRoute[]
  if (filter === 'cerca') visible = sorted
  else if (filter === 'isla') visible = sortByDistance(RECOMMENDED_ROUTES.filter((r) => r.zone === 'Isla Mujeres'))
  else if (filter === 'cancun') visible = sortByDistance(RECOMMENDED_ROUTES.filter((r) => r.zone === 'Cancún centro' || r.zone === 'Zona Hotelera'))
  else visible = sortByDistance(RECOMMENDED_ROUTES)

  const chips: { id: Filter; label: string }[] = [
    { id: 'cerca', label: userPosition ? '📍 Más cercanas a ti' : userZone ? `📍 Cerca de mí (${userZone})` : '📍 Cerca de mí' },
    { id: 'isla', label: '🏝️ Isla Mujeres' },
    { id: 'cancun', label: '🌴 Cancún' },
    { id: 'todas', label: 'Todas' },
  ]

  return (
    <div className="space-y-2">
      {!compact && (
        <>
          <p className="text-sm font-bold text-teal-dark">
            🏃 Rutas recomendadas para correr
            {userPosition && filter === 'cerca' ? ' · Ordenadas por distancia al inicio' : mine.length > 0 && filter === 'cerca' ? ` · Cerca de ti en ${userZone} (${mine.length})` : ''}
          </p>
          <p className="text-xs text-slate-500">Toca una ruta para verla en el mapa. Las distancias son aproximadas, calculadas del trazado. El marcador 🧍 en el mapa eres tú.</p>
        </>
      )}
      {!userPosition && onRequestLocation && (
        <div className="space-y-1">
          <button
            onClick={onRequestLocation}
            disabled={locState === 'loading'}
            className="w-full rounded-full bg-teal px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {locState === 'loading' ? '📍 Buscando tu ubicación…' : '📍 Mostrar las más cercanas a mí'}
          </button>
          {locState === 'denied' && (
            <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-800">Sin permiso de ubicación: las rutas se ordenan por tu zona. Activa la ubicación en Ajustes → PULSO → Permisos → Ubicación y vuelve a intentarlo.</p>
          )}
          {locState === 'unavailable' && (
            <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-800">No se pudo tomar tu ubicación en este teléfono. Las rutas se ordenan por tu zona.</p>
          )}
        </div>
      )}
      {userPosition && !compact && (
        <p className="rounded-xl bg-teal/10 p-2 text-xs font-semibold text-teal-dark">🧍 Estás aquí: las rutas están ordenadas del inicio más cercano al más lejano. Toca una para ver en el mapa qué tan lejos te queda el inicio.</p>
      )}
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
        const distKm = userPosition ? distanceToRouteStartKm(userPosition, r) : null
        if (compact) {
          return (
            <div key={r.id}>
              <button className="w-full text-left" onClick={() => onSelect(r)}>
                <div className={`flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm ${selected ? 'ring-2 ring-pulso' : ''}`}>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-night">{r.name}</span>
                  {distKm !== null && <span className="shrink-0 text-[11px] font-semibold text-teal-dark">🧍 {distKm.toFixed(1)} km</span>}
                  <span className="shrink-0 text-[11px] font-semibold text-slate-500">~{routeDistanceKm(r).toFixed(1)} km</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${DIFFICULTY_COLOR[r.difficulty]}`}>{r.difficulty}</span>
                </div>
              </button>
              {selected && (
                <Btn variant="coral" className="mt-2 w-full" onClick={() => onRun(r)}>
                  ▶ Recorrer esta ruta con GPS
                </Btn>
              )}
            </div>
          )
        }
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
                {distKm !== null && <Tag>🧍 A {distKm.toFixed(1)} km del inicio</Tag>}
                {userZone && r.zone === userZone && !userPosition && <Tag>⭐ Cerca de ti</Tag>}
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
