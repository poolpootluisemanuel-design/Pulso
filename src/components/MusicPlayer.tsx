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
import { startAudioService, stopAudioService } from '../lib/audioService'
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

export default function MusicPlayer({ profileId, compact, expanded, onExpandedChange, onPlayingChange, onGoTrain }: {
  profileId: string
  compact?: boolean
  // Controlado desde App: la música empieza recogida en mini-barra en
  // todas las pestañas; solo se expande cuando Luis la abre en Entrenar.
  expanded?: boolean
  onExpandedChange?: (v: boolean) => void
  onPlayingChange?: (m: MusicStatus) => void
  onGoTrain?: () => void
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
  // Qué video/playlist ya está cargado en el reproductor: el cue solo
  // se hace cuando cambia, nunca al volver de otra pestaña o de local.
  const lastCuedRef = useRef<string | null>(null)
  const [ytReady, setYtReady] = useState(false)
  const [ytPlayerReady, setYtPlayerReady] = useState(false)
  const [ytFailed, setYtFailed] = useState(false)
  const [ytError, setYtError] = useState('')

  const preset = MUSIC_PRESETS.find((p) => p.id === pref.presetId) || MUSIC_PRESETS[MUSIC_PRESETS.length - 1]
  const custom = parseYouTubeUrl(pref.customUrl)
  const useCustom = pref.customUrl.trim() !== '' && custom !== null
  const title = useCustom ? (pref.customLabel || 'Mi playlist de YouTube') : `Música para ${preset.label.toLowerCase()}`
  const playingTitle = `PULSO — ${title}`
  const currentLocal = localTracks[localIndex] || null
  const anyPlaying = playing || localPlaying
  const statusTitle = source === 'local' && currentLocal ? cleanTrackName(currentLocal.name) : title
  // Título CORTO para la mini-barra: el título completo ("Música para
  // correr…") se cortaba como "Músic…" porque no cabe junto al play,
  // la miniatura y los botones. En la mini-barra basta el deporte o el
  // nombre de la canción; el título completo sigue en la hoja y en
  // Media Session.
  const miniTitle = source === 'local' && currentLocal
    ? cleanTrackName(currentLocal.name)
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
  // SOLO cuando cambia el video: antes se hacía cueVideoById cada vez
  // que cambiaba la fuente o se re-activaba el reproductor, y el video
  // volvía a empezar desde 0 al volver de música local o de otra
  // pestaña. `lastCuedRef` recuerda qué video ya está cargado.
  useEffect(() => {
    if (!ytPlayerReady || !playerRef.current || source !== 'youtube') return
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
  }, [ytPlayerReady, preset.id, custom?.kind, custom?.id, source])

  // Play / pausa de YouTube (la API lo controla, sin recargar el iframe).
  // Solo se ordena cuando el estado deseado difiere del estado real del
  // reproductor: antes cada cambio de `playing` —incluidos los que venían
  // del propio onStateChange— volvía a llamar a playVideo/pauseVideo.
  useEffect(() => {
    if (!ytPlayerReady || !playerRef.current || source !== 'youtube') return
    const st = window.YT?.PlayerState
    if (!st) return
    try {
      if (playing && ytStateRef.current !== st.PLAYING) playerRef.current.playVideo()
      else if (!playing && ytStateRef.current === st.PLAYING) playerRef.current.pauseVideo()
    } catch { /* noop */ }
  }, [playing, ytPlayerReady, source])

  // Al pasar a música local, pausar YouTube.
  useEffect(() => {
    if (source === 'local') {
      try { playerRef.current?.pauseVideo() } catch { /* noop */ }
    }
  }, [source])

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

  // Media Session (YouTube).
  useEffect(() => {
    if (source !== 'youtube') return
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
  }, [playing, playingTitle, source])

  // Media Session (local).
  useEffect(() => {
    if (source !== 'local') return
    const ms = navigator.mediaSession
    if (!ms) return
    if (!localPlaying || !currentLocal) {
      if (!localPlaying) ms.metadata = null
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
  }, [localPlaying, localIndex, source])

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

  function saveCustom() {
    const parsed = parseYouTubeUrl(customInput)
    if (!parsed) {
      setCustomErr('Ese link no parece de YouTube. Pega el link completo de un video o una playlist de YouTube.')
      return
    }
    setCustomErr('')
    update({ customUrl: customInput.trim(), customLabel: parsed.kind === 'playlist' ? 'Mi playlist de YouTube' : 'Mi video de YouTube' })
    setPlaying(true)
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

  // Cuando cambia la canción local, el <audio> ya tiene el nuevo src por
  // render; al pasar a playing se reproduce en el efecto de abajo.
  // El <audio> vive siempre montado (fuera de los condicionales) para
  // que no se corte al cambiar de pestaña o de modo.
  // Si el audio aún no cargó el nuevo src (readyState < 2), NO se llama
  // a play(): antes su rechazo ponía localPlaying=false aunque el
  // usuario había dado a Reproducir, y el botón quedaba desfasado. En
  // ese caso arranca solo al dispararse onCanPlay.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || source !== 'local') return
    if (localPlaying && currentLocal) {
      if (audio.readyState >= 2 && !audio.paused) return
      if (audio.readyState >= 2) void audio.play().catch(() => undefined)
    } else audio.pause()
  }, [localPlaying, localIndex, source, currentLocal])

  function switchSource(next: 'youtube' | 'local') {
    if (next === 'youtube') setLocalPlaying(false)
    else setPlaying(false)
    setSource(next)
  }

  function togglePlay() {
    if (source === 'local') setLocalPlaying(!localPlaying)
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
      className={!expanded ? 'h-12 w-20 shrink-0 rounded-lg' : source === 'local' ? 'hidden' : 'h-24 w-40 shrink-0 rounded-lg bg-slate-900'}
      src={embedSrc(preset, custom)}
      title={useCustom ? pref.customLabel : `YouTube: ${preset.label}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  ) : (
    <div
      ref={playerDivRef}
      className={!expanded
        ? 'h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900'
        : source === 'local' ? 'hidden'
        : 'h-24 w-40 shrink-0 overflow-hidden rounded-lg bg-slate-900'}
    />
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
            <p className="truncate text-xs text-white/60">{anyPlaying ? 'Sonando…' : 'En pausa'} · {source === 'local' ? 'Música local' : 'YouTube'}</p>
          </div>
          {source === 'local' && localTracks.length > 1 && (
            <button
              onClick={() => playLocal((localIndex + 1) % localTracks.length)}
              className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-sm font-bold"
            >
              ⏭
            </button>
          )}
          <button
            onClick={() => { if (!compact) onExpandedChange?.(true); else onGoTrain?.() }}
            className="shrink-0 rounded-full bg-white/10 px-2.5 py-2 text-xs font-bold"
            aria-label="Expandir reproductor"
          >
            ▲
          </button>
          {/* Sin botón "Entrenar →" en la mini-barra: la ▲ ya lleva a
              Entrenar en las demás pestañas, y ese botón robaba el
              espacio del título, que se cortaba como "Músic…". */}
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
              <div className="flex flex-wrap gap-2">
                {MUSIC_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { update({ presetId: p.id, customUrl: '' }); setCustomInput('') }}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${!useCustom && pref.presetId === p.id ? 'bg-teal text-white' : 'bg-sage-100 text-teal-dark'}`}
                  >
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>

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

              <Field label="Tu playlist de YouTube (opcional)">
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Pega aquí el link de tu playlist o video"
                    inputMode="url"
                  />
                  <Btn variant="teal" onClick={saveCustom}>Usar</Btn>
                </div>
              </Field>
              {customErr && <p className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{customErr}</p>}
              {useCustom && <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">Tu playlist queda guardada en este teléfono.</p>}
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
          hoja expandida con música local. */}
      <audio
        ref={audioRef}
        className={expanded && source === 'local' && currentLocal ? 'mt-3 w-full' : 'hidden'}
        controls
        preload="metadata"
        src={currentLocal ? currentLocal.url : undefined}
        onCanPlay={() => { if (localPlayingRef.current && audioRef.current?.paused) void audioRef.current.play().catch(() => undefined) }}
        onPlay={() => setLocalPlaying(true)}
        onPause={() => setLocalPlaying(false)}
        onEnded={() => { if (localTracks.length > 1) playLocal((localIndex + 1) % localTracks.length) }}
      />
    </div>
  )
}
