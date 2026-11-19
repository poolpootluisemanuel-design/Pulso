// Hoja inferior del mapa (patrón visual de GuestGate: fondo marfil,
// esquinas redondeadas arriba, tirador). Dos posiciones: media (vista
// previa de la lista) y completa (lista con scroll). En modo normal
// se coloca dentro del contenedor del mapa (absolute), no cubre toda
// la app. En modo dock (mapa inmersivo, Fase 1) es hija flex del
// contenedor a pantalla completa: ocupa el 42% (o el 85% expandida)
// de alto en móvil y en escritorio (≥768 px) se vuelve panel lateral
// derecho de ~380 px a toda altura.
// Uso: vista de mapa de Sesiones, con la lista de sesiones que tienen
// ubicación (o las rutas recomendadas). Solo lectura: para ver el
// detalle de una sesión se toca su marcador en el mapa, como antes.
import { useState } from 'react'
import type { ReactNode } from 'react'

export default function MapBottomSheet({ title, count, children, dock = false, header }: {
  title: string
  count: number
  children: ReactNode
  /** Modo dock (mapa inmersivo): hoja hija flex del contenedor, con
   *  altura propia (42% / 85%); en escritorio, panel lateral. */
  dock?: boolean
  /** Cabecera propia en vez del título: en inmersivo lleva el cambio
   *  Sesiones/Rutas y el toggle de "Entrenando ahora". El tirador
   *  sigue expandiendo/contrayendo la hoja. */
  header?: ReactNode
}) {
  const [full, setFull] = useState(false)
  return (
    <div className={dock
      ? `relative w-full shrink-0 transition-all duration-300 ${full ? 'h-[85%]' : 'h-[42%]'} md:h-full md:w-[380px]`
      : 'absolute inset-x-0 bottom-0 z-10'}>
      <div
        className={dock
          ? 'flex h-full flex-col overflow-hidden rounded-t-3xl bg-[#FFF9F0] shadow-2xl transition-all duration-300 md:rounded-l-3xl md:rounded-tr-none'
          : `flex flex-col overflow-hidden rounded-t-3xl bg-[#FFF9F0] shadow-2xl transition-all duration-300 ${full ? 'max-h-[85%]' : 'max-h-[42%]'}`}
      >
        {header ? (
          <>
            <button
              type="button"
              onClick={() => setFull((f) => !f)}
              aria-label={full ? 'Ver menos actividades' : 'Ver todas las actividades'}
              className={`w-full shrink-0 px-4 pb-1 pt-2 ${dock ? 'md:hidden' : ''}`}
            >
              <span className="mx-auto block h-1.5 w-12 rounded-full bg-slate-300" />
            </button>
            <div className="shrink-0 px-4 pb-2">{header}</div>
          </>
        ) : (
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
        )}
        <div className={dock ? 'min-h-0 flex-1 overflow-y-auto px-4 pb-3' : 'overflow-y-auto px-4 pb-3'}>
          {children}
        </div>
      </div>
    </div>
  )
}
