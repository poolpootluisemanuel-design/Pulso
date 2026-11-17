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
import { addDaysISO, legacyLocalHash, sha256, uid } from './utils'

export const mode = supabaseConfigured ? 'supabase' : 'local'

// ---------- Administración ----------
// El dueño de la app es admin: por su correo (aunque is_admin sea
// false en la base) o por la columna is_admin del perfil. El correo
// del dueño NUNCA se muestra en la app: solo se compara aquí.
export const OWNER_EMAIL = 'pool.poot.luis.emanuel@gmail.com'
export function isAdminUser(user: AuthUser | null, profile: Profile | null): boolean {
  if (!user) return false
  if (user.email.trim().toLowerCase() === OWNER_EMAIL) return true
  return profile?.is_admin === true
}

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

// ---------- Modo offline ----------
// Sin internet la app NO debe quedarse en blanco ni en "Cargando" para
// siempre. Estrategia:
// - Cada lectura de Supabase tiene timeout de 5 s: si no responde, se
//   usa la copia guardada en el teléfono (espejo local).
// - Cada escritura que falla por falta de red se guarda en el teléfono
//   y se encola en `outbox` para subirla a Supabase cuando vuelva
//   internet (con el mismo id, así no se duplica).
// - YouTube sin internet no suena (eso no tiene arreglo); la música
//   local del teléfono sí, y el GPS tampoco necesita internet.
function withTimeout<T>(p: PromiseLike<T>, ms = 5000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}
function isNetworkError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return (
    m.includes('timeout') || m.includes('failed to fetch') || m.includes('networkerror') ||
    m.includes('network request failed') || m.includes('load failed') || m.includes('offline')
  )
}
function cacheSet(key: string, value: unknown): void {
  try { localStorage.setItem(LS + 'cache_' + key, JSON.stringify(value)) } catch { /* sin espacio: se sigue sin espejo */ }
}
function cacheGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS + 'cache_' + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}

export interface OutboxOp { kind: 'workout' | 'session' | 'post' | 'rsvp' | 'profile' | 'plan' | 'delete-workout'; item?: unknown; id?: string }
function loadOutbox(): OutboxOp[] {
  try { return JSON.parse(localStorage.getItem(LS + 'outbox') || '[]') as OutboxOp[] } catch { return [] }
}
function saveOutbox(ops: OutboxOp[]): void {
  try { localStorage.setItem(LS + 'outbox', JSON.stringify(ops)) } catch { /* noop */ }
}
export function pendingSyncCount(): number { return loadOutbox().length }
function queueOffline(op: OutboxOp): void {
  const ops = loadOutbox()
  // Sin duplicar: si ya hay una operación con el mismo id, se reemplaza.
  const key = (op.item as { id?: string } | undefined)?.id || op.id
  const filtered = key ? ops.filter((o) => ((o.item as { id?: string } | undefined)?.id || o.id) !== key) : ops
  filtered.push(op)
  saveOutbox(filtered)
}

