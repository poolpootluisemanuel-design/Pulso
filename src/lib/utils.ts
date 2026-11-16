import type { Workout } from './types'

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Día de la semana en español para una fecha YYYY-MM-DD. Se usa al crear
 *  sesiones para no volver a cruzar día y fecha (regla del plan). */
export function weekdayName(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00')
  return d.toLocaleDateString('es-MX', { weekday: 'long' })
}

export function formatDate(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00')
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Distancia en km entre dos puntos (fórmula haversine). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function paceMinKm(distanceKm: number, minutes: number): string {
  if (!distanceKm || distanceKm <= 0) return '—'
  const pace = minutes / distanceKm
  const m = Math.floor(pace)
  const s = Math.round((pace - m) * 60)
  return `${m}:${String(s).padStart(2, '0')} min/km`
}

/** Racha: días seguidos con al menos un entrenamiento, terminando hoy o ayer. */
export function computeStreak(workouts: Workout[]): number {
  const days = new Set(workouts.map((w) => w.date))
  let streak = 0
  const d = new Date()
  // Si hoy aún no entrenó, la racha puede seguir viva desde ayer.
  if (!days.has(todayISO())) d.setDate(d.getDate() - 1)
  while (days.has(d.toISOString().slice(0, 10))) {
    streak += 1
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export interface Medal {
  id: string
  label: string
  earned: boolean
}

export function computeMedals(workouts: Workout[]): Medal[] {
  const totalKm = workouts.reduce((s, w) => s + (w.distance_km || 0), 0)
  const streak = computeStreak(workouts)
  const last7 = workouts.filter((w) => {
    const d = new Date(w.date + 'T12:00:00')
    return Date.now() - d.getTime() <= 7 * 24 * 3600 * 1000
  }).length
  return [
    { id: 'primero', label: 'Primer entrenamiento', earned: workouts.length >= 1 },
    { id: 'tres-semana', label: '3 entrenamientos en una semana', earned: last7 >= 3 },
    { id: 'diez-km', label: '10 km acumulados', earned: totalKm >= 10 },
    { id: 'racha-3', label: 'Racha de 3 días', earned: streak >= 3 },
    { id: 'racha-7', label: 'Racha de 7 días', earned: streak >= 7 },
    { id: 'diez-entrenos', label: '10 entrenamientos', earned: workouts.length >= 10 },
  ]
}

export async function sha256(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    // Fallback solo para modo local sin crypto.subtle (http sin SSL).
    let h = 0
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
    return 'local-' + h.toString(16)
  }
}
