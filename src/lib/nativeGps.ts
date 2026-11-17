// GPS en segundo plano para la app nativa (Capacitor).
// En web NO se usa: ahí sigue navigator.geolocation.watchPosition y el
// GPS se pausa con la pantalla apagada (límite del navegador).
// En nativo se usa @capacitor-community/background-geolocation, que en
// Android corre un servicio en primer plano con notificación
// ("PULSO · Grabando") y sigue dando posiciones con la pantalla
// apagada y la app en segundo plano, como Strava. El plugin pide los
// permisos solo; para que funcione en segundo plano el usuario debe
// elegir "Permitir todo el tiempo" en el permiso de ubicación.
// Las posiciones que entrega pasan por el MISMO filtro anti-deriva de
// GpsTracker (accuracy, velocidad implícita, pausa si estás parado):
// este módulo solo cambia DE DÓNDE viene la posición, no cómo se suma.
import { registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'
import { Geolocation } from '@capacitor/geolocation'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

export interface NativeFix {
  lat: number
  lng: number
  /** Precisión en metros (igual que coords.accuracy del navegador). */
  accuracy: number
  time: number | null
}

/** Arranca el watcher en segundo plano. Devuelve el id para pararlo. */
export async function startNativeWatch(
  onFix: (fix: NativeFix) => void,
  onError: (message: string) => void,
): Promise<string> {
  const id = await BackgroundGeolocation.addWatcher(
    {
      // Con backgroundMessage definido, Android muestra la notificación
      // del servicio en primer plano y las posiciones siguen llegando
      // en segundo plano. Sin él, solo hay garantía en primer plano.
      backgroundMessage: 'PULSO está grabando tu entrenamiento con GPS.',
      backgroundTitle: 'PULSO · Grabando',
      requestPermissions: true,
      stale: false,
      // Mínimo 5 m entre posiciones: el filtro anti-deriva de GpsTracker
      // sigue siendo el que decide qué se suma como distancia real.
      distanceFilter: 5,
    },
    (position, error) => {
      if (error) {
        if (error.code === 'NOT_AUTHORIZED') {
          onError(
            'No diste permiso de ubicación. En Ajustes → PULSO → Ubicación elige "Permitir todo el tiempo" para grabar con la pantalla apagada.',
          )
        } else {
          onError(error.message || 'Se perdió la señal GPS. La grabación sigue con lo que llevaba.')
        }
        return
      }
      if (!position) return
      onFix({
        lat: position.latitude,
        lng: position.longitude,
        accuracy: position.accuracy,
        time: position.time,
      })
    },
  )
  return id
}

/** Para el watcher en segundo plano. */
export async function stopNativeWatch(id: string): Promise<void> {
  try {
    await BackgroundGeolocation.removeWatcher({ id })
  } catch {
    /* ya estaba parado: no pasa nada */
  }
}

/** Primera posición en nativo (equivale a getCurrentPosition del navegador). */
export async function getNativeCurrentPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    }
  } catch {
    return null
  }
}
