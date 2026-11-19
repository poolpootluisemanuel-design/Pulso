// Música en segundo plano (app nativa de Android): puente TS del
// plugin PulsoAudio (android/app/src/main/java/com/pulso/app/
// PulsoAudioPlugin.java + AudioForegroundService.java).
// - startAudioService(title) arranca el servicio en primer plano
//   (notificación "PULSO · Sonando") para que el audio de la WebView
//   no se corte al salir de la app o al apagar la pantalla.
//   stopAudioService() lo para al pausar. Si cambia la canción
//   mientras suena, se vuelve a llamar a start con el título nuevo.
// - updateMedia(title, artist, playing) actualiza la sesión de medios
//   nativa (título/artista/estado) para que la pantalla de bloqueo y
//   los ajustes rápidos muestren la canción y los controles. Sin esto
//   el teléfono no muestra controles: el MediaSession de la WebView
//   no genera notificación del sistema (reporte de Luis, build 37).
// - addMediaControlListener(cb) recibe los botones de esa notificación
//   (play/pause/next/previous) para que la web reaccione.
// - En web no existe: devuelve false/null sin hacer nada (el
//   navegador pausa el audio al bloquear la pantalla, límite web).
// - Quien llama es MusicPlayer: al sonar (YouTube o local) arranca,
//   al pausar para. Nunca se arranca sin que suene música.
import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { isAndroid, isNative } from './native'

interface PulsoAudioPlugin {
  startAudio(options: { title: string }): Promise<{ started: boolean }>
  stopAudio(): Promise<{ stopped: boolean }>
  updateMedia(options: { title: string; artist: string; playing: boolean }): Promise<void>
  playUrl(options: { url: string; title: string; artist: string }): Promise<void>
  pausePlayer(): Promise<void>
  seekTo(options: { positionMs: number }): Promise<void>
  getPosition(): Promise<{ positionMs: number; durationMs: number; playing: boolean }>
  addListener(eventName: string, listenerFunc: (data: { action?: string; type?: string; message?: string }) => void): Promise<PluginListenerHandle>
}

const PulsoAudio = registerPlugin<PulsoAudioPlugin>('PulsoAudio')

/** true solo dentro de la app nativa de Android (en web, false). */
export function audioServiceSupported(): boolean {
  return isNative() && isAndroid()
}

/** Arranca el servicio en primer plano con el título que suena. */
export async function startAudioService(title: string): Promise<boolean> {
  if (!audioServiceSupported()) return false
  try {
    return (await PulsoAudio.startAudio({ title })).started
  } catch {
    return false
  }
}

/** Para el servicio en primer plano (al pausar la música). */
export async function stopAudioService(): Promise<boolean> {
  if (!audioServiceSupported()) return false
  try {
    return (await PulsoAudio.stopAudio()).stopped
  } catch {
    return false
  }
}

/** Actualiza la sesión de medios nativa (título/artista/estado). */
export async function updateMedia(title: string, artist: string, playing: boolean): Promise<void> {
  if (!audioServiceSupported()) return
  try {
    await PulsoAudio.updateMedia({ title, artist, playing })
  } catch {
    /* la sesión es opcional: el audio sigue */
  }
}

export type MediaControlAction = 'play' | 'pause' | 'next' | 'previous'

/** Escucha los botones de la notificación de medios (bloqueo). */
export function addMediaControlListener(cb: (action: MediaControlAction) => void): Promise<PluginListenerHandle | null> {
  if (!audioServiceSupported()) return Promise.resolve(null)
  return PulsoAudio.addListener('mediaControl', (data) => {
    const a = (data as { action?: string }).action
    if (a === 'play' || a === 'pause' || a === 'next' || a === 'previous') cb(a)
  }).catch(() => null)
}

// --- Reproductor NATIVO (ExoPlayer): el audio sale del WebView para
// que no se corte al salir de la app ni al apagar la pantalla. En
// web no existe: ahí sigue el <audio> de siempre. ---

/** Reproduce una URL nativa (content:// local o stream https). */
export async function playNativeUrl(url: string, title: string, artist: string): Promise<void> {
  if (!audioServiceSupported()) return
  try {
    await PulsoAudio.playUrl({ url, title, artist })
  } catch {
    /* el elemento web sigue de respaldo en la app */
  }
}

/** Pausa el reproductor nativo y para el servicio. */
export async function pauseNative(): Promise<void> {
  if (!audioServiceSupported()) return
  try {
    await PulsoAudio.pausePlayer()
  } catch {
    /* noop */
  }
}

/** Adelantar / atrasar en el reproductor nativo (milisegundos). */
export async function seekNative(positionMs: number): Promise<void> {
  if (!audioServiceSupported()) return
  try {
    await PulsoAudio.seekTo({ positionMs })
  } catch {
    /* noop */
  }
}

/** Posición y duración actuales del reproductor nativo. */
export async function getNativePosition(): Promise<{ positionMs: number; durationMs: number; playing: boolean } | null> {
  if (!audioServiceSupported()) return null
  try {
    return await PulsoAudio.getPosition()
  } catch {
    return null
  }
}

export type PlayerEventType = 'ended' | 'error'

/** El reproductor nativo avisa cuando termina la canción o falla. */
export function addPlayerEventListener(cb: (ev: { type: PlayerEventType; message?: string }) => void): Promise<PluginListenerHandle | null> {
  if (!audioServiceSupported()) return Promise.resolve(null)
  return PulsoAudio.addListener('playerEvent', (data) => {
    const t = (data as { type?: string }).type
    if (t === 'ended' || t === 'error') cb({ type: t, message: (data as { message?: string }).message })
  }).catch(() => null)
}
