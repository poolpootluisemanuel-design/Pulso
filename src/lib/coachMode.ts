// ============================================================
// Modo coach de PULSO (NO es el entrenador IA).
//
// - Entrenador IA = src/lib/coach.ts: genera planes semanales
//   automáticos por deporte, nivel y meta. No se toca aquí.
// - Modo coach = esto: una persona real marca que es coach, ve
//   sus clases/sesiones, sus alumnos confirmados y estadísticas
//   simples, y crea clases desde su panel. Sin pagos.
//
// Persistencia (dos niveles, el local siempre funciona):
// 1. localStorage, clave `pulso_coach_<profileId>`: funciona en
//    modo local y en Supabase, también sin internet. Es la fuente
//    que lee isCoach() cuando el perfil aún no trae los campos.
// 2. Supabase, tabla profiles: columnas is_coach,
//    coach_specialty y coach_experience. Solo existen si se corre
//    supabase/migration_coach_mode.sql en el SQL Editor (archivo
//    aparte; NO se aplica desde este código ni se toca schema.sql).
//    Si la migración no está corrida, el update a Supabase falla
//    por columna inexistente y se ignora sin romper nada: el modo
//    coach sigue funcionando con localStorage en ese teléfono.
//    Cuando la migración sí está corrida, el flag viaja con la
//    cuenta y se ve en cualquier teléfono.
// ============================================================
import { supabase, supabaseConfigured } from './supabase'
import { getProfile, listProfiles, listRsvps, listSessions } from './store'
import type { Profile, SessionItem } from './types'
import { todayISO } from './utils'

/** Campos de coach en la tabla profiles (tras la migración).
 *  Son opcionales en Profile hasta que el cableado los añada a
 *  src/lib/types.ts — ver el reporte de entrega. */
export interface CoachProfileFields {
  is_coach?: boolean
  coach_specialty?: string
  coach_experience?: string
}

/** Un perfil con los campos de coach, si ya los trae. */
export type ProfileWithCoach = Profile & CoachProfileFields

export interface CoachProfile {
  profileId: string
  isCoach: boolean
  /** Especialidad, texto libre. Ej. "Pádel intermedio", "Running". */
  specialty: string
  /** Experiencia, texto libre. Ej. "5 años dando clases". */
  experience: string
}

export interface CoachStudent {
  profileId: string
  name: string
  /** Sesiones del coach a las que va confirmado (títulos). */
  sessionTitles: string[]
  sessionsCount: number
}

export interface CoachStats {
  /** Nº total de sesiones creadas por el coach (pasadas y futuras). */
  totalSessions: number
  /** Total de asistentes confirmados sumando todas sus sesiones. */
  totalConfirmedAttendees: number
  /** Sesiones con fecha de hoy en adelante. */
  upcomingSessions: number
}

function key(profileId: string): string {
  return `pulso_coach_${profileId}`
}