// Sube a Supabase lo que se hizo sin internet. Se llama al volver la
// red y después de cada carga exitosa. Devuelve cuántos quedaron por subir.
export async function syncOutbox(): Promise<number> {
  if (!supabaseConfigured || !supabase) return 0
  if (!navigator.onLine) return loadOutbox().length
  const ops = loadOutbox()
  if (!ops.length) return 0
  const remaining: OutboxOp[] = []
  for (const op of ops) {
    try {
      if (op.kind === 'workout' && op.item) {
        const item = op.item as Workout
        const { route, ...rest } = item
        const { error } = await supabase.from('workouts').upsert({ ...rest, route: route || null }, { onConflict: 'id' })
        if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error
      } else if (op.kind === 'session' && op.item) {
        const s = op.item as SessionItem
        const { error } = await supabase.from('sessions').upsert(s, { onConflict: 'id' })
        if (error && /lat|lng|column/i.test(error.message)) {
          // La base aún no tiene las columnas lat/lng (falta correr el
          // schema nuevo): se sube sin coordenadas, sin perder la sesión.
          const { lat: _lat, lng: _lng, ...rest } = s
          const { error: e2 } = await supabase.from('sessions').upsert(rest, { onConflict: 'id' })
          if (e2 && !/duplicate|unique|conflict/i.test(e2.message)) throw e2
        } else if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error
      } else if (op.kind === 'post' && op.item) {
        const { error } = await supabase.from('posts').upsert(op.item as Post, { onConflict: 'id' })
        if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error
      } else if (op.kind === 'rsvp' && op.item) {
        const { error } = await supabase.from('rsvps').upsert(op.item as Rsvp, { onConflict: 'id' })
        if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error
      } else if (op.kind === 'profile' && op.item) {
        const p = op.item as Profile
        const { error } = await supabase.from('profiles').upsert({
          id: p.id, name: p.name, email: p.email, zone: p.zone, bio: p.bio,
          beginner: p.beginner, sports: p.sports, availability: p.availability, photo_url: p.photo_url || null,
          ...(p.is_admin !== undefined ? { is_admin: p.is_admin } : {}),
        }, { onConflict: 'id' })
        if (error) throw error
      } else if (op.kind === 'plan' && op.item) {
        const pl = op.item as TrainingPlan
        const { error } = await supabase.from('training_plans').upsert({
          id: pl.id, profile_id: pl.profile_id, sport: pl.sport, level: pl.level, goal: pl.goal,
          days_per_week: pl.days_per_week, minutes_per_session: pl.minutes_per_session,
          adjustment: pl.adjustment, week_goal_km: pl.week_goal_km || null, tasks: pl.tasks,
        }, { onConflict: 'id' })
        if (error) throw error
      } else if (op.kind === 'delete-workout' && op.id) {
        await supabase.from('workouts').delete().eq('id', op.id)
      }
    } catch {
      // Sigue sin red o error real: se queda en la cola para el próximo intento.
      remaining.push(op)
    }
  }
  saveOutbox(remaining)
  return remaining.length
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
    { id: 'demo-s1', title: 'Running matutino', sport: 'Running', level: 'todos', date: addDaysISO(2), time: '07:00', place: 'Malecón Tajamar', zone: 'Cancún centro', capacity: 8, host_id: 'demo-ana', host_name: 'Ana', notes: 'Ritmo suave, 5 km. Principiantes bienvenidos.', lat: 21.1486, lng: -86.8533 },
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
// La sesión se guarda en localStorage Y en una cookie (mismo id): si el
// navegador pierde una de las dos al cerrar la pestaña, la otra rescata
// la sesión. La cookie no lleva la contraseña, solo el id de sesión.
function setSession(id: string): void {
  localStorage.setItem(LS + 'session', id)
  try { document.cookie = `${LS}session=${id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax` } catch { /* noop */ }
}
function clearSession(): void {
  localStorage.removeItem(LS + 'session')
  try { document.cookie = `${LS}session=; path=/; max-age=0; SameSite=Lax` } catch { /* noop */ }
}
function getSessionId(): string | null {
  const ls = localStorage.getItem(LS + 'session')
  if (ls) return ls
  const m = document.cookie.match(new RegExp('(?:^|; )' + LS + 'session=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (supabaseConfigured && supabase) {
    // getSession() lee la sesión guardada en el teléfono (sin red):
    // getUser() va a la red y sin internet se quedaba colgado. Con la
    // sesión local se entra offline; el perfil se saca del espejo local
    // si Supabase no responde en 5 s.
    let sessionUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null
    try {
      const { data } = await withTimeout(supabase.auth.getSession())
      sessionUser = data.session?.user ?? null
    } catch { sessionUser = null }
    if (!sessionUser) return null
    const cached = cacheGet<Profile | null>('profile_' + sessionUser.id, null)
    try {
      const { data: prof } = await withTimeout(
        supabase.from('profiles').select('name').eq('id', sessionUser.id).maybeSingle()
      )
      if (!prof) {
        await ensureSupabaseProfile(sessionUser.id, sessionUser.email || '', (sessionUser.user_metadata?.name as string) || '')
      } else {
        cacheSet('profile_' + sessionUser.id, { id: sessionUser.id, name: prof.name as string, email: sessionUser.email || '' })
      }
      const name = (prof?.name as string) || (sessionUser.user_metadata?.name as string) || cached?.name || 'Sin nombre'
      return { id: sessionUser.id, email: sessionUser.email || '', name }
    } catch {
      // Sin internet: entra con la sesión y el perfil guardados.
      return { id: sessionUser.id, email: sessionUser.email || '', name: cached?.name || (sessionUser.user_metadata?.name as string) || 'Sin nombre' }
    }
  }
  const id = getSessionId()
  if (!id) return null
  const users = load<LocalUser[]>('users', [])
  const u = users.find((x) => x.id === id)
  return u ? { id: u.id, email: u.email, name: u.name } : null
}

// Crea la fila en profiles si falta (repara cuentas de Auth creadas
// antes del arreglo de RLS). Solo se llama con sesión activa, así que
// auth.uid() = id y la política RLS lo permite. Nunca lanza: si falla,
// el usuario entra igual y se reintenta en el siguiente inicio.
async function ensureSupabaseProfile(userId: string, email: string, name: string): Promise<void> {
  if (!supabaseConfigured || !supabase) return
  try {
    const cleanName = name.trim() || email.split('@')[0] || 'Sin nombre'
    const { error } = await supabase.from('profiles').upsert({
      id: userId, name: cleanName, email: email.trim().toLowerCase(),
      zone: 'Cancún centro', bio: '', beginner: true, sports: [], availability: [],
    }, { onConflict: 'id' })
    if (error) console.warn('No se pudo crear el perfil en Supabase:', error.message)
  } catch { /* entra igual, se reintenta luego */ }
}

export async function signUp(name: string, email: string, password: string): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase()
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail, password,
      // El link de confirmación debe volver a ESTA app, no al default
      // de Supabase (http://localhost:3000, que no existe en el
      // teléfono y daba error al confirmar el correo).
      options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin },
    })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('No se pudo crear la cuenta. Revisa tu correo, puede pedir confirmación.')
    // Si Supabase tiene la confirmación de correo activada, signUp no
    // devuelve sesión: sin sesión, auth.uid() es null y el insert del
    // perfil lo rechaza RLS. Se entra con la misma contraseña para
    // obtener la sesión antes de insertar el perfil.
    let session = data.session
    if (!session) {
      const { data: siData, error: siErr } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      if (siErr || !siData.session) {
        const msg = (siErr?.message || '').toLowerCase()
        if (msg.includes('email not confirmed') || msg.includes('not confirmed') || msg.includes('confirm')) {
          throw new Error('Revisa tu correo para confirmar la cuenta y luego entra. La cuenta se creó, solo falta confirmarla.')
        }
        throw new Error('Cuenta creada. Revisa tu correo para confirmar la cuenta y luego entra.')
      }
      session = siData.session
    }
    void session
    const profile: Profile = { id: data.user.id, name: name.trim(), email: cleanEmail, zone: 'Cancún centro', bio: '', beginner: true, sports: [], availability: [] }
    const { error: pErr } = await supabase.from('profiles').insert({ ...profile, sports: [] })
    if (pErr) {
      // El perfil no quedó guardado, pero la cuenta de Auth sí existe:
      // se intenta crearlo de nuevo con la sesión ya activa, y si
      // aun así falla, al entrar se repara solo. No se deja al usuario
      // con un error críptico de RLS.
      if (pErr.message.toLowerCase().includes('row-level security')) {
        await ensureSupabaseProfile(data.user.id, cleanEmail, name.trim())
        return { id: data.user.id, email: cleanEmail, name: name.trim() }
      }
      throw new Error('Cuenta creada, pero no se guardó el perfil: ' + pErr.message)
    }
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
  setSession(id)
  return { id, email: cleanEmail, name: name.trim() }
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase()
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    if (error) throw new Error('Correo o contraseña incorrectos.')
    if (!data.user) throw new Error('No se pudo entrar.')
    const { data: prof } = await supabase.from('profiles').select('name').eq('id', data.user.id).maybeSingle()
    if (!prof) {
      // Cuenta de Auth existe pero sin fila en profiles: se crea sola.
      await ensureSupabaseProfile(data.user.id, cleanEmail, (data.user.user_metadata?.name as string) || '')
    }
    const name = (prof?.name as string) || (data.user.user_metadata?.name as string) || 'Sin nombre'
    return { id: data.user.id, email: cleanEmail, name }
  }
  const users = load<LocalUser[]>('users', [])
  const u = users.find((x) => x.email === cleanEmail)
  // Acepta el hash SHA-256 actual y, para cuentas creadas antes del
  // arreglo, el hash viejo 'local-…': si entra con el viejo, se le
  // actualiza el hash al nuevo para que no vuelva a fallar.
  const newHash = await sha256(password)
  const ok = !!u && (u.passwordHash === newHash || u.passwordHash === legacyLocalHash(password))
  if (!ok || !u) throw new Error('Correo o contraseña incorrectos.')
  if (u.passwordHash !== newHash) {
    u.passwordHash = newHash
    save('users', users)
  }
  setSession(u.id)
  return { id: u.id, email: u.email, name: u.name }
}

