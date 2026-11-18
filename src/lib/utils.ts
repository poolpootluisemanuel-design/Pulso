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

/** Zona por coordenadas GPS (cajas aproximadas, en ese orden: las
 *  específicas primero, Riviera Maya al final como zona amplia).
 *  Sirve para no dejar fijo "Cancún centro" cuando la persona está
 *  en Isla Mujeres o en otro lado. Si no cae en ninguna, null y se
 *  deja la zona que el usuario ya tenía elegida. */
const ZONE_AREAS: { zone: string; latMin: number; latMax: number; lngMin: number; lngMax: number }[] = [
  { zone: 'Isla Mujeres', latMin: 21.22, latMax: 21.29, lngMin: -86.75, lngMax: -86.68 },
  { zone: 'Zona Hotelera', latMin: 21.08, latMax: 21.16, lngMin: -86.82, lngMax: -86.76 },
  { zone: 'Puerto Cancún', latMin: 21.17, latMax: 21.2, lngMin: -86.82, lngMax: -86.79 },
  { zone: 'Cancún centro', latMin: 21.13, latMax: 21.19, lngMin: -86.87, lngMax: -86.8 },
  { zone: 'Puerto Morelos', latMin: 20.83, latMax: 20.88, lngMin: -86.92, lngMax: -86.86 },
  { zone: 'Playa del Carmen', latMin: 20.6, latMax: 20.66, lngMin: -87.09, lngMax: -87.05 },
  { zone: 'Tulum', latMin: 20.19, latMax: 20.24, lngMin: -87.45, lngMax: -87.4 },
  { zone: 'Cozumel', latMin: 20.47, latMax: 20.55, lngMin: -86.97, lngMax: -86.9 },
  { zone: 'Riviera Maya', latMin: 20.0, latMax: 21.1, lngMin: -87.6, lngMax: -86.8 },
]

export function detectZone(lat: number, lng: number): string | null {
  for (const a of ZONE_AREAS) {
    if (lat >= a.latMin && lat <= a.latMax && lng >= a.lngMin && lng <= a.lngMax) return a.zone
  }
  return null
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

/** Token aleatorio de 128 bits (32 caracteres hex) para la sesión
 *  en modo local. Usa crypto.getRandomValues cuando existe; si no,
 *  combina Math.random con la hora (peor, pero el modo local es
 *  solo demo). Nunca se usa el id del usuario como sesión. */
export function randomToken(): string {
  try {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) +
      Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}

/** SHA-256 puro en JavaScript, determinista en cualquier contexto.
 *  ANTES se usaba crypto.subtle, que SOLO existe en contextos seguros
 *  (https). Si la cuenta se creó donde subtle no estaba (o al revés),
 *  el hash caía en el fallback 'local-…' y al entrar después con el
 *  hash real ya no coincidía: "Correo o contraseña incorrectos" aunque
 *  la contraseña fuera la misma. Este hash es idéntico siempre, así
 *  que una cuenta creada en cualquier navegador entra en cualquier otro.
 *  Verificado contra hashlib de Python (vectores 'abc', '' y texto
 *  largo de varios bloques). */
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]
function rotr(x: number, n: number): number { return (x >>> n) | (x << (32 - n)) }
export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const bitLen = bytes.length * 8
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 4, bitLen >>> 0)
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000))
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const w = new Array<number>(64)
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + s1 + ch + SHA256_K[i] + w[i]) | 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (s0 + maj) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('')
}
