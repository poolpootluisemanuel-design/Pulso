// Capa de datos de PULSO.
// - Si hay VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY: usa Supabase (cuentas
//   reales, base de datos en la nube, datos compartidos entre teléfonos).
// - Si no hay credenciales: modo local de demostración. Los datos se guardan
//   en el propio teléfono (localStorage) y solo los ve ese teléfono. Sirve
//   para probar la app sin crear cuentas todavía. Al conectar Supabase, el
//   modo local ya no se usa: cada persona crea su cuenta real.
// Nunca se inventan credenciales aquí.
import { supabase, supabaseConfigured } from './supabase'
import type { AuthUser, Business, Challenge, Level, PlanTask, Post, Profile, Rsvp, SessionItem, SportLevel, TrainingPlan, Workout } from './types'
import { addDaysISO, sha256, uid } from './utils'

export const mode = supabaseConfigured ? 'supabase' : 'local'

const LS = 'pulso_local_'

interface LocalUser {
  id: string
  email: string
  name: string
  passwordHash: string
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown): void {
  localStorage.setItem(LS + key, JSON.stringify(value))
}

function seedLocal(): void {
  if (localStorage.getItem(LS + 'seeded')) return
  const ana: Profile = {
    id: 'demo-ana', name: 'Ana', email: 'ana@ejemplo.mx', zone: 'Cancún centro',
    bio: 'Corro por las mañanas, busco compañía para no fallar.', beginner: false,
    sports: [{ sport: 'Running', level: 'intermedio' }, { sport: 'Yoga', level: 'principiante' }],
    availability: ['martes', 'jueves', 'sábado'],
  }
  const carlos: Profile = {
    id: 'demo-carlos', name: 'Carlos', email: 'carlos@ejemplo.mx', zone: 'Zona Hotelera',
    bio: 'Pádel intermedio, juego entre semana en la tarde.', beginner: false,
    sports: [{ sport: 'Pádel', level: 'intermedio' }],
    availability: ['martes', 'jueves'],
  }
  save('profiles', [ana, carlos])
  save('sessions', [
    { id: 'demo-s1', title: 'Running matutino', sport: 'Running', level: 'todos', date: addDaysISO(2), time: '07:00', place: 'Malecón Tajamar', zone: 'Cancún centro', capacity: 8, host_id: 'demo-ana', host_name: 'Ana', notes: 'Ritmo suave, 5 km. Principiantes bienvenidos.' },
    { id: 'demo-s2', title: 'Pádel entre semana', sport: 'Pádel', level: 'intermedio', date: addDaysISO(4), time: '19:00', place: 'Cancha por confirmar', zone: 'Zona Hotelera', capacity: 4, host_id: 'demo-carlos', host_name: 'Carlos', notes: 'Llevar raqueta. Se arma reta.' },
  ] as SessionItem[])
  save('rsvps', [] as Rsvp[])
  save('workouts', [] as Workout[])
  save('challenges', [
    { id: 'demo-c1', title: 'Reto 7 días: entrena 3 veces', days: 7, target_count: 3, start_date: addDaysISO(0) },
    { id: 'demo-c2', title: 'Reto 30 días: 12 entrenamientos', days: 30, target_count: 12, start_date: addDaysISO(0) },
  ] as Challenge[])
  save('posts', [
    { id: 'demo-p1', profile_id: 'demo-ana', author_name: 'Ana', text: '¡Hola Cancún! ¿Quién se apunta a correr el martes en Tajamar?', created_at: new Date().toISOString() },
  ] as Post[])
  save('businesses', [
    { id: 'demo-b1', name: 'Cancha Pádel Cancún', kind: 'Cancha de pádel', zone: 'Cancún centro', description: 'Renta de canchas por hora y clases para principiantes.', phone: '' },
    { id: 'demo-b2', name: 'Gym Caribe Fit', kind: 'Gimnasio', zone: 'Zona Hotelera', description: 'Clases grupales, pesas y zona funcional frente al mar.', phone: '' },
  ] as Business[])
  save('users', [] as LocalUser[])
  localStorage.setItem(LS + 'seeded', '1')
}
if (!supabaseConfigured) seedLocal()

// ---------- Auth ----------
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase.auth.getUser()
    if (!data.user) return null
    const { data: prof } = await supabase.from('profiles').select('name').eq('id', data.user.id).maybeSingle()
    return { id: data.user.id, email: data.user.email || '', name: (prof?.name as string) || 'Sin nombre' }
  }
  const id = localStorage.getItem(LS + 'session')
  if (!id) return null
  const users = load<LocalUser[]>('users', [])
  const u = users.find((x) => x.id === id)
  return u ? { id: u.id, email: u.email, name: u.name } : null
}