export async function resetPassword(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase()
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      // Volver al origen real de la app. Antes era origin + '/reset',
      // pero la app no tiene ruta /reset (daría 404 en Vercel): al
      // volver al origen, Supabase detecta la sesión de recuperación
      // en el link y la app abre ya con la sesión, para cambiar la
      // contraseña desde el perfil.
      redirectTo: window.location.origin,
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
  setSession(u.id)
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
  const currentHash = await sha256(current)
  if (!u || (u.passwordHash !== currentHash && u.passwordHash !== legacyLocalHash(current))) throw new Error('Tu contraseña actual no coincide.')
  u.passwordHash = await sha256(next)
  save('users', users)
}

export async function signOut(): Promise<void> {
  if (supabaseConfigured && supabase) await supabase.auth.signOut()
  clearSession()
}

// ---------- Perfiles ----------
export async function getProfile(id: string): Promise<Profile | null> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', id).maybeSingle()
      )
      if (error || !data) return cacheGet<Profile | null>('profile_' + id, null)
      const prof = rowToProfile(data)
      cacheSet('profile_' + id, prof)
      return prof
    } catch {
      return cacheGet<Profile | null>('profile_' + id, null)
    }
  }
  return load<Profile[]>('profiles', []).find((p) => p.id === id) || null
}

