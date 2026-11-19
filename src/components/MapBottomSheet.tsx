// Hoja inferior del mapa (patrón visual de GuestGate: fondo marfil,
// esquinas redondeadas arriba, tirador). Tres posiciones en móvil:
// contraída (solo tirador + encabezado, ~76 px), media (42%) y
// expandida (85%). En escritorio (≥768 px) sigue siendo panel
// lateral derecho de ~380 px a toda altura, como antes: en escritorio
// el estado no esconde nada (el encabezado y el contenido siempre se
// ven), solo cambia la altura en móvil.
// Uso: vista de mapa de Sesiones, con la lista de sesiones que tienen
// ubicación (o las rutas recomendadas). Solo lectura: para ver el
// detalle de una sesión se toca su marcador en el mapa, como antes.
//
// Arrastre: SOLO desde el tirador y el encabezado (esa zona tiene
// touch-action: none y captura el puntero). El contenido con scroll
// sigue con scroll normal y los botones del encabezado siguen
// funcionando con toque: un arrastre de más de 40 px cambia de estado
// y suprime el clic que vendría después; un toque corto es un clic
// normal. El gesto nunca toca el mapa: la zona de arrastre vive solo
// sobre la hoja, nunca sobre MapLibre, así que no pelea con sus
// gestos (arrastrar, pellizcar, girar con dos dedos).
// En contraída el contenido queda montado pero oculto (hidden), para
// no perder el estado interno de la lista (p. ej. el filtro de rutas
// elegido en RecommendedRoutes).
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type SheetState = 'collapsed' | 'medium' | 'expanded'

const SHEET_ORDER: SheetState[] = ['collapsed', 'medium', 'expanded']

function stepSheet(state: SheetState, dir: 1 | -1): SheetState {
  const i = SHEET_ORDER.indexOf(state) + dir
  return SHEET_ORDER[Math.min(SHEET_ORDER.length - 1, Math.max(0, i))]
}

export default function MapBottomSheet({ title, count, children, dock = false, header, collapsedTitle, state, onStateChange }: {
  title: string
  count: number
  children: ReactNode
  /** Modo dock (mapa inmersivo): hoja hija flex del contenedor, con
   *  altura propia (contraída ~76 px / media 42% / expandida 85%);
   *  en escritorio, panel lateral. */
  dock?: boolean
  /** Cabecera propia en vez del título: en inmersivo lleva el cambio
   *  Sesiones/Rutas y el toggle de "Entrenando ahora". El tirador
   *  sigue expandiendo/contrayendo la hoja. */
  header?: ReactNode
  /** Encabezado que se muestra en contraída (p. ej. "Rutas (11)");
   *  si no se pasa, se usa `${title} (${count})`. */
  collapsedTitle?: string
  /** Estado controlado (quien llama lo guarda para, p. ej., poner las
   *  rutas en compacto al expandir). Sin él, la hoja se controla sola
   *  y empieza en media, como antes. */
  state?: SheetState
  onStateChange?: (s: SheetState) => void
}) {
  const [inner, setInner] = useState<SheetState>('medium')
  const sheetState = state ?? inner
  function setSheetState(next: SheetState) {
    if (onStateChange) onStateChange(next)
    else setInner(next)
  }
  const collapsed = sheetState === 'collapsed'
  const expanded = sheetState === 'expanded'

  // Arrastre desde tirador/encabezado (ver comentario de arriba).
  const dragStartYRef = useRef<number | null>(null)
  const draggedRef = useRef(false)
  function onDragStart(e: React.PointerEvent) {
    dragStartYRef.current = e.clientY
    draggedRef.current = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  function onDragMove(e: React.PointerEvent) {
    if (dragStartYRef.current === null) return
    if (Math.abs(e.clientY - dragStartYRef.current) > 8) draggedRef.current = true
  }
  function onDragEnd(e: React.PointerEvent) {
    if (dragStartYRef.current === null) return
    const dy = e.clientY - dragStartYRef.current
    dragStartYRef.current = null
    if (Math.abs(dy) > 40) setSheetState(stepSheet(sheetState, dy < 0 ? 1 : -1))
  }
  // Si hubo arrastre, el clic que sigue no debe activar botones.
  function onDragClickCapture(e: React.MouseEvent) {
    if (draggedRef.current) {
      draggedRef.current = false
      e.preventDefault()
      e.stopPropagation()
    }
  }
  // Toque en el tirador: contraída → media; media → expandida;
  // expandida → media. A contraída solo se llega arrastrando hacia
  // abajo, para no perder la lista de un toque.
  function onHandleClick() {
    if (sheetState === 'collapsed') setSheetState('medium')
    else if (sheetState === 'medium') setSheetState('expanded')
    else setSheetState('medium')
  }
  const handleLabel = collapsed ? 'Ver actividades' : expanded ? 'Ver menos actividades' : 'Ver todas las actividades'

  return (
    <div className={dock
      ? `relative w-full shrink-0 transition-all duration-300 ${collapsed ? 'h-[76px]' : expanded ? 'h-[85%]' : 'h-[42%]'} md:h-full md:w-[380px]`
      : 'absolute inset-x-0 bottom-0 z-10'}>
      <div
        className={dock
          ? 'flex h-full flex-col overflow-hidden rounded-t-3xl bg-[#FFF9F0] shadow-2xl transition-all duration-300 md:rounded-l-3xl md:rounded-tr-none'
          : `flex flex-col overflow-hidden rounded-t-3xl bg-[#FFF9F0] shadow-2xl transition-all duration-300 ${collapsed ? 'max-h-[76px]' : expanded ? 'max-h-[85%]' : 'max-h-[42%]'}`}
      >
        {/* Zona de arrastre: tirador + encabezado (ver arriba). En
            escritorio (dock) el tirador se esconde y el panel es fijo. */}
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onClickCapture={onDragClickCapture}
        >
          <button
            type="button"
            onClick={onHandleClick}
            aria-label={handleLabel}
            className={`w-full px-4 pb-1 pt-2 ${dock ? 'md:hidden' : ''}`}
          >
            <span className="mx-auto block h-1.5 w-12 rounded-full bg-slate-300" />
          </button>
          {header ? (
            collapsed ? (
              <button
                type="button"
                onClick={onHandleClick}
                aria-label={handleLabel}
                className="flex w-full items-center justify-center gap-1 px-4 pb-2 text-sm font-black text-night md:hidden"
              >
                {collapsedTitle ?? `${title} (${count})`} ▴
              </button>
            ) : (
              <div className="px-4 pb-2">{header}</div>
            )
          ) : (
            <button
              type="button"
              onClick={onHandleClick}
              aria-label={handleLabel}
              className="w-full px-4 pb-1 pt-2"
            >
              <span className="mt-1 flex items-center justify-center gap-1 text-sm font-black text-night">
                {title} ({count}) {expanded ? '▾' : '▴'}
              </span>
            </button>
          )}
          {/* En escritorio el encabezado completo siempre se ve
              (el estado solo manda en móvil): sin esto, en contraída
              el panel lateral quedaría sin sus botones. */}
          {header && collapsed && (
            <div className="hidden px-4 pb-2 md:block">{header}</div>
          )}
        </div>
        <div className={dock
          ? `min-h-0 flex-1 overflow-y-auto px-4 pb-3 ${collapsed ? 'hidden md:block' : ''}`
          : `overflow-y-auto px-4 pb-3 ${collapsed ? 'hidden' : ''}`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