export async function signUp(name: string, email: string, password: string): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase()
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail, password,
      options: { data: { name: name.trim() } },
    })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('No se pudo crear la cuenta. Revisa tu correo, puede pedir confirmación.')
    const profile: Profile = { id: data.user.id, name: name.trim(), email: cleanEmail, zone: 'Cancún centro', bio: '', beginner: true, sports: [], availability: [] }
    const { error: pErr } = await supabase.from('profiles').insert({ ...profile, sports: [] })
    if (pErr) throw new Error('Cuenta creada, pero no se guardó el perfil: ' + pErr.message)
    return { id: data.user.id, email: cleanEmail, name: name.trim() }
  }
  const users = load<LocalUser[]>('users', [])
  if (users.some((u) => u.email === cleanEmail)) throw new Error('Ese correo ya tiene cuenta. Entra con tu contraseña o usa recuperación.')
  const id = uid()
  users.push({ id, email: cleanEmail, name: name.trim(), passwordHash: await sha256(password) })
  save('users', users)
  const profile: Profile = { id, name: name.trim(), email: cleanEmail, zone: 'Cancún centro', bio: '', beginner: true, sports: [], availability: [] }
  const profiles = load<Profile[]>('profiles', [])
  profiles.push(profile)
  save('profiles', profiles)
  localStorage.setItem(LS + 'session', id)
  return { id, email: cleanEmail, name: name.trim() }
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase()
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    if (error) throw new Error('Correo o contraseña incorrectos.')
    if (!data.user) throw new Error('No se pudo entrar.')
    const { data: prof } = await supabase.from('profiles').select('name').eq('id', data.user.id).maybeSingle()
    return { id: data.user.id, email: cleanEmail, name: (prof?.name as string) || 'Sin nombre' }
  }
  const users = load<LocalUser[]>('users', [])
  const u = users.find((x) => x.email === cleanEmail)
  if (!u || (await sha256(password)) !== u.passwordHash) throw new Error('Correo o contraseña incorrectos.')
  localStorage.setItem(LS + 'session', u.id)
  return { id: u.id, email: u.email, name: u.name }
}

export async function resetPassword(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase()
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin + '/reset',
    })
    if (error) throw new Error(error.message)
    return
  }
  // Modo local: no hay correo que enviar. Se permite poner contraseña nueva
  // directamente (esto solo existe en modo local, nunca en Supabase).
  const users = load<LocalUser[]>('users', [])
  if (!users.some((u) => u.email === cleanEmail)) throw new Error('Ese correo no tiene cuenta en este teléfono.')
  localStorage.setItem(LS + 'reset-email', cleanEmail)
}

export async function setNewPasswordLocal(email: string, password: string): Promise<void> {
  if (supabaseConfigured) throw new Error('En modo Supabase la contraseña nueva llega por el link de tu correo.')
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
  const users = load<LocalUser[]>('users', [])
  const u = users.find((x) => x.email === email.trim().toLowerCase())
  if (!u) throw new Error('Ese correo no tiene cuenta.')
  u.passwordHash = await sha256(password)
  save('users', users)
  localStorage.setItem(LS + 'session', u.id)
  localStorage.removeItem(LS + 'reset-email')
}

export async function changePassword(current: string, next: string): Promise<void> {
  if (next.length < 6) throw new Error('La contraseña nueva debe tener al menos 6 caracteres.')
  const me = await getCurrentUser()
  if (!me) throw new Error('No hay sesión activa.')
  if (supabaseConfigured && supabase) {
    // Verificamos la actual entrando de nuevo; si falla, no cambiamos nada.
    const { error } = await supabase.auth.signInWithPassword({ email: me.email, password: current })
    if (error) throw new Error('Tu contraseña actual no coincide.')
    const { error: upErr } = await supabase.auth.updateUser({ password: next })
    if (upErr) throw new Error(upErr.message)
    return
  }
  const users = load<LocalUser[]>('users', [])
  const u = users.find((x) => x.id === me.id)
  if (!u || (await sha256(current)) !== u.passwordHash) throw new Error('Tu contraseña actual no coincide.')
  u.passwordHash = await sha256(next)
  save('users', users)
}

export async function signOut(): Promise<void> {
  if (supabaseConfigured && supabase) await supabase.auth.signOut()
  localStorage.removeItem(LS + 'session')
}

// ---------- Perfiles ----------
export async function getProfile(id: string): Promise<Profile | null> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    return rowToProfile(data)
  }
  return load<Profile[]>('profiles', []).find((p) => p.id === id) || null
}

