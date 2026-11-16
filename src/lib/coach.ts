// Entrenador IA de PULSO (lógica de reglas, sin API externa ni claves).
// Genera un plan semanal por deporte, nivel y meta, y lo ajusta según
// los entrenamientos que la persona ya registró en su historial.
// No es un plan médico: si tienes una lesión o condición de salud,
// consúltalo con un profesional antes de seguirlo.
import type { CoachGoal, Level, PlanTask, TrainingPlan, Workout } from './types'
import { DAYS, SPORTS } from './types'
import { uid } from './utils'

export interface CoachInput {
  sport: string
  level: Level
  goal: CoachGoal
  daysPerWeek: number
  minutesPerSession: number
}

const GOAL_LABEL: Record<CoachGoal, string> = {
  resistencia: 'más resistencia',
  fuerza: 'ganar fuerza',
  tecnica: 'mejorar tu técnica',
  constancia: 'ser constante',
  bajar_peso: 'bajar de peso',
}

// Ritmo estimado (min/km) por deporte y nivel, para calcular la meta de km.
const PACE_MIN_KM: Record<string, Record<Level, number>> = {
  Caminata: { principiante: 13, intermedio: 11, avanzado: 10 },
  Running: { principiante: 8, intermedio: 6.5, avanzado: 5.5 },
  Correr: { principiante: 8, intermedio: 6.5, avanzado: 5.5 },
  Ciclismo: { principiante: 3.5, intermedio: 2.8, avanzado: 2.2 },
}

interface Archetype {
  title: string
  detail: string
}

// Una sesión tipo por deporte. La duración y la distancia se ajustan
// con los minutos que eligió la persona; el detalle cambia por nivel.
function archetypes(sport: string, level: Level, goal: CoachGoal): Archetype[] {
  const lvl = level === 'principiante' ? 'suave, sin forzarte' : level === 'intermedio' ? 'a ritmo constante' : 'con intensidad'
  const tecnica =
    goal === 'tecnica'
      ? ' Dedica los últimos 10 minutos solo a técnica, despacio y con buena forma.'
      : ''
  const fuerza =
    goal === 'fuerza' ? ' Termina con 3 series cortas de fuerza (sentadillas, plancha, zancadas).' : ''
  const base = `${lvl}.${tecnica}${fuerza}`

  const bySport: Record<string, Archetype[]> = {
    Caminata: [
      { title: 'Caminata con ritmo', detail: `Camina ${base} Lleva agua y calzado cómodo.` },
      { title: 'Caminata + intervalos', detail: `Alterna 3 min caminando normal y 2 min a paso rápido, ${base}` },
      { title: 'Caminata larga', detail: `Ruta un poco más larga que la habitual, ${base} Disfruta el recorrido.` },
    ],
    Running: [
      { title: 'Rodaje suave', detail: `Corre a un ritmo en el que puedas hablar, ${base}` },
      { title: 'Intervalos', detail: `Calienta 10 min, luego 6 x 2 min rápido / 2 min suave, y enfría 5 min.${tecnica}` },
      { title: 'Rodaje largo', detail: `Tu salida más larga de la semana, ${base} Termina caminando 5 min.` },
    ],
    Correr: [
      { title: 'Rodaje suave', detail: `Corre a un ritmo en el que puedas hablar, ${base}` },
      { title: 'Intervalos', detail: `Calienta 10 min, luego 6 x 2 min rápido / 2 min suave, y enfría 5 min.${tecnica}` },
      { title: 'Rodaje largo', detail: `Tu salida más larga de la semana, ${base} Termina caminando 5 min.` },
    ],
    Ciclismo: [
      { title: 'Rodada suave', detail: `Rueda en terreno plano, ${base} Revisa frenos y llantas antes de salir.` },
      { title: 'Rodada con subidas', detail: `Busca una ruta con 2 o 3 subidas cortas, ${base}` },
      { title: 'Rodada larga', detail: `Tu rodada más larga de la semana, ${base} Lleva agua y algo de comer.` },
    ],
    CrossFit: [
      { title: 'WOD de fuerza', detail: `Calienta 10 min, trabaja fuerza (sentadilla, peso muerto o press) en 4 series, ${base}` },
      { title: 'WOD metabólico', detail: `Circuito: 3 rondas de burpees, sentadillas, remo o salto de cuerda, con descanso entre rondas.${tecnica}` },
      { title: 'Movilidad + técnica', detail: `Sesión suave de movilidad y técnica de tus levantamientos, ${base}` },
    ],
    Gym: [
      { title: 'Tren superior', detail: `Press, remo, dominadas asistidas y hombro: 3 series de 10-12 repeticiones.${tecnica}` },
      { title: 'Tren inferior', detail: `Sentadilla, zancada, peso muerto rumano y pantorrilla: 3 series de 10-12 repeticiones.${tecnica}` },
      { title: 'Cuerpo completo', detail: `Circuito de cuerpo completo, ${base} Termina con 5 min de estiramiento.` },
    ],
    'Pádel': [
      { title: 'Pádel: técnica', detail: `Practica bandeja, volea y salida de pared, ${base} Juega puntos cortos al final.${tecnica}` },
      { title: 'Pádel: partido', detail: `Partido o reta con tu nivel, ${base} Concéntrate en no fallar la primera bola.` },
      { title: 'Pádel: físico', detail: `Antes o después de jugar: 15 min de desplazamientos laterales, zancadas y core.${fuerza}` },
    ],
    Yoga: [
      { title: 'Yoga suave', detail: `Secuencia lenta de saludos al sol y respiración, ${base}` },
      { title: 'Yoga de fuerza', detail: `Posturas de equilibrio y fuerza (guerrero, plancha, silla), ${base}` },
      { title: 'Yoga + respiración', detail: `Sesión de estiramiento profundo y 5 min de respiración al final.${tecnica}` },
    ],
    'Natación': [
      { title: 'Nado continuo', detail: `Nada a ritmo cómodo con pausas cortas cada 100 m, ${base}` },
      { title: 'Técnica de brazada', detail: `Series cortas enfocadas en brazada y respiración, ${base}${tecnica}` },
      { title: 'Nado largo', detail: `Tu nado más largo de la semana, ${base} Termina con 100 m muy suaves.` },
    ],
    Surf: [
      { title: 'Surf: remada', detail: `Sesión de remada y práctica de pop-up en la arena antes de entrar, ${base}` },
      { title: 'Surf en el mar', detail: `Sesión en el mar según las condiciones, ${base} Siempre con compañero.` },
      { title: 'Surf: físico', detail: `En tierra: remada simulada, plancha, sentadillas y equilibrio, ${base}` },
    ],
  }
  const list = bySport[sport] || [
    { title: `${sport}: sesión base`, detail: `Entrena ${base}` },
    { title: `${sport}: sesión de técnica`, detail: `Enfócate en la técnica, despacio y con buena forma.${tecnica}` },
    { title: `${sport}: sesión larga`, detail: `Tu sesión más larga de la semana, ${base}` },
  ]
  return list
}