export async function saveProfile(p: Profile): Promise<void> {
  if (supabaseConfigured && supabase) {
    try {
      const { error } = await withTimeout(supabase.from('profiles').upsert({
        id: p.id, name: p.name, email: p.email, zone: p.zone, bio: p.bio,
        beginner: p.beginner, sports: p.sports, availability: p.availability, photo_url: p.photo_url || null,
        // Solo se escribe is_admin si viene definido: si no, un perfil
        // guardado normal borraría el permiso de admin en la base.
        ...(p.is_admin !== undefined ? { is_admin: p.is_admin } : {}),
      }))
      if (error) throw new Error(error.message)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      // Sin internet: se guarda en el teléfono y se sube luego.
      cacheSet('profile_' + p.id, p)
      queueOffline({ kind: 'profile', item: p })
      return
    }
    cacheSet('profile_' + p.id, p)
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
    try {
      const { data, error } = await withTimeout(supabase.from('profiles').select('*').order('name'))
      if (error) throw new Error(error.message)
      const list = (data || []).map(rowToProfile)
      cacheSet('profiles', list)
      return list
    } catch (e) {
      if (isNetworkError(e)) return cacheGet<Profile[]>('profiles', load<Profile[]>('profiles', []))
      throw e
    }
  }
  return load<Profile[]>('profiles', [])
}

function rowToProfile(r: Record<string, unknown>): Profile {
  return {
    id: String(r.id), name: String(r.name || ''), email: String(r.email || ''),
    zone: String(r.zone || ''), bio: String(r.bio || ''), beginner: Boolean(r.beginner),
    sports: (r.sports as SportLevel[]) || [], availability: (r.availability as string[]) || [],
    photo_url: (r.photo_url as string) || undefined,
    is_admin: Boolean(r.is_admin),
  }
}

// ---------- Sesiones ----------
export async function listSessions(): Promise<SessionItem[]> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await withTimeout(supabase.from('sessions').select('*').order('date').order('time'))
      if (error) throw new Error(error.message)
      const list = (data || []).map((r) => {
        const lat = (r as Record<string, unknown>).lat
        const lng = (r as Record<string, unknown>).lng
        return {
          ...r,
          level: r.level as Level | 'todos',
          ...(typeof lat === 'number' ? { lat } : lat ? { lat: Number(lat) } : {}),
          ...(typeof lng === 'number' ? { lng } : lng ? { lng: Number(lng) } : {}),
        } as SessionItem
      })
      cacheSet('sessions', list)
      return list
    } catch (e) {
      if (isNetworkError(e)) return cacheGet<SessionItem[]>('sessions', load<SessionItem[]>('sessions', []))
      throw e
    }
  }
  return load<SessionItem[]>('sessions', []).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

