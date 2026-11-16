import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-slate-100 bg-white p-4 shadow-md shadow-night/5 ${className}`}>{children}</div>
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
  const styles = {
    coral: 'bg-gradient-to-r from-pulso to-pulso-dark text-white shadow-lg shadow-pulso/30',
    teal: 'bg-teal text-white shadow-lg shadow-teal/25',
    dark: 'bg-night text-white shadow-lg shadow-night/25',
    ghost: 'bg-night-100 text-teal-dark',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-full px-4 py-2.5 font-bold disabled:opacity-50 ${styles} ${className}`}>
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
