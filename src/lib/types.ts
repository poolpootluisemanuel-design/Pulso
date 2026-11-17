export type Level = 'principiante' | 'intermedio' | 'avanzado'

export interface SportLevel {
  sport: string
  level: Level
}

export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface Profile {
  id: string
  name: string
  email: string
  zone: string
  bio: string
  beginner: boolean
  sports: SportLevel[]
  availability: string[]
  photo_url?: string
  /** Permiso de admin en la base de datos (columna is_admin).
   *  El dueño también es admin por su correo (ver OWNER_EMAIL en
   *  store.ts), aunque is_admin sea false. */
  is_admin?: boolean
  /** Cuenta bloqueada por el admin: puede entrar y ver la app, pero
   *  no puede crear sesiones, publicar ni apuntarse a sesiones. */
  is_blocked?: boolean
}

export interface SessionItem {
  id: string
  title: string
  sport: string
  level: Level | 'todos'
  date: string // YYYY-MM-DD
  time: string // HH:MM
  place: string
  zone: string
  capacity: number
  host_id: string
  host_name: string
  notes?: string
  /** Coordenadas opcionales del lugar (para el mapa de sesiones).
   *  Las sesiones viejas no las tienen y solo salen en la lista. */
  lat?: number
  lng?: number
}

export interface Rsvp {
  id: string
  session_id: string
  profile_id: string
  status: 'confirmed' | 'waitlist'
}

export interface Workout {
  id: string
  profile_id: string
  sport: string
  date: string // YYYY-MM-DD
  duration_min: number
  distance_km?: number
  notes?: string
  route?: { lat: number; lng: number }[]
}

export interface Challenge {
  id: string
  title: string
  days: 7 | 30
  target_count: number
  target_km?: number
  start_date: string
}

export type CoachGoal = 'resistencia' | 'fuerza' | 'tecnica' | 'constancia' | 'bajar_peso'

export const COACH_GOALS: { id: CoachGoal; label: string }[] = [
  { id: 'resistencia', label: 'Más resistencia' },
  { id: 'fuerza', label: 'Ganar fuerza' },
  { id: 'tecnica', label: 'Mejorar mi técnica' },
  { id: 'constancia', label: 'Ser constante / agarrar el hábito' },
  { id: 'bajar_peso', label: 'Bajar de peso' },
]

export interface PlanTask {
  id: string
  day: string
  date: string // YYYY-MM-DD
  title: string
  detail: string
  duration_min: number
  distance_km?: number
  done: boolean
}

export interface TrainingPlan {
  id: string
  profile_id: string
  sport: string
  level: Level
  goal: CoachGoal
  days_per_week: number
  minutes_per_session: number
  week_goal_min: number
  week_goal_km?: number
  adjustment: string
  tasks: PlanTask[]
  created_at: string
}

export interface Post {
  id: string
  profile_id: string
  author_name: string
  text: string
  created_at: string
}

export interface Business {
  id: string
  name: string
  kind: string
  zone: string
  description: string
  phone?: string
}

export const SPORTS = [
  'Pádel',
  'Running',
  'Ciclismo',
  'CrossFit',
  'Gym',
  'Yoga',
  'Natación',
  'Surf',
  'Caminata',
] as const

export const ZONES = ['Cancún centro', 'Zona Hotelera', 'Puerto Cancún', 'Isla Mujeres', 'Puerto Morelos', 'Playa del Carmen', 'Tulum', 'Cozumel', 'Riviera Maya'] as const

export const LEVELS: Level[] = ['principiante', 'intermedio', 'avanzado']
export const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