export async function createSession(s: Omit<SessionItem, 'id'>): Promise<SessionItem> {
  const item: SessionItem = { ...s, id: uid() }
  if (supabaseConfigured && supabase) {
    try {
      const { error } = await withTimeout(supabase.from('sessions').insert(item))
      if (error) throw new Error(error.message)
    } catch (e) {
      if (isNetworkError(e)) {
        const list = cacheGet<SessionItem[]>('sessions', load<SessionItem[]>('sessions', []))
        list.push(item)
        cacheSet('sessions', list)
        queueOffline({ kind: 'session', item })
      } else if (e instanceof Error && /lat|lng|column/i.test(e.message)) {
        // La base aún no tiene las columnas lat/lng (falta correr el
        // schema nuevo en Supabase): la sesión se crea sin coordenadas
        // en la nube, pero se guardan en el teléfono para que salga en
        // el mapa local hasta que se corra el esquema.
        const { lat: _lat, lng: _lng, ...rest } = item
        const { error } = await supabase.from('sessions').insert(rest as SessionItem)
        if (error) throw new Error(error.message)
        const list = cacheGet<SessionItem[]>('sessions', load<SessionItem[]>('sessions', []))
        const i = list.findIndex((x) => x.id === item.id)
        if (i >= 0) list[i] = item
        else list.push(item)
        cacheSet('sessions', list)
      } else throw e
    }
    return item
  }
  const list = load<SessionItem[]>('sessions', [])
  list.push(item)
  save('sessions', list)
  return item
}

export async function listRsvps(sessionId: string): Promise<Rsvp[]> {
  if (supabaseConfigured && supabase) {
    try {
      const { data } = await withTimeout(supabase.from('rsvps').select('*').eq('session_id', sessionId))
      return (data || []) as Rsvp[]
    } catch {
      return []
    }
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
    try {
      const { error } = await withTimeout(supabase.from('rsvps').insert(rsvp))
      if (error) throw new Error(error.message)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      // Sin internet: se apunta en el teléfono y se sube al volver la red.
      queueOffline({ kind: 'rsvp', item: rsvp })
    }
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
    try {
      const { data, error } = await withTimeout(supabase.from('workouts').select('*').eq('profile_id', profileId).order('date', { ascending: false }))
      if (error) throw new Error(error.message)
      const list = (data || []) as Workout[]
      cacheSet('workouts_' + profileId, list)
      return list
    } catch (e) {
      if (isNetworkError(e)) return cacheGet<Workout[]>('workouts_' + profileId, load<Workout[]>('workouts', []).filter((w) => w.profile_id === profileId))
      throw e
    }
  }
  return load<Workout[]>('workouts', [])
    .filter((w) => w.profile_id === profileId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export async function logWorkout(w: Omit<Workout, 'id'>): Promise<Workout> {
  const item: Workout = { ...w, id: uid() }
  if (supabaseConfigured && supabase) {
    try {
      const { route, ...rest } = item
      const { error } = await withTimeout(supabase.from('workouts').insert({ ...rest, route: route || null }))
      if (error) throw new Error(error.message)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      const list = cacheGet<Workout[]>('workouts_' + item.profile_id, load<Workout[]>('workouts', []))
      list.unshift(item)
      cacheSet('workouts_' + item.profile_id, list)
      queueOffline({ kind: 'workout', item })
    }
    return item
  }
  const list = load<Workout[]>('workouts', [])
  list.push(item)
  save('workouts', list)
  return item
}

export async function deleteWorkout(id: string): Promise<void> {
  if (supabaseConfigured && supabase) {
    try {
      await withTimeout(supabase.from('workouts').delete().eq('id', id))
    } catch (e) {
      if (!isNetworkError(e)) throw e
      queueOffline({ kind: 'delete-workout', id })
    }
    return
  }
  save('workouts', load<Workout[]>('workouts', []).filter((w) => w.id !== id))
}

// ---------- Administración (solo el dueño) ----------
// Todos los entrenamientos de todos los usuarios (estadísticas del
// panel). En Supabase requiere la política "admins ven
// entrenamientos" (schema.sql): sin correr el esquema nuevo, RLS
// solo devuelve los propios y el panel lo avisa.
export async function listAllWorkouts(): Promise<Workout[]> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await withTimeout(supabase.from('workouts').select('*').order('date', { ascending: false }))
      if (error) throw new Error(error.message)
      return (data || []) as Workout[]
    } catch {
      return []
    }
  }
  return load<Workout[]>('workouts', []).sort((a, b) => b.date.localeCompare(a.date))
}