// Días de la semana (lunes a domingo) repartidos según cuántos días entrena.
function pickDays(daysPerWeek: number, availability: string[]): string[] {
  const n = Math.max(2, Math.min(6, daysPerWeek))
  const ordered = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
  const preferred = ordered.filter((d) => availability.includes(d))
  const pool = preferred.length >= n ? preferred : ordered
  // Reparto espaciado: lunes/miércoles/viernes, etc.
  const step = 7 / n
  const picked: string[] = []
  for (let i = 0; i < n; i++) {
    const day = pool[Math.min(pool.length - 1, Math.round(i * step))] || ordered[i * 2]
    if (!picked.includes(day)) picked.push(day)
  }
  // Si el reparto dejó huecos, completa con los días que faltan en orden.
  for (const d of ordered) {
    if (picked.length >= n) break
    if (!picked.includes(d)) picked.push(d)
  }
  return picked.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b))
}

// Próxima fecha (>= hoy) para un día de la semana en español.
function nextDateFor(day: string): string {
  const jsDay = { domingo: 0, lunes: 1, martes: 2, 'miércoles': 3, jueves: 4, viernes: 5, 'sábado': 6 }[day] ?? 1
  const d = new Date()
  const diff = (jsDay - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function generatePlan(input: CoachInput, workouts: Workout[], availability: string[]): TrainingPlan {
  const recent = workouts.filter((w) => Date.now() - new Date(w.date + 'T12:00:00').getTime() <= 7 * 24 * 3600 * 1000)
  const sameSport = recent.filter((w) => w.sport === input.sport).length
  const recentMin = recent.reduce((s, w) => s + w.duration_min, 0)
  const recentKm = recent.reduce((s, w) => s + (w.distance_km || 0), 0)

  // Ajuste por historial: si ya entrenó mucho, sube la carga; si no
  // entrenó nada, la semana es de arranque suave.
  let minutes = input.minutesPerSession
  let adjustment: string
  if (recent.length === 0) {
    adjustment = 'Esta es tu semana de arranque: empezamos suave para agarrar el ritmo. Si te sientes bien, la próxima semana subimos.'
  } else if (recent.length >= 4) {
    minutes = Math.round((minutes * 1.1) / 5) * 5
    adjustment = `La semana pasada entrenaste ${recent.length} veces (${recentMin} min${recentKm ? `, ${recentKm.toFixed(1)} km` : ''}), así que subimos la carga un 10%: sesiones de ${minutes} min.`
  } else if (sameSport === 0) {
    adjustment = `La semana pasada entrenaste ${recent.length} veces, pero no ${input.sport}. Este plan te mete de lleno en ${input.sport} sin descuidar lo demás.`
  } else {
    adjustment = `La semana pasada hiciste ${sameSport} sesiones de ${input.sport} (${recentMin} min). Mantenemos ese ritmo y variamos las sesiones para que no te aburras.`
  }
  if (input.goal === 'bajar_peso') {
    adjustment += ' Para tu meta, lo clave es la constancia: mejor 4 sesiones cortas que una muy larga.'
  }

  const days = pickDays(input.daysPerWeek, availability)
  const arch = archetypes(input.sport, input.level, input.goal)
  const pace = PACE_MIN_KM[input.sport]?.[input.level]
  const tasks: PlanTask[] = days.map((day, i) => {
    const a = arch[i % arch.length]
    const isLong = i === days.length - 1
    const duration = isLong ? Math.round(minutes * 1.2) : minutes
    return {
      id: uid(),
      day,
      date: nextDateFor(day),
      title: a.title,
      detail: a.detail,
      duration_min: duration,
      distance_km: pace ? Math.round((duration / pace) * 10) / 10 : undefined,
      done: false,
    }
  })

  return {
    id: uid(),
    profile_id: '',
    sport: input.sport,
    level: input.level,
    goal: input.goal,
    days_per_week: days.length,
    minutes_per_session: minutes,
    week_goal_min: tasks.reduce((s, t) => s + t.duration_min, 0),
    week_goal_km: pace ? Math.round(tasks.reduce((s, t) => s + (t.distance_km || 0), 0) * 10) / 10 : undefined,
    adjustment,
    tasks,
    created_at: new Date().toISOString(),
  }
}

export function goalLabel(goal: CoachGoal): string {
  return GOAL_LABEL[goal]
}

export function sportList(): string[] {
  return [...SPORTS]
}

export { DAYS }
