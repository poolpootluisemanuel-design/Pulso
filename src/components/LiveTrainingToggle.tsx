// Interruptor opt-in "Que se me vea entrenando ahora".
// - Por defecto APAGADO (isLiveOptIn, localStorage por perfil). Sin esto,
//   aunque se grabe con GPS no se publica nada.
// - Se integra con el estado de grabación de GpsTracker por props:
//   `isRecording` (true solo mientras status === 'recording') y
//   `position` (la última posición aceptada, currentPos). Cada posición
//   aceptada se publica (con throttle interno de 4 s en liveTraining).
// - Al pausar/terminar/salir, la presencia se quita de inmediato con
//   stopLivePosition, sin esperar la expiración de 60 s. La ubicación en
//   vivo NO se guarda en ninguna tabla: solo Presence efímero.

import { useEffect, useState } from 'react'
import { isLiveOptIn, publishLivePosition, setLiveOptIn, stopLivePosition } from '../lib/liveTraining'

export interface LivePosition {
  lat: number
  lng: number
}

export default function LiveTrainingToggle({
  profileId,
  profileName,
  sport,
  isRecording,
  position,
}: {
  profileId: string
  profileName: string
  /** Deporte que se está grabando (Caminata / Correr / Ciclismo). */
  sport: string
  /** true solo mientras GpsTracker está en status === 'recording' */
  isRecording: boolean
  /** Última posición aceptada por el filtro anti-deriva (currentPos),
   *  o null si aún no hay fix. */
  position: LivePosition | null
}) {
  const [optIn, setOptIn] = useState(() => isLiveOptIn(profileId))

  function toggle(v: boolean): void {
    setOptIn(v)
    setLiveOptIn(profileId, v)
    if (!v) stopLivePosition(profileId)
  }

  // Mientras grabas con el opt-in prendido, publica cada posición
  // aceptada. Si se prende el opt-in a mitad de grabación, empieza
  // a publicar en ese momento (ya hay position).
  useEffect(() => {
    if (!optIn || !isRecording || !position) return
    publishLivePosition(profileId, profileName, sport, position.lat, position.lng)
  }, [optIn, isRecording, position, profileId, profileName, sport])

  // Al dejar de grabar (pausa, terminar, cancelar), se quita de
  // inmediato. En el primer render isRecording ya es false: stop es
  // no-op si nunca se publicó.
  useEffect(() => {
    if (!isRecording) stopLivePosition(profileId)
  }, [isRecording, profileId])

  // Al salir de la pantalla a mitad de grabación, también se quita.
  useEffect(() => () => {
    stopLivePosition(profileId)
  }, [profileId])

  return (
    <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={optIn}
        onChange={(e) => toggle(e.target.checked)}
      />
      <span>
        📍 Que se me vea entrenando ahora
        <span className="block text-xs font-normal text-slate-500">
          Solo se ve mientras grabas con GPS y se apaga al terminar. Sin esto, nadie ve tu ubicación en vivo.
        </span>
      </span>
    </label>
  )
}