/** Borrar una sesión (admin o su anfitrión, según RLS). */
export async function deleteSession(id: string): Promise<void> {
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return
  }
  save('sessions', load<SessionItem[]>('sessions', []).filter((s) => s.id !== id))
  const cached = cacheGet<SessionItem[]>('sessions', [])
  cacheSet('sessions', cached.filter((s) => s.id !== id))
}

/** Borrar una publicación del muro (admin o su autor, según RLS). */
export async function deletePost(id: string): Promise<void> {
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.from('posts').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return
  }
  save('posts', load<Post[]>('posts', []).filter((p) => p.id !== id))
  const cached = cacheGet<Post[]>('posts', [])
  cacheSet('posts', cached.filter((p) => p.id !== id))
}

// ---------- Retos, comunidad y negocios (estructura básica) ----------
export async function listChallenges(): Promise<Challenge[]> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await withTimeout(supabase.from('challenges').select('*').order('start_date', { ascending: false }))
      if (error) throw new Error(error.message)
      const list = (data || []) as Challenge[]
      cacheSet('challenges', list)
      return list
    } catch (e) {
      if (isNetworkError(e)) return cacheGet<Challenge[]>('challenges', load<Challenge[]>('challenges', []))
      throw e
    }
  }
  return load<Challenge[]>('challenges', [])
}

export async function listPosts(): Promise<Post[]> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await withTimeout(supabase.from('posts').select('*').order('created_at', { ascending: false }))
      if (error) throw new Error(error.message)
      const list = (data || []) as Post[]
      cacheSet('posts', list)
      return list
    } catch (e) {
      if (isNetworkError(e)) return cacheGet<Post[]>('posts', load<Post[]>('posts', []))
      throw e
    }
  }
  return load<Post[]>('posts', []).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function createPost(profileId: string, authorName: string, text: string): Promise<Post> {
  const post: Post = { id: uid(), profile_id: profileId, author_name: authorName, text: text.trim(), created_at: new Date().toISOString() }
  if (!post.text) throw new Error('Escribe algo para publicar.')
  if (supabaseConfigured && supabase) {
    try {
      const { error } = await withTimeout(supabase.from('posts').insert(post))
      if (error) throw new Error(error.message)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      const list = cacheGet<Post[]>('posts', load<Post[]>('posts', []))
      list.unshift(post)
      cacheSet('posts', list)
      queueOffline({ kind: 'post', item: post })
    }
    return post
  }
  const list = load<Post[]>('posts', [])
  list.unshift(post)
  save('posts', list)
  return post
}

export async function listBusinesses(): Promise<Business[]> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await withTimeout(supabase.from('businesses').select('*').order('name'))
      if (error) throw new Error(error.message)
      const list = (data || []) as Business[]
      cacheSet('businesses', list)
      return list
    } catch (e) {
      if (isNetworkError(e)) return cacheGet<Business[]>('businesses', load<Business[]>('businesses', []))
      throw e
    }
  }
  return load<Business[]>('businesses', [])
}

// ---------- Planes del entrenador IA ----------
// El plan activo es el último guardado de cada perfil. En Supabase va
// a la tabla training_plans; en modo local, a localStorage.
export async function getPlan(profileId: string): Promise<TrainingPlan | null> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await withTimeout(supabase.from('training_plans')
        .select('*').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(1).maybeSingle())
      if (error || !data) return cacheGet<TrainingPlan | null>('plan_' + profileId, null)
      const plan = rowToPlan(data)
      cacheSet('plan_' + profileId, plan)
      return plan
    } catch {
      return cacheGet<TrainingPlan | null>('plan_' + profileId, null)
    }
  }
  const plans = load<TrainingPlan[]>('plans', []).filter((p) => p.profile_id === profileId)
  return plans.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null
}

export async function savePlan(plan: TrainingPlan): Promise<TrainingPlan> {
  if (supabaseConfigured && supabase) {
    try {
      const { error } = await withTimeout(supabase.from('training_plans').insert({
        id: plan.id, profile_id: plan.profile_id, sport: plan.sport, level: plan.level,
        goal: plan.goal, days_per_week: plan.days_per_week, minutes_per_session: plan.minutes_per_session,
        adjustment: plan.adjustment, week_goal_km: plan.week_goal_km || null,
        tasks: plan.tasks,
      }))
      if (error) throw new Error(error.message)
    } catch (e) {
      if (!isNetworkError(e)) throw e
      cacheSet('plan_' + plan.profile_id, plan)
      queueOffline({ kind: 'plan', item: plan })
    }
    cacheSet('plan_' + plan.profile_id, plan)
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
