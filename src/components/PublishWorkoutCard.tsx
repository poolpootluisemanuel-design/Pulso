// Tarjeta al terminar de grabar con GPS: el recorrido con su mapa,
// sus números, un texto opcional y la visibilidad. Con Comunidad PULSO
// se crea la publicación; con Solo yo no se crea post y el
// entrenamiento queda guardado solo para el dueño (se ve en su
// historial). El botón cambia de texto según la visibilidad.
import { useState } from 'react'
import type { Workout } from '../lib/types'
import { Btn, Card, inputCls } from './ui'
import WorkoutPostCard from './WorkoutPostCard'

export type PublishVisibility = 'comunidad' | 'solo'

export default function PublishWorkoutCard({ workout, onPublish, onClose }: {
  workout: Workout
  onPublish: (note: string, visibility: PublishVisibility) => void
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const [visibility, setVisibility] = useState<PublishVisibility>('comunidad')
  return (
    <Card>
      <p className="text-lg font-black text-night">Tu recorrido</p>
      <WorkoutPostCard
        sport={workout.sport}
        distanceKm={workout.distance_km}
        durationMin={workout.duration_min}
        steps={workout.steps}
        route={workout.route}
      />
      <textarea
        className={`${inputCls} mt-3 resize-none`}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="¿Cómo te fue? (opcional)"
      />
      <div className="mt-3 flex gap-2">
        {([
          ['comunidad', 'Comunidad PULSO'],
          ['solo', 'Solo yo'],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setVisibility(v)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${visibility === v ? 'bg-pulso text-night' : 'bg-white text-slate-600 shadow-sm'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Btn
        variant="coral"
        className="mt-3 w-full"
        onClick={() => onPublish(note, visibility)}
      >
        {visibility === 'comunidad' ? 'Publicar recorrido' : 'Guardar solo para mí'}
      </Btn>
      <button type="button" className="mt-2 w-full py-1 text-sm font-bold text-teal-dark underline" onClick={onClose}>
        Ahora no
      </button>
      {visibility === 'solo' && (
        <p className="mt-1 text-center text-xs text-slate-500">Queda guardado en tu historial, nadie más lo ve.</p>
      )}
    </Card>
  )
}
