// Modo invitado: explorar la app sin cuenta (vista previa).
// El invitado VE todo lo público (sesiones, mapa, rutas, comunidad,
// negocios, retos) pero NO puede apuntarse, crear, publicar, chatear
// ni grabar entrenamientos: esas acciones piden crear cuenta gratis.
// La bandera vive en localStorage para que el modo sobreviva al
// cerrar y reabrir la app. No es una sesión: no hay usuario ni token.
import type { Profile } from './types'

const GUEST_FLAG = 'pulso_guest_v1'

export function isGuestMode(): boolean {
  try {
    return localStorage.getItem(GUEST_FLAG) === '1'
  } catch {
    return false
  }
}

export function enterGuestMode(): void {
  try {
    localStorage.setItem(GUEST_FLAG, '1')
  } catch {
    /* sin almacenamiento: el modo invitado solo dura esta visita */
  }
}

export function exitGuestMode(): void {
  try {
    localStorage.removeItem(GUEST_FLAG)
  } catch {
    /* nada que hacer */
  }
}

// Perfil de solo lectura para que las pantallas que leen
// profile.name / profile.zone no se rompan en invitado. El id
// 'guest' nunca coincide con un usuario real, así que "Me apunto"
// o el chat no pueden confundirlo con alguien apuntado: además
// esas acciones se bloquean antes, en la interfaz.
export const GUEST_PROFILE: Profile = {
  id: 'guest',
  name: 'Invitado',
  email: '',
  zone: 'Isla Mujeres',
  bio: '',
  beginner: true,
  sports: [],
  availability: [],
}

export const GUEST_ACCOUNT_MSG = 'Crea tu cuenta gratis para hacer esto'
