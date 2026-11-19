// Hoja inferior del mapa (patrón visual de GuestGate: fondo marfil,
// esquinas redondeadas arriba, tirador). Dos posiciones: media (vista
// previa de la lista) y completa (lista con scroll). Se coloca dentro
// del contenedor del mapa (absolute), no cubre toda la app.
// Uso: vista de mapa de Sesiones, con la lista de sesiones que tienen
// ubicación. Solo lectura: para ver el detalle de una sesión se toca
// su marcador en el mapa, como antes.
import { useState } from 'react'
import type { ReactNode } from 'react'

export default function MapBottomSheet({ title, count, children }: {
  title: string
  count: number
  children: ReactNode
}) {
  const [full, setFull] = useState(false)
  return (
    <div className="absolute inset-x-0 bottom-0 z-10">
      <div
        className={`flex flex-col overflow-hidden rounded-t-3xl bg-[#FFF9F0] shadow-2xl transition-all duration-300 ${full ? 'max-h-[85%]' : 'max-h-[42%]'}`}
      >
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          aria-label={full ? 'Ver menos actividades' : 'Ver todas las actividades'}
          className="w-full shrink-0 px-4 pb-1 pt-2"
        >
          <span className="mx-auto block h-1.5 w-12 rounded-full bg-slate-300" />
          <span className="mt-1 flex items-center justify-center gap-1 text-sm font-black text-night">
            {title} ({count}) {full ? '▾' : '▴'}
          </span>
        </button>
        <div className="overflow-y-auto px-4 pb-3">
          {children}
        </div>
      </div>
    </div>
  )
}
