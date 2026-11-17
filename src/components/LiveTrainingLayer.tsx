// Capa "Entrenando ahora" sobre el mapa existente.
// - NO crea un mapa nuevo ni toca MapView: MapView no expone la instancia
//   de MapLibre (no hay onMapReady ni ref), así que el camino cableado es
//   `liveTrainersToMarkers()`: convierte entrenadores en MapMarker[] y
//   SessionsTab los pasa a la prop `markers` del MapView que ya existe.
// - Si algún día MapView expone el mapa, este mismo componente acepta
//   la prop opcional `map` y dibuja los marcadores directo con MapLibre
//   (mismo estilo de punto que MapView: círculo con inicial).
// - El toggle "Entrenando ahora" con contador es lo que ve el usuario;
//   la lista de chips muestra quién entrena (inicial + nombre + deporte).

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { LiveTrainer } from '../lib/liveTraining'
import type { MapMarker } from './MapView'

const SPORT_EMOJI: Record<string, string> = {
  running: '🏃', caminata: '🚶', pádel: '🎾', padel: '🎾', crossfit: '💪',
  ciclismo: '🚴', surf: '🏄', natación: '🏊', gym: '🏋️', yoga: '🧘',
}
export function sportEmojiForLive(sport: string): string {
  return SPORT_EMOJI[sport.toLowerCase()] || '🏅'
}

// El popup del mapa es HTML: se escapan los textos del usuario para
// que un nombre con < o " no rompa el marcador.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Entrenadores activos -> marcadores del MapView existente. Yo salgo en
 *  teal con 📍; los demás en rojo pulso con el emoji de su deporte. */
export function liveTrainersToMarkers(trainers: LiveTrainer[], selfProfileId?: string): MapMarker[] {
  return trainers.map((t) => {
    const mine = t.profileId === selfProfileId
    return {
      key: `live-${t.profileId}`,
      lat: t.lat,
      lng: t.lng,
      emoji: mine ? '📍' : sportEmojiForLive(t.sport),
      color: mine ? '#14B8A6' : '#E63946',
      popupHtml: `<b>${esc(t.name)}</b>${mine ? ' (tú)' : ''}<br>${esc(t.sport)} · entrenando ahora`,
    }
  })
}

function liveDotElement(trainer: LiveTrainer, mine: boolean): HTMLDivElement {
  const el = document.createElement('div')
  const initial = (trainer.name.trim().charAt(0) || '?').toUpperCase()
  el.style.cssText = `display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:${mine ? '#14B8A6' : '#E63946'};color:#fff;font-size:17px;font-weight:900;border:2px solid #fff;box-shadow:0 2px 8px rgba(10,27,46,.5);`
  el.textContent = initial
  el.title = `${trainer.name} · ${trainer.sport}`
  return el
}

export default function LiveTrainingLayer({
  trainers,
  visible,
  onToggle,
  selfProfileId,
  map,
}: {
  trainers: LiveTrainer[]
  /** ¿Se ven los entrenadores en el mapa? */
  visible: boolean
  onToggle: (visible: boolean) => void
  selfProfileId?: string
  /** Instancia de MapLibre, solo si quien monta la capa la pasa.
   *  Sin ella, los marcadores se dibujan con liveTrainersToMarkers()
   *  en la prop `markers` de MapView (camino cableado en SessionsTab). */
  map?: maplibregl.Map | null
}) {
  const markersRef = useRef<maplibregl.Marker[]>([])

  // Camino directo con la instancia del mapa (hoy sin uso: MapView no
  // la expone). Se limpia solo al cambiar entrenadores/visibilidad o
  // al desmontar; nunca crea un mapa nuevo.
  useEffect(() => {
    if (!map) return
    if (!visible) return
    trainers.forEach((t) => {
      const mine = t.profileId === selfProfileId
      const marker = new maplibregl.Marker({ element: liveDotElement(t, mine) })
        .setLngLat([t.lng, t.lat])
        .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false })
          .setHTML(`<b>${esc(t.name)}</b>${mine ? ' (tú)' : ''}<br>${esc(t.sport)} · entrenando ahora`))
        .addTo(map)
      markersRef.current.push(marker)
    })
    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
    }
  }, [map, trainers, visible, selfProfileId])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onToggle(!visible)}
          aria-pressed={visible}
          className={`rounded-full px-3 py-2 text-sm font-bold shadow-sm ${visible ? 'bg-pulso text-white' : 'bg-white text-slate-600'}`}
        >
          {visible ? '🔴' : '⚪'} Entrenando ahora{trainers.length > 0 ? ` (${trainers.length})` : ''}
        </button>
        {visible && trainers.length === 0 && (
          <span className="text-xs text-slate-500">Nadie entrena ahora mismo.</span>
        )}
      </div>
      {visible && trainers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {trainers.map((t) => {
            const mine = t.profileId === selfProfileId
            return (
              <span
                key={t.profileId}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${mine ? 'bg-teal/10 text-teal-dark' : 'bg-sage-50 text-slate-700'}`}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-white"
                  style={{ background: mine ? '#14B8A6' : '#E63946' }}
                >
                  {(t.name.trim().charAt(0) || '?').toUpperCase()}
                </span>
                {t.name}{mine ? ' (tú)' : ''} · {sportEmojiForLive(t.sport)} {t.sport}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
