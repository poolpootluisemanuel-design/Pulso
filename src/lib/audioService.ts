// Música en segundo plano (app nativa de Android): puente TS del
// plugin PulsoAudio (android/app/src/main/java/com/pulso/app/
// PulsoAudioPlugin.java + AudioForegroundService.java).
// - startAudioService(title) arranca el servicio en primer plano
//   (notificación "PULSO · Sonando") para que el audio de la WebView
//   no se corte al salir de la app o al apagar la pantalla.
//   stopAudioService() lo para al pausar. Si cambia la canción
//   mientras suena, se vuelve a llamar a start con el título nuevo.
// - En web no existe: devuelve false/null sin hacer nada (el
//   navegador pausa el audio al bloquear la pantalla, límite web).
// - Quien llama es MusicPlayer: al sonar (YouTube o local) arranca,
//   al pausar para. Nunca se arranca sin que suene música.
import { registerPlugin } from '@capacitor/core'
import { isAndroid, isNative } from './native'

interface PulsoAudioPlugin {
  startAudio(options: { title: string }): Promise<{ started: boolean }>
  stopAudio(): Promise<{ stopped: boolean }>
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
