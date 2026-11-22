// Extractor de YouTube (servicio en el VPS del usuario):
// resuelve la URL directa de audio de un video o la lista de videos
// de una playlist, para que la app la pase a su <audio> y suene en
// segundo plano con el servicio en primer plano. Solo resuelve: el
// teléfono baja el audio directo de googlevideo, sin descargas ni
// proxy. Si el servidor no responde, pide clave y no hay, o devuelve
// error, se lanza un ExtractorError con su tipo para que el
// reproductor lo diagnostique en palabras simples y lo reintente
// (ver MusicPlayer). Ya NO hay video incrustado de respaldo: el embed
// se quitó por completo.
export interface ExtractorTrack {
  id: string
  title: string
  author?: string
  durationSec?: number
  thumbnail?: string
}

export interface ResolvedAudio {
  url: string
  title: string
  author?: string
  durationSec?: number
  thumbnail?: string
}

/** Por qué falló una llamada al extractor (para el diagnóstico). */
export type ExtractorErrorKind =
  | 'offline' // sin red (el fetch ni salió)
  | 'server' // el servidor no responde o devuelve 5xx sin ser bloqueo
  | 'blocked' // YouTube bloqueó el video (502 "Sign in to confirm…")
  | 'key' // 401: clave no válida
  | 'resolve' // el video no se pudo resolver (sin URL, lista vacía…)
  | 'network' // error de red / timeout (se clasifica en MusicPlayer)

export class ExtractorError extends Error {
  kind: ExtractorErrorKind
  status?: number
  code: string
  constructor(kind: ExtractorErrorKind, message: string, status?: number, code?: string) {
    super(message)
    this.name = 'ExtractorError'
    this.kind = kind
    this.status = status
    this.code = code ?? (status !== undefined ? `extractor ${status}` : 'error')
  }
}

// Dirección pública del extractor; se puede cambiar por build con
// VITE_EXTRACTOR_URL. La clave viaja como cabecera x-pulso-key solo
// si el build la trae (VITE_EXTRACTOR_KEY).
export const EXTRACTOR_URL =
  import.meta.env.VITE_EXTRACTOR_URL || 'https://extractor.mercaislamx.com'
const EXTRACTOR_KEY = import.meta.env.VITE_EXTRACTOR_KEY || ''

/** Miniatura oficial de YouTube para un video (siempre existe). */
export function ytThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
}

async function fetchExtractor(path: string): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (EXTRACTOR_KEY) headers['x-pulso-key'] = EXTRACTOR_KEY
  let res: Response
  try {
    res = await fetch(`${EXTRACTOR_URL}${path}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    // Sin red o timeout: el reproductor distingue sin internet
    // (navigator.onLine) de servidor sin respuesta.
    throw new ExtractorError('network', 'extractor sin respuesta', undefined, err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'red')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 401) throw new ExtractorError('key', 'extractor 401', 401)
    if (res.status === 502 && /sign in to confirm|not a bot/i.test(body)) {
      throw new ExtractorError('blocked', 'extractor 502: YouTube bloqueó el video', 502)
    }
    if (res.status >= 500) throw new ExtractorError('server', `extractor ${res.status}`, res.status)
    throw new ExtractorError('resolve', `extractor ${res.status}`, res.status)
  }
  return res.json() as Promise<unknown>
}

/** ¿Responde el servidor del extractor? (diagnóstico: /health). */
export async function checkExtractorHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${EXTRACTOR_URL}/health`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: unknown }
    return data.ok === true
  } catch {
    return false
  }
}

/** Resuelve un video a su URL directa de audio. */
export async function resolveVideo(id: string): Promise<ResolvedAudio> {
  const data = (await fetchExtractor(`/resolve?id=${encodeURIComponent(id)}`)) as {
    url?: string
    title?: string
    author?: string
    duration?: number
  }
  if (!data.url) throw new ExtractorError('resolve', 'extractor sin URL de audio')
  return {
    url: data.url,
    title: data.title || 'Video de YouTube',
    author: data.author,
    durationSec: typeof data.duration === 'number' ? data.duration : undefined,
    thumbnail: ytThumbnail(id),
  }
}

/** Lista los videos de una playlist (máx. 100, primera página). */
export async function listPlaylist(id: string): Promise<ExtractorTrack[]> {
  const data = (await fetchExtractor(`/playlist?id=${encodeURIComponent(id)}`)) as {
    videos?: { id: string; title?: string; author?: string; duration?: number }[]
  }
  if (!Array.isArray(data.videos)) throw new ExtractorError('resolve', 'extractor sin lista de videos')
  return data.videos
    .filter((v) => v.id)
    .map((v) => ({
      id: v.id,
      title: v.title || 'Video de YouTube',
      author: v.author,
      durationSec: typeof v.duration === 'number' ? v.duration : undefined,
      thumbnail: ytThumbnail(v.id),
    }))
}
