// Música para entrenar: YouTube o música local del teléfono (opcional).
// - YouTube: cada preset es un VIDEO REAL de YouTube (mix largo de
//   música para entrenar), verificado con yt-dlp: playable_in_embed=True
//   y oEmbed 200 para los 8 IDs. El embed viejo usaba
//   youtube-nocookie.com/embed?listType=search, que en el navegador
//   muestra "Este video no está disponible" y nunca suena: por eso Luis
//   lo percibía como que "se resetea". Ahora se incrusta con la API
//   oficial de YouTube (iframe_api) sobre youtube.com/embed/<videoId>.
//   Si un video falla al incrustarse (error 101/150), se muestra el
//   aviso y el botón "Abrir en YouTube" sigue funcionando.
// - El usuario puede pegar su propia playlist/video y se guarda.
// - NO se puede descargar música de YouTube. La opción local es solo
//   para canciones que el usuario YA tenga descargadas en su teléfono.
// - En la app NATIVA de Android (plugin DeviceMusic, src/lib/deviceMusic.ts)
//   la música local ya no se carga archivo por archivo: con el permiso
//   de "Música y audio" se lee la lista del teléfono con MediaStore y
//   suena directo, sin copiar ni subir nada. En web sigue el
//   <input type=file> de siempre y la lista no persiste al cerrar.
// - Este componente vive MONTADO EN App.tsx, fuera de las pestañas:
//   nunca se oculta con display:none (eso pausa el iframe de YouTube).
//   Por defecto es una MINI-BARRA fija y pequeña en todas las pestañas
//   (también en Entrenar); solo se expande a una hoja baja (40vh) con
//   el video en miniatura cuando Luis la abre, y se recoge sola al
//   cambiar de pestaña. El audio sigue sonando al recogerla.
// - Segundo plano (app nativa): mientras suena, el plugin
//   PulsoAudio mantiene un servicio en primer plano ("PULSO ·
//   Sonando") para que el audio siga al salir de la app o con la
//   pantalla apagada. YouTube con pantalla apagada puede pausarse
//   igual (límite del embed): para mayor seguridad, "Abrir en
//   YouTube" con Premium. En web no hay servicio: el navegador
//   pausa el audio al bloquear la pantalla.
// - "Abrir en YouTube" usa el plugin @capacitor/browser: window.open
//   con '_blank' se ignora en la WebView de Capacitor y el botón no
//   abría nada (ver lib/openExternal.ts).
import { useEffect, useRef, useState } from 'react'
import { getMusicPref, saveMusicPref } from '../lib/store'
import {
  clearCachedDeviceSongs,
  deviceMusicSupported,
  deviceSongUrl,
  formatDuration,
  hasDeviceMusicPermission,
  listDeviceSongs,
  loadCachedDeviceSongs,
  saveCachedDeviceSongs,
  type DeviceSong,
} from '../lib/deviceMusic'
import { Btn, Field, inputCls } from './ui'
import { startAudioService, stopAudioService, updateMedia, addMediaControlListener } from '../lib/audioService'
import type { MediaControlAction } from '../lib/audioService'
import { listPlaylist, resolveVideo, ytThumbnail, type ExtractorTrack } from '../lib/youtubeExtractor'
import { openExternalUrl } from '../lib/openExternal'

// Videos reales de YouTube por deporte (mixes largos, públicos).
// Verificados 2026-11-16 con yt-dlp: playable_in_embed=True, oEmbed 200.
// NO inventar IDs: si se cambia uno, verificarlo igual antes de subirlo.
export interface Preset { id: string; label: string; emoji: string; query: string; videoId: string }
export const MUSIC_PRESETS: Preset[] = [
  { id: 'caminata', label: 'Caminata', emoji: '🚶', query: 'música para caminar relajante', videoId: 'Y1gV3k3g7cA' },
  { id: 'correr', label: 'Correr', emoji: '🏃', query: 'música para correr energía', videoId: 'I33eXtFOWRE' },
  { id: 'ciclismo', label: 'Ciclismo', emoji: '🚴', query: 'música para ciclismo ruta', videoId: 'WKIcALqtWbc' },
  { id: 'crossfit', label: 'CrossFit', emoji: '💪', query: 'música para entrenar crossfit intensa', videoId: 'ClmbRcCfXQY' },
  { id: 'padel', label: 'Pádel', emoji: '🎾', query: 'música para jugar pádel', videoId: 'MnKnCBV8GDU' },
  { id: 'gym', label: 'Gym', emoji: '🏋️', query: 'música para entrenar gym motivación', videoId: 'T45bv_9vTFg' },
  { id: 'general', label: 'General', emoji: '🎵', query: 'música para entrenar motivación', videoId: 'a-EkjVGqXtY' },
]

interface LocalTrack { name: string; url: string; durationMs?: number }

// Extrae de un link de YouTube: {kind:'playlist', id} o {kind:'video', id}.
// Acepta watch?v=, youtu.be/, /embed/, /shorts/, music.youtube.com y &list=.
// También acepta el ID de una playlist pegado suelto (PL…, UU…, OLAK…,
// RD…, LM…) y el list= dentro del fragmento (#list=…): antes esos dos
// casos no se reconocían y la playlist no se abría.
export function parseYouTubeUrl(url: string): { kind: 'playlist' | 'video'; id: string } | null {
  const u = url.trim()
  if (!u) return null
  // ID de playlist pegado suelto, sin link completo.
  if (/^(PL|UU|OLAK|RD|LM)[A-Za-z0-9_-]{6,}$/.test(u)) return { kind: 'playlist', id: u }
  const list = u.match(/[?&#]list=([A-Za-z0-9_-]+)/)
  if (list) return { kind: 'playlist', id: list[1] }
  const v = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/)
  if (v) return { kind: 'video', id: v[1] }
  const short = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)
  if (short) return { kind: 'video', id: short[1] }
  const embed = u.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,})/)
  if (embed) return { kind: 'video', id: embed[1] }
  return null
}

// Embed de respaldo (solo si la API de YouTube no carga): youtube.com,
// video real, NUNCA listType=search en youtube-nocookie (ese no suena).
// Src FIJA por video: antes incluía `playing` (autoplay) y la key del
// iframe también, así que cada toque de Reproducir/Pausa recreaba el
// iframe y el video volvía a empezar desde 0.
function embedSrc(preset: Preset, custom: { kind: 'playlist' | 'video'; id: string } | null): string {
  if (custom?.kind === 'playlist') return `https://www.youtube.com/embed/videoseries?list=${custom.id}&rel=0`
  if (custom?.kind === 'video') return `https://www.youtube.com/embed/${custom.id}?rel=0`
  return `https://www.youtube.com/embed/${preset.videoId}?rel=0`
}

// Link normal de YouTube para abrir en la app / pestaña de YouTube.
function externalUrl(preset: Preset, custom: { kind: 'playlist' | 'video'; id: string } | null): string {
  if (custom?.kind === 'playlist') return `https://www.youtube.com/playlist?list=${custom.id}`
  if (custom?.kind === 'video') return `https://www.youtube.com/watch?v=${custom.id}`
  return `https://www.youtube.com/watch?v=${preset.videoId}`
}

// Cola del extractor: persiste en este teléfono. Por defecto son los
// 7 presets: en modo extractor suenan sin que Luis pegue ningún link.
const YT_QUEUE_KEY = 'pulso_yt_queue'

function defaultYtQueue(): ExtractorTrack[] {
  return MUSIC_PRESETS.map((p) => ({
    id: p.videoId,
    title: `Música para ${p.label.toLowerCase()}`,
    thumbnail: ytThumbnail(p.videoId),
  }))
}

function loadYtQueue(): ExtractorTrack[] {
  try {
    const raw = localStorage.getItem(YT_QUEUE_KEY)
    if (!raw) return defaultYtQueue()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return defaultYtQueue()
    const tracks = parsed.filter(
      (t): t is ExtractorTrack =>
        typeof t === 'object' && t !== null &&
        typeof (t as { id?: unknown }).id === 'string' &&
        typeof (t as { title?: unknown }).title === 'string',
    )
    return tracks.length > 0 ? tracks : defaultYtQueue()
  } catch {
    return defaultYtQueue()
  }
}

