// Música local nativa: leer las canciones del teléfono sin cargarlas
// una por una (solo en la app instalada de Android, plugin DeviceMusic
// en android/app/src/main/java/com/pulso/app/DeviceMusicPlugin.java).
// En web NO se usa: ahí sigue el <input type=file> de MusicPlayer.
// - Solo se leen metadatos (título, artista, duración y la content://
//   URI de MediaStore). Los archivos NO se copian ni se suben a ningún
//   servidor; el <audio> los reproduce con Capacitor.convertFileSrc(uri).
// - La lista de metadatos sí se guarda en localStorage (clave
//   pulso_device_songs_<profileId>) para que no haya que escanear de
//   nuevo al abrir la app; la URI de MediaStore es estable entre
//   aperturas, así que la lista guardada sigue sonando.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { isAndroid, isNative } from './native'

export interface DeviceSong {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
  mimeType: string
  /** content:// URI de MediaStore, estable entre aperturas. */
  uri: string
}

interface DeviceMusicPlugin {
  hasPermission(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  listSongs(): Promise<{ songs: DeviceSong[] }>
}

const DeviceMusic = registerPlugin<DeviceMusicPlugin>('DeviceMusic')

/** true solo dentro de la app nativa de Android (en web, false). */
export function deviceMusicSupported(): boolean {
  return isNative() && isAndroid()
}

/** ¿Ya está dado el permiso de Música y audio? (false en web). */
export async function hasDeviceMusicPermission(): Promise<boolean> {
  if (!deviceMusicSupported()) return false
  try {
    return (await DeviceMusic.hasPermission()).granted
  } catch {
    return false
  }
}

/** Muestra el diálogo del sistema para el permiso de Música y audio. */
export async function requestDeviceMusicPermission(): Promise<boolean> {
  if (!deviceMusicSupported()) return false
  try {
    return (await DeviceMusic.requestPermission()).granted
  } catch {
    return false
  }
}

/** Lista las canciones del teléfono (pide permiso antes si hace falta). */
export async function listDeviceSongs(): Promise<DeviceSong[]> {
  if (!deviceMusicSupported()) return []
  const granted = await requestDeviceMusicPermission()
  if (!granted) return []
  try {
    const { songs } = await DeviceMusic.listSongs()
    return Array.isArray(songs) ? songs : []
  } catch {
    return []
  }
}

/** URL que el <audio> de la WebView puede reproducir para una canción. */
export function deviceSongUrl(song: DeviceSong): string {
  try {
    return Capacitor.convertFileSrc(song.uri)
  } catch {
    return song.uri
  }
}

function cacheKey(profileId: string): string {
  return `pulso_device_songs_${profileId}`
}

/** Metadatos guardados (solo metadatos, nunca los archivos). */
export function loadCachedDeviceSongs(profileId: string): DeviceSong[] {
  try {
    const raw = localStorage.getItem(cacheKey(profileId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is DeviceSong =>
        !!s && typeof s === 'object' && typeof (s as DeviceSong).uri === 'string' && typeof (s as DeviceSong).title === 'string',
    )
  } catch {
    return []
  }
}

export function saveCachedDeviceSongs(profileId: string, songs: DeviceSong[]): void {
  try {
    localStorage.setItem(cacheKey(profileId), JSON.stringify(songs))
  } catch {
    /* sin espacio: la lista se vuelve a escanear la próxima vez */
  }
}

export function clearCachedDeviceSongs(profileId: string): void {
  try {
    localStorage.removeItem(cacheKey(profileId))
  } catch {
    /* noop */
  }
}

/** "3:45" a partir de milisegundos. */
export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return ''
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
