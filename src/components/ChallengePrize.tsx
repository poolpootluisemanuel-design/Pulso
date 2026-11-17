// Premio de un reto, dado por un negocio local.
// Se monta DENTRO de la tarjeta del reto en Challenges.tsx (no es una
// tarjeta propia): el reto ya muestra título, días y barra de progreso,
// esto solo agrega la línea del premio.
//   - Sin premio (el reto no trae prize_text ni negocio): no muestra
//     nada (null).
//   - Reto completado: "🏆 Premio: <texto>" + negocio y zona.
//   - Aún no completado: "🎁 Premio al completarlo: <texto>" como
//     incentivo, con el negocio y su zona si los hay.
// El negocio se resuelve fuera (getChallengePrize en
// src/lib/challengePrizes.ts) y llega ya resuelto en `business`; si no
// llega, solo se muestra el texto del premio.
import type { Business } from '../lib/types'
import type { ChallengeRow } from '../lib/challengePrizes'

export interface ChallengePrizeProps {
  challenge: ChallengeRow
  business?: Business
  /** Si es true, el reto ya está completado y se muestra el premio
   *  como ganado. Si no se pasa (o es false), se muestra como
   *  incentivo. En Challenges.tsx se calcula con
   *  isChallengeCompleted(c, workouts) de challengePrizes.ts. */
  completed?: boolean
}

export default function ChallengePrize({ challenge, business, completed = false }: ChallengePrizeProps) {
  const prizeText = challenge.prize_text?.trim() || ''
  if (!prizeText && !business) return null

  const label = prizeText || (business ? `Premio de ${business.name}` : '')
  return (
    <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
      {completed ? (
        <p className="text-sm font-bold text-amber-900">🏆 Premio: {label}</p>
      ) : (
        <p className="text-sm font-bold text-amber-900">🎁 Premio al completarlo: {label}</p>
      )}
      {business && (
        <p className="text-xs text-amber-800">
          {business.name} · {business.zone}
        </p>
      )}
      {completed && <p className="text-xs font-semibold text-amber-800">¡Reto completado!</p>}
    </div>
  )
}