export async function saveProfile(p: Profile): Promise<void> {
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from('profiles').upsert({
      id: p.id, name: p.name, email: p.email, zone: p.zone, bio: p.bio,
      beginner: p.beginner, sports: p.sports, availability: p.availability, photo_url: p.photo_url || null,
    })
    if (error) throw new Error(error.message)
    // Espejo en profile_sports para consultas por deporte (si la tabla existe).
    await supabase.from('profile_sports').delete().eq('profile_id', p.id)
    if (p.sports.length) {
      await supabase.from('profile_sports').insert(p.sports.map((s) => ({ profile_id: p.id, sport: s.sport, level: s.level })))
    }
    return
  }
  const profiles = load<Profile[]>('profiles', [])
  const i = profiles.findIndex((x) => x.id === p.id)
  if (i >= 0) profiles[i] = p
  else profiles.push(p)
  save('profiles', profiles)
}

export async function listProfiles(): Promise<Profile[]> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.from('profiles').select('*').order('name')
    if (error) throw new Error(error.message)
    return (data || []).map(rowToProfile)
  }
  return load<Profile[]>('profiles', [])
}

function rowToProfile(r: Record<string, unknown>): Profile {
  return {
    id: String(r.id), name: String(r.name || ''), email: String(r.email || ''),
    zone: String(r.zone || ''), bio: String(r.bio || ''), beginner: Boolean(r.beginner),
    sports: (r.sports as SportLevel[]) || [], availability: (r.availability as string[]) || [],
    photo_url: (r.photo_url as string) || undefined,
  }
}

// ---------- Sesiones ----------
export async function listSessions(): Promise<SessionItem[]> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.from('sessions').select('*').order('date').order('time')
    if (error) throw new Error(error.message)
    return (data || []).map((r) => ({ ...r, level: r.level as Level | 'todos' }) as SessionItem)
  }
  return load<SessionItem[]>('sessions', []).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

export async function createSession(s: Omit<SessionItem, 'id'>): Promise<SessionItem> {
  const item: SessionItem = { ...s, id: uid() }
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from('sessions').insert(item)
    if (error) throw new Error(error.message)
    return item
  }
  const list = load<SessionItem[]>('sessions', [])
  list.push(item)
  save('sessions', list)
  return item
}

export async function listRsvps(sessionId: string): Promise<Rsvp[]> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase.from('rsvps').select('*').eq('session_id', sessionId)
    return (data || []) as Rsvp[]
  }
  return load<Rsvp[]>('rsvps', []).filter((r) => r.session_id === sessionId)
}

export async function joinSession(session: SessionItem, profileId: string): Promise<'confirmed' | 'waitlist'> {
  const rsvps = await listRsvps(session.id)
  if (rsvps.some((r) => r.profile_id === profileId)) throw new Error('Ya estás apuntado en esta sesión.')
  const confirmed = rsvps.filter((r) => r.status === 'confirmed').length
  const status: 'confirmed' | 'waitlist' = confirmed < session.capacity ? 'confirmed' : 'waitlist'
  const rsvp: Rsvp = { id: uid(), session_id: session.id, profile_id: profileId, status }
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from('rsvps').insert(rsvp)
    if (error) throw new Error(error.message)
    return status
  }
  const all = load<Rsvp[]>('rsvps', [])
  all.push(rsvp)
  save('rsvps', all)
  return status
}

export async function cancelRsvp(sessionId: string, profileId: string): Promise<void> {
  if (supabaseConfigured && supabase) {
    await supabase.from('rsvps').delete().eq('session_id', sessionId).eq('profile_id', profileId)
    // Promover al primero en lista de espera.
    const { data } = await supabase.from('rsvps').select('*').eq('session_id', sessionId).eq('status', 'waitlist').order('created_at').limit(1)
    if (data && data[0]) await supabase.from('rsvps').update({ status: 'confirmed' }).eq('id', data[0].id)
    return
  }
  const all = load<Rsvp[]>('rsvps', [])
  const rest = all.filter((r) => !(r.session_id === sessionId && r.profile_id === profileId))
  const firstWait = rest.find((r) => r.session_id === sessionId && r.status === 'waitlist')
  if (firstWait) firstWait.status = 'confirmed'
  save('rsvps', rest)
}

// ---------- Entrenamientos ----------
export async function listWorkouts(profileId: string): Promise<Workout[]> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.from('workouts').select('*').eq('profile_id', profileId).order('date', { ascending: false })
    if (error) throw new Error(error.message)
    return (data || []) as Workout[]
  }
  return load<Workout[]>('workouts', [])
    .filter((w) => w.profile_id === profileId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export async function logWorkout(w: Omit<Workout, 'id'>): Promise<Workout> {
  const item: Workout = { ...w, id: uid() }
  if (supabaseConfigured && supabase) {
    const { route, ...rest } = item
    const { error } = await supabase.from('workouts').insert({ ...rest, route: route || null })
    if (error) throw new Error(error.message)
    return item
  }
  const list = load<Workout[]>('workouts', [])
  list.push(item)
  save('workouts', list)
  return item
}

export async function deleteWorkout(id: string): Promise<void> {
  if (supabaseConfigured && supabase) {
    await supabase.from('workouts').delete().eq('id', id)
    return
  }
  save('workouts', load<Workout[]>('workouts', []).filter((w) => w.id !== id))
}

// ---------- Retos, comunidad y negocios (estructura básica) ----------
export async function listChallenges(): Promise<Challenge[]> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.from('challenges').select('*').order('start_date', { ascending: false })
    if (error) throw new Error(error.message)
    return (data || []) as Challenge[]
  }
  return load<Challenge[]>('challenges', [])
}