type WakeLockSentinel = { release: () => Promise<void> | void }

async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<WakeLockSentinel> } }
    if (!nav.wakeLock) return null
    return await nav.wakeLock.request('screen')
  } catch {
    return null
  }
}

function cleanTrackName(name: string): string {
  return name.replace(/\.(mp3|m4a|wav|ogg|flac|aac)$/i, '').replace(/[_-]+/g, ' ').trim() || name
}

/** Segundos a "m:ss" para la barrita de minutos. */
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Foto de una canción de YouTube (miniatura oficial); si la imagen
 *  falla, queda la inicial del título sobre rosa. */
function TrackThumb({ track, className }: { track: ExtractorTrack | null; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [track?.thumbnail])
  if (!track?.thumbnail || failed) {
    return (
      <div className={`flex shrink-0 items-center justify-center rounded-lg bg-pulso font-black text-night ${className ?? 'h-12 w-20'}`} aria-hidden>
        {track ? track.title.charAt(0).toUpperCase() : '♪'}
      </div>
    )
  }
  return <img src={track.thumbnail} alt="" onError={() => setFailed(true)} className={`shrink-0 rounded-lg object-cover ${className ?? 'h-12 w-20'}`} />
}

/** Barrita de minutos: actual / total, tocable para adelantar. */
function SeekBar({ current, total, onSeek, dark }: { current: number; total: number; onSeek: (frac: number) => void; dark?: boolean }) {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0
  return (
    <div>
      <div
        className={`h-1.5 w-full cursor-pointer rounded-full ${dark ? 'bg-white/20' : 'bg-slate-200'}`}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))) }}
        role="slider"
        aria-label="Adelantar en la canción"
        aria-valuenow={Math.floor(current)}
        aria-valuemax={Math.floor(total)}
      >
        <div className="h-full rounded-full bg-pulso" style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-0.5 flex justify-between text-[11px] ${dark ? 'text-white/60' : 'text-slate-500'}`}>
        <span>{fmtTime(current)}</span>
        <span>{fmtTime(total)}</span>
      </div>
    </div>
  )
}

export interface MusicStatus { playing: boolean; title: string; source: 'youtube' | 'local' }

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => unknown; PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number; CUED: number; BUFFERING: number } }
    onYouTubeIframeAPIReady?: () => void
  }
}

type YTPlayer = {
  playVideo: () => void
  pauseVideo: () => void
  cueVideoById: (id: string) => void
  cuePlaylist: (opts: { list: string }) => void
  loadVideoById: (id: string) => void
  destroy: () => void
}

export default function MusicPlayer({ profileId, compact, expanded, onExpandedChange, onPlayingChange, onGoTrain, immersive }: {
  profileId: string
  compact?: boolean
  // Controlado desde App: la música empieza recogida en mini-barra en
  // todas las pestañas; solo se expande cuando Luis la abre en Entrenar.
  expanded?: boolean
  onExpandedChange?: (v: boolean) => void
  onPlayingChange?: (m: MusicStatus) => void
  onGoTrain?: () => void
  /** Mapa inmersivo abierto: la ▲ abre la hoja del reproductor SOBRE
   *  el mapa (no se sale a Entrenar). MusicPlayer nunca se desmonta:
   *  solo cambia dónde se abre la hoja; el dock sube a z-40 en App
   *  para que la hoja pinte por encima del mapa inmersivo (z-30). */
  immersive?: boolean
}) {
  const [pref, setPref] = useState(() => getMusicPref(profileId))
  const [playing, setPlaying] = useState(false)
  const [customInput, setCustomInput] = useState(() => getMusicPref(profileId).customUrl)
  const [customErr, setCustomErr] = useState('')
  const [keepScreenOn, setKeepScreenOn] = useState(true)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // Al cambiar de pestaña (compact) la hoja se recoge sola a
  // mini-barra: la música sigue sonando, pero no tapa el contenido
  // de la pestaña nueva. En Entrenar solo se expande si Luis la abre.
  useEffect(() => {
    if (compact && expanded) onExpandedChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact])

  // Reproductor local opcional.
  const [source, setSource] = useState<'youtube' | 'local'>('youtube')
  // Sin internet YouTube no suena: se avisa y se ofrece la música local.
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([])
  const [localIndex, setLocalIndex] = useState(0)
  const [localPlaying, setLocalPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Música local NATIVA (app instalada de Android): canciones del
  // teléfono leídas con MediaStore, sin elegirlas una por una.
  // En web nativeMusic es false y no se muestra nada de esto.
  const nativeMusic = deviceMusicSupported()
  const [deviceSongs, setDeviceSongs] = useState<DeviceSong[]>(() => loadCachedDeviceSongs(profileId))
  const [deviceLoaded, setDeviceLoaded] = useState(false)
  const [deviceLoading, setDeviceLoading] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState('')
  const [deviceQuery, setDeviceQuery] = useState('')

  function deviceToTrack(song: DeviceSong): LocalTrack {
    return {
      name: song.artist ? `${song.title} — ${song.artist}` : song.title,
      url: deviceSongUrl(song),
      durationMs: song.durationMs,
    }
  }

  // Al abrir, si ya había una lista de canciones del teléfono guardada
  // (solo metadatos, nunca los archivos), mostrarla sin escanear de
  // nuevo. Las URIs de MediaStore son estables, así que sigue sonando.
  useEffect(() => {
    if (!nativeMusic) return
    const cached = loadCachedDeviceSongs(profileId)
    if (cached.length > 0) {
      setDeviceSongs(cached)
      setLocalTracks(cached.map(deviceToTrack))
      setDeviceLoaded(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reproductor de YouTube (API oficial). El div del reproductor es
  // siempre el PRIMER hijo del componente y nunca se desmonta: en modo
  // compacto solo se hace chiquito, pero sigue visible y sonando.
  const playerDivRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  // Último estado REAL del reproductor de YouTube (-1 = sin empezar).
  // Es la única fuente para decidir si hay que ordenar play/pausa.
  const ytStateRef = useRef<number>(-1)
  // Espejos de `playing` / `localPlaying` para leerlos dentro de
  // efectos y callbacks sin que el closure quede desfasado.
  const playingRef = useRef(false)
  const localPlayingRef = useRef(false)
  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { localPlayingRef.current = localPlaying }, [localPlaying])
  // Reintentos al pausarse el <audio> por fuera (pantalla apagada,
  // foco de audio): como mucho 3 seguidos; al sonar se resetea. Sin
  // tope, un sistema que pausa en bucle reintentaría sin parar.
  const audioResumeTriesRef = useRef(0)
  // Qué video/playlist ya está cargado en el reproductor: el cue solo
  // se hace cuando cambia, nunca al volver de otra pestaña o de local.
  const lastCuedRef = useRef<string | null>(null)
  const [ytReady, setYtReady] = useState(false)
  const [ytPlayerReady, setYtPlayerReady] = useState(false)
  const [ytFailed, setYtFailed] = useState(false)
  const [ytError, setYtError] = useState('')

  // Modo extractor: la cola de YouTube suena por el <audio> con la URL
  // directa del extractor (segundo plano real). 'embed' es el
  // comportamiento de siempre (iframe); se llega ahí solo si el
  // extractor falla, y "Probar de nuevo" vuelve a intentarlo.
  const [ytMode, setYtMode] = useState<'extractor' | 'embed'>('extractor')
  const [ytQueue, setYtQueue] = useState<ExtractorTrack[]>(() => loadYtQueue())
  const [ytQueueIndex, setYtQueueIndex] = useState(0)
  const [ytAudioUrl, setYtAudioUrl] = useState<string | null>(null)
  const [ytResolving, setYtResolving] = useState(false)
  const [ytExtractErr, setYtExtractErr] = useState('')
  // Tiempo del <audio> para la barrita de minutos (modo extractor).
  const [ytTime, setYtTime] = useState({ current: 0, duration: 0 })
  // Para qué video ya se resolvió ytAudioUrl (resolver perezoso).
  const ytResolvedForRef = useRef<string | null>(null)
  // Espejos de `source` / `ytMode` para los handlers del <audio>.
  const sourceRef = useRef<'youtube' | 'local'>('youtube')
  const ytModeRef = useRef<'extractor' | 'embed'>('extractor')
  useEffect(() => { sourceRef.current = source }, [source])
  useEffect(() => { ytModeRef.current = ytMode }, [ytMode])

  const preset = MUSIC_PRESETS.find((p) => p.id === pref.presetId) || MUSIC_PRESETS[MUSIC_PRESETS.length - 1]
  const custom = parseYouTubeUrl(pref.customUrl)
  const useCustom = pref.customUrl.trim() !== '' && custom !== null
  const title = useCustom ? (pref.customLabel || 'Mi playlist de YouTube') : `Música para ${preset.label.toLowerCase()}`
  const currentLocal = localTracks[localIndex] || null
  const anyPlaying = playing || localPlaying
  // En modo extractor la canción que suena es la de la cola.
  const ytExtractorActive = source === 'youtube' && ytMode === 'extractor'
  const ytCurrent = ytQueue[ytQueueIndex] ?? null
  const statusTitle = source === 'local' && currentLocal
    ? cleanTrackName(currentLocal.name)
    : ytExtractorActive && ytCurrent ? ytCurrent.title : title
  const playingTitle = `PULSO — ${statusTitle}`
  // Título CORTO para la mini-barra: el título completo ("Música para
  // correr…") se cortaba como "Músic…" porque no cabe junto al play,
  // la miniatura y los botones. En la mini-barra basta el deporte o el
  // nombre de la canción; el título completo sigue en la hoja y en
  // Media Session.
  const miniTitle = source === 'local' && currentLocal
    ? cleanTrackName(currentLocal.name)
    : ytExtractorActive && ytCurrent ? ytCurrent.title
    : useCustom ? 'Mi playlist' : preset.label

  // Avisar arriba (App) para la mini-barra / barrita de actividad.
  useEffect(() => {
    onPlayingChange?.({ playing: anyPlaying, title: statusTitle, source })
  }, [anyPlaying, statusTitle, source, onPlayingChange])

  // Cargar la API de YouTube una sola vez.
  useEffect(() => {
    if (window.YT?.Player) { setYtReady(true); return }
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); setYtReady(true) }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      s.onerror = () => setYtFailed(true)
      document.head.appendChild(s)
    }
    const t = setTimeout(() => { if (!window.YT?.Player) setYtFailed(true) }, 10000)
    return () => clearTimeout(t)
  }, [])

  // Crear el reproductor de YouTube cuando la API está lista.
  useEffect(() => {
    if (!ytReady || ytFailed || playerRef.current || !playerDivRef.current || !window.YT) return
    try {
      const player = new window.YT.Player(playerDivRef.current, {
        width: '100%',
        height: '100%',
        videoId: preset.videoId,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onReady: () => setYtPlayerReady(true),
          onStateChange: (e: { data: number }) => {
            const st = window.YT?.PlayerState
            if (!st) return
            ytStateRef.current = e.data
            // El iframe sigue montado y cargado aunque en modo
            // extractor esté oculto y nunca suene: sus cambios de
            // estado NO deben tocar `playing`, porque apagan el
            // servicio en primer plano y matan el stream del
            // extractor (pantalla apagada, build 37). Solo en modo
            // embed el iframe es la fuente que suena.
            if (sourceRef.current !== 'youtube' || ytModeRef.current !== 'embed') return
            // BUFFERING (3): no tocar `playing`, el video sigue en el
            // mismo punto y solo está cargando. CUED (5) y UNSTARTED
            // (-1): el video está parado en 0, así que el botón debe
            // decir Reproducir, no Pausa. Antes cualquier estado
            // distinto de PLAYING que no fuera PAUSED/ENDED dejaba el
            // botón desfasado del audio real.
            if (e.data === st.PLAYING) setPlaying(true)
            else if (e.data === st.PAUSED || e.data === st.ENDED || e.data === st.CUED || e.data === -1) setPlaying(false)
          },
          onError: (e: { data: number }) => {
            // En modo extractor el iframe no suena: su error no es
            // error del audio y no debe parar nada.
            if (sourceRef.current !== 'youtube' || ytModeRef.current !== 'embed') return
            setPlaying(false)
            setYtError(e.data === 101 || e.data === 150
              ? 'Este video no permite verse incrustado. Ábrelo en YouTube con el botón de abajo.'
              : 'YouTube no pudo reproducir este video aquí. Ábrelo en YouTube con el botón de abajo.')
          },
        },
      }) as unknown as YTPlayer
      playerRef.current = player
    } catch {
      setYtFailed(true)
    }
    return () => {
      try { playerRef.current?.destroy() } catch { /* noop */ }
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytReady, ytFailed])

  // Cargar el video/playlist que toca (preset o link del usuario).
  // SOLO en modo embed: en modo extractor el iframe nunca suena y
  // la cola va por el <audio>.
  // SOLO cuando cambia el video: antes se hacía cueVideoById cada vez
  // que cambiaba la fuente o se re-activaba el reproductor, y el video
  // volvía a empezar desde 0 al volver de música local o de otra
  // pestaña. `lastCuedRef` recuerda qué video ya está cargado.
  useEffect(() => {
    if (!ytPlayerReady || !playerRef.current || source !== 'youtube' || ytMode !== 'embed') return
    const target = custom?.kind === 'playlist' ? `playlist:${custom.id}` : custom?.kind === 'video' ? `video:${custom.id}` : `video:${preset.videoId}`
    if (lastCuedRef.current === target) return
    lastCuedRef.current = target
    setYtError('')
    const wasPlaying = playingRef.current
    try {
      if (custom?.kind === 'playlist') playerRef.current.cuePlaylist({ list: custom.id })
      else if (custom?.kind === 'video') playerRef.current.cueVideoById(custom.id)
      else playerRef.current.cueVideoById(preset.videoId)
      // cue deja el video en pausa en 0: sincronizar el botón.
      ytStateRef.current = window.YT?.PlayerState?.CUED ?? 5
      setPlaying(false)
      if (wasPlaying) playerRef.current.playVideo()
    } catch {
      setYtFailed(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytPlayerReady, preset.id, custom?.kind, custom?.id, source, ytMode])

  // Play / pausa de YouTube (la API lo controla, sin recargar el iframe).
  // Solo en modo embed: en modo extractor el play/pausa es del <audio>.
  // Solo se ordena cuando el estado deseado difiere del estado real del
  // reproductor: antes cada cambio de `playing` —incluidos los que venían
  // del propio onStateChange— volvía a llamar a playVideo/pauseVideo.
  useEffect(() => {
    if (!ytPlayerReady || !playerRef.current || source !== 'youtube' || ytMode !== 'embed') return
    const st = window.YT?.PlayerState
    if (!st) return
    try {
      if (playing && ytStateRef.current !== st.PLAYING) playerRef.current.playVideo()
      else if (!playing && ytStateRef.current === st.PLAYING) playerRef.current.pauseVideo()
    } catch { /* noop */ }
  }, [playing, ytPlayerReady, source, ytMode])

  // Al pasar a música local, pausar YouTube (solo en modo embed: en
  // modo extractor el iframe nunca suena).
  useEffect(() => {
    if (source === 'local' && ytMode === 'embed') {
      try { playerRef.current?.pauseVideo() } catch { /* noop */ }
    }
  }, [source, ytMode])

  // Mantener pantalla encendida mientras suena. Fallback silencioso.
  useEffect(() => {
    if (!anyPlaying || !keepScreenOn) {
      void Promise.resolve(wakeLockRef.current?.release()).catch(() => undefined)
      wakeLockRef.current = null
      return
    }
    let cancelled = false
    requestWakeLock().then((lock) => {
      if (cancelled) { void Promise.resolve(lock?.release()).catch(() => undefined); return }
      wakeLockRef.current = lock
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock().then((lock) => { wakeLockRef.current = lock })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void Promise.resolve(wakeLockRef.current?.release()).catch(() => undefined)
      wakeLockRef.current = null
    }
  }, [anyPlaying, keepScreenOn])

  // Música en segundo plano (solo app nativa): mientras suena, se
  // mantiene el servicio en primer plano "PULSO · Sonando" para que
  // Android no duerma la WebView al salir de la app o apagar la
  // pantalla. Al pausar, el servicio se para. ANTES no había servicio
  // y la música se cortaba al salir de la app: el Wake Lock solo
  // funciona con la pantalla encendida y la app visible.
  useEffect(() => {
    if (!anyPlaying) { void stopAudioService(); return }
    void startAudioService(statusTitle)
    return () => { void stopAudioService() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPlaying, statusTitle])

  // Sesión de medios NATIVA (pantalla de bloqueo / ajustes rápidos):
  // título, artista y estado del audio y del servicio. Sin esto el
  // teléfono no muestra controles (build 37). Se manda también en
  // pausa para que la tarjeta de medios ofrezca reanudar.
  useEffect(() => {
    void updateMedia(statusTitle, source === 'local' ? 'PULSO · Música local' : 'PULSO', anyPlaying)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTitle, anyPlaying, source])

  // Botones de la notificación de medios (bloqueo): play/pausa/
  // anterior/siguiente llegan desde el plugin nativo.
  const mediaActionRef = useRef<(action: MediaControlAction) => void>(() => undefined)
  useEffect(() => {
    mediaActionRef.current = (action: MediaControlAction) => {
      if (action === 'play') {
        if (sourceRef.current === 'local') setLocalPlaying(true)
        else setPlaying(true)
      } else if (action === 'pause') {
        setLocalPlaying(false)
        setPlaying(false)
      } else if (action === 'next') {
        if (sourceRef.current === 'local' && localTracks.length > 1) playLocal((localIndex + 1) % localTracks.length)
        else if (ytExtractorActive && ytQueue.length > 1) playYtTrack((ytQueueIndex + 1) % ytQueue.length)
      } else if (action === 'previous') {
        if (sourceRef.current === 'local' && localTracks.length > 1) playLocal((localIndex - 1 + localTracks.length) % localTracks.length)
        else if (ytExtractorActive && ytQueue.length > 1) playYtTrack((ytQueueIndex - 1 + ytQueue.length) % ytQueue.length)
      }
    }
  })
  useEffect(() => {
    let handle: { remove: () => Promise<void> } | null = null
    let cancelled = false
    void addMediaControlListener((action) => { mediaActionRef.current(action) }).then((h) => {
      if (cancelled) { void h?.remove(); return }
      handle = h
    })
    return () => { cancelled = true; void handle?.remove() }
  }, [])

  // Media Session (YouTube, modo embed).
  useEffect(() => {
    if (source !== 'youtube' || ytMode !== 'embed') return
    const ms = navigator.mediaSession
    if (!ms) return
    if (!playing) {
      ms.metadata = null
      return
    }
    try {
      ms.metadata = new MediaMetadata({
        title: playingTitle,
        artist: 'PULSO',
        album: 'Entrena con pulso',
        artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      })
      ms.setActionHandler('play', () => setPlaying(true))
      ms.setActionHandler('pause', () => setPlaying(false))
    } catch { /* noop */ }
    return () => {
      try { ms.setActionHandler('play', null); ms.setActionHandler('pause', null) } catch { /* noop */ }
    }
  }, [playing, playingTitle, source, ytMode])

  // Si el extractor falla, se cae al embed como antes y se avisa:
  // "Probar de nuevo" vuelve a intentar el extractor.
  function fallbackToEmbed(reason: string) {
    setYtExtractErr(reason)
    setYtAudioUrl(null)
    ytResolvedForRef.current = null
    setYtMode('embed')
  }

  function retryExtractor() {
    setYtExtractErr('')
    setYtAudioUrl(null)
    ytResolvedForRef.current = null
    setYtMode('extractor')
  }

  // La cola se guarda en este teléfono al cambiar.
  useEffect(() => {
    try { localStorage.setItem(YT_QUEUE_KEY, JSON.stringify(ytQueue)) } catch { /* noop */ }
  }, [ytQueue])

  // Si la cola se acorta (borrar), el índice no se sale de rango.
  useEffect(() => {
    if (ytQueueIndex >= ytQueue.length) setYtQueueIndex(Math.max(0, ytQueue.length - 1))
  }, [ytQueue, ytQueueIndex])

  // Resolver perezoso: solo la canción que suena pide su URL directa
  // de audio al extractor. Si falla, se cae al embed.
  useEffect(() => {
    if (!ytExtractorActive) return
    const track = ytCurrent
    if (!track) { setYtAudioUrl(null); setPlaying(false); return }
    if (ytResolvedForRef.current === track.id && ytAudioUrl) return
    let cancelled = false
    setYtResolving(true)
    setYtExtractErr('')
    resolveVideo(track.id)
      .then((r) => {
        if (cancelled) return
        ytResolvedForRef.current = track.id
        setYtAudioUrl(r.url)
        if (r.title && r.title !== track.title) {
          setYtQueue((q) => q.map((t) => (t.id === track.id ? { ...t, title: r.title, durationSec: r.durationSec ?? t.durationSec } : t)))
        }
        setYtResolving(false)
      })
      .catch(() => {
        if (cancelled) return
        setYtResolving(false)
        fallbackToEmbed('El extractor no respondió. Suena el video embebido como antes; toca "Probar de nuevo" para reintentarlo.')
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytExtractorActive, ytCurrent?.id])

  // Media Session (extractor): la cola suena por <audio>; la pantalla
  // de bloqueo muestra la canción actual con su foto y los controles.
  useEffect(() => {
    if (!ytExtractorActive) return
    const ms = navigator.mediaSession
    if (!ms) return
    if (!ytCurrent) {
      try { ms.metadata = null } catch { /* noop */ }
      return
    }
    try {
      ms.metadata = new MediaMetadata({
        title: ytCurrent.title,
        artist: 'PULSO',
        album: 'Entrena con pulso',
        artwork: ytCurrent.thumbnail
          ? [{ src: ytCurrent.thumbnail, sizes: '120x90', type: 'image/jpeg' }]
          : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      })
      ms.setActionHandler('play', () => setPlaying(true))
      ms.setActionHandler('pause', () => setPlaying(false))
      ms.setActionHandler('previoustrack', () => playYtTrack((ytQueueIndex - 1 + ytQueue.length) % ytQueue.length))
      ms.setActionHandler('nexttrack', () => playYtTrack((ytQueueIndex + 1) % ytQueue.length))
    } catch { /* noop */ }
    return () => {
      try {
        ms.setActionHandler('play', null); ms.setActionHandler('pause', null)
        ms.setActionHandler('previoustrack', null); ms.setActionHandler('nexttrack', null)
      } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytExtractorActive, ytCurrent?.id, ytQueueIndex, ytQueue.length])

  // Media Session (local): controles de la pantalla de bloqueo /
  // notificación (play, pausa, anterior, siguiente).
  // ANTES, al pausar se borraba el metadata (ms.metadata = null) y
  // el efecto salía sin registrar los handlers: la notificación de
  // la pantalla de bloqueo perdía la canción y los botones, y ya no
  // se podía reanudar ni cambiar de canción desde ahí (había que
  // volver a abrir la app). Ahora el metadata y los 4 handlers
  // quedan registrados mientras haya una canción cargada (suene o
  // no), así la pantalla de bloqueo siempre responde. Solo se
  // limpian cuando no hay canción o se cambia a YouTube.
  useEffect(() => {
    if (source !== 'local') return
    const ms = navigator.mediaSession
    if (!ms) return
    if (!currentLocal) {
      try { ms.metadata = null } catch { /* noop */ }
      return
    }
    try {
      ms.metadata = new MediaMetadata({
        title: cleanTrackName(currentLocal.name),
        artist: 'PULSO · Música local',
        album: 'Entrena con pulso',
        artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      })
      ms.setActionHandler('play', () => { void audioRef.current?.play().catch(() => undefined) })
      ms.setActionHandler('pause', () => audioRef.current?.pause())
      ms.setActionHandler('previoustrack', () => playLocal((localIndex - 1 + localTracks.length) % localTracks.length))
      ms.setActionHandler('nexttrack', () => playLocal((localIndex + 1) % localTracks.length))
    } catch { /* noop */ }
    return () => {
      try {
        ms.setActionHandler('play', null); ms.setActionHandler('pause', null)
        ms.setActionHandler('previoustrack', null); ms.setActionHandler('nexttrack', null)
      } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPlaying, localIndex, source, currentLocal])

  // Liberar las URLs locales al desmontar (son solo de esta sesión).
  useEffect(() => () => {
    localTracks.forEach((t) => URL.revokeObjectURL(t.url))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update(next: Partial<{ presetId: string; customUrl: string; customLabel: string }>) {
    const merged = { ...pref, ...next }
    setPref(merged)
    saveMusicPref(profileId, merged)
  }

  // Agregar un link de YouTube: en modo embed se guarda y suena el
  // embed como antes; en modo extractor el link se agrega a la cola
  // (video: se resuelve y se agrega; playlist: se agregan todos sus
  // videos). El link también se guarda en el pref, así el embed sigue
  // teniendo qué sonar si el extractor falla.
  async function saveCustom() {
    const parsed = parseYouTubeUrl(customInput)
    if (!parsed) {
      setCustomErr('Ese link no parece de YouTube. Pega el link completo de un video o una playlist de YouTube.')
      return
    }
    setCustomErr('')
    update({ customUrl: customInput.trim(), customLabel: parsed.kind === 'playlist' ? 'Mi playlist de YouTube' : 'Mi video de YouTube' })
    if (ytMode !== 'extractor' || source !== 'youtube') {
      // En modo embed el video también entra a la cola (la playlist
      // no: sus videos solo se conocen resolviéndola con el extractor).
      if (parsed.kind === 'video') {
        addYtTrack({ id: parsed.id, title: 'Mi video de YouTube', thumbnail: ytThumbnail(parsed.id) })
      } else {
        setPlaying(true)
      }
      return
    }
    setYtResolving(true)
    try {
      if (parsed.kind === 'video') {
        const r = await resolveVideo(parsed.id)
        addYtTrack({ id: parsed.id, title: r.title, durationSec: r.durationSec, thumbnail: ytThumbnail(parsed.id) })
      } else {
        const tracks = await listPlaylist(parsed.id)
        if (tracks.length === 0) {
          setCustomErr('Esa playlist no tiene videos que se puedan agregar.')
          return
        }
        const have = new Set(ytQueue.map((t) => t.id))
        const fresh = tracks.filter((t) => !have.has(t.id))
        if (fresh.length === 0) {
          const at = ytQueue.findIndex((t) => t.id === tracks[0].id)
          if (at >= 0) playYtTrack(at)
          return
        }
        setYtQueue([...ytQueue, ...fresh])
        setYtQueueIndex(ytQueue.length)
        setPlaying(true)
      }
    } catch {
      fallbackToEmbed('El extractor no respondió al agregar tu link. Suena el video embebido como antes; toca "Probar de nuevo" para reintentarlo.')
      setPlaying(true)
    } finally {
      setYtResolving(false)
    }
  }

  // Pide el permiso de Música y audio y lee las canciones del teléfono
  // (solo en la app nativa). La lista queda guardada en este teléfono.
  async function loadDeviceSongs() {
    setDeviceLoading(true)
    setDeviceStatus('Buscando tus canciones…')
    const songs = await listDeviceSongs()
    setDeviceLoading(false)
    if (songs.length === 0) {
      const granted = await hasDeviceMusicPermission()
      setDeviceStatus(granted
        ? 'No se encontró música en este teléfono (se listan canciones de más de 30 segundos).'
        : 'Sin permiso de Música y audio. Actívalo en Ajustes → PULSO → Permisos → Música y audio.')
      return
    }
    setDeviceSongs(songs)
    saveCachedDeviceSongs(profileId, songs)
    setLocalTracks(songs.map(deviceToTrack))
    setLocalIndex(0)
    setSource('local')
    setPlaying(false)
    setLocalPlaying(true)
    setDeviceLoaded(true)
    setDeviceStatus(`${songs.length} canciones encontradas en tu teléfono.`)
  }

  function pickLocalFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    localTracks.forEach((t) => URL.revokeObjectURL(t.url))
    const tracks: LocalTrack[] = Array.from(files)
      .filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name))
      .map((f) => ({ name: f.name, url: URL.createObjectURL(f) }))
    if (tracks.length === 0) {
      setCustomErr('No se encontró ningún archivo de audio en esa selección. Elige MP3 u otro audio de tu teléfono.')
      return
    }
    setCustomErr('')
    setLocalTracks(tracks)
    setLocalIndex(0)
    setSource('local')
    setPlaying(false)
    setLocalPlaying(true)
  }

  function playLocal(index: number) {
    if (localTracks.length === 0) return
    setLocalIndex(index)
    setLocalPlaying(true)
  }

  // Cola de YouTube: sonar una canción. En modo extractor va por el
  // <audio> con la URL resuelta; en modo embed la canción se pone como
  // video personalizado y el efecto de cue del iframe la carga y la
  // reproduce. `trackOverride` es para agregar: la canción aún no está
  // en `ytQueue` cuando se llama.
  function playYtTrack(index: number, trackOverride?: ExtractorTrack) {
    const track = trackOverride ?? ytQueue[index]
    if (!track) return
    if (ytMode !== 'extractor' || source !== 'youtube') {
      if (index !== ytQueueIndex) setYtQueueIndex(index)
      update({ customUrl: `https://www.youtube.com/watch?v=${track.id}`, customLabel: track.title })
      setPlaying(true)
      return
    }
    if (ytQueue.length === 0) return
    if (index !== ytQueueIndex) {
      setYtQueueIndex(index)
      setYtAudioUrl(null)
      ytResolvedForRef.current = null
    }
    setPlaying(true)
  }

  function addYtTrack(track: ExtractorTrack) {
    const at = ytQueue.findIndex((t) => t.id === track.id)
    if (at >= 0) { playYtTrack(at); return }
    const index = ytQueue.length
    setYtQueue([...ytQueue, track])
    setYtQueueIndex(index)
    playYtTrack(index, track)
  }

  function removeYtTrack(index: number) {
    const currentId = ytCurrent?.id
    const next = ytQueue.filter((_, i) => i !== index)
    setYtQueue(next)
    let newIndex = ytQueueIndex
    if (index < ytQueueIndex) newIndex = ytQueueIndex - 1
    else if (index === ytQueueIndex && ytQueueIndex >= next.length) newIndex = Math.max(0, next.length - 1)
    setYtQueueIndex(newIndex)
    // Si cambió la canción que sonaba, hay que resolver de nuevo.
    if (next[newIndex]?.id !== currentId) {
      setYtAudioUrl(null)
      ytResolvedForRef.current = null
    }
    // En modo embed la canción que suena es la del pref: si se borró
    // la que sonaba, se pone en cola la que quedó como actual.
    if (ytMode !== 'extractor' && source === 'youtube' && index === ytQueueIndex && next[newIndex]) {
      const t = next[newIndex]
      update({ customUrl: `https://www.youtube.com/watch?v=${t.id}`, customLabel: t.title })
      setPlaying(true)
    }
  }

  function moveYtTrack(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= ytQueue.length) return
    const next = [...ytQueue]
    const tmp = next[index]
    next[index] = next[j]
    next[j] = tmp
    setYtQueue(next)
    if (ytQueueIndex === index) setYtQueueIndex(j)
    else if (ytQueueIndex === j) setYtQueueIndex(index)
  }

  // Un preset en modo extractor: si ya está en la cola salta a él; si
  // no, entra después de la canción actual y suena. El preset también
  // se guarda en el pref, así el embed lo tiene si hace falta.
  function tapPreset(p: Preset) {
    update({ presetId: p.id, customUrl: '' })
    setCustomInput('')
    if (ytMode !== 'extractor' || source !== 'youtube') return
    const at = ytQueue.findIndex((t) => t.id === p.videoId)
    if (at >= 0) { playYtTrack(at); return }
    const track: ExtractorTrack = { id: p.videoId, title: `Música para ${p.label.toLowerCase()}`, thumbnail: ytThumbnail(p.videoId) }
    const pos = ytQueue.length === 0 ? 0 : ytQueueIndex + 1
    const next = [...ytQueue]
    next.splice(pos, 0, track)
    setYtQueue(next)
    setYtQueueIndex(pos)
    setPlaying(true)
  }

  /** Adelantar en la canción del extractor (barrita de minutos). */
  function seekYt(frac: number) {
    const audio = audioRef.current
    const total = ytTime.duration
    if (!audio || !total) return
    const t = Math.min(1, Math.max(0, frac)) * total
    audio.currentTime = t
    setYtTime((prev) => ({ ...prev, current: t }))
  }

  // Cuando cambia la canción local, el <audio> ya tiene el nuevo src por
  // render; al pasar a playing se reproduce en el efecto de abajo.
  // El <audio> vive siempre montado (fuera de los condicionales) para
  // que no se corte al cambiar de pestaña o de modo. En modo extractor
  // el MISMO <audio> suena la cola de YouTube con la URL resuelta.
  // Si el audio aún no cargó el nuevo src (readyState < 2), NO se llama
  // a play(): antes su rechazo ponía localPlaying=false aunque el
  // usuario había dado a Reproducir, y el botón quedaba desfasado. En
  // ese caso arranca solo al dispararse onCanPlay.
  // SOLO UNA FUENTE SUENA A LA VEZ (bug 2026-11-19): este efecto NO
  // debe salir antes de pausar cuando no toca sonar. Antes el
  // `if (source !== 'local') return` hacía que al cambiar a YouTube el
  // <audio> local siguiera sonando con localPlaying=false: la
  // mini-barra mostraba "En pausa · YouTube" mientras sonaba la música
  // local, y al darle play a YouTube sonaban las dos juntas. Ahora
  // cualquier estado en el que no toca sonar pausa el elemento.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const shouldPlayLocal = source === 'local' && localPlaying && currentLocal
    const shouldPlayYt = ytExtractorActive && playing && ytAudioUrl
    if (shouldPlayLocal || shouldPlayYt) {
      if (audio.readyState >= 2 && !audio.paused) return
      if (audio.readyState >= 2) void audio.play().catch(() => undefined)
    } else {
      audio.pause()
    }
  }, [localPlaying, localIndex, source, currentLocal, playing, ytAudioUrl, ytExtractorActive])

  // Solo una fuente suena a la vez: al cambiar de fuente se pausa la
  // otra DE INMEDIATO (además del efecto del <audio> y del de YouTube),
  // para que nunca suenen local y YouTube juntas ni la mini-barra se
  // quede mostrando la fuente equivocada.
  function switchSource(next: 'youtube' | 'local') {
    if (next === 'youtube') {
      try { audioRef.current?.pause() } catch { /* noop */ }
      setLocalPlaying(false)
    } else {
      try { playerRef.current?.pauseVideo() } catch { /* noop */ }
      setPlaying(false)
    }
    setSource(next)
  }

  function togglePlay() {
    if (source === 'local') setLocalPlaying(!localPlaying)
    // Sin canción en la cola del extractor no hay nada que sonar.
    else if (ytExtractorActive && !ytCurrent) return
    else setPlaying(!playing)
  }

  // Div del reproductor de YouTube: UN SOLO nodo, siempre el mismo,
  // siempre montado como primer hijo de la raíz. En mini-barra y en la
  // hoja expandida el video es solo una MINIATURA (h-12/h-24): antes
  // en la hoja ocupaba todo el ancho en 16:9 y tapaba la sección.
  // Con música local se oculta en la hoja (el audio es lo que suena);
  // en mini-barra el nodo sigue montado para que no se recargue.
  const ytPlayer = ytFailed ? (
    <iframe
      key={useCustom ? 'custom-' + pref.customUrl : 'preset-' + preset.id}
      className={ytExtractorActive ? 'hidden' : !expanded ? 'h-12 w-20 shrink-0 rounded-lg' : source === 'local' ? 'hidden' : 'h-24 w-40 shrink-0 rounded-lg bg-slate-900'}
      src={embedSrc(preset, custom)}
      title={useCustom ? pref.customLabel : `YouTube: ${preset.label}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  ) : (
    <div
      ref={playerDivRef}
      className={ytExtractorActive ? 'hidden' : !expanded
        ? 'h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900'
        : source === 'local' ? 'hidden'
        : 'h-24 w-40 shrink-0 overflow-hidden rounded-lg bg-slate-900'}
    />
  )

  // Presets y campo de link: iguales en modo extractor y en modo embed
  // (en extractor, el preset salta a la cola y el link se agrega).
  const presetButtons = (
    <div className="flex flex-wrap gap-2">
      {MUSIC_PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => tapPreset(p)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${!useCustom && pref.presetId === p.id ? 'bg-teal text-white' : 'bg-sage-100 text-teal-dark'}`}
        >
          {p.emoji} {p.label}
        </button>
      ))}
    </div>
  )

  const customField = (
    <>
      <Field label="Tu playlist de YouTube (opcional)">
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Pega aquí el link de tu playlist o video"
            inputMode="url"
          />
          <Btn variant="teal" onClick={() => void saveCustom()}>Usar</Btn>
        </div>
      </Field>
      {customErr && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{customErr}</p>}
      {useCustom && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">Tu playlist queda guardada en este teléfono.</p>}
    </>
  )

  // La cola se ve en AMBOS modos (extractor y embed): antes solo
  // estaba en la rama del extractor y al caer al embed desaparecía
  // por completo. Tocar una fila suena esa canción en el modo que
  // esté activo (playYtTrack ramifica); ↑ ↓ ✕ y el guardado en el
  // teléfono son los mismos en los dos modos.
  const ytQueueList = ytQueue.length === 0 ? (
    <p className="rounded-xl bg-sage-100 p-2 text-sm text-slate-600">Tu lista está vacía. Agrega una canción con el link de abajo o toca un preset.</p>
  ) : (
    <div className="space-y-1">
      {ytQueue.map((t, i) => (
        <div key={t.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${i === ytQueueIndex ? 'bg-teal/10 font-bold text-teal-dark' : 'bg-sage-50 text-slate-700'}`}>
          <TrackThumb track={t} className="h-9 w-9" />
          <button onClick={() => playYtTrack(i)} className="min-w-0 flex-1 truncate text-left">
            {i === ytQueueIndex ? '▶ ' : ''}{t.title}
          </button>
          {t.durationSec ? <span className="shrink-0 text-xs text-slate-400">{fmtTime(t.durationSec)}</span> : null}
          <button onClick={() => moveYtTrack(i, -1)} disabled={i === 0} aria-label="Subir en la lista" className="shrink-0 px-1 text-base disabled:opacity-30">↑</button>
          <button onClick={() => moveYtTrack(i, 1)} disabled={i === ytQueue.length - 1} aria-label="Bajar en la lista" className="shrink-0 px-1 text-base disabled:opacity-30">↓</button>
          <button onClick={() => removeYtTrack(i)} aria-label="Quitar de la lista" className="shrink-0 px-1 text-base">✕</button>
        </div>
      ))}
    </div>
  )

  // Una sola raíz y el div de YouTube siempre como primer hijo: al
  // pasar de mini-barra a hoja (y al revés) React conserva el mismo
  // nodo DOM y el reproductor NO se recarga ni se corta.
  // La hoja expandida es BAJA: max-h-[40vh] con scroll interno, y el
  // video es solo una miniatura. Antes era 62vh con video 16:9 a todo
  // lo ancho y tapaba la sección completa. Por defecto todo es
  // mini-barra (también en Entrenar); la hoja solo se abre al tocar ▲.
  return (
    <div className={!expanded
      ? 'flex items-center gap-2 rounded-2xl bg-night px-2 py-2 text-white shadow-xl shadow-night/40'
      : 'max-h-[40vh] overflow-y-auto rounded-t-3xl border border-slate-100 bg-white p-3 shadow-xl shadow-night/20'}>
      {ytPlayer}
      {ytExtractorActive && <TrackThumb track={ytCurrent} className="h-12 w-12" />}
      {!expanded ? (
        <>
          <button
            onClick={togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pulso text-lg font-black text-night"
            aria-label={anyPlaying ? 'Pausar música' : 'Reproducir música'}
          >
            {anyPlaying ? '⏸' : '▶'}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">🎵 {miniTitle}</p>
            <p className="truncate text-xs text-white/60">{anyPlaying ? 'Sonando…' : 'En pausa'} · {source === 'local' ? 'Música local' : ytExtractorActive ? 'YouTube · extractor' : 'YouTube'}{ytResolving ? ' · Resolviendo…' : ''}</p>
            {ytExtractorActive && ytCurrent && (
              <SeekBar current={ytTime.current} total={ytTime.duration || ytCurrent.durationSec || 0} onSeek={seekYt} dark />
            )}
          </div>
          {source === 'local' && localTracks.length > 1 && (
            <>
              <button
                onClick={() => playLocal((localIndex - 1 + localTracks.length) % localTracks.length)}
                className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-sm font-bold"
                aria-label="Canción anterior"
              >
                ⏮
              </button>
              <button
                onClick={() => playLocal((localIndex + 1) % localTracks.length)}
                className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-sm font-bold"
                aria-label="Siguiente canción"
              >
                ⏭
              </button>
            </>
          )}
          {source === 'youtube' && ytQueue.length > 1 && (
            <>
              <button
                onClick={() => playYtTrack((ytQueueIndex - 1 + ytQueue.length) % ytQueue.length)}
                className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-sm font-bold"
                aria-label="Canción anterior"
              >
                ⏮
              </button>
              <button
                onClick={() => playYtTrack((ytQueueIndex + 1) % ytQueue.length)}
                className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-sm font-bold"
                aria-label="Siguiente canción"
              >
                ⏭
              </button>
            </>
          )}
          <button
            onClick={() => { if (immersive || !compact) onExpandedChange?.(true); else onGoTrain?.() }}
            className="shrink-0 rounded-full bg-white/10 px-2.5 py-2 text-xs font-bold"
            aria-label="Expandir reproductor"
          >
            ▲
          </button>
          {/* Sin botón "Entrenar →" en la mini-barra: la ▲ ya lleva a
              Entrenar en las demás pestañas, y ese botón robaba el
              espacio del título, que se cortaba como "Músic…". En el
              mapa inmersivo la ▲ abre la hoja sobre el mapa (no se
              sale de Sesiones). */}
        </>
      ) : (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold">🎵 Música para entrenar</h3>
            <button
              onClick={() => onExpandedChange?.(false)}
              className="shrink-0 rounded-full bg-night-100 px-3 py-1.5 text-xs font-bold text-teal-dark"
              aria-label="Recoger reproductor"
            >
              ▼ Recoger
            </button>
          </div>
          <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-600">
            Sigue sonando al cambiar de pestaña y al salir de la app: mientras suena, la app mantiene un servicio en primer plano (verás la notificación "PULSO · Sonando"). Con la pantalla apagada, la música local sigue; YouTube puede pausarse: para mayor seguridad ábrela en YouTube con Premium.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => switchSource('youtube')}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${source === 'youtube' ? 'bg-teal text-white' : 'bg-sage-100 text-teal-dark'}`}
            >
              ▶ YouTube
            </button>
            <button
              onClick={() => switchSource('local')}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${source === 'local' ? 'bg-teal text-white' : 'bg-sage-100 text-teal-dark'}`}
            >
              📱 Música local
            </button>
          </div>

          {source === 'youtube' ? (
            <>
              {!online && (
                <p className="rounded-xl bg-amber-50 p-2 text-sm font-semibold text-amber-800">
                  📶 Sin internet: YouTube no suena. Cambia a 📱 Música local, que sí funciona sin datos.
                </p>
              )}
              {ytMode === 'extractor' ? (
                <>
                  <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">
                    Suena por el extractor: audio directo en segundo plano, con la pantalla apagada. Tu lista se guarda en este teléfono.
                  </p>
                  {ytResolving && <p className="rounded-xl bg-sage-100 p-2 text-sm text-slate-600">Resolviendo audio…</p>}
                  {ytCurrent && (
                    <div className="space-y-2 rounded-xl bg-sage-100 p-3">
                      <div className="flex items-center gap-3">
                        <TrackThumb track={ytCurrent} className="h-14 w-14" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{ytCurrent.title}</p>
                          <p className="text-xs text-slate-500">
                            {ytQueueIndex + 1} de {ytQueue.length} · {playing ? 'Sonando…' : 'En pausa'}{ytResolving ? ' · Resolviendo audio…' : ''}
                          </p>
                        </div>
                      </div>
                      <SeekBar current={ytTime.current} total={ytTime.duration || ytCurrent.durationSec || 0} onSeek={seekYt} />
                      <div className="flex gap-2">
                        <Btn variant="ghost" className="flex-1" onClick={() => playYtTrack((ytQueueIndex - 1 + ytQueue.length) % ytQueue.length)} disabled={ytQueue.length < 2}>⏮ Anterior</Btn>
                        <Btn variant={playing ? 'ghost' : 'coral'} className="flex-1" onClick={() => setPlaying(!playing)}>
                          {playing ? '⏸ Pausa' : '▶ Reproducir'}
                        </Btn>
                        <Btn variant="ghost" className="flex-1" onClick={() => playYtTrack((ytQueueIndex + 1) % ytQueue.length)} disabled={ytQueue.length < 2}>Siguiente ⏭</Btn>
                      </div>
                    </div>
                  )}

                  {ytQueueList}

                  {presetButtons}
                  <div className="flex items-center gap-2">
                    <Btn variant="teal" className="flex-1" onClick={() => void openExternalUrl(ytCurrent ? `https://www.youtube.com/watch?v=${ytCurrent.id}` : externalUrl(preset, custom))}>
                      ▶ Abrir en YouTube
                    </Btn>
                  </div>
                  {customField}
                </>
              ) : (
                <>
                  {ytExtractErr && (
                    <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-800">
                      {ytExtractErr}{' '}
                      <button className="font-bold underline" onClick={retryExtractor}>Probar de nuevo</button>
                    </p>
                  )}
                  {ytQueueList}
                  {presetButtons}

                  {/* El video ya está arriba como primer hijo de la raíz
                      (una sola instancia): NO se vuelve a renderizar aquí.
                      Antes aparecía dos veces y el ref quedaba en esta
                      segunda copia, que se desmontaba al pasar a mini-barra. */}
                  {ytError && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{ytError}</p>}

                  <div className="flex items-center gap-2">
                    <Btn variant={playing ? 'ghost' : 'coral'} className="flex-1" onClick={() => setPlaying(!playing)}>
                      {playing ? '⏸ Pausa' : '▶ Reproducir'}
                    </Btn>
                    {/* Abrir en YouTube con el plugin @capacitor/browser:
                        ANTES era window.open(..., '_blank'), que la
                        WebView de Capacitor ignora en silencio (no tiene
                        onCreateWindow): el botón no abría nada y la
                        playlist de Luis nunca salía. Ahora sí se abre su
                        playlist tal como la pegó, con su lista completa. */}
                    <Btn variant="teal" className="flex-1" onClick={() => void openExternalUrl(externalUrl(preset, custom))}>
                      ▶ Abrir en YouTube
                    </Btn>
                  </div>
                  {useCustom && (
                    <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">
                      Tu playlist guardada: {pref.customLabel || 'Mi playlist de YouTube'}. El botón de arriba abre esa lista en YouTube.
                    </p>
                  )}

                  {customField}
                </>
              )}
            </>
          ) : (
            <>
              {nativeMusic ? (
                <>
                  <p className="text-sm text-slate-600">
                    Tus canciones del teléfono, sin elegirlas una por una. Se pide el permiso de Música y audio una sola vez; la lista queda guardada en este teléfono y los archivos no se copian ni se suben a ningún servidor.
                  </p>
                  <Btn variant="teal" className="w-full" onClick={() => void loadDeviceSongs()} disabled={deviceLoading}>
                    {deviceLoading ? '🔍 Buscando…' : deviceLoaded ? '🔄 Actualizar mis canciones' : '🎵 Mis canciones del teléfono'}
                  </Btn>
                  {deviceStatus && <p className="rounded-xl bg-sage-100 p-2 text-sm text-slate-600">{deviceStatus}</p>}
                  {deviceSongs.length > 0 && (
                    <input
                      className={inputCls}
                      value={deviceQuery}
                      onChange={(e) => setDeviceQuery(e.target.value)}
                      placeholder="Buscar por título o artista…"
                    />
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-600">
                  Elige canciones que ya tengas en tu teléfono (MP3, M4A, WAV…). No se suben a ningún servidor, solo suenan aquí. Al cerrar la app hay que volver a elegirlas.
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                className="hidden"
                onChange={(e) => { pickLocalFiles(e.target.files); e.target.value = '' }}
              />
              <Btn variant="teal" className="w-full" onClick={() => fileInputRef.current?.click()}>
                {nativeMusic ? '📂 …o elegir archivos a mano' : '📂 Elegir archivos de mi teléfono'}
              </Btn>
              {customErr && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{customErr}</p>}

              {currentLocal && (
                <div className="space-y-3 rounded-xl bg-sage-100 p-3">
                  <p className="font-bold">🎵 {cleanTrackName(currentLocal.name)}</p>
                  <p className="text-xs text-slate-500">
                    {localIndex + 1} de {localTracks.length} · {localPlaying ? 'Sonando…' : 'En pausa'}
                  </p>
                  <div className="flex gap-2">
                    <Btn variant="ghost" className="flex-1" onClick={() => playLocal((localIndex - 1 + localTracks.length) % localTracks.length)} disabled={localTracks.length < 2}>⏮ Anterior</Btn>
                    <Btn variant={localPlaying ? 'ghost' : 'coral'} className="flex-1" onClick={() => setLocalPlaying(!localPlaying)}>
                      {localPlaying ? '⏸ Pausa' : '▶ Reproducir'}
                    </Btn>
                    <Btn variant="ghost" className="flex-1" onClick={() => playLocal((localIndex + 1) % localTracks.length)} disabled={localTracks.length < 2}>Siguiente ⏭</Btn>
                  </div>
                  <p className="text-xs text-slate-500">
                    Se controla también desde la pantalla de bloqueo / notificaciones. {nativeMusic
                      ? 'Con la pantalla apagada sigue sonando: mientras suena, la app mantiene un servicio en primer plano (verás la notificación "PULSO · Sonando").'
                      : 'Aguanta mejor en segundo plano que YouTube, pero si bloqueas la pantalla mucho tiempo el navegador puede pausarla: mantén la pantalla encendida con el interruptor de abajo.'}
                  </p>
                </div>
              )}

              {localTracks.length > 0 && (
                <div className="space-y-1">
                  {localTracks
                    .map((t, i) => ({ t, i }))
                    .filter(({ t }) => !deviceQuery.trim() || t.name.toLowerCase().includes(deviceQuery.trim().toLowerCase()))
                    .map(({ t, i }) => (
                      <button
                        key={t.url}
                        onClick={() => playLocal(i)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${i === localIndex ? 'bg-teal/10 font-bold text-teal-dark' : 'bg-sage-50 text-slate-700'}`}
                      >
                        <span className="min-w-0 truncate">{i === localIndex ? '▶ ' : ''}{cleanTrackName(t.name)}</span>
                        {t.durationMs ? <span className="shrink-0 text-xs text-slate-400">{formatDuration(t.durationMs)}</span> : null}
                      </button>
                    ))}
                  <button
                    className="w-full text-center text-sm text-slate-500 underline"
                    onClick={() => {
                      localTracks.forEach((t) => URL.revokeObjectURL(t.url))
                      setLocalTracks([])
                      setLocalPlaying(false)
                      setLocalIndex(0)
                      setDeviceSongs([])
                      setDeviceLoaded(false)
                      setDeviceStatus('')
                      setDeviceQuery('')
                      clearCachedDeviceSongs(profileId)
                    }}
                  >
                    Quitar lista local
                  </button>
                </div>
              )}
              {localTracks.length === 0 && (
                <p className="rounded-xl bg-sage-100 p-2 text-sm text-slate-600">Aún no elegiste canciones. Tu playlist de YouTube sigue guardada, no se borra al cambiar a Local.</p>
              )}
            </>
          )}

          <div className="flex items-center justify-between rounded-xl bg-sage-100 px-3 py-2">
            <span className="text-sm font-semibold text-teal-dark">🔆 Mantener pantalla encendida</span>
            <button
              role="switch"
              aria-checked={keepScreenOn}
              onClick={() => setKeepScreenOn(!keepScreenOn)}
              className={`rounded-full px-3 py-1 text-sm font-bold ${keepScreenOn ? 'bg-teal text-white' : 'bg-slate-300 text-slate-700'}`}
            >
              {keepScreenOn ? 'Sí' : 'No'}
            </button>
          </div>
          </div>
        </div>
      )}
      {/* El <audio> local siempre montado; con controles solo en la
          hoja expandida con música local. En modo extractor el mismo
          <audio> suena la cola de YouTube (sin controles nativos: la
          barrita de minutos es la de arriba). */}
      <audio
        ref={audioRef}
        className={expanded && source === 'local' && currentLocal ? 'mt-3 w-full' : 'hidden'}
        controls
        preload="metadata"
        src={source === 'local' ? currentLocal?.url : ytExtractorActive ? ytAudioUrl ?? undefined : undefined}
        onCanPlay={() => {
          const audio = audioRef.current
          if (!audio || !audio.paused) return
          if (sourceRef.current === 'local' && localPlayingRef.current) void audio.play().catch(() => undefined)
          else if (sourceRef.current === 'youtube' && ytModeRef.current === 'extractor' && playingRef.current) void audio.play().catch(() => undefined)
        }}
        onPlay={() => {
          audioResumeTriesRef.current = 0
          if (sourceRef.current === 'local') setLocalPlaying(true)
          else if (sourceRef.current === 'youtube' && ytModeRef.current === 'extractor') setPlaying(true)
        }}
        onPause={() => {
          const audio = audioRef.current
          if (!audio) return
          // La canción terminó: onEnded ya avanza la cola o, si no
          // hay siguiente, se espera un instante para no apagar la
          // siguiente antes de que cargue.
          if (audio.ended) {
            window.setTimeout(() => {
              const a = audioRef.current
              if (a && a.ended && a.paused) {
                if (sourceRef.current === 'local') setLocalPlaying(false)
                else if (sourceRef.current === 'youtube' && ytModeRef.current === 'extractor') setPlaying(false)
              }
            }, 150)
            return
          }
          // Pausa EXTERNA (el sistema apagó la pantalla o quitó el
          // foco): la intención sigue siendo sonar, así que se
          // reintenta. La pausa del usuario no llega aquí con la
          // intención en true: togglePlay ya la puso en false antes
          // de pausar el elemento.
          if (sourceRef.current === 'local') {
            if (localPlayingRef.current && audioResumeTriesRef.current < 3) {
              audioResumeTriesRef.current += 1
              window.setTimeout(() => { void audioRef.current?.play().catch(() => setLocalPlaying(false)) }, 400)
            } else setLocalPlaying(false)
          } else if (sourceRef.current === 'youtube' && ytModeRef.current === 'extractor') {
            if (playingRef.current && audioResumeTriesRef.current < 3) {
              audioResumeTriesRef.current += 1
              window.setTimeout(() => { void audioRef.current?.play().catch(() => setPlaying(false)) }, 400)
            } else setPlaying(false)
          }
        }}
        onEnded={() => {
          if (ytExtractorActive && ytQueue.length > 1) {
            setYtQueueIndex((i) => (i + 1) % ytQueue.length)
            setYtAudioUrl(null)
            ytResolvedForRef.current = null
            return
          }
          if (localTracks.length > 1) playLocal((localIndex + 1) % localTracks.length)
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current
          if (!audio) return
          const duration = Number.isFinite(audio.duration) ? audio.duration : 0
          setYtTime((prev) => (Math.abs(audio.currentTime - prev.current) >= 0.5 || duration !== prev.duration ? { current: audio.currentTime, duration } : prev))
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current
          if (!audio) return
          setYtTime({ current: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 })
        }}
      />
    </div>
  )
}
