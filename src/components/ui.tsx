import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ${className}`}>{children}</div>
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
    coral: 'bg-pulso text-white',
    teal: 'bg-teal text-white',
    dark: 'bg-night text-white',
    ghost: 'bg-night-100 text-teal-dark',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-full px-4 py-2.5 font-semibold disabled:opacity-50 ${styles} ${className}`}>
      {children}
    </button>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-lime-tag px-2 py-0.5 text-xs font-semibold text-slate-700">{children}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}

export const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-800 outline-none focus:border-teal'
export const selectCls = inputCls

export function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-500">{text}</p>
}
