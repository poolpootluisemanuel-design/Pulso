// Música para entrenar: YouTube o música local del teléfono (opcional).
// - YouTube: las playlists por tipo de entrenamiento usan el buscador
//   de YouTube (listType=search): no se inventan IDs, siempre devuelven
//   resultados reales. El usuario puede pegar su propia playlist y se
//   guarda en su teléfono. El reproductor es el iframe oficial
//   (youtube-nocookie).
// - NO se puede descargar música de YouTube: los términos de YouTube no
//   lo permiten y PULSO no descarga audio de YouTube. La opción local
//   es solo para canciones que el usuario YA tenga descargadas en su
//   teléfono (sus propios MP3 / archivos de audio): se eligen con el
//   selector de archivos y suenan solo en ese dispositivo, sin subirse
//   a ningún servidor. Al cerrar la app hay que volver a elegirlas.
// - Segundo plano, explicado sin mentir:
//   * Con la pantalla encendida (Wake Lock, interruptor de abajo) la
//     música sigue sonando mientras entrenas o grabas con GPS.
//   * YouTube web puede pausar si bloqueas la pantalla o cambias de
//     app. Para segundo plano real con pantalla apagada hace falta
//     YouTube Premium: usa "Abrir en YouTube" y ahí sigue sonando.
//   * La música local usa <audio> con Media Session: se controla desde
//     la pantalla de bloqueo / notificaciones y aguanta mejor en
//     segundo plano que el iframe de YouTube, pero el navegador web
//     también puede pausarla si bloqueas la pantalla mucho tiempo.
//     Spotify Premium después sería la otra opción.
// - Media Session: mientras suena, aparecen título y controles de
//   PULSO en la pantalla de bloqueo / notificaciones del teléfono.
import { useEffect, useRef, useState } from 'react'
import { getMusicPref, saveMusicPref } from '../lib/store'
import { Btn, Card, Field, inputCls } from './ui'

interface Preset { id: string; label: string; emoji: string; query: string }

