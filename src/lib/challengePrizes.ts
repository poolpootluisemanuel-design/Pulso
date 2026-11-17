// Premios de negocios locales en los retos de PULSO.
// Reutiliza listChallenges / listBusinesses / listWorkouts de store.ts
// (ya exportadas; no se duplica su lógica de Supabase + espejo local).
// No inventa negocios ni premios: todo sale de la base (o del seed
// local) y solo se muestra si el reto trae prize_text o business_id.
//
// Para que funcione hay que correr antes
// supabase/migration_challenge_prizes.sql en Supabase. Si la migración
// aún no se corrió, las columnas no existen, los campos llegan como
// undefined y getChallengePrize devuelve null (no se rompe nada).
// En modo local, los retos del seed no traen premio: también null.
import { listBusinesses, listChallenges, listWorkouts } from './store'
import type { Business, Challenge, Workout } from './types'

/** Fila de challenges con los campos de premio de la migración.
 *  Van como opcionales en Challenge (types.ts) cuando se haga el
 *  cableado; mientras tanto se leen con este tipo extendido para no
 *  tocar types.ts. */
export type ChallengeRow = Challenge & {
  prize_text?: string | null
  business_id?: string | null
}

export interface Prize {
  challengeId: string
  businessId?: string
  prizeText: string
}

export interface ChallengeWithPrize {
  challenge: Challenge
  prize: Prize | null
  business?: Business
}

export interface ChallengePrizeInfo {
  prize: Prize
  business?: Business
}

/** Resuelve el premio de un reto y el negocio que lo da.
 *  Devuelve null si el reto no trae ni texto de premio ni negocio
 *  (es el estado "sin premio": el componente no muestra nada).
 *  `prizeText` queda en '' cuando el premio es solo "cortesía de"
 *  un negocio sin texto; el componente muestra el nombre del negocio. */
export function getChallengePrize(challenge: ChallengeRow, businesses: Business[]): ChallengePrizeInfo | null {
  const prizeText = challenge.prize_text?.trim() || ''
  const businessId = challenge.business_id?.trim() || undefined
  if (!prizeText && !businessId) return null
  const business = businessId ? businesses.find((b) => b.id === businessId) : undefined
  return { prize: { challengeId: challenge.id, businessId, prizeText }, business }
}

/** Misma resolución, por id de reto: carga los retos con
 *  listChallenges() de store.ts y resuelve sobre esa lista. */
export async function getChallengePrizeById(challengeId: string, businesses: Business[]): Promise<ChallengePrizeInfo | null> {
  const challenges = await listChallenges()
  const challenge = challenges.find((c) => c.id === challengeId)
  if (!challenge) return null
  return getChallengePrize(challenge, businesses)
}

/** Retos con su premio (y negocio) resueltos. Reutiliza
 *  listChallenges() y listBusinesses() de store.ts, sin copiar su
 *  lógica de Supabase / espejo local / offline. */
export async function listChallengesWithPrizes(): Promise<ChallengeWithPrize[]> {
  const [challenges, businesses] = await Promise.all([listChallenges(), listBusinesses()])
  return challenges.map((challenge) => {
    const resolved = getChallengePrize(challenge, businesses)
    return { challenge, prize: resolved?.prize ?? null, business: resolved?.business }
  })
}

// ---------- Progreso / reto completado ----------

/** Progreso de un reto con la MISMA regla que muestra Challenges.tsx:
 *  entrenamientos totales del usuario contra target_count. Ojo: esa
 *  vista no filtra por la ventana del reto (start_date + days) ni usa
 *  target_km; aquí se replica tal cual para que el premio se gane
 *  justo cuando la barra llega al 100%. Si se quiere ventana, usar
 *  challengeProgressInWindow (aún no cableada en la vista). */
export function challengeProgress(challenge: Challenge, workouts: Workout[]): {
  done: number
  total: number
  pct: number
  completed: boolean
} {
  const done = Math.min(workouts.length, challenge.target_count)
  const pct = challenge.target_count > 0 ? Math.round((done / challenge.target_count) * 100) : 0
  return { done, total: challenge.target_count, pct, completed: done >= challenge.target_count }
}

/** ¿El usuario ya completó este reto? (versión síncrona, para usar
 *  en Challenges.tsx con los workouts que ya tiene cargados). */
export function isChallengeCompleted(challenge: Challenge, workouts: Workout[]): boolean {
  return challengeProgress(challenge, workouts).completed
}

/** Variante con ventana: solo cuenta entrenamientos con fecha dentro
 *  de [start_date, start_date + days). No la usa Challenges.tsx hoy;
 *  queda disponible si se decide que el premio exija entrenar dentro
 *  de las fechas del reto y no con entrenamientos viejos. */
export function challengeProgressInWindow(challenge: Challenge, workouts: Workout[]): {
  done: number
  total: number
  pct: number
  completed: boolean
} {
  const start = new Date(challenge.start_date + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + challenge.days)
  const inWindow = workouts.filter((w) => {
    const d = new Date(w.date + 'T00:00:00')
    return d >= start && d < end
  })
  const done = Math.min(inWindow.length, challenge.target_count)
  const pct = challenge.target_count > 0 ? Math.round((done / challenge.target_count) * 100) : 0
  return { done, total: challenge.target_count, pct, completed: done >= challenge.target_count }
}

/** ¿El perfil ya completó este reto? Carga los entrenamientos con
 *  listWorkouts(profileId) y los retos con listChallenges(), y aplica
 *  la misma regla de progreso que Challenges.tsx. */
export async function challengeCompleted(profileId: string, challengeId: string): Promise<boolean> {
  const [workouts, challenges] = await Promise.all([listWorkouts(profileId), listChallenges()])
  const challenge = challenges.find((c) => c.id === challengeId)
  if (!challenge) return false
  return isChallengeCompleted(challenge, workouts)
}
