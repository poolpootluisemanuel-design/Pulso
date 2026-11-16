// Música para entrenar con YouTube (sin API key ni cuenta de Spotify).
// - Las playlists por tipo de entrenamiento usan el buscador de YouTube
//   (listType=search): no se inventan IDs de playlists, siempre devuelven
//   resultados reales de YouTube. El usuario puede poner su propia
//   playlist: pega el link de YouTube y se guarda en su teléfono.
// - El reproductor es el iframe oficial de YouTube (youtube-nocookie).
//   Nota honesta: en la web del teléfono, si bloqueas la pantalla o
//   cambias de app, YouTube puede pausar la música. Eso es una
//   limitación de YouTube web, no de PULSO; en Spotify Premium la
//   reproducción en segundo plano sí es completa.
import { useState } from 'react'
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

export default function MusicPlayer({ profileId }: { profileId: string }) {
  const [pref, setPref] = useState(() => getMusicPref(profileId))
  const [playing, setPlaying] = useState(false)
  const [customInput, setCustomInput] = useState(() => getMusicPref(profileId).customUrl)
  const [customErr, setCustomErr] = useState('')
  const [open, setOpen] = useState(true)

  const preset = MUSIC_PRESETS.find((p) => p.id === pref.presetId) || MUSIC_PRESETS[MUSIC_PRESETS.length - 1]
  const custom = parseYouTubeUrl(pref.customUrl)
  const useCustom = pref.customUrl.trim() !== '' && custom !== null

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
            Suena mientras entrenas o grabas con GPS. Elige por tipo de entrenamiento o pega tu playlist de YouTube.
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
            <Btn variant="ghost" onClick={() => { update({ customUrl: '', customLabel: '' }); setCustomInput('') }}>
              Volver a las de PULSO
            </Btn>
          </div>
          <p className="text-xs text-slate-500">
            {useCustom ? `Sonando: ${pref.customLabel || 'tu playlist'}.` : `Sonando: playlist de YouTube para ${preset.label.toLowerCase()}.`}
            {' '}Si bloqueas la pantalla, YouTube web puede pausar la música.
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