function readLocal(profileId: string): CoachProfile | null {
  try {
    const raw = localStorage.getItem(key(profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CoachProfile>
    return {
      profileId,
      isCoach: parsed.isCoach === true,
      specialty: typeof parsed.specialty === 'string' ? parsed.specialty : '',
      experience: typeof parsed.experience === 'string' ? parsed.experience : '',
    }
  } catch {
    return null
  }
}

function writeLocal(coach: CoachProfile): void {
  try {
    localStorage.setItem(key(coach.profileId), JSON.stringify(coach))
  } catch {
    // Sin espacio en localStorage: el modo coach no se guarda en
    // este teléfono, pero no se rompe la app.
  }
}

/** Lee el modo coach de un perfil: primero localStorage y, si el
 *  perfil ya trae los campos de Supabase, esos mandan cuando el
 *  local no dice nada. Nunca lanza. */
export function getCoachProfile(profile: Profile | ProfileWithCoach): CoachProfile {
  const local = readLocal(profile.id)
  if (local) return local
  const p = profile as ProfileWithCoach
  return {
    profileId: profile.id,
    isCoach: p.is_coach === true,
    specialty: p.coach_specialty || '',
    experience: p.coach_experience || '',
  }
}

/** ¿Este perfil tiene el modo coach activado? Lee localStorage y,
 *  si el perfil ya trae is_coach de Supabase, también ese campo. */
export function isCoach(profile: Profile | ProfileWithCoach | null | undefined): boolean {
  if (!profile) return false
  return getCoachProfile(profile).isCoach
}

/** Activa o desactiva el modo coach de un perfil.
 *  - Guarda siempre en localStorage (funciona sin internet y sin
 *    migración).
 *  - Si hay Supabase, intenta guardar también en profiles
 *    (is_coach / coach_specialty / coach_experience). Si la
 *    migración no está corrida, Supabase rechaza el update por
 *    columna inexistente: se ignora el error y queda solo lo
 *    local, sin lanzar.
 *  - Al desactivar se guardan specialty/experience vacías.
 *  Devuelve el CoachProfile resultante. */
export async function setCoachMode(
  profileId: string,
  on: boolean,
  specialty = '',
  experience = '',
): Promise<CoachProfile> {
  const coach: CoachProfile = {
    profileId,
    isCoach: on,
    specialty: on ? specialty.trim() : '',
    experience: on ? experience.trim() : '',
  }
  writeLocal(coach)
  if (supabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_coach: coach.isCoach,
          coach_specialty: coach.specialty || null,
          coach_experience: coach.experience || null,
        })
        .eq('id', profileId)
      if (error) {
        // Columna inexistente = migración sin correr: queda lo
        // local. Cualquier otro error tampoco rompe el flujo.
        console.warn('Modo coach: no se pudo guardar en Supabase (queda en local):', error.message)
      }
    } catch (e) {
      console.warn('Modo coach: no se pudo guardar en Supabase (queda en local):', e instanceof Error ? e.message : String(e))
    }
  }
  return coach
}

/** Sesiones creadas por el coach (host_id = coachId), ordenadas
 *  por fecha y hora. */
export async function listCoachSessions(coachId: string): Promise<SessionItem[]> {
  const all = await listSessions()
  return all
    .filter((s) => s.host_id === coachId)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/** Alumnos del coach: participantes con RSVP 'confirmed' en sus
 *  sesiones, deduplicados por profile_id, con su nombre y las
 *  sesiones a las que van. El nombre se resuelve con listProfiles();
 *  si el perfil no aparece (o no se pudo leer), queda 'Sin nombre'. */
export async function listCoachStudents(coachId: string): Promise<CoachStudent[]> {
  const sessions = await listCoachSessions(coachId)
  if (sessions.length === 0) return []
  const titleById = new Map(sessions.map((s) => [s.id, s.title]))
  const sessionIdsByProfile = new Map<string, string[]>()
  for (const s of sessions) {
    const rsvps = await listRsvps(s.id)
    for (const r of rsvps) {
      if (r.status !== 'confirmed') continue
      const list = sessionIdsByProfile.get(r.profile_id) || []
      if (!list.includes(s.id)) list.push(s.id)
      sessionIdsByProfile.set(r.profile_id, list)
    }
  }
  if (sessionIdsByProfile.size === 0) return []
  let nameById = new Map<string, string>()
  try {
    const profiles = await listProfiles()
    nameById = new Map(profiles.map((p) => [p.id, p.name]))
  } catch {
    // Sin lista de perfiles: los nombres quedan como 'Sin nombre'
    // y se sigue mostrando a quién va a cada sesión por su id.
    try {
      const me = await getProfile(coachId)
      if (me) nameById.set(me.id, me.name)
    } catch {
      // noop
    }
  }
  return [...sessionIdsByProfile.entries()]
    .map(([profileId, sessionIds]) => ({
      profileId,
      name: nameById.get(profileId) || 'Sin nombre',
      sessionTitles: sessionIds.map((id) => titleById.get(id) || 'Sesión'),
      sessionsCount: sessionIds.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es-MX'))
}

/** Estadísticas simples del coach: nº de sesiones, total de
 *  asistentes confirmados (sumando todas sus sesiones) y nº de
 *  sesiones próximas (fecha de hoy en adelante). */
export async function coachStats(coachId: string): Promise<CoachStats> {
  const sessions = await listCoachSessions(coachId)
  const today = todayISO()
  let totalConfirmedAttendees = 0
  for (const s of sessions) {
    const rsvps = await listRsvps(s.id)
    totalConfirmedAttendees += rsvps.filter((r) => r.status === 'confirmed').length
  }
  return {
    totalSessions: sessions.length,
    totalConfirmedAttendees,
    upcomingSessions: sessions.filter((s) => s.date >= today).length,
  }
}
