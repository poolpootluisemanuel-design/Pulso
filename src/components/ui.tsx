import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // Si quien usa la tarjeta ya trae su propio fondo (bg-night, bg-coral…),
  // NO se pone bg-white: antes ambos fondos convivían y Tailwind
  // resolvía el conflicto a favor de bg-white, así que la tarjeta de
  // racha (texto blanco sobre fondo oscuro) quedaba blanca con el texto
  // invisible — solo se veía el emoji 🔥. Ahora el fondo propio gana
  // siempre y el borde claro solo va en las tarjetas blancas.
  const hasBg = /bg-(night|coral|pulso|teal)/.test(className)
  return (
    <div className={`rounded-3xl p-4 shadow-md shadow-night/5 ${hasBg ? 'border-transparent' : 'border border-slate-100 bg-white'} ${className}`}>
      {children}
    </div>
  )
}

export function Btn({
  children, onClick, variant = 'coral', type = 'button', disabled = false, className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'coral' | 'teal' | 'ghost' | 'dark'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  // Regla de color (rediseño 2026-11-18): rosa = solo la acción
  // principal, con texto marrón oscuro encima (el blanco sobre rosa
  // no se lee). Lila = secundario, también con texto oscuro.
  const styles = {
    coral: 'bg-pulso text-night shadow-lg shadow-pulso/30',
    teal: 'bg-teal text-night shadow-lg shadow-teal/25',
    dark: 'bg-night text-white shadow-lg shadow-night/25',
    ghost: 'bg-night-100 text-teal-dark',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-full px-4 py-3 font-bold disabled:opacity-50 ${styles} ${className}`}>
      {children}
    </button>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-teal/15 px-2.5 py-0.5 text-xs font-bold text-teal-dark">{children}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-night">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}

export const inputCls = 'w-full rounded-2xl border border-slate-200 bg-night-50 px-3.5 py-2.5 text-slate-800 outline-none focus:border-pulso focus:ring-2 focus:ring-pulso/20'
export const selectCls = inputCls

export function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-500">{text}</p>
}
