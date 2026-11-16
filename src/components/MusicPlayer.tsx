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
// - Este componente vive MONTADO EN App.tsx, fuera de las pestañas:
//   nunca se oculta con display:none (eso pausa el iframe de YouTube).
//   En Entrenar se ve la tarjeta completa; en las demás pestañas se ve
//   la mini-barra fija con el video chiquito pero visible, y el audio
//   sigue sonando.
// - Segundo plano: con pantalla encendida (Wake Lock) la música sigue;
//   con pantalla apagada hace falta YouTube Premium ("Abrir en YouTube").
//   La música local (<audio> + Media Session) aguanta mejor.
import { useEffect, useRef, useState } from 'react'
import { getMusicPref, saveMusicPref } from '../lib/store'
import { Btn, Field, inputCls } from './ui'

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

interface LocalTrack { name: string; url: string }

// Extrae de un link de YouTube: {kind:'playlist', id} o {kind:'video', id}.
// Acepta watch?v=, youtu.be/, /embed/, /shorts/, music.youtube.com y &list=.
export function parseYouTubeUrl(url: string): { kind: 'playlist' | 'video'; id: string } | null {
  const u = url.trim()
  if (!u) return null
  const list = u.match(/[?&]list=([A-Za-z0-9_-]+)/)
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

export default function MusicPlayer({ profileId, compact, onPlayingChange, onGoTrain }: {
  profileId: string
  compact?: boolean
  onPlayingChange?: (m: MusicStatus) => void
  onGoTrain?: () => void
}) {
  const [pref, setPref] = useState(() => getMusicPref(profileId))
  const [playing, setPlaying] = useState(false)
  const [customInput, setCustomInput] = useState(() => getMusicPref(profileId).customUrl)
  const [customErr, setCustomErr] = useState('')
  const [open, setOpen] = useState(true)
  const [keepScreenOn, setKeepScreenOn] = useState(true)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // Reproductor local opcional.
  const [source, setSource] = useState<'youtube' | 'local'>('youtube')
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([])
  const [localIndex, setLocalIndex] = useState(0)
  const [localPlaying, setLocalPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
  // siempre montado como primer hijo de la raíz. Antes se renderizaba
  // DOS veces en la tarjeta completa (una como primer hijo y otra dentro
  // de la sección de YouTube): el ref quedaba en la segunda instancia,
  // así que al pasar a mini-barra esa instancia se desmontaba, el
  // YT.Player quedaba huérfano y el video "se movía" y dejaba de
  // responder. Ahora hay una sola instancia y nunca cambia de padre.
  // En la tarjeta completa el video queda fijo arriba (sticky) aunque
  // se baje por la lista de controles.
  const ytPlayer = ytFailed ? (
    <iframe
      key={useCustom ? 'custom-' + pref.customUrl : 'preset-' + preset.id}
      className={compact ? 'h-16 w-28 shrink-0 rounded-lg' : source === 'local' ? 'hidden' : 'sticky top-0 z-10 aspect-video w-full bg-slate-900'}
      src={embedSrc(preset, custom)}
      title={useCustom ? pref.customLabel : `YouTube: ${preset.label}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  ) : (
    <div
      ref={playerDivRef}
      className={compact
        ? 'h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-900'
        : source === 'local' ? 'hidden'
        : 'sticky top-0 z-10 aspect-video w-full overflow-hidden rounded-xl bg-slate-900'}
    />
  )

  // Una sola raíz y el div de YouTube siempre como primer hijo: al
  // pasar de tarjeta completa a mini-barra (y al revés) React conserva
  // el mismo nodo DOM y el reproductor NO se recarga ni se corta.
  // (Dos árboles distintos con early-return lo desmontarían.)
  // En modo completo la raíz es una hoja con scroll (max-h) anclada
  // abajo, no un bloque en el flujo: así el reproductor no cambia de
  // sitio al cambiar de pestaña, solo se expande o se recoge en el
  // mismo lugar fijo.
  return (
    <div className={compact
      ? 'flex items-center gap-2 rounded-2xl bg-night px-2 py-2 text-white shadow-xl shadow-night/40'
      : 'max-h-[62vh] overflow-y-auto rounded-t-3xl border border-slate-100 bg-white p-4 shadow-xl shadow-night/20'}>
      {ytPlayer}
      {compact ? (
        <>
          <button
            onClick={togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pulso text-lg font-black text-white"
            aria-label={anyPlaying ? 'Pausar música' : 'Reproducir música'}
          >
            {anyPlaying ? '⏸' : '▶'}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">🎵 {statusTitle}</p>
            <p className="text-xs text-white/60">{anyPlaying ? 'Sonando…' : 'En pausa'} · {source === 'local' ? 'Música local' : 'YouTube'}</p>
          </div>
          {source === 'local' && localTracks.length > 1 && (
            <button
              onClick={() => playLocal((localIndex + 1) % localTracks.length)}
              className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-sm font-bold"
            >
              ⏭
            </button>
          )}
          <button onClick={onGoTrain} className="shrink-0 rounded-full bg-teal px-3 py-2 text-xs font-bold text-white">
            Entrenar →
          </button>
        </>
      ) : (
        <div className="mt-3">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
            <h3 className="text-lg font-bold">🎵 Música para entrenar</h3>
            <span className="text-slate-400">{open ? '▲' : '▼'}</span>
          </button>
          {open && (
            <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">
            Suena mientras entrenas y sigue sonando si cambias de pestaña. Para que suene en segundo plano con la pantalla apagada hace falta YouTube Premium: ábrela en YouTube con el botón de abajo.
          </p>
          <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-800">
            Ojo: de YouTube no se pueden descargar las canciones, YouTube no lo permite. La música local es solo para canciones que tú ya tengas descargadas en tu teléfono: elige tus MP3 abajo y suenan sin subirlos a ningún lado.
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
                <Btn variant="teal" className="flex-1" onClick={() => window.open(externalUrl(preset, custom), '_blank', 'noopener,noreferrer')}>
                  ▶ Abrir en YouTube
                </Btn>
              </div>
              <p className="text-xs text-slate-500">
                {`Sonando: ${title}.`} Con la pantalla encendida y la app abierta, la música sigue mientras entrenas o grabas con GPS, aunque cambies de pestaña. Si bloqueas la pantalla o cambias de app, YouTube web puede pausar: para segundo plano real, abre en YouTube con Premium (o Spotify Premium después).
              </p>

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
              <p className="text-sm text-slate-600">
                Elige canciones que ya tengas en tu teléfono (MP3, M4A, WAV…). No se suben a ningún servidor, solo suenan aquí. Al cerrar la app hay que volver a elegirlas.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                className="hidden"
                onChange={(e) => { pickLocalFiles(e.target.files); e.target.value = '' }}
              />
              <Btn variant="teal" className="w-full" onClick={() => fileInputRef.current?.click()}>
                📂 Elegir archivos de mi teléfono
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
                    Se controla también desde la pantalla de bloqueo / notificaciones. Aguanta mejor en segundo plano que YouTube, pero si bloqueas la pantalla mucho tiempo el navegador puede pausarla: mantén la pantalla encendida con el interruptor de abajo.
                  </p>
                </div>
              )}

              {localTracks.length > 0 && (
                <div className="space-y-1">
                  {localTracks.map((t, i) => (
                    <button
                      key={t.url}
                      onClick={() => playLocal(i)}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${i === localIndex ? 'bg-teal/10 font-bold text-teal-dark' : 'bg-sage-50 text-slate-700'}`}
                    >
                      {i === localIndex ? '▶ ' : ''}{cleanTrackName(t.name)}
                    </button>
                  ))}
                  <button
                    className="w-full text-center text-sm text-slate-500 underline"
                    onClick={() => { localTracks.forEach((t) => URL.revokeObjectURL(t.url)); setLocalTracks([]); setLocalPlaying(false); setLocalIndex(0) }}
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
      )}
        </div>
      )}
      {/* El <audio> local siempre montado; con controles solo en la
          tarjeta completa con música local. */}
      <audio
        ref={audioRef}
        className={!compact && source === 'local' && currentLocal ? 'mt-3 w-full' : 'hidden'}
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