export const MUSIC_PRESETS: Preset[] = [
  { id: 'caminata', label: 'Caminata', emoji: '🚶', query: 'música para caminar relajante' },
  { id: 'correr', label: 'Correr', emoji: '🏃', query: 'música para correr energía' },
  { id: 'ciclismo', label: 'Ciclismo', emoji: '🚴', query: 'música para ciclismo ruta' },
  { id: 'crossfit', label: 'CrossFit', emoji: '💪', query: 'música para entrenar crossfit intensa' },
  { id: 'padel', label: 'Pádel', emoji: '🎾', query: 'música para jugar pádel' },
  { id: 'gym', label: 'Gym', emoji: '🏋️', query: 'música para entrenar gym motivación' },
  { id: 'general', label: 'General', emoji: '🎵', query: 'música para entrenar motivación' },
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

function embedSrc(preset: Preset, custom: { kind: 'playlist' | 'video'; id: string } | null, playing: boolean): string {
  const autoplay = playing ? '&autoplay=1' : ''
  if (custom?.kind === 'playlist') return `https://www.youtube-nocookie.com/embed/videoseries?list=${custom.id}${autoplay}`
  if (custom?.kind === 'video') return `https://www.youtube-nocookie.com/embed/${custom.id}?rel=0${autoplay}`
  return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(preset.query)}${autoplay}`
}

// Link normal de YouTube (no embed) para abrir en la app / pestaña de
// YouTube: ahí sí sigue sonando en segundo plano si tiene Premium.
function externalUrl(preset: Preset, custom: { kind: 'playlist' | 'video'; id: string } | null): string {
  if (custom?.kind === 'playlist') return `https://www.youtube.com/playlist?list=${custom.id}`
  if (custom?.kind === 'video') return `https://www.youtube.com/watch?v=${custom.id}`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(preset.query)}`
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

export default function MusicPlayer({ profileId, onPlayingChange }: { profileId: string; onPlayingChange?: (m: MusicStatus) => void }) {
  const [pref, setPref] = useState(() => getMusicPref(profileId))
  const [playing, setPlaying] = useState(false)
  const [customInput, setCustomInput] = useState(() => getMusicPref(profileId).customUrl)
  const [customErr, setCustomErr] = useState('')
  const [open, setOpen] = useState(true)
  const [keepScreenOn, setKeepScreenOn] = useState(true)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // Reproductor local opcional: archivos que el usuario ya tiene en su teléfono.
  const [source, setSource] = useState<'youtube' | 'local'>('youtube')
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([])
  const [localIndex, setLocalIndex] = useState(0)
  const [localPlaying, setLocalPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const preset = MUSIC_PRESETS.find((p) => p.id === pref.presetId) || MUSIC_PRESETS[MUSIC_PRESETS.length - 1]
  const custom = parseYouTubeUrl(pref.customUrl)
  const useCustom = pref.customUrl.trim() !== '' && custom !== null
  const title = useCustom ? (pref.customLabel || 'Mi playlist de YouTube') : `Música para ${preset.label.toLowerCase()}`
  const playingTitle = `PULSO — ${title}`
  const currentLocal = localTracks[localIndex] || null
  const anyPlaying = playing || localPlaying
  const statusTitle = source === 'local' && currentLocal ? cleanTrackName(currentLocal.name) : title

  // Avisar arriba (App) para la barrita de música activa.
  useEffect(() => {
    onPlayingChange?.({ playing: anyPlaying, title: statusTitle, source })
  }, [anyPlaying, statusTitle, source, onPlayingChange])

  // Mantener pantalla encendida mientras suena (YouTube o local, si el
  // navegador lo permite). Fallback silencioso: si no hay Wake Lock,
  // simplemente no se activa.
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
    // El navegador puede soltar el Wake Lock al cambiar de pestaña:
    // al volver a la app se pide de nuevo.
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

  // Media Session (YouTube): título y controles en pantalla de bloqueo.
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
    } catch {
      // Navegador sin Media Session: no pasa nada, la música sigue.
    }
    return () => {
      try { ms.setActionHandler('play', null); ms.setActionHandler('pause', null) } catch { /* noop */ }
    }
  }, [playing, playingTitle, source])

  // Media Session (local): controles en pantalla de bloqueo, con
  // anterior / siguiente, para el <audio> del teléfono.
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
    } catch {
      // Navegador sin Media Session: no pasa nada, la música sigue.
    }
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
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || source !== 'local') return
    if (localPlaying && currentLocal) void audio.play().catch(() => setLocalPlaying(false))
    else audio.pause()
  }, [localPlaying, localIndex, source, currentLocal])

  function switchSource(next: 'youtube' | 'local') {
    // Cambiar entre YouTube y Local no borra nada: la playlist de
    // YouTube guardada sigue en el teléfono y la lista local sigue en
    // esta sesión hasta cerrar la app.
    if (next === 'youtube') setLocalPlaying(false)
    else setPlaying(false)
    setSource(next)
  }

  return (
    <Card>
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <h3 className="text-lg font-bold">🎵 Música para entrenar</h3>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600">
            Suena mientras entrenas con la pantalla encendida. Para que suene en segundo plano con la pantalla apagada hace falta YouTube Premium: ábrela en YouTube con el botón de abajo.
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

              <div className="overflow-hidden rounded-xl bg-slate-900">
                <iframe
                  key={`${useCustom ? 'custom-' + pref.customUrl : 'preset-' + preset.id}-${playing ? 'play' : 'pause'}`}
                  className="aspect-video w-full"
                  src={embedSrc(preset, custom, playing)}
                  title={useCustom ? pref.customLabel : `YouTube: ${preset.label}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>

              <div className="flex items-center gap-2">
                <Btn variant={playing ? 'ghost' : 'coral'} className="flex-1" onClick={() => setPlaying(!playing)}>
                  {playing ? '⏸ Pausa' : '▶ Reproducir'}
                </Btn>
                <Btn variant="teal" className="flex-1" onClick={() => window.open(externalUrl(preset, custom), '_blank', 'noopener,noreferrer')}>
                  ▶ Abrir en YouTube
                </Btn>
              </div>
              <p className="text-xs text-slate-500">
                {`Sonando: ${title}.`} Con la pantalla encendida y la app abierta, la música sigue mientras entrenas o grabas con GPS. Si bloqueas la pantalla o cambias de app, YouTube web puede pausar: para segundo plano real, abre en YouTube con Premium (o Spotify Premium después).
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
                  <audio
                    ref={audioRef}
                    className="w-full"
                    controls
                    preload="metadata"
                    src={currentLocal.url}
                    onPlay={() => setLocalPlaying(true)}
                    onPause={() => setLocalPlaying(false)}
                    onEnded={() => { if (localTracks.length > 1) playLocal((localIndex + 1) % localTracks.length) }}
                  />
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
    </Card>
  )
}
