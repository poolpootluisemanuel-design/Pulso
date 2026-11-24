// Cuerpo de una publicación de recorrido: mapa dibujado + números +
// nota. La usa el feed de Comunidad, el perfil público y (sin nota) el
// detalle del historial. El encabezado de autor lo pone quien la usa.
import { paceMinKm } from '../lib/utils'
import RouteMini from './RouteMini'

export default function WorkoutPostCard({ sport, distanceKm, durationMin, steps, route, note }: {
  sport: string
  distanceKm?: number
  durationMin: number
  steps?: number
  route?: { lat: number; lng: number }[]
  note?: string
}) {
  // Ritmo con la unidad chica al lado (como en GpsTracker): antes la
  // unidad se partía a otra línea y parecía otro número.
  const paceStr = paceMinKm(distanceKm ?? 0, durationMin)
  const paceValue = paceStr === '—' ? '—' : paceStr.replace(' min/km', '')
  const speedValue = distanceKm && durationMin > 0 ? (distanceKm / (durationMin / 60)).toFixed(1) : '0'
  return (
    <div className="mt-1 space-y-2">
      {route && route.length >= 2 && <RouteMini route={route} h={150} />}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-sage-50 p-2">
          <p className="whitespace-nowrap text-lg font-black tabular-nums">
            {distanceKm != null ? distanceKm : '—'} <span className="text-xs font-bold text-slate-500">km</span>
          </p>
          <p className="text-xs text-slate-500">Distancia</p>
        </div>
        <div className="rounded-xl bg-sage-50 p-2">
          <p className="whitespace-nowrap text-lg font-black tabular-nums">
            {durationMin} <span className="text-xs font-bold text-slate-500">min</span>
          </p>
          <p className="text-xs text-slate-500">Tiempo</p>
        </div>
        <div className="rounded-xl bg-sage-50 p-2">
          <p className="whitespace-nowrap text-lg font-black">
            {sport === 'Ciclismo' ? (
              <>{speedValue} <span className="text-xs font-bold text-slate-500">km/h</span></>
            ) : paceValue === '—' ? '—' : (
              <>{paceValue} <span className="text-xs font-bold text-slate-500">min/km</span></>
            )}
          </p>
          <p className="text-xs text-slate-500">{sport === 'Ciclismo' ? 'Velocidad' : 'Ritmo'}</p>
        </div>
      </div>
      {steps ? <p className="text-center text-sm text-slate-600">👣 {steps.toLocaleString('es-MX')} pasos</p> : null}
      {note && <p>{note}</p>}
    </div>
  )
}
