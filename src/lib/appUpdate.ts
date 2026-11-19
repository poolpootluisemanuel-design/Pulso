// Aviso de actualización del APK (app nativa).
// Cómo funciona: al abrir la app (con internet) se descarga el
// `version.json` remoto de GitHub (rama main, siempre el último) y
// se compara su versionCode con APP_BUILD, el número de build de
// ESTA app. Si el remoto es mayor, App muestra el modal "Hay una
// actualización" con las novedades y el botón "Actualizar ahora"
// (abre el enlace directo del APK nuevo, que se instala encima
// porque todos llevan la misma llave fija).
//
// Proceso de cada release (¡no olvidar!):
// 1) Subir APP_BUILD aquí y versionCode en public/version.json al
//    mismo número nuevo.
// 2) Compilar y subir el APK nuevo al descargador directo.
// 3) Actualizar apkUrl en public/version.json con el enlace nuevo
//    (ese archivo se lee en remoto, no hace falta recompilar).
// El version.json que viaja DENTRO del APK no se usa para comparar:
// la comparación siempre lee el remoto de GitHub.
export const APP_BUILD = 22 // Build 22: distancia/ritmo GPS, música sin cortes, mapa que sigue.

export interface RemoteVersion {
  versionCode: number
  versionName: string
  apkUrl: string
  notes: string[]
}

const REMOTE_VERSION_URL =
  'https://raw.githubusercontent.com/poolpootluisemanuel-design/Pulso/main/public/version.json'

/** Devuelve la versión nueva si la hay; null si ya estás al día,
 *  no hay internet o no se pudo revisar (nunca rompe la app). */
export async function checkAppUpdate(): Promise<RemoteVersion | null> {
  if (!navigator.onLine) return null
  try {
    const res = await fetch(`${REMOTE_VERSION_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<RemoteVersion>
    if (
      typeof data.versionCode === 'number' &&
      data.versionCode > APP_BUILD &&
      typeof data.apkUrl === 'string' &&
      data.apkUrl.length > 0
    ) {
      return {
        versionCode: data.versionCode,
        versionName: typeof data.versionName === 'string' ? data.versionName : `Build ${data.versionCode}`,
        apkUrl: data.apkUrl,
        notes: Array.isArray(data.notes) ? data.notes.filter((n) => typeof n === 'string') : [],
      }
    }
    return null
  } catch {
    return null
  }
}
