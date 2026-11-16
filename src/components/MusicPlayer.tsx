// Música para entrenar con YouTube (sin API key ni cuenta de Spotify).
// - Las playlists por tipo de entrenamiento usan el buscador de YouTube
//   (listType=search): no se inventan IDs de playlists, siempre devuelven
//   resultados reales de YouTube. El usuario puede poner su propia
//   playlist: pega el link de YouTube y se guarda en su teléfono.
// - El reproductor es el iframe oficial de YouTube (youtube-nocookie).
// - Segundo plano, explicado sin mentir:
//   * Con la pantalla encendida (Wake Lock, interruptor de abajo) la
//     música sigue sonando mientras entrenas o grabas con GPS.
//   * Con la pantalla apagada / en otra app, YouTube web puede pausar.
//     Para segundo plano real con pantalla apagada hace falta
//     YouTube Premium: usa "Abrir en YouTube" y ahí sigue sonando.
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

export default function MusicPlayer({ profileId }: { profileId: string }) {
  const [pref, setPref] = useState(() => getMusicPref(profileId))
  const [playing, setPlaying] = useState(false)
  const [customInput, setCustomInput] = useState(() => getMusicPref(profileId).customUrl)
  const [customErr, setCustomErr] = useState('')
  const [open, setOpen] = useState(true)
  const [keepScreenOn, setKeepScreenOn] = useState(true)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const preset = MUSIC_PRESETS.find((p) => p.id === pref.presetId) || MUSIC_PRESETS[MUSIC_PRESETS.length - 1]
  const custom = parseYouTubeUrl(pref.customUrl)
  const useCustom = pref.customUrl.trim() !== '' && custom !== null
  const title = useCustom ? (pref.customLabel || 'Mi playlist de YouTube') : `Música para ${preset.label.toLowerCase()}`
  const playingTitle = `PULSO — ${title}`

  // Mantener pantalla encendida mientras suena (si el navegador lo permite).
  // Fallback silencioso: si no hay Wake Lock, simplemente no se activa.
  useEffect(() => {
    if (!playing || !keepScreenOn) {
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
  }, [playing, keepScreenOn])

  // Media Session: título y controles en pantalla de bloqueo / notificaciones.
  useEffect(() => {
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
  }, [playing, playingTitle])

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
        </div>
      )}
    </Card>
  )
}
