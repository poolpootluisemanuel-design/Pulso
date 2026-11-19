// Extractor de YouTube (servicio en el VPS del usuario):
// resuelve la URL directa de audio de un video o la lista de videos
// de una playlist, para que la app la pase a su <audio> y suene en
// segundo plano con el servicio en primer plano. Solo resuelve: el
// teléfono baja el audio directo de googlevideo, sin descargas ni
// proxy. Si el servidor no responde, pide clave y no hay, o devuelve
// error, se lanza una excepción y el reproductor cae al embed de
// YouTube como antes (ver MusicPlayer, ytMode 'embed').
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
  const res = await fetch(`${EXTRACTOR_URL}${path}`, { headers })
  if (!res.ok) throw new Error(`extractor ${res.status}`)
  return res.json() as Promise<unknown>
}

/** Resuelve un video a su URL directa de audio. */
export async function resolveVideo(id: string): Promise<ResolvedAudio> {
  const data = (await fetchExtractor(`/resolve?id=${encodeURIComponent(id)}`)) as {
    url?: string
    title?: string
    author?: string
    duration?: number
  }
  if (!data.url) throw new Error('extractor sin URL de audio')
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
  if (!Array.isArray(data.videos)) throw new Error('extractor sin lista de videos')
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
