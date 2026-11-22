// Música para entrenar: YouTube o música local del teléfono (opcional).
// - YouTube: cada preset es un VIDEO REAL de YouTube (mix largo de
//   música para entrenar). Suena SOLO por el extractor + el
//   reproductor nativo (ExoPlayer en la app): el extractor resuelve
//   la URL directa de audio y el reproductor nativo la baja y la
//   decodifica fuera del WebView, así sigue sonando al salir de la
//   app y con la pantalla apagada. NO hay video incrustado (embed):
//   el iframe se pausaba al salir y era el fallo que Luis reportó,
//   así que se quitó por completo (2026-11-19). Si el extractor no
//   responde, la app avisa y el botón "Probar de nuevo" reintenta;
//   el botón "Abrir en YouTube" abre el video en la app de YouTube.
// - El usuario puede pegar su propia playlist/video y se guarda.
// - NO se puede descargar música de YouTube. La opción local es solo
//   para canciones que el usuario YA tenga descargadas en su teléfono.
// - En la app NATIVA de Android (plugin DeviceMusic, src/lib/deviceMusic.ts)
//   la música local ya no se carga archivo por archivo: con el permiso
//   de "Música y audio" se lee la lista del teléfono con MediaStore y
//   suena directo, sin copiar ni subir nada. En web sigue el
//   <input type=file> de siempre y la lista no persiste al cerrar.
// - Este componente vive MONTADO EN App.tsx, fuera de las pestañas:
//   nunca se oculta con display:none. Por defecto es una MINI-BARRA
//   fija y pequeña en todas las pestañas (también en Entrenar); solo
//   se expande a una hoja CASI A PANTALLA COMPLETA (~92vh, estilo
//   app nativa: portada grande, controles grandes, se recoge con ⌄
//   o arrastrando el tirador) cuando Luis la abre, y se recoge sola
//   al cambiar de pestaña. El audio sigue sonando al recogerla.
// - Segundo plano (app nativa): mientras suena, el reproductor nativo
//   mantiene un servicio en primer plano ("PULSO · Sonando") para que
//   el audio siga al salir de la app o con la pantalla apagada. En web
//   no hay servicio: el navegador pausa el audio al bloquear la pantalla.
// - "Abrir en YouTube" usa el plugin @capacitor/browser: window.open
//   con '_blank' se ignora en la WebView de Capacitor y el botón no
//   abría nada (ver lib/openExternal.ts).
import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
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
import { IconArrowDown, IconArrowUp, IconChevronDown, IconChevronUp, IconPause, IconPlay, IconSkipBack, IconSkipForward, IconX } from './icons'
import { startAudioService, stopAudioService, updateMedia, addMediaControlListener, audioServiceSupported, playNativeUrl, pauseNative, seekNative, getNativePosition, addPlayerEventListener } from '../lib/audioService'
import type { MediaControlAction, PlayerEventType } from '../lib/audioService'
import { listPlaylist, resolveVideo, ytThumbnail, checkExtractorHealth, ExtractorError, type ExtractorTrack } from '../lib/youtubeExtractor'
import { openExternalUrl } from '../lib/openExternal'
import { APP_BUILD } from '../lib/appUpdate'

// Videos reales de YouTube por deporte (mixes largos, públicos).
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

interface LocalTrack { name: string; url: string; durationMs?: number; nativeUri?: string }

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

/** Barrita de minutos: actual / total, tocable para adelantar.
 *  `large` es la del reproductor expandido estilo app: barra más
 *  gruesa y tiempos más grandes. */