export async function listPosts(): Promise<Post[]> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data || []) as Post[]
  }
  return load<Post[]>('posts', []).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function createPost(profileId: string, authorName: string, text: string): Promise<Post> {
  const post: Post = { id: uid(), profile_id: profileId, author_name: authorName, text: text.trim(), created_at: new Date().toISOString() }
  if (!post.text) throw new Error('Escribe algo para publicar.')
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from('posts').insert(post)
    if (error) throw new Error(error.message)
    return post
  }
  const list = load<Post[]>('posts', [])
  list.unshift(post)
  save('posts', list)
  return post
}

export async function listBusinesses(): Promise<Business[]> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.from('businesses').select('*').order('name')
    if (error) throw new Error(error.message)
    return (data || []) as Business[]
  }
  return load<Business[]>('businesses', [])
}

// ---------- Planes del entrenador IA ----------
// El plan activo es el último guardado de cada perfil. En Supabase va
// a la tabla training_plans; en modo local, a localStorage.
export async function getPlan(profileId: string): Promise<TrainingPlan | null> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.from('training_plans')
      .select('*').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) return null
    return rowToPlan(data)
  }
  const plans = load<TrainingPlan[]>('plans', []).filter((p) => p.profile_id === profileId)
  return plans.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null
}

export async function savePlan(plan: TrainingPlan): Promise<TrainingPlan> {
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from('training_plans').insert({
      id: plan.id, profile_id: plan.profile_id, sport: plan.sport, level: plan.level,
      goal: plan.goal, days_per_week: plan.days_per_week, minutes_per_session: plan.minutes_per_session,
      adjustment: plan.adjustment, week_goal_km: plan.week_goal_km || null,
      tasks: plan.tasks,
    })
    if (error) throw new Error(error.message)
    return plan
  }
  const plans = load<TrainingPlan[]>('plans', [])
  plans.push(plan)
  save('plans', plans)
  return plan
}

export async function togglePlanTask(profileId: string, planId: string, taskId: string): Promise<TrainingPlan | null> {
  const plan = await getPlan(profileId)
  if (!plan || plan.id !== planId) return null
  const tasks: PlanTask[] = plan.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t))
  const updated = { ...plan, tasks }
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from('training_plans').update({ tasks }).eq('id', planId)
    if (error) throw new Error(error.message)
    return updated
  }
  const plans = load<TrainingPlan[]>('plans', [])
  const i = plans.findIndex((p) => p.id === planId)
  if (i >= 0) { plans[i] = updated; save('plans', plans) }
  return updated
}

export async function deletePlan(_profileId: string, planId: string): Promise<void> {
  if (supabaseConfigured && supabase) {
    await supabase.from('training_plans').delete().eq('id', planId)
    return
  }
  save('plans', load<TrainingPlan[]>('plans', []).filter((p) => p.id !== planId))
}

function rowToPlan(r: Record<string, unknown>): TrainingPlan {
  return {
    id: String(r.id), profile_id: String(r.profile_id), sport: String(r.sport),
    level: (r.level as Level) || 'principiante', goal: (r.goal as TrainingPlan['goal']) || 'constancia',
    days_per_week: Number(r.days_per_week) || 3, minutes_per_session: Number(r.minutes_per_session) || 30,
    week_goal_min: ((r.tasks as PlanTask[]) || []).reduce((s, t) => s + (t.duration_min || 0), 0),
    week_goal_km: (r.week_goal_km as number) || undefined,
    adjustment: String(r.adjustment || ''),
    tasks: (r.tasks as PlanTask[]) || [],
    created_at: String(r.created_at || new Date().toISOString()),
  }
}

// ---------- Música (preferencia del teléfono) ----------
// La playlist elegida es una preferencia de cada teléfono, no un dato
// de la cuenta: se guarda en localStorage, también en modo Supabase.
export interface MusicPref { presetId: string; customUrl: string; customLabel: string }
export function getMusicPref(profileId: string): MusicPref {
  try {
    const raw = localStorage.getItem(LS + 'music_' + profileId)
    if (raw) return JSON.parse(raw) as MusicPref
  } catch { /* usa el valor por defecto */ }
  return { presetId: 'general', customUrl: '', customLabel: '' }
}
export function saveMusicPref(profileId: string, pref: MusicPref): void {
  localStorage.setItem(LS + 'music_' + profileId, JSON.stringify(pref))
}