function SeekBar({ current, total, onSeek, dark, large }: { current: number; total: number; onSeek: (frac: number) => void; dark?: boolean; large?: boolean }) {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0
  return (
    <div>
      <div
        className={`${large ? 'h-2.5' : 'h-1.5'} w-full cursor-pointer rounded-full ${dark ? 'bg-white/20' : 'bg-slate-200'}`}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))) }}
        role="slider"
        aria-label="Adelantar en la canción"
        aria-valuenow={Math.floor(current)}
        aria-valuemax={Math.floor(total)}
      >
        <div className="h-full rounded-full bg-pulso" style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-0.5 flex justify-between ${large ? 'text-sm' : 'text-[11px]'} ${dark ? 'text-white/60' : 'text-slate-500'}`}>
        <span>{fmtTime(current)}</span>
        <span>{fmtTime(total)}</span>
      </div>
    </div>
  )
}

export interface MusicStatus { playing: boolean; title: string; source: 'youtube' | 'local' }

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

  // Hoja estilo app: entra deslizando desde abajo; el tirador permite
  // recogerla arrastrando, pero el botón ⌄ es el camino principal y
  // debe funcionar siempre.
  const [sheetIn, setSheetIn] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartYRef = useRef(0)
  const dragYRef = useRef(0)
  // Contenedor con scroll de la hoja (la raíz del componente cuando
  // está expandida): al abrirla se lleva arriba, para que el tirador
  // y el encabezado sean lo primero que se ve.
  const sheetRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!expanded) { setSheetIn(false); setDragY(0); dragYRef.current = 0; setDragging(false); return }
    if (sheetRef.current) sheetRef.current.scrollTop = 0
    const raf = requestAnimationFrame(() => setSheetIn(true))
    return () => cancelAnimationFrame(raf)
  }, [expanded])

  // Gesto: arrastrar el tirador hacia abajo recoge la hoja (umbral
  // 90 px); si no llega, vuelve a su sitio. El botón ⌄ sigue siendo
  // el camino principal.
  function handleDragStart(e: ReactTouchEvent) {
    dragStartYRef.current = e.touches[0].clientY
    dragYRef.current = 0
    setDragging(true)
  }
  function handleDragMove(e: ReactTouchEvent) {
    const dy = Math.max(0, e.touches[0].clientY - dragStartYRef.current)
    dragYRef.current = dy
    setDragY(dy)
  }
  function handleDragEnd() {
    setDragging(false)
    if (dragYRef.current >= 90) onExpandedChange?.(false)
    else { setDragY(0); dragYRef.current = 0 }
  }

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
  // Reproductor NATIVO (ExoPlayer) en la app instalada: el audio sale
  // del WebView y no se corta al salir ni al apagar la pantalla. En
  // web (vista previa) sigue el <audio> de siempre.
  const useNativePlayer = audioServiceSupported()
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
      // URI cruda para el reproductor nativo (ExoPlayer la abre
      // directo; la WebView necesita el convertFileSrc de arriba).
      nativeUri: song.uri,
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

  // YouTube suena SOLO por el extractor (sin embed): la cola se
  // resuelve video por video a su URL directa de audio. Si el
  // extractor falla se muestra el aviso y "Probar de nuevo"
  // reintenta (ytRetry re-dispara la resolución).
  const [ytQueue, setYtQueue] = useState<ExtractorTrack[]>(() => loadYtQueue())
  const [ytQueueIndex, setYtQueueIndex] = useState(0)
  const [ytAudioUrl, setYtAudioUrl] = useState<string | null>(null)
  const [ytResolving, setYtResolving] = useState(false)
  const [ytRetry, setYtRetry] = useState(0)
  // Tiempo del <audio> para la barrita de minutos (modo extractor).
  const [ytTime, setYtTime] = useState({ current: 0, duration: 0 })
  // Para qué video ya se resolvió ytAudioUrl (resolver perezoso).
  const ytResolvedForRef = useRef<string | null>(null)

  // AUTO-DIAGNÓSTICO (falla del extractor): cuando un resolve o la
  // reproducción fallan, la app clasifica el error, lo dice en
  // palabras simples, reintenta sola (el bloqueo de YouTube es
  // intermitente) y si no se arregla ofrece reportar a soporte.
  // `network` no tiene diagnóstico propio: sin internet es 'offline'
  // y con internet es 'server'.
  type YtDiagKind = 'offline' | 'server' | 'blocked' | 'key' | 'resolve'
  interface YtDiag { kind: YtDiagKind; code: string; at: number }
  const YT_DIAG_TEXT: Record<YtDiagKind, string> = {
    offline: 'No tienes internet.',
    server: 'El servidor del extractor no responde.',
    blocked: 'YouTube bloqueó este video por ahora.',
    key: 'La clave del extractor no es válida.',
    resolve: 'No se pudo resolver el video.',
  }
  const [ytDiag, setYtDiag] = useState<YtDiag | null>(null)
  // ¿Responde el servidor? null = revisando aún.
  const [diagServerOk, setDiagServerOk] = useState<boolean | null>(null)
  const [diagRetrying, setDiagRetrying] = useState(false)
  const [diagAllFailed, setDiagAllFailed] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportCopied, setReportCopied] = useState(false)
  // Reintentos automáticos por canción (máx. 2: a los 5 s y 15 s) y
  // canciones que ya fallaron en esta racha (para pasar a la
  // siguiente y detectar si TODA la lista falló).
  const ytAutoRetryCountRef = useRef(0)
  const ytAutoRetryTimersRef = useRef<number[]>([])
  const ytFailedIdsRef = useRef<Set<string>>(new Set())

  // ¿Suena DE VERDAD? `playing` solo dice la intención: con el
  // extractor fallando o el stream atascado, playing era true y la
  // cola decía "Sonando…" sin sonar nada. `ytAudible` solo se pone
  // true con evidencia (la posición nativa avanza o el <audio> suena).
  // `ytStalled` marca que sonaba y dejó de avanzar: ahí se dispara
  // el diagnóstico como si el resolve hubiera fallado.
  const [ytAudible, setYtAudible] = useState(false)
  const [ytStalled, setYtStalled] = useState(false)
  const ytAudibleRef = useRef(false)
  const ytStalledRef = useRef(false)
  const ytLastPosRef = useRef(0)
  const ytStallPollsRef = useRef(0)
  const ytCurrentIdRef = useRef<string | null>(null)
  const ytStallHandlerRef = useRef<() => void>(() => undefined)
  useEffect(() => { ytCurrentIdRef.current = ytQueue[ytQueueIndex]?.id ?? null }, [ytQueue, ytQueueIndex])
  // Espejo de `source` para los handlers del <audio>.
  const sourceRef = useRef<'youtube' | 'local'>('youtube')
  useEffect(() => { sourceRef.current = source }, [source])

  const preset = MUSIC_PRESETS.find((p) => p.id === pref.presetId) || MUSIC_PRESETS[MUSIC_PRESETS.length - 1]
  const custom = parseYouTubeUrl(pref.customUrl)
  const useCustom = pref.customUrl.trim() !== '' && custom !== null
  const title = useCustom ? (pref.customLabel || 'Mi playlist de YouTube') : `Música para ${preset.label.toLowerCase()}`
  const currentLocal = localTracks[localIndex] || null
  const anyPlaying = playing || localPlaying
  // Estado real de YouTube para la UI: "Sonando…" solo con evidencia
  // de audio (ytAudible); "No está sonando" si se atascó; "Cargando…"
  // mientras arranca; "Resolviendo…" mientras pide la URL.
  const ytSounds = playing && ytAudible
  function ytStatusText(): string {
    if (!playing) return 'En pausa'
    if (ytResolving) return 'Resolviendo…'
    if (ytAudible) return 'Sonando…'
    if (ytStalled) return 'No está sonando'
    return 'Cargando…'
  }
  // YouTube = extractor (único modo, sin embed): la canción que
  // suena es la de la cola.
  const ytExtractorActive = source === 'youtube'
  const ytCurrent = ytQueue[ytQueueIndex] ?? null
  // Total para la barrita grande del reproductor expandido.
  const bigSeekTotal = source === 'local'
    ? ytTime.duration || (currentLocal?.durationMs ? currentLocal.durationMs / 1000 : 0)
    : ytTime.duration || ytCurrent?.durationSec || 0
  const statusTitle = source === 'local' && currentLocal
    ? cleanTrackName(currentLocal.name)
    : ytExtractorActive && ytCurrent ? ytCurrent.title : title

  // ¿La canción actual suena por el reproductor NATIVO? (ref para
  // los handlers del <audio>: en nativo el elemento no debe sonar
  // nunca, ni siquiera al cargar el src por onCanPlay, o sonarían
  // las dos fuentes juntas).
  const nativeAudioRef = useRef(false)
  useEffect(() => {
    nativeAudioRef.current = useNativePlayer && ((source === 'local' && !!currentLocal?.nativeUri) || ytExtractorActive)
  }, [useNativePlayer, source, currentLocal, ytExtractorActive])
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
    // En la app nativa el servicio lo maneja el reproductor
    // (playNativeUrl / pauseNative); aquí no se toca.
    if (useNativePlayer) return
    if (!anyPlaying) { void stopAudioService(); return }
    void startAudioService(statusTitle)
    return () => { void stopAudioService() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPlaying, statusTitle, useNativePlayer])

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

  // Barrita de minutos con el reproductor nativo: la posición se
  // pregunta cada medio segundo (el <audio> no suena en nativo y su
  // onTimeUpdate no dispara). Sirve para local y para YouTube. En
  // YouTube además es la evidencia de que suena DE VERDAD: la
  // posición avanza solo si el audio avanza; 3 s sin avance con
  // intención de sonar = atascado, y ahí se dispara el diagnóstico
  // como si el resolve hubiera fallado.
  useEffect(() => {
    if (!useNativePlayer || !anyPlaying) return
    const id = window.setInterval(() => {
      void getNativePosition().then((p) => {
        if (!p) return
        const pos = p.positionMs / 1000
        setYtTime({ current: pos, duration: p.durationMs > 0 ? p.durationMs / 1000 : 0 })
        if (sourceRef.current === 'youtube' && ytCurrentIdRef.current) {
          if (pos > ytLastPosRef.current + 0.2) {
            ytLastPosRef.current = pos
            ytStallPollsRef.current = 0
            if (!ytAudibleRef.current) { ytAudibleRef.current = true; setYtAudible(true) }
            if (ytStalledRef.current) { ytStalledRef.current = false; setYtStalled(false) }
          } else {
            ytStallPollsRef.current += 1
            if (ytStallPollsRef.current >= 6 && ytAudibleRef.current) {
              ytAudibleRef.current = false
              setYtAudible(false)
              ytStalledRef.current = true
              setYtStalled(true)
              ytStallHandlerRef.current()
            }
          }
        }
      })
    }, 500)
    return () => window.clearInterval(id)
  }, [anyPlaying, useNativePlayer])

  // Al atascarse el audio (sonaba y dejó de avanzar), diagnosticarlo
  // como fallo de resolve: el reintento vuelve a resolver la URL.
  useEffect(() => {
    ytStallHandlerRef.current = () => {
      if (!playingRef.current) return
      handleYtFailure(new ExtractorError('resolve', 'El audio se detuvo.', undefined, 'sin avance'))
    }
  })

  // Al cambiar de canción (a mano o por auto-avance), el intento
  // nuevo parte de cero: sin diagnóstico viejo, sin reintentos
  // pendientes y sin atasco.
  useEffect(() => {
    ytAutoRetryCountRef.current = 0
    clearAutoRetryTimers()
    setYtAudible(false)
    ytAudibleRef.current = false
    setYtStalled(false)
    ytStalledRef.current = false
    ytLastPosRef.current = 0
    ytStallPollsRef.current = 0
    setYtDiag(null)
    setDiagAllFailed(false)
    setShowReport(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytQueue[ytQueueIndex]?.id])

  // Sin intención de sonar no hay evidencia de audio.
  useEffect(() => {
    if (!anyPlaying) {
      setYtAudible(false)
      ytAudibleRef.current = false
    }
  }, [anyPlaying])

  // Limpiar los reintentos automáticos al desmontar.
  useEffect(() => () => {
    ytAutoRetryTimersRef.current.forEach((t) => window.clearTimeout(t))
  }, [])

  // El reproductor nativo avisa cuando termina la canción o falla:
  // avanzar la cola igual que el onEnded del <audio>, o avisar si
  // el extractor falló. El handler vive en un ref para no
  // re-suscribirse con valores desfasados.
  const playerEventRef = useRef<(ev: { type: PlayerEventType; message?: string }) => void>(() => undefined)
  useEffect(() => {
    playerEventRef.current = (ev: { type: PlayerEventType; message?: string }) => {
      if (ev.type === 'ended') {
        if (sourceRef.current === 'youtube' && ytQueue.length > 1) {
          setYtQueueIndex((i) => (i + 1) % ytQueue.length)
          setYtAudioUrl(null)
          ytResolvedForRef.current = null
        } else if (sourceRef.current === 'local' && localTracks.length > 1) {
          playLocal((localIndex + 1) % localTracks.length)
        }
      } else if (ev.type === 'error') {
        if (sourceRef.current === 'youtube') {
          handleYtFailure(new ExtractorError('resolve', 'El reproductor no pudo sonar este audio.', undefined, 'reproductor'))
        } else {
          setLocalPlaying(false)
        }
      }
    }
  })
  useEffect(() => {
    if (!useNativePlayer) return
    let handle: { remove: () => Promise<void> } | null = null
    let cancelled = false
    void addPlayerEventListener((ev) => { playerEventRef.current(ev) }).then((h) => {
      if (cancelled) { void h?.remove(); return }
      handle = h
    })
    return () => { cancelled = true; void handle?.remove() }
  }, [useNativePlayer])

  // --- Auto-diagnóstico del extractor ---
  function clearAutoRetryTimers() {
    ytAutoRetryTimersRef.current.forEach((t) => window.clearTimeout(t))
    ytAutoRetryTimersRef.current = []
    setDiagRetrying(false)
  }

  function classifyExtractorError(err: unknown): YtDiagKind {
    if (err instanceof ExtractorError) {
      if (err.kind === 'network') return navigator.onLine ? 'server' : 'offline'
      if (err.kind === 'blocked' || err.kind === 'key' || err.kind === 'resolve' || err.kind === 'server') return err.kind
      return 'resolve'
    }
    return navigator.onLine ? 'resolve' : 'offline'
  }

  // Un fallo de YouTube (resolve o reproducción): clasificarlo,
  // mostrarlo en palabras simples y, si el usuario quería sonar,
  // reintentarlo solo (2 veces: 5 s y 15 s; el bloqueo es
  // intermitente) y si no, pasar a la siguiente canción; si TODA la
  // lista falló, ofrecer la música local. Con auto=false solo se
  // muestra el diagnóstico (agregar un link fallido). La intención
  // de sonar NO se apaga: si se apagara, el reintento resolvería la
  // URL pero nada volvería a sonar.
  function handleYtFailure(err: unknown, auto = true) {
    const track = ytCurrent
    const kind = classifyExtractorError(err)
    const code = err instanceof ExtractorError ? err.code : err instanceof Error ? err.message : 'error'
    setYtDiag({ kind, code, at: Date.now() })
    setDiagServerOk(null)
    void checkExtractorHealth().then((ok) => setDiagServerOk(ok)).catch(() => setDiagServerOk(false))
    if (!auto || !playingRef.current || !track) return
    ytAutoRetryCountRef.current += 1
    const n = ytAutoRetryCountRef.current
    if (n <= 2) {
      const delay = n === 1 ? 5000 : 15000
      setDiagRetrying(true)
      const t = window.setTimeout(() => {
        if (!playingRef.current) return
        if (ytCurrentIdRef.current !== track.id) return
        setDiagRetrying(false)
        retryExtractorAuto()
      }, delay)
      ytAutoRetryTimersRef.current.push(t)
      return
    }
    ytFailedIdsRef.current.add(track.id)
    setDiagRetrying(false)
    const nextIdx = ytQueue.findIndex((t) => !ytFailedIdsRef.current.has(t.id))
    if (nextIdx >= 0) playYtTrack(nextIdx)
    else {
      setDiagAllFailed(true)
      setPlaying(false)
    }
  }

  // Reintento automático (sin resetear el contador ni los fallidos:
  // eso es solo del reintento manual).
  function retryExtractorAuto() {
    clearAutoRetryTimers()
    setYtDiag(null)
    setShowReport(false)
    setYtStalled(false)
    ytStalledRef.current = false
    setYtAudible(false)
    ytAudibleRef.current = false
    setYtAudioUrl(null)
    ytResolvedForRef.current = null
    setYtRetry((n) => n + 1)
  }

  // "Probar de nuevo" (manual): intento fresco — limpia el error, el
  // diagnóstico, los reintentos automáticos y la lista de fallidos, y
  // re-dispara la resolución (ytRetry).
  function retryExtractor() {
    ytAutoRetryCountRef.current = 0
    ytFailedIdsRef.current.clear()
    setDiagAllFailed(false)
    retryExtractorAuto()
  }

  // Texto del reporte a soporte (sin datos personales ni claves).
  function supportReportText(): string {
    const track = ytCurrent
    const cause = ytDiag ? `${YT_DIAG_TEXT[ytDiag.kind]} (${ytDiag.code})` : 'El extractor no respondió.'
    const when = new Date(ytDiag?.at ?? Date.now())
    const dateStr = when.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    return [
      'La música de YouTube no sonó.',
      track ? `Video: ${track.title} (${ytQueueIndex + 1} de ${ytQueue.length}).` : 'Video: (sin canción).',
      `Error: ${cause}`,
      `Hora: ${dateStr}.`,
      `App: build ${APP_BUILD}.`,
    ].join('\n')
  }

  // Abrir la hoja de compartir con el reporte; si no hay compartir,
  // copiarlo al portapapeles; si tampoco se puede, el texto ya se ve
  // en la tarjeta para copiarlo a mano. Si el usuario cancela la
  // hoja, no se hace nada más.
  async function shareSupportReport() {
    const text = supportReportText()
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> }
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: 'PULSO · Reporte de música', text })
      } catch { /* cancelado por el usuario: no hacer nada más */ }
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setReportCopied(true)
      window.setTimeout(() => setReportCopied(false), 3000)
    } catch {
      setReportCopied(false)
    }
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
  // de audio al extractor. Si falla, se muestra el aviso (sin embed).
  useEffect(() => {
    if (!ytExtractorActive) return
    const track = ytCurrent
    if (!track) { setYtAudioUrl(null); setPlaying(false); return }
    if (ytResolvedForRef.current === track.id && ytAudioUrl) return
    let cancelled = false
    setYtResolving(true)
    resolveVideo(track.id)
      .then((r) => {
        if (cancelled) return
        ytResolvedForRef.current = track.id
        setYtAudioUrl(r.url)
        if (r.title && r.title !== track.title) {
          setYtQueue((q) => q.map((t) => (t.id === track.id ? { ...t, title: r.title, durationSec: r.durationSec ?? t.durationSec } : t)))
        }
        setYtResolving(false)
        // Resolvió: intento nuevo, sin diagnóstico ni fallidos.
        ytAutoRetryCountRef.current = 0
        ytFailedIdsRef.current.delete(track.id)
        setYtDiag(null)
        setDiagAllFailed(false)
        setYtStalled(false)
        ytStalledRef.current = false
      })
      .catch((err) => {
        if (cancelled) return
        setYtResolving(false)
        handleYtFailure(err)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytExtractorActive, ytCurrent?.id, ytRetry])

  // Media Session (extractor): la cola suena por <audio>; la pantalla
  // de bloqueo muestra la canción actual con su foto y los controles.
  useEffect(() => {
    if (useNativePlayer) return
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
    if (useNativePlayer) return
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

  // Agregar un link de YouTube: el link se agrega a la cola
  // (video: se resuelve y se agrega; playlist: se agregan todos sus
  // videos). El link también se guarda en el pref.
  async function saveCustom() {
    const parsed = parseYouTubeUrl(customInput)
    if (!parsed) {
      setCustomErr('Ese link no parece de YouTube. Pega el link completo de un video o una playlist de YouTube.')
      return
    }
    setCustomErr('')
    update({ customUrl: customInput.trim(), customLabel: parsed.kind === 'playlist' ? 'Mi playlist de YouTube' : 'Mi video de YouTube' })
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
    } catch (err) {
      handleYtFailure(err, false)
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

  // Cola de YouTube: sonar una canción. Va por el extractor con la
  // URL resuelta. `trackOverride` es para agregar: la canción aún no
  // está en `ytQueue` cuando se llama.
  function playYtTrack(index: number, trackOverride?: ExtractorTrack) {
    const track = trackOverride ?? ytQueue[index]
    if (!track) return
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
    ytFailedIdsRef.current.delete(track.id)
    const index = ytQueue.length
    setYtQueue([...ytQueue, track])
    setYtQueueIndex(index)
    playYtTrack(index, track)
  }

  function removeYtTrack(index: number) {
    const currentId = ytCurrent?.id
    ytFailedIdsRef.current.delete(ytQueue[index]?.id)
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

  // Un preset: si ya está en la cola salta a él; si no, entra
  // después de la canción actual y suena. El preset también se
  // guarda en el pref.
  function tapPreset(p: Preset) {
    update({ presetId: p.id, customUrl: '' })
    setCustomInput('')
    ytFailedIdsRef.current.delete(p.videoId)
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

  /** Adelantar en la canción que suena (barrita de minutos). */
  function seekYt(frac: number) {
    const total = ytTime.duration
      || (source === 'local' && currentLocal?.durationMs ? currentLocal.durationMs / 1000 : 0)
      || (ytExtractorActive && ytCurrent?.durationSec ? ytCurrent.durationSec : 0)
    if (!total) return
    const t = Math.min(1, Math.max(0, frac)) * total
    if (useNativePlayer) {
      void seekNative(Math.round(t * 1000))
      setYtTime((prev) => ({ ...prev, current: t }))
      return
    }
    const audio = audioRef.current
    if (!audio) return
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
  // EN LA APP NATIVA el motor es ExoPlayer (playNativeUrl): el
  // <audio> solo queda para las canciones locales sin URI nativa
  // (archivo elegido a mano, blob:) y para la vista previa web.
  useEffect(() => {
    const audio = audioRef.current
    const shouldPlayLocal = source === 'local' && localPlaying && currentLocal
    const shouldPlayYt = ytExtractorActive && playing && ytAudioUrl
    if (useNativePlayer) {
      const localNativeUrl = currentLocal?.nativeUri
      if (source === 'local' && localPlaying && currentLocal && localNativeUrl) {
        audio?.pause()
        void playNativeUrl(localNativeUrl, cleanTrackName(currentLocal.name), 'PULSO · Música local')
      } else if (ytExtractorActive && playing && ytAudioUrl && ytCurrent) {
        audio?.pause()
        void playNativeUrl(ytAudioUrl, ytCurrent.title, 'PULSO')
      } else if (shouldPlayLocal && audio) {
        // Sin URI nativa (blob: de archivo elegido): <audio> web.
        void pauseNative()
        if (audio.readyState >= 2) void audio.play().catch(() => undefined)
      } else {
        void pauseNative()
        audio?.pause()
      }
      return
    }
    if (!audio) return
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
      setPlaying(false)
      // Al salir de YouTube el diagnóstico ya no aplica.
      clearAutoRetryTimers()
      setYtDiag(null)
      setDiagAllFailed(false)
      setShowReport(false)
    }
    setSource(next)
  }

  function togglePlay() {
    if (source === 'local') setLocalPlaying(!localPlaying)
    // Sin canción en la cola del extractor no hay nada que sonar.
    else if (ytExtractorActive && !ytCurrent) return
    else setPlaying(!playing)
  }

  // Presets y campo de link: el preset salta a la cola y el link se agrega.
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

  // La cola se ve siempre: tocar una fila suena esa canción
  // (playYtTrack); ↑ ↓ ✕ y el guardado en el teléfono son los mismos.
  const ytQueueList = ytQueue.length === 0 ? (
    <p className="rounded-xl bg-sage-100 p-2 text-sm text-slate-600">Tu lista está vacía. Agrega una canción con el link de abajo o toca un preset.</p>
  ) : (
    <div className="space-y-1">
      {ytQueue.map((t, i) => (
        <div key={t.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${i === ytQueueIndex ? 'bg-teal/10 font-bold text-teal-dark' : 'bg-sage-50 text-slate-700'}`}>
          <TrackThumb track={t} className="h-9 w-9" />
          <button onClick={() => playYtTrack(i)} className="min-w-0 flex-1 truncate text-left">
            {i === ytQueueIndex && ytSounds ? <IconPlay className="mr-1 inline h-3.5 w-3.5 align-middle" /> : null}{t.title}
          </button>
          {t.durationSec ? <span className="shrink-0 text-xs text-slate-400">{fmtTime(t.durationSec)}</span> : null}
          <button onClick={() => moveYtTrack(i, -1)} disabled={i === 0} aria-label="Subir en la lista" className="inline-flex shrink-0 items-center justify-center p-1 disabled:opacity-30"><IconArrowUp className="h-4 w-4" /></button>
          <button onClick={() => moveYtTrack(i, 1)} disabled={i === ytQueue.length - 1} aria-label="Bajar en la lista" className="inline-flex shrink-0 items-center justify-center p-1 disabled:opacity-30"><IconArrowDown className="h-4 w-4" /></button>
          <button onClick={() => removeYtTrack(i)} aria-label="Quitar de la lista" className="inline-flex shrink-0 items-center justify-center p-1"><IconX className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )

  // Una sola raíz. La hoja expandida es CASI A PANTALLA COMPLETA
  // (92dvh menos el borde inferior del dock — ver
  // .pulso-player-sheet en index.css — estilo app nativa) con scroll
  // interno. Por defecto todo es mini-barra (también en Entrenar);
  // la hoja solo se abre al tocar ▲. Entra deslizando desde abajo
  // (sheetIn) y se recoge arrastrando el tirador (dragY) o con el
  // botón ⌄.
  return (
    <div
      ref={sheetRef}
      className={!expanded
        ? 'flex items-center gap-2 rounded-2xl bg-night px-2 py-2 text-white shadow-xl shadow-night/40'
        : 'pulso-player-sheet overflow-y-auto rounded-t-3xl border border-slate-100 bg-white shadow-xl shadow-night/20 transition-transform duration-300 ease-out'}
      style={expanded ? { transform: dragging ? `translateY(${dragY}px)` : `translateY(${sheetIn ? 0 : 100}%)`, opacity: sheetIn || dragging ? 1 : 0 } : undefined}
    >
      {!expanded ? (
        <>
          {ytExtractorActive && <TrackThumb track={ytCurrent} className="h-12 w-12" />}
          <button
            onClick={togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pulso text-night"
            aria-label={anyPlaying ? 'Pausar música' : 'Reproducir música'}
          >
            {anyPlaying ? <IconPause className="h-5 w-5" /> : <IconPlay className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">🎵 {miniTitle}</p>
            <p className="truncate text-xs text-white/60">{source === 'youtube' ? `${ytStatusText()} · YouTube` : `${localPlaying ? 'Sonando…' : 'En pausa'} · Música local`}</p>
            {ytExtractorActive && ytCurrent && (
              <SeekBar current={ytTime.current} total={ytTime.duration || ytCurrent.durationSec || 0} onSeek={seekYt} dark />
            )}
          </div>
          {source === 'local' && localTracks.length > 1 && (
            <>
              <button
                onClick={() => playLocal((localIndex - 1 + localTracks.length) % localTracks.length)}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 p-2"
                aria-label="Canción anterior"
              >
                <IconSkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={() => playLocal((localIndex + 1) % localTracks.length)}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 p-2"
                aria-label="Siguiente canción"
              >
                <IconSkipForward className="h-4 w-4" />
              </button>
            </>
          )}
          {source === 'youtube' && ytQueue.length > 1 && (
            <>
              <button
                onClick={() => playYtTrack((ytQueueIndex - 1 + ytQueue.length) % ytQueue.length)}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 p-2"
                aria-label="Canción anterior"
              >
                <IconSkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={() => playYtTrack((ytQueueIndex + 1) % ytQueue.length)}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 p-2"
                aria-label="Siguiente canción"
              >
                <IconSkipForward className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={() => { if (immersive || !compact) onExpandedChange?.(true); else onGoTrain?.() }}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 p-2.5"
            aria-label="Expandir reproductor"
          >
            <IconChevronUp className="h-4 w-4" />
          </button>
          {/* Sin botón "Entrenar →" en la mini-barra: la ▲ ya lleva a
              Entrenar en las demás pestañas, y ese botón robaba el
              espacio del título, que se cortaba como "Músic…". En el
              mapa inmersivo la ▲ abre la hoja sobre el mapa (no se
              sale de Sesiones). */}
        </>
      ) : (
        <div className="flex h-full flex-col px-4 pb-4 pt-1">
          <div
            className="touch-none select-none pb-2 pt-1"
            onTouchStart={handleDragStart}
            onTouchMove={handleDragMove}
            onTouchEnd={handleDragEnd}
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold">🎵 Música para entrenar</h3>
            <button
              onClick={() => onExpandedChange?.(false)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-night-100 px-3 py-1.5 text-xs font-bold text-teal-dark"
              aria-label="Recoger reproductor"
            >
              <IconChevronDown className="h-4 w-4" /> Recoger
            </button>
          </div>

          {/* Portada grande + título de la canción que suena. La
              portada es 16:9 (aspect-video, ancho completo): la
              miniatura de YouTube es 320×180 y en cuadrado con
              object-cover se recortaban ~44 % de los lados. */}
          <div className="mt-3 flex flex-col items-center">
            {source === 'youtube' && ytCurrent ? (
              <TrackThumb track={ytCurrent} className="aspect-video w-full max-w-md rounded-3xl" />
            ) : (
              <div className="flex aspect-video w-full max-w-md items-center justify-center rounded-3xl bg-teal/10 text-6xl">🎵</div>
            )}
            <p className="mt-3 w-full truncate text-center text-lg font-bold">
              {source === 'youtube' ? (ytCurrent?.title ?? 'Sin canción') : currentLocal ? cleanTrackName(currentLocal.name) : 'Sin canción'}
            </p>
            <p className="text-sm text-slate-500">
              {source === 'youtube'
                ? `${ytQueueIndex + 1} de ${ytQueue.length} · ${ytStatusText()}`
                : `${localIndex + 1} de ${localTracks.length} · ${localPlaying ? 'Sonando…' : 'En pausa'}`}
            </p>
          </div>

          {/* Barra grande + controles grandes. */}
          <div className="mt-4">
            <SeekBar large current={ytTime.current} total={bigSeekTotal} onSeek={seekYt} />
            <div className="mt-3 flex items-center justify-center gap-6">
              <button
                onClick={() => {
                  if (source === 'local') { if (localTracks.length > 1) playLocal((localIndex - 1 + localTracks.length) % localTracks.length) }
                  else if (ytQueue.length > 1) playYtTrack((ytQueueIndex - 1 + ytQueue.length) % ytQueue.length)
                }}
                disabled={source === 'local' ? localTracks.length < 2 : ytQueue.length < 2}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-100 disabled:opacity-30"
                aria-label="Canción anterior"
              >
                <IconSkipBack className="h-7 w-7" />
              </button>
              <button
                onClick={togglePlay}
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-pulso text-night"
                aria-label={anyPlaying ? 'Pausar música' : 'Reproducir música'}
              >
                {anyPlaying ? <IconPause className="h-9 w-9" /> : <IconPlay className="h-9 w-9" />}
              </button>
              <button
                onClick={() => {
                  if (source === 'local') { if (localTracks.length > 1) playLocal((localIndex + 1) % localTracks.length) }
                  else if (ytQueue.length > 1) playYtTrack((ytQueueIndex + 1) % ytQueue.length)
                }}
                disabled={source === 'local' ? localTracks.length < 2 : ytQueue.length < 2}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-100 disabled:opacity-30"
                aria-label="Siguiente canción"
              >
                <IconSkipForward className="h-7 w-7" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => switchSource('youtube')}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ${source === 'youtube' ? 'bg-teal text-white' : 'bg-sage-100 text-teal-dark'}`}
            >
              <IconPlay className="h-4 w-4" /> YouTube
            </button>
            <button
              onClick={() => switchSource('local')}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${source === 'local' ? 'bg-teal text-white' : 'bg-sage-100 text-teal-dark'}`}
            >
              📱 Música local
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-400">Sigue sonando con la pantalla apagada y al salir de la app.</p>

          <div className="mt-3 space-y-3">

          {source === 'youtube' ? (
            <>
              {!online && (
                <p className="rounded-xl bg-amber-50 p-2 text-sm font-semibold text-amber-800">
                  📶 Sin internet: YouTube no suena. Cambia a 📱 Música local, que sí funciona sin datos.
                </p>
              )}
              {ytDiag && (
                <div className="space-y-2 rounded-xl bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-900">No suena: {YT_DIAG_TEXT[ytDiag.kind]}</p>
                  <div className="space-y-0.5 text-xs text-amber-800">
                    <p>Internet: {navigator.onLine ? '✓ Conectado' : '✗ Sin conexión'}</p>
                    <p>Servidor PULSO: {diagServerOk === null ? 'Revisando…' : diagServerOk ? '✓ Funciona' : '✗ No responde'}</p>
                    <p>YouTube: {ytDiag.kind === 'blocked' ? '✗ Bloqueado por ahora' : ytDiag.kind === 'key' ? '✗ Clave inválida' : ytDiag.kind === 'offline' ? '✗ Sin internet' : 'Revisando…'}</p>
                  </div>
                  {diagRetrying && <p className="text-xs font-semibold text-amber-800">Reintentando solo…</p>}
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="teal" onClick={retryExtractor}>Probar de nuevo</Btn>
                    {ytQueue.length > 1 && <Btn variant="ghost" onClick={() => playYtTrack((ytQueueIndex + 1) % ytQueue.length)}>Siguiente canción</Btn>}
                    <Btn variant="ghost" onClick={() => setShowReport((s) => !s)}>Reportar a soporte</Btn>
                  </div>
                  {showReport && (
                    <>
                      <p className="whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-700">{supportReportText()}</p>
                      <div className="flex items-center gap-2">
                        <Btn variant="teal" onClick={() => void shareSupportReport()}>Compartir reporte</Btn>
                        {reportCopied && <span className="text-xs font-semibold text-teal-dark">Copiado</span>}
                      </div>
                    </>
                  )}
                </div>
              )}
              {diagAllFailed && (
                <div className="space-y-2 rounded-xl bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-900">YouTube no responde ahorita.</p>
                  <p className="text-xs text-amber-800">Tu música local suena sin internet ni extractor.</p>
                  <Btn variant="teal" onClick={() => switchSource('local')}>📱 Escuchar música local</Btn>
                </div>
              )}
              {ytResolving && <p className="text-center text-xs text-slate-500">Resolviendo audio…</p>}
              {ytQueueList}
              {presetButtons}
              <div className="flex items-center gap-2">
                <Btn variant="teal" className="flex-1" onClick={() => void openExternalUrl(ytCurrent ? `https://www.youtube.com/watch?v=${ytCurrent.id}` : externalUrl(preset, custom))}>
                  <IconPlay className="mr-1.5 inline h-4 w-4 align-middle" /> Abrir en YouTube
                </Btn>
              </div>
              {customField}
              {useCustom && (
                <p className="rounded-xl bg-teal/10 p-2 text-sm text-teal-dark">
                  Tu playlist guardada: {pref.customLabel || 'Mi playlist de YouTube'}. El botón de arriba abre esa lista en YouTube.
                </p>
              )}
            </>
          ) : (
            <>
              {nativeMusic ? (
                <>
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
              ) : null}
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
                        <span className="min-w-0 truncate">{i === localIndex ? <IconPlay className="mr-1 inline h-3.5 w-3.5 align-middle" /> : null}{cleanTrackName(t.name)}</span>
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
        className={expanded && source === 'local' && currentLocal && (!useNativePlayer || !currentLocal.nativeUri) ? 'mt-3 w-full' : 'hidden'}
        controls
        preload="metadata"
        src={source === 'local' ? currentLocal?.url : ytExtractorActive ? ytAudioUrl ?? undefined : undefined}
        onCanPlay={() => {
          // En nativo el <audio> NO suena (el motor es ExoPlayer):
          // sin este freno, al cargar el src el elemento arrancaría
          // solo y sonaría junto al nativo.
          if (nativeAudioRef.current) return
          const audio = audioRef.current
          if (!audio || !audio.paused) return
          if (sourceRef.current === 'local' && localPlayingRef.current) void audio.play().catch(() => undefined)
          else if (sourceRef.current === 'youtube' && playingRef.current) void audio.play().catch(() => undefined)
        }}
        onPlay={() => {
          audioResumeTriesRef.current = 0
          if (sourceRef.current === 'local') setLocalPlaying(true)
          else if (sourceRef.current === 'youtube') {
            setPlaying(true)
            if (!ytAudibleRef.current) { ytAudibleRef.current = true; setYtAudible(true) }
            if (ytStalledRef.current) { ytStalledRef.current = false; setYtStalled(false) }
          }
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
                else if (sourceRef.current === 'youtube') { setPlaying(false); setYtAudible(false); ytAudibleRef.current = false }
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
          } else if (sourceRef.current === 'youtube') {
            if (playingRef.current && audioResumeTriesRef.current < 3) {
              audioResumeTriesRef.current += 1
              window.setTimeout(() => { void audioRef.current?.play().catch(() => setPlaying(false)) }, 400)
            } else { setPlaying(false); setYtAudible(false); ytAudibleRef.current = false }
          }
        }}
        onEnded={() => {
          if (sourceRef.current === 'youtube') { setYtAudible(false); ytAudibleRef.current = false }
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
